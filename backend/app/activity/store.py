"""Explicitly provisioned PostgreSQL activity history. No memory/file fallback."""
import json
import os


class ActivityUnavailable(Exception):
    pass


class ActivityStore:
    def __init__(self, database_url):
        self.database_url = database_url

    def _connect(self):
        import psycopg
        return psycopg.connect(self.database_url, connect_timeout=3,
                              options='-c statement_timeout=3000 -c lock_timeout=1000')

    def append(self, event):
        packed = json.dumps(event)
        if len(packed.encode('utf-8')) > 256 * 1024:
            raise ActivityUnavailable()
        try:
            with self._connect() as connection, connection.cursor() as cursor:
                cursor.execute('INSERT INTO app_management.activity_log(event) VALUES (%s::jsonb)', (packed,))
        except Exception:
            raise ActivityUnavailable() from None

    def read(self):
        try:
            with self._connect() as connection, connection.cursor() as cursor:
                cursor.execute('SELECT event FROM app_management.activity_log ORDER BY sequence DESC LIMIT 200')
                return [row[0] for row in cursor.fetchall()]
        except Exception:
            raise ActivityUnavailable() from None


def configured_activity_store(app):
    injected = getattr(app.state, 'activity_store', None)
    if injected is not None:
        return injected
    enabled = os.environ.get('TLS_ACTIVITY_ENABLED', 'false')
    if enabled == 'false':
        return None
    if enabled != 'true':
        raise ActivityUnavailable()
    from app.config import get_settings
    persistence = get_settings().persistence
    if persistence is None:
        raise ActivityUnavailable()
    return ActivityStore(persistence.database_url)
