"""Verified MinIO relocation and relational rollback using bounded synthetic SVGs."""
import hashlib
from io import BytesIO
import sqlite3

import pytest

from app.layouts.service import LayoutArtifactError, LayoutConflictError
from .test_layout_code_reuse import catalog, seed


class Response(BytesIO):
    def release_conn(self):
        pass


class Objects:
    def __init__(self, objects):
        self.objects = objects
        self.removed = []
        self.fail_delete = False

    def get_object(self, bucket, key):
        return Response(self.objects[key])

    def remove_object(self, bucket, key):
        if self.fail_delete:
            raise RuntimeError('synthetic delete failure')
        self.removed.append(key)
        del self.objects[key]


@pytest.fixture
def storage(catalog):
    service, connection, objects = catalog
    seed(connection, 'E100', versions=3)
    del service.__dict__['_verified_object_bytes']
    service.settings.minio_bucket = 'synthetic'
    service.client = Objects(objects)
    for version in range(1, 4):
        payload = f'<svg xmlns="http://www.w3.org/2000/svg"><text>Version {version}</text></svg>'.encode()
        objects[f'layouts/E100/v{version}/layout.svg'] = payload
        connection.execute('UPDATE label_studio.layout_versions SET svg_sha256=? WHERE version=?',
                           (hashlib.sha256(payload).hexdigest(), version))
    connection.commit()
    return service, connection, objects


def move(service, connection, source='E100', target='AAAA'):
    checksum, title = connection.execute('SELECT v.svg_sha256, COALESCE(l.title_override,v.title) FROM label_studio.layouts l JOIN label_studio.layout_versions v ON l.label_code=v.label_code AND l.active_version=v.version WHERE l.label_code=?', (source,)).fetchone()
    moves = []
    with service._database.connect('synthetic') as transaction:
        with transaction.cursor() as cursor:
            service.manage_template(cursor, source, version=3, checksum=checksum,
                                    previous_title=title, title=target, new_code=target,
                                    relocations=moves)
    return moves


def test_every_version_copies_exact_bytes_before_commit_then_removes_unused_sources(storage):
    service, connection, objects = storage
    original = dict(objects)
    moves = move(service, connection)
    assert service.client.removed == []
    assert len(moves) == 3
    for version in range(1, 4):
        assert objects[f'layouts/AAAA/v{version}/layout.svg'] == original[f'layouts/E100/v{version}/layout.svg']
    assert connection.execute('SELECT object_key FROM label_studio.layout_versions ORDER BY version').fetchall() == [(f'layouts/AAAA/v{v}/layout.svg',) for v in range(1, 4)]
    service.cleanup_relocated_objects(moves)
    assert set(objects) == {f'layouts/AAAA/v{v}/layout.svg' for v in range(1, 4)}
    back = move(service, connection, 'AAAA', 'E100')
    service.cleanup_relocated_objects(back)
    assert objects == original


def test_corrupt_source_never_changes_references_or_deletes_objects(storage):
    service, connection, objects = storage
    objects['layouts/E100/v1/layout.svg'] = b'corrupt'
    with pytest.raises(LayoutArtifactError):
        move(service, connection)
    assert connection.execute('SELECT DISTINCT label_code FROM label_studio.layout_versions').fetchall() == [('E100',)]
    assert service.client.removed == []


def test_different_destination_never_overwritten(storage):
    service, connection, objects = storage
    objects['layouts/AAAA/v1/layout.svg'] = b'unrelated immutable SVG'
    before = dict(objects)
    with pytest.raises(LayoutArtifactError):
        move(service, connection)
    assert objects == before
    assert service.client.removed == []


def test_identical_unreferenced_copy_can_be_reconciled(storage):
    service, connection, objects = storage
    objects['layouts/AAAA/v1/layout.svg'] = objects['layouts/E100/v1/layout.svg']
    moves = move(service, connection)
    service.cleanup_relocated_objects(moves)
    assert len(objects) == 3


def test_destination_referenced_by_another_template_is_rejected_even_with_identical_bytes(storage):
    service, connection, objects = storage
    seed(connection, 'OTHER')
    connection.execute("UPDATE label_studio.layout_versions SET object_key='layouts/AAAA/v1/layout.svg' WHERE label_code='OTHER'")
    connection.commit()
    objects['layouts/AAAA/v1/layout.svg'] = objects['layouts/E100/v1/layout.svg']
    with pytest.raises(LayoutConflictError):
        move(service, connection)
    assert service.client.removed == []


def test_database_failure_preserves_originals_and_retains_verified_copies(storage):
    service, connection, objects = storage
    original = dict(objects)
    connection.execute("CREATE TRIGGER label_studio.block_move BEFORE UPDATE ON layout_versions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        move(service, connection)
    assert all(objects[key] == payload for key, payload in original.items())
    assert connection.execute('SELECT DISTINCT label_code FROM label_studio.layout_versions').fetchall() == [('E100',)]
    assert service.client.removed == []


def test_upload_acknowledgement_failure_keeps_database_and_originals(storage):
    service, connection, objects = storage
    original = dict(objects)

    def uncertain_put(key, payload):
        objects[key] = payload
        raise RuntimeError('synthetic lost upload acknowledgement')

    service._put_immutable = uncertain_put
    with pytest.raises(RuntimeError):
        move(service, connection)
    assert all(objects[key] == payload for key, payload in original.items())
    assert connection.execute('SELECT DISTINCT label_code FROM label_studio.layout_versions').fetchall() == [('E100',)]
    assert service.client.removed == []


def test_cleanup_failure_keeps_committed_template_readable(storage):
    service, connection, objects = storage
    moves = move(service, connection)
    service.client.fail_delete = True
    with pytest.raises(RuntimeError):
        service.cleanup_relocated_objects(moves)
    for key, checksum in connection.execute('SELECT object_key, svg_sha256 FROM label_studio.layout_versions'):
        assert service._verified_object_bytes(key, checksum) == objects[key]


def test_cleanup_never_deletes_a_source_referenced_after_rename(storage):
    service, connection, objects = storage
    moves = move(service, connection)
    seed(connection, 'OTHER')
    connection.execute("UPDATE label_studio.layout_versions SET object_key='layouts/E100/v1/layout.svg' WHERE label_code='OTHER'")
    connection.commit()
    service.cleanup_relocated_objects(moves)
    assert 'layouts/E100/v1/layout.svg' in objects
    assert 'layouts/E100/v1/layout.svg' not in service.client.removed
