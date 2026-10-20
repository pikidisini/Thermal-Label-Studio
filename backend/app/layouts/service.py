"""Direct PostgreSQL and MinIO implementation for persisted Studio layouts."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from io import BytesIO
import time

from app.config import PersistenceSettings
from app.svg_safety import validate_safe_svg

from .models import LayoutSummary, SaveLayoutRequest, StoredLayout, published_version


class LayoutNotFoundError(ValueError):
    pass


class LayoutConflictError(ValueError):
    pass


class LayoutPersistenceError(RuntimeError):
    pass


class LayoutArtifactError(LayoutPersistenceError):
    """An existing artifact failed integrity or safe-SVG validation."""


LAYOUT_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS label_studio;
CREATE TABLE IF NOT EXISTS label_studio.layouts (
    label_code varchar(128) PRIMARY KEY,
    active_version integer NOT NULL CHECK (active_version >= 1),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at)
);
ALTER TABLE label_studio.layouts ADD COLUMN IF NOT EXISTS title_override varchar(160);
ALTER TABLE label_studio.layouts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS label_studio.layout_versions (
    label_code varchar(128) NOT NULL REFERENCES label_studio.layouts(label_code),
    version integer NOT NULL CHECK (version >= 1),
    title varchar(160) NOT NULL CHECK (length(btrim(title)) > 0),
    width_mm numeric(8, 3) NOT NULL CHECK (width_mm BETWEEN 10 AND 500),
    height_mm numeric(8, 3) NOT NULL CHECK (height_mm BETWEEN 10 AND 500),
    dpi numeric(8, 3) NOT NULL CHECK (dpi BETWEEN 72 AND 600),
    status varchar(16) NOT NULL CHECK (status = 'published'),
    svg_sha256 char(64) NOT NULL CHECK (svg_sha256 ~ '^[0-9a-f]{64}$'),
    object_key varchar(512) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    PRIMARY KEY (label_code, version)
);
"""


class LayoutService:
    """One concrete service; no storage/provider indirection is introduced."""

    def __init__(self, settings: PersistenceSettings) -> None:
        # Fixture-only startup must not require persistence drivers.
        import psycopg
        from minio import Minio
        from minio.error import S3Error

        self._database = psycopg
        self._s3_error = S3Error
        self.settings = settings
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def initialize(self) -> None:
        for attempt in range(20):
            try:
                with self._database.connect(self.settings.database_url) as connection:
                    with connection.cursor() as cursor:
                        cursor.execute(LAYOUT_SCHEMA_SQL)
                if not self.client.bucket_exists(self.settings.minio_bucket):
                    self.client.make_bucket(self.settings.minio_bucket)
                return
            except Exception:
                if attempt == 19:
                    break
                time.sleep(1)
        raise LayoutPersistenceError("Layout persistence is unavailable.")

    def list_layouts(self) -> list[LayoutSummary]:
        query = """
            SELECT v.label_code, COALESCE(l.title_override, v.title), v.version, v.width_mm, v.height_mm,
                   v.dpi, v.svg_sha256, v.object_key, v.created_at
            FROM label_studio.layouts l
            JOIN label_studio.layout_versions v
              ON v.label_code = l.label_code AND v.version = l.active_version
            WHERE l.deleted_at IS NULL
            ORDER BY l.updated_at DESC, v.label_code
        """
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(query)
                    return [self._summary(row) for row in cursor.fetchall()]
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def list_versions(self, label_code: str) -> list[LayoutSummary]:
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("""SELECT v.label_code, v.title, v.version, v.width_mm, v.height_mm,
                        v.dpi, v.svg_sha256, v.object_key, v.created_at
                        FROM label_studio.layouts l JOIN label_studio.layout_versions v
                        ON v.label_code = l.label_code WHERE l.label_code = %s AND l.deleted_at IS NULL
                        ORDER BY v.version DESC""", (label_code,))
                    rows = cursor.fetchall()
            if not rows:
                raise LayoutNotFoundError("Layout was not found.")
            return [self._summary(row) for row in rows]
        except LayoutNotFoundError:
            raise
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def get_layout(self, label_code: str, version: int | None = None) -> StoredLayout:
        query = """
            SELECT v.label_code, COALESCE(l.title_override, v.title), v.version, v.width_mm, v.height_mm,
                   v.dpi, v.svg_sha256, v.object_key, v.created_at
            FROM label_studio.layouts l
            JOIN label_studio.layout_versions v
              ON v.label_code = l.label_code AND v.version = l.active_version
            WHERE l.label_code = %s AND l.deleted_at IS NULL
        """
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    # Keep an acknowledged rename's cleanup from removing the
                    # selected old object between metadata lookup and download.
                    cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (label_code,))
                    if version is None:
                        cursor.execute(query, (label_code,))
                    else:
                        cursor.execute(query.replace('v.version = l.active_version', 'v.version = %s'), (version, label_code))
                    row = cursor.fetchone()
                    if row is None:
                        raise LayoutNotFoundError("Layout was not found.")
                    summary = self._summary(row)
                    svg_bytes = self._verified_object_bytes(summary.object_key, summary.svg_sha256)
            try:
                svg = svg_bytes.decode("utf-8")
                validate_safe_svg(svg)
            except (ValueError, UnicodeError) as exc:
                raise LayoutArtifactError("Stored layout artifact is invalid.") from exc
            # Return the exact checksum-verified artifact, not a second XML
            # serialization whose bytes no longer identify the stored version.
            return StoredLayout(**summary.model_dump(), svg=svg)
        except (LayoutNotFoundError, LayoutArtifactError):
            raise
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def manage_template(self, cursor, label_code, *, version, checksum, previous_title, title=None, new_code=None, delete=False, relocations=None):
        """Copy verified SVGs before committing their new references and audit."""
        for code in sorted({label_code, new_code or label_code}):
            cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (code,))
        cursor.execute("""SELECT l.active_version, v.svg_sha256, COALESCE(l.title_override, v.title)
            FROM label_studio.layouts l JOIN label_studio.layout_versions v
            ON v.label_code = l.label_code AND v.version = l.active_version
            WHERE l.label_code = %s AND l.deleted_at IS NULL FOR UPDATE OF l""", (label_code,))
        row = cursor.fetchone()
        if row is None:
            raise LayoutNotFoundError('Layout was not found.')
        if row[0] != version or row[1] != checksum or row[2] != previous_title:
            raise LayoutConflictError('Template changed. Refresh before saving again.')
        before = dict(label_code=label_code, title=row[2], version=row[0], svg_sha256=row[1])
        if delete:
            cursor.execute('UPDATE label_studio.layouts SET deleted_at = now(), updated_at = now() WHERE label_code = %s', (label_code,))
            return before, dict(before, deleted=True)
        if new_code != label_code:
            self._release_renamed_code(cursor, new_code)
            cursor.execute('SELECT label_code FROM label_studio.layouts WHERE label_code = %s', (new_code,))
            if cursor.fetchone() is not None:
                raise LayoutConflictError('Label code already exists or was previously used.')
        moves = self._relocate_template_objects(cursor, label_code, new_code)
        if relocations is not None:
            relocations.extend(moves)
        if new_code != label_code:
            cursor.execute("""INSERT INTO label_studio.layouts(label_code, active_version, created_at, updated_at, title_override)
                SELECT %s, active_version, created_at, now(), %s FROM label_studio.layouts WHERE label_code = %s""", (new_code, title, label_code))
            cursor.execute('UPDATE label_studio.layout_versions SET label_code = %s WHERE label_code = %s', (new_code, label_code))
            # All versions now belong to the new identity; release the old code.
            cursor.execute('UPDATE label_studio.layouts SET deleted_at = now(), updated_at = now() WHERE label_code = %s', (label_code,))
            self._release_renamed_code(cursor, label_code)
        else:
            cursor.execute('UPDATE label_studio.layouts SET title_override = %s, updated_at = now() WHERE label_code = %s', (title, label_code))
        after = dict(before, label_code=new_code, title=title)
        if moves:
            after['object_moves'] = moves
        return before, after

    def _verified_object_bytes(self, object_key, checksum):
        response = self.client.get_object(self.settings.minio_bucket, object_key)
        try:
            payload = response.read(512 * 1024 + 1)
        finally:
            response.close()
            response.release_conn()
        if len(payload) > 512 * 1024 or hashlib.sha256(payload).hexdigest() != checksum:
            raise LayoutArtifactError('Stored layout artifact is invalid.')
        return payload

    def _relocate_template_objects(self, cursor, label_code, new_code):
        """Never overwrite an existing object or remove a source before commit.

        Identical unreferenced destinations from an interrupted copy may be reused.
        Different bytes or another version's reference are always a conflict.
        """
        cursor.execute('SELECT version, object_key, svg_sha256 FROM label_studio.layout_versions WHERE label_code = %s ORDER BY version', (label_code,))
        moves = []
        for version, source, checksum in cursor.fetchall():
            target = f'layouts/{new_code}/v{version}/layout.svg'
            if source == target:
                continue
            cursor.execute('SELECT label_code FROM label_studio.layout_versions WHERE object_key = %s', (target,))
            if cursor.fetchone() is not None:
                raise LayoutConflictError('Destination object belongs to another template version.')
            payload = self._verified_object_bytes(source, checksum)
            try:
                self._put_immutable(target, payload)
            except LayoutConflictError:
                # A previous interrupted operation may have left this exact copy.
                if self._verified_object_bytes(target, checksum) != payload:
                    raise LayoutConflictError('Destination object content differs.') from None
            self._verified_object_bytes(target, checksum)
            moves.append(dict(version=version, source=source, target=target, svg_sha256=checksum))
        for move in moves:
            cursor.execute('UPDATE label_studio.layout_versions SET object_key = %s WHERE label_code = %s AND version = %s',
                           (move['target'], label_code, move['version']))
        return moves

    def cleanup_relocated_objects(self, moves):
        """After an acknowledged commit, remove only checksum-verified unused sources.

        Lock both prefixes just like rename/save and recheck references under the
        locks. On uncertain commit this method must not be invoked. Cleanup can
        be incomplete without invalidating the committed destination references.
        """
        with self._database.connect(self.settings.database_url) as connection:
            with connection.cursor() as cursor:
                codes = {move[key].split('/')[1] for move in moves for key in ('source', 'target')}
                for code in sorted(codes):
                    cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', (code,))
                for move in moves:
                    cursor.execute('SELECT label_code FROM label_studio.layout_versions WHERE object_key = %s', (move['source'],))
                    if cursor.fetchone() is not None:
                        continue
                    cursor.execute('SELECT label_code FROM label_studio.layout_versions WHERE object_key = %s AND svg_sha256 = %s',
                                   (move['target'], move['svg_sha256']))
                    if cursor.fetchone() is None:
                        continue
                    self._verified_object_bytes(move['target'], move['svg_sha256'])
                    self._verified_object_bytes(move['source'], move['svg_sha256'])
                    self.client.remove_object(self.settings.minio_bucket, move['source'])

    @staticmethod
    def _release_renamed_code(cursor, label_code):
        """Release only empty rename reservations, retaining actual deleted histories.

        Also handles reservations created before code reuse was supported. Callers
        hold the code's advisory lock and commit this with their normal operation.
        Immutable SVG objects and management audit evidence are never removed.
        """
        cursor.execute("""DELETE FROM label_studio.layouts
            WHERE label_code = %s AND deleted_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM label_studio.layout_versions
                WHERE label_studio.layout_versions.label_code = label_studio.layouts.label_code)""", (label_code,))

    def rename_layout(self, label_code: str, title: str) -> LayoutSummary:
        return self._manage_layout(label_code, title)

    def delete_layout(self, label_code: str) -> None:
        self._manage_layout(label_code, None)

    def _manage_layout(self, label_code: str, title: str | None) -> LayoutSummary | None:
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (label_code,))
                    if title is None:
                        cursor.execute(
                            """UPDATE label_studio.layouts SET deleted_at = now(), updated_at = now()
                               WHERE label_code = %s AND deleted_at IS NULL RETURNING label_code""",
                            (label_code,),
                        )
                    else:
                        cursor.execute(
                            """UPDATE label_studio.layouts SET title_override = %s, updated_at = now()
                               WHERE label_code = %s AND deleted_at IS NULL RETURNING label_code""",
                            (title, label_code),
                        )
                    if cursor.fetchone() is None:
                        raise LayoutNotFoundError("Layout was not found.")
                    if title is None:
                        return None
                    cursor.execute(
                        """SELECT v.label_code, COALESCE(l.title_override, v.title), v.version,
                                  v.width_mm, v.height_mm, v.dpi, v.svg_sha256, v.object_key, v.created_at
                           FROM label_studio.layouts l JOIN label_studio.layout_versions v
                           ON v.label_code = l.label_code AND v.version = l.active_version
                           WHERE l.label_code = %s AND l.deleted_at IS NULL""", (label_code,),
                    )
                    summary = self._summary(cursor.fetchone())
            return summary
        except LayoutNotFoundError:
            raise
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def save_layout(self, request: SaveLayoutRequest) -> LayoutSummary:
        try:
            svg = validate_safe_svg(request.svg)
            stored_request = SaveLayoutRequest(**{**request.model_dump(), "svg": svg})
            payload = svg.encode("utf-8")
            now = datetime.now(timezone.utc)
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (stored_request.label_code,))
                    self._release_renamed_code(cursor, stored_request.label_code)
                    cursor.execute(
                        "SELECT COALESCE(MAX(version), 0) + 1 FROM label_studio.layout_versions WHERE label_code = %s",
                        (stored_request.label_code,),
                    )
                    version_number = cursor.fetchone()[0]
                    cursor.execute("SELECT deleted_at FROM label_studio.layouts WHERE label_code = %s", (stored_request.label_code,))
                    existing = cursor.fetchone()
                    if existing is not None and existing[0] is not None:
                        raise LayoutConflictError("Deleted layout identifiers cannot be reused.")
                    # A failed/ambiguous commit can leave an immutable artifact.
                    # Preserve it: a commit acknowledgement failure does not prove
                    # rollback. Under the per-label DB lock, choose a fresh key
                    # instead of overwriting or deleting a possibly published SVG.
                    for _ in range(32):
                        version = published_version(stored_request, version_number)
                        try:
                            self._put_immutable(version.object_key, payload)
                            break
                        except LayoutConflictError:
                            version_number += 1
                    else:
                        raise LayoutPersistenceError("Layout artifact allocation is unavailable.")
                    cursor.execute(
                        """INSERT INTO label_studio.layouts (label_code, active_version, created_at, updated_at)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (label_code) DO UPDATE
                           SET active_version = EXCLUDED.active_version, updated_at = EXCLUDED.updated_at, title_override = NULL""",
                        (version.label_code, version.version, now, now),
                    )
                    cursor.execute(
                        """INSERT INTO label_studio.layout_versions
                           (label_code, version, title, width_mm, height_mm, dpi, status, svg_sha256, object_key, created_at, updated_at)
                           VALUES (%s, %s, %s, %s, %s, %s, 'published', %s, %s, %s, %s)""",
                        (version.label_code, version.version, version.title, version.width_mm,
                         version.height_mm, version.dpi, version.svg_sha256, version.object_key, now, now),
                    )
            return LayoutSummary.from_version(version, now)
        except LayoutConflictError:
            raise
        except ValueError as exc:
            raise LayoutPersistenceError("Layout content is invalid.") from exc
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def _put_immutable(self, object_key: str, payload: bytes) -> None:
        try:
            self.client.stat_object(self.settings.minio_bucket, object_key)
        except self._s3_error as exc:
            if exc.code not in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
                raise LayoutPersistenceError("Layout artifact could not be published.") from exc
        else:
            raise LayoutConflictError("Layout version already exists.")
        self.client.put_object(
            self.settings.minio_bucket,
            object_key,
            BytesIO(payload),
            length=len(payload),
            content_type="image/svg+xml",
        )

    @staticmethod
    def _summary(row: tuple) -> LayoutSummary:
        return LayoutSummary(
            label_code=row[0], title=row[1], version=row[2], width_mm=float(row[3]),
            height_mm=float(row[4]), dpi=float(row[5]), svg_sha256=row[6],
            object_key=row[7], created_at=row[8],
        )
