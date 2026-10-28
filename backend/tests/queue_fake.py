"""SQLite transaction fake for queue behavior; never PostgreSQL acceptance."""
import sqlite3
from tests.intake_ledger_fake import LedgerDatabase, Connection, Cursor


class QueueDatabase(LedgerDatabase):
    def __init__(self):
        super().__init__()
        with sqlite3.connect(self.path) as connection:
            connection.executescript('''
                CREATE TABLE queue_control(singleton INTEGER PRIMARY KEY,paused INTEGER,max_pending INTEGER);
                INSERT INTO queue_control VALUES(1,0,1000);
                CREATE TABLE printer_owners(destination TEXT PRIMARY KEY,owner TEXT,held INTEGER DEFAULT 0,updated_at INTEGER DEFAULT (unixepoch()));
                CREATE TABLE queue(sequence INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id TEXT UNIQUE,request_id TEXT,sender TEXT,
                    target_id TEXT,destination TEXT,mode TEXT,state TEXT,ciphertext BLOB,key_version TEXT,credential_digest BLOB,
                    policy_revision TEXT,worker_id TEXT,started_at INTEGER,finished_at INTEGER,
                    created_at INTEGER DEFAULT (unixepoch()),expires_at INTEGER DEFAULT (unixepoch()+86400), UNIQUE(sender,request_id));
                CREATE TABLE queue_workers(worker_id TEXT PRIMARY KEY,heartbeat INTEGER,current_job TEXT);
                CREATE TABLE queue_audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id TEXT,printer_owner TEXT,
                    actor TEXT,action TEXT,note TEXT,at INTEGER DEFAULT (unixepoch()));
            ''')

    def connect(self):
        return QueueConnection(self)


class QueueConnection(Connection):
    def cursor(self):
        return QueueCursor(self.connection.cursor(),self.database)


class QueueCursor(Cursor):
    @property
    def rowcount(self):
        return self.cursor.rowcount

    def execute(self,sql,parameters=()):
        sql = sql.replace('now()', 'unixepoch()').replace(' FOR UPDATE OF q SKIP LOCKED','').replace("interval '24 hours'",'86400')
        super().execute(sql,parameters)
