"""Small immutable image blobs share Studio PostgreSQL; no implicit schema changes."""
import base64
from datetime import datetime, timezone
from uuid import uuid4
from .validation import validate_graphic


class GraphicsUnavailable(RuntimeError): pass
class GraphicNotFound(ValueError): pass


class GraphicsService:
    def __init__(self, settings):
        import psycopg
        self._database = psycopg
        self.settings = settings

    def _execute(self, sql, args=None, many=False):
        try:
            with self._database.connect(self.settings.database_url, connect_timeout=3,
                    options='-c statement_timeout=10000 -c lock_timeout=3000') as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, args)
                    return cursor.fetchall() if many else cursor.fetchone()
        except Exception as exc:
            raise GraphicsUnavailable('Graphics storage is unavailable.') from exc

    @staticmethod
    def _summary(row):
        return {'id': str(row[0]), 'name': row[1], 'content_type': row[2], 'byte_length': row[3], 'width': row[4], 'height': row[5], 'updated_at': row[6], 'version': 1}

    def create(self, value):
        name, mime, data, width, height = validate_graphic(value)
        row = self._execute('''INSERT INTO label_studio.graphics
            (id, name, content_type, content, width, height, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id,name,content_type,octet_length(content),width,height,created_at''',
            (uuid4(), name, mime, data, width, height, datetime.now(timezone.utc)))
        return self._summary(row)

    def list(self, offset=0, query=''):
        rows = self._execute('''SELECT id,name,content_type,octet_length(content),width,height,created_at
            FROM label_studio.graphics WHERE strpos(lower(name),lower(%s)) > 0
            ORDER BY created_at DESC,id LIMIT 100 OFFSET %s''',
            (query, offset), many=True)
        return [self._summary(row) for row in rows]

    def get(self, identifier):
        row = self._execute('''SELECT id,name,content_type,octet_length(content),width,height,created_at,content
            FROM label_studio.graphics WHERE id=%s''', (identifier,))
        if row is None: raise GraphicNotFound()
        return {**self._summary(row), 'data_uri': f'data:{row[2]};base64,' + base64.b64encode(bytes(row[7])).decode('ascii')}
