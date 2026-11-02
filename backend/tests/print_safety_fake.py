"""SQLite transaction fake, explicitly not PostgreSQL locking acceptance."""
import sqlite3
from threading import Lock
from app.printing.durable import DirectPrintStore
from .queue_fake import QueueDatabase, QueueConnection, QueueCursor


class SafetyDatabase(QueueDatabase):
    def __init__(self):
        super().__init__()
        self.locks = {}
        self.lock_guard = Lock()
        with sqlite3.connect(self.path) as connection:
            connection.executescript("""
                CREATE TABLE direct_print_jobs(job_id TEXT PRIMARY KEY,account_id TEXT,kind TEXT,
                    fingerprint TEXT,destination TEXT,payload_hashes TEXT,items TEXT,response TEXT,state TEXT,
                    created_at INTEGER DEFAULT (unixepoch()),updated_at INTEGER DEFAULT (unixepoch()));
                CREATE TABLE printer_safety_audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner TEXT,actor TEXT,action TEXT,note TEXT,at INTEGER DEFAULT (unixepoch()));
            """)

    def connect(self):
        return SafetyConnection(self)

    def store(self):
        return DirectPrintStore(self.connect)


class SafetyConnection(QueueConnection):
    def __init__(self, database):
        super().__init__(database)
        self.session_locks = []
        self.transaction_locks = []

    def cursor(self):
        return SafetyCursor(self.connection.cursor(),self.database,self)

    def commit(self):
        super().commit()
        self.release(self.transaction_locks)

    def rollback(self):
        super().rollback()
        self.release(self.transaction_locks)

    @staticmethod
    def release(locks):
        while locks: locks.pop().release()

    def close(self):
        super().close()
        self.release(self.session_locks)
        self.release(self.transaction_locks)


class SafetyCursor(QueueCursor):
    def __init__(self,cursor,database,connection):
        super().__init__(cursor,database)
        self.connection = connection
        self.synthetic = None

    def execute(self,sql,parameters=()):
        self.synthetic = None
        if 'pg_try_advisory' in sql:
            with self.database.lock_guard:
                lock=self.database.locks.setdefault(parameters[0],Lock())
            acquired=lock.acquire(blocking=False)
            if acquired:
                locks=self.connection.transaction_locks if 'xact' in sql else self.connection.session_locks
                locks.append(lock)
            self.synthetic=(acquired,)
        elif 'to_regclass' in sql:
            self.synthetic=('queue',)
        else:
            super().execute(sql,parameters)

    def fetchone(self):
        if self.synthetic is not None:
            row,self.synthetic=self.synthetic,None
            return row
        return super().fetchone()
