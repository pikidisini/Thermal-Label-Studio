"""Code reassignment with relational constraints; no operational storage access."""
import sqlite3
from types import SimpleNamespace

import pytest

from app.layouts.models import SaveLayoutRequest
from app.layouts.service import LayoutConflictError, LayoutService


class Cursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.cursor.close()

    def execute(self, sql, params=()):
        if sql.startswith('SELECT pg_advisory_xact_lock'):
            return
        # SQLite checks relational effects; PostgreSQL locking needs live coverage.
        sql = sql.replace(' FOR UPDATE OF l', '')
        self.cursor.execute(sql.replace('%s', '?').replace('now()', 'CURRENT_TIMESTAMP'), params)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()


class Database:
    def __init__(self, connection):
        self.connection = connection

    def connect(self, _):
        return self

    def __enter__(self):
        return self

    def __exit__(self, kind, *_):
        if kind is None:
            self.connection.commit()
        else:
            self.connection.rollback()

    def cursor(self):
        return Cursor(self.connection)


@pytest.fixture
def catalog():
    connection = sqlite3.connect(':memory:')
    connection.execute('PRAGMA foreign_keys = ON')
    connection.execute("ATTACH DATABASE ':memory:' AS label_studio")
    connection.executescript('''
        CREATE TABLE label_studio.layouts (
            label_code TEXT PRIMARY KEY, active_version INTEGER, created_at TEXT,
            updated_at TEXT, title_override TEXT, deleted_at TEXT);
        CREATE TABLE label_studio.layout_versions (
            label_code TEXT REFERENCES layouts(label_code), version INTEGER,
            title TEXT, width_mm REAL, height_mm REAL, dpi REAL, status TEXT,
            svg_sha256 TEXT, object_key TEXT UNIQUE, created_at TEXT, updated_at TEXT,
            PRIMARY KEY(label_code, version));
    ''')
    service = LayoutService.__new__(LayoutService)
    service.settings = SimpleNamespace(database_url='synthetic')
    service._database = Database(connection)
    objects = {}

    def put(key, payload):
        if key in objects:
            raise LayoutConflictError('Immutable object exists')
        objects[key] = payload

    service._put_immutable = put
    # These tests focus on relational identity/version behavior. Byte integrity
    # and post-commit deletion are covered in test_layout_object_rename.py.
    service._verified_object_bytes = lambda key, checksum: objects.setdefault(key, b'synthetic SVG')
    yield service, connection, objects
    connection.close()


def seed(connection, code, *, deleted=False, versions=1):
    connection.execute('INSERT INTO label_studio.layouts VALUES (?, ?, ?, ?, ?, ?)',
                       (code, max(versions, 1), '2026-10-18', '2026-10-18', None,
                        '2026-10-18' if deleted else None))
    for version in range(1, versions + 1):
        connection.execute('INSERT INTO label_studio.layout_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                           (code, version, code, 200, 80, 203.2, 'published', 'a' * 64,
                            f'layouts/{code}/v{version}/layout.svg', '2026-10-18', '2026-10-18'))
    connection.commit()


def rename(service, code, new_code, *, version=1, previous_title=None):
    with service._database.connect('synthetic') as connection:
        with connection.cursor() as cursor:
            return service.manage_template(cursor, code, version=version, checksum='a' * 64,
                                           previous_title=previous_title or code,
                                           title=new_code, new_code=new_code)


def test_reassign_e100_preserves_histories_with_matching_object_prefixes(catalog):
    service, connection, _ = catalog
    seed(connection, 'E100', versions=3)
    seed(connection, 'label_roll_80x200')
    before = connection.execute('SELECT svg_sha256 FROM label_studio.layout_versions ORDER BY svg_sha256').fetchall()
    rename(service, 'E100', 'AAAA', version=3)
    assert connection.execute("SELECT 1 FROM label_studio.layouts WHERE label_code='E100'").fetchone() is None
    rename(service, 'label_roll_80x200', 'E100')
    assert connection.execute('SELECT label_code, version FROM label_studio.layout_versions ORDER BY label_code, version').fetchall() == [
        ('AAAA', 1), ('AAAA', 2), ('AAAA', 3), ('E100', 1)]
    assert connection.execute('SELECT object_key FROM label_studio.layout_versions ORDER BY object_key').fetchall() == [
        ('layouts/AAAA/v1/layout.svg',), ('layouts/AAAA/v2/layout.svg',),
        ('layouts/AAAA/v3/layout.svg',), ('layouts/E100/v1/layout.svg',)]
    assert connection.execute('SELECT svg_sha256 FROM label_studio.layout_versions ORDER BY svg_sha256').fetchall() == before


def test_rename_back_to_original_code(catalog):
    service, connection, _ = catalog
    seed(connection, 'E100')
    rename(service, 'E100', 'AAAA')
    rename(service, 'AAAA', 'E100')
    assert connection.execute('SELECT label_code FROM label_studio.layouts').fetchall() == [('E100',)]


def test_reclaims_only_empty_legacy_rename_reservation(catalog):
    service, connection, _ = catalog
    seed(connection, 'E100', deleted=True, versions=0)
    seed(connection, 'AAAA', versions=3)
    seed(connection, 'ASTRIA')
    rename(service, 'ASTRIA', 'E100')
    assert connection.execute('SELECT label_code, count(*) FROM label_studio.layout_versions GROUP BY label_code ORDER BY label_code').fetchall() == [('AAAA', 3), ('E100', 1)]


@pytest.mark.parametrize('deleted', [False, True])
def test_active_and_deleted_template_with_history_still_block_reassignment(catalog, deleted):
    service, connection, _ = catalog
    seed(connection, 'E100', deleted=deleted)
    seed(connection, 'ASTRIA')
    with pytest.raises(LayoutConflictError):
        rename(service, 'ASTRIA', 'E100')
    assert connection.execute('SELECT count(*) FROM label_studio.layout_versions').fetchone() == (2,)


def test_save_reuses_legacy_reservation_without_overwriting_old_immutable_object(catalog):
    service, connection, objects = catalog
    seed(connection, 'E100', deleted=True, versions=0)
    seed(connection, 'AAAA')
    objects['layouts/E100/v1/layout.svg'] = b'previous template immutable artifact'
    before = dict(objects)
    result = service.save_layout(SaveLayoutRequest(label_code='E100', title='ASTRIA',
        svg='<svg xmlns="http://www.w3.org/2000/svg"/>', width_mm=200, height_mm=80, dpi=203.2))
    assert result.version == 2
    assert all(objects[key] == value for key, value in before.items())
    assert connection.execute("SELECT deleted_at FROM label_studio.layouts WHERE label_code='E100'").fetchone() == (None,)


def test_failed_rename_keeps_legacy_reservation_and_original_template(catalog):
    service, connection, _ = catalog
    seed(connection, 'E100', deleted=True, versions=0)
    seed(connection, 'ASTRIA')
    connection.execute("CREATE TRIGGER label_studio.block_move BEFORE UPDATE ON layout_versions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        rename(service, 'ASTRIA', 'E100')
    assert connection.execute("SELECT deleted_at FROM label_studio.layouts WHERE label_code='E100'").fetchone()[0] is not None
    assert connection.execute('SELECT label_code FROM label_studio.layout_versions').fetchall() == [('ASTRIA',)]
