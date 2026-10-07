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


LAYOUT_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS label_studio;
CREATE TABLE IF NOT EXISTS label_studio.layouts (
    label_code varchar(128) PRIMARY KEY,
    active_version integer NOT NULL CHECK (active_version >= 1),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at)
);
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
            SELECT v.label_code, v.title, v.version, v.width_mm, v.height_mm,
                   v.dpi, v.svg_sha256, v.object_key, v.created_at
            FROM label_studio.layouts l
            JOIN label_studio.layout_versions v
              ON v.label_code = l.label_code AND v.version = l.active_version
            ORDER BY v.updated_at DESC, v.label_code
        """
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(query)
                    return [self._summary(row) for row in cursor.fetchall()]
        except Exception as exc:
            raise LayoutPersistenceError("Layout persistence is unavailable.") from exc

    def get_layout(self, label_code: str) -> StoredLayout:
        query = """
            SELECT v.label_code, v.title, v.version, v.width_mm, v.height_mm,
                   v.dpi, v.svg_sha256, v.object_key, v.created_at
            FROM label_studio.layouts l
            JOIN label_studio.layout_versions v
              ON v.label_code = l.label_code AND v.version = l.active_version
            WHERE l.label_code = %s
        """
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(query, (label_code,))
                    row = cursor.fetchone()
            if row is None:
                raise LayoutNotFoundError("Layout was not found.")
            summary = self._summary(row)
            response = self.client.get_object(self.settings.minio_bucket, summary.object_key)
            try:
                svg_bytes = response.read()
            finally:
                response.close()
                response.release_conn()
            if len(svg_bytes) > 512 * 1024 or hashlib.sha256(svg_bytes).hexdigest() != summary.svg_sha256:
                raise LayoutPersistenceError("Stored layout artifact is invalid.")
            svg = validate_safe_svg(svg_bytes.decode("utf-8"))
            return StoredLayout(**summary.model_dump(), svg=svg)
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
                    cursor.execute(
                        "SELECT COALESCE(MAX(version), 0) + 1 FROM label_studio.layout_versions WHERE label_code = %s",
                        (stored_request.label_code,),
                    )
                    version_number = cursor.fetchone()[0]
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
                           SET active_version = EXCLUDED.active_version, updated_at = EXCLUDED.updated_at""",
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
