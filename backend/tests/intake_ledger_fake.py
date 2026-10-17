"""Disposable transactional SQL fake; SQLite is NOT PostgreSQL runtime evidence.

Runs the repository's SQL against a tiny equivalent schema. BEGIN IMMEDIATE
simulates the cross-connection serialization provided by PostgreSQL row locks.
Faults distinguish rolled-back commits from lost acknowledgments after commit.
"""
from pathlib import Path
import sqlite3
from uuid import uuid4
from app.label_intake.identity import LedgerKeys
from app.label_intake.ledger import PostgresLedger

ROOT = Path(__file__).resolve().parents[2]


class LedgerDatabase:
    def __init__(self):
        self.directory = ROOT/'.tmp'/('t08-ledger-test-'+uuid4().hex)
        self.directory.mkdir(parents=True)
        self.path = self.directory/'fake.sqlite'
        self.fail_sql = None
        self.commit_fault = None
        self.rollback_fault = False
        self.closed = 0
        with sqlite3.connect(self.path) as connection:
            connection.executescript('''
                CREATE TABLE capacity (singleton INTEGER PRIMARY KEY, identities INTEGER);
                INSERT INTO capacity VALUES (1,0);
                CREATE TABLE key_versions (key_version TEXT PRIMARY KEY, key_check TEXT);
                CREATE TABLE requests (ledger_id TEXT PRIMARY KEY, sender TEXT, key_version TEXT,
                    identity_hmac TEXT, payload_hmac TEXT, owner_token TEXT, original_trace_id TEXT,
                    mode TEXT, state TEXT, created_at REAL, expires_at REAL, metadata TEXT, outcome TEXT,
                    UNIQUE(sender,key_version,identity_hmac));
                CREATE TABLE items (ledger_id TEXT, item_index INTEGER, state TEXT, metadata TEXT,
                    PRIMARY KEY(ledger_id,item_index));
                CREATE TABLE simulation_results (ledger_id TEXT PRIMARY KEY, response TEXT);
            ''')

    def connect(self):
        return Connection(self)

    def ledger(self, keys=None, clock=None):
        kwargs = {} if clock is None else {'clock':clock}
        return PostgresLedger(self.connect, keys or LedgerKeys('k1', {'k1':b'A'*32}), **kwargs)

    def rows(self, query):
        with sqlite3.connect(self.path) as connection:
            return connection.execute(query).fetchall()


class Connection:
    autocommit = False
    def __init__(self, database):
        self.database = database
        self.connection = sqlite3.connect(database.path, timeout=5)
        self.connection.execute('BEGIN IMMEDIATE')
    def cursor(self):
        return Cursor(self.connection.cursor(), self.database)
    def commit(self):
        fault = self.database.commit_fault
        self.database.commit_fault = None
        if fault == 'before':
            raise RuntimeError('synthetic commit rejected')
        self.connection.commit()
        if fault == 'after':
            raise RuntimeError('synthetic commit acknowledgment lost')
    def rollback(self):
        self.connection.rollback()
        if self.database.rollback_fault:
            raise RuntimeError('synthetic rollback acknowledgment lost')
    def close(self):
        self.connection.close(); self.database.closed += 1


class Cursor:
    def __init__(self, cursor, database): self.cursor, self.database = cursor, database
    def execute(self, sql, parameters=()):
        if self.database.fail_sql and self.database.fail_sql in sql:
            raise RuntimeError('synthetic SQL unavailable')
        translated = sql.replace('label_intake.','').replace('%s','?').replace('::jsonb','').replace(' FOR UPDATE','')
        self.cursor.execute(translated, parameters)
    def fetchone(self): return self.cursor.fetchone()
    def fetchall(self): return self.cursor.fetchall()
    def close(self): self.cursor.close()
