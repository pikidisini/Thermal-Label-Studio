"""PostgreSQL-only persistence; drivers load only when configured."""
from datetime import datetime, timezone
from uuid import uuid4

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS label_studio;
CREATE TABLE IF NOT EXISTS label_studio.studio_sample_datasets (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
 original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL CHECK (updated_at >= created_at)
);
CREATE INDEX IF NOT EXISTS studio_sample_datasets_created_idx
 ON label_studio.studio_sample_datasets (created_at DESC, id);
"""

class DatasetPersistenceError(RuntimeError): pass
class DatasetNotFoundError(ValueError): pass

class StudioDatasetService:
    def __init__(self, settings):
        import psycopg
        from psycopg.types.json import Jsonb
        self._database = psycopg
        self._jsonb = Jsonb
        self.settings = settings

    def initialize(self):
        self._execute(SCHEMA_SQL)

    def _execute(self, sql, args=None, many=False):
        try:
            with self._database.connect(self.settings.database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, args)
                    if cursor.description is None: return None
                    return cursor.fetchall() if many else cursor.fetchone()
        except Exception as exc:
            raise DatasetPersistenceError("Sample dataset storage is unavailable.") from exc

    @staticmethod
    def _summary(row):
        return dict(id=str(row[0]), name=row[1], original_filename=row[2], created_at=row[3], updated_at=row[4])

    def create(self, name, original_filename, payload):
        identifier = uuid4(); now = datetime.now(timezone.utc)
        self._execute("""INSERT INTO label_studio.studio_sample_datasets
            (id, name, original_filename, payload, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)""",
            (identifier, name, original_filename, self._jsonb(payload), now, now))
        return self._summary((identifier, name, original_filename, now, now))

    def list(self):
        rows = self._execute("""SELECT id, name, original_filename, created_at, updated_at
            FROM label_studio.studio_sample_datasets ORDER BY created_at DESC, id""", many=True)
        return [self._summary(row) for row in rows]

    def get(self, identifier):
        row = self._execute("""SELECT id, name, original_filename, created_at, updated_at, payload
            FROM label_studio.studio_sample_datasets WHERE id = %s""", (identifier,))
        if row is None: raise DatasetNotFoundError("Sample dataset was not found.")
        return {**self._summary(row), "payload": row[5]}
