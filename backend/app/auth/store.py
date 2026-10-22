"""Transactional PostgreSQL account repository; schema is provisioned explicitly."""
from contextlib import contextmanager
import json

TABLES = {'users': 'accounts', 'sessions': 'sessions', 'limits': 'login_limits'}


class Repository:
    def __init__(self, cursor):
        self.cursor = cursor

    def get(self, kind, key):
        self.cursor.execute(f'SELECT document FROM studio_auth.{TABLES[kind]} WHERE id = %s', (key,))
        row = self.cursor.fetchone()
        return row[0] if row else None

    def put(self, kind, key, document):
        self.cursor.execute(f'INSERT INTO studio_auth.{TABLES[kind]} (id, document) VALUES (%s, %s::jsonb) '
                            'ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document', (key, json.dumps(document)))

    def delete(self, kind, key):
        self.cursor.execute(f'DELETE FROM studio_auth.{TABLES[kind]} WHERE id = %s', (key,))

    def all(self, kind):
        self.cursor.execute(f'SELECT id, document FROM studio_auth.{TABLES[kind]}')
        return dict(self.cursor.fetchall())

    def event(self, event):
        self.cursor.execute('INSERT INTO studio_auth.security_events(document) VALUES (%s::jsonb)', (json.dumps(event),))


class AuthStore:
    def __init__(self, dsn):
        self.dsn = dsn

    @contextmanager
    def transaction(self):
        import psycopg
        with psycopg.connect(self.dsn, connect_timeout=3,
                            options='-c statement_timeout=10000 -c lock_timeout=3000') as connection:
            with connection.cursor() as cursor:
                # Serialize auth mutations, including concurrent last-admin changes.
                # This is a bounded LAN-account store, not a distributed identity service.
                cursor.execute('SELECT pg_advisory_xact_lock(798621504)')
                yield Repository(cursor)
