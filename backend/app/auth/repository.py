"""Data access repository for application users and sessions.

Decoupled via AuthRepository interface so it can be swapped to PostgreSQL or an
enterprise identity provider in production.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import List, Optional
import uuid

from .models import Role, Session, User

logger = logging.getLogger("auth_repository")


class AuthRepository(ABC):
    """Abstract interface defining required authentication persistence operations."""

    @abstractmethod
    def get_user_by_username(self, username: str) -> Optional[User]:
        pass

    @abstractmethod
    def get_user_by_id(self, user_id: str) -> Optional[User]:
        pass

    @abstractmethod
    def create_user(
        self,
        username: str,
        password_hash: str,
        role: Role,
        is_active: bool = True,
        user_id: Optional[str] = None,
    ) -> User:
        pass

    @abstractmethod
    def update_user_password(self, user_id: str, new_password_hash: str) -> bool:
        pass

    @abstractmethod
    def set_user_active(self, user_id: str, is_active: bool) -> bool:
        pass

    @abstractmethod
    def list_users(self) -> List[User]:
        pass

    @abstractmethod
    def save_session(self, session: Session) -> None:
        pass

    @abstractmethod
    def get_session_by_hash(self, session_hash: str) -> Optional[Session]:
        pass

    @abstractmethod
    def update_session_activity(self, session_hash: str, last_activity: datetime) -> None:
        pass

    @abstractmethod
    def delete_session(self, session_hash: str) -> bool:
        pass

    @abstractmethod
    def delete_sessions_for_user(self, user_id: str) -> int:
        pass

    @abstractmethod
    def cleanup_expired_sessions(self, now: Optional[datetime] = None) -> int:
        pass


class SqliteAuthRepository(AuthRepository):
    """SQLite-based implementation of AuthRepository on local durable volume."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path).resolve()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            check_same_thread=False,
            isolation_level=None,  # Autocommit mode for explicit transactions
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _init_db(self) -> None:
        """Initializes database schema if tables do not exist."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS auth_users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    session_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    role TEXT NOT NULL,
                    csrf_token TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_activity_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
            """)

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> User:
        return User(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
            role=Role.from_str(row["role"]),
            is_active=bool(row["is_active"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    @staticmethod
    def _row_to_session(row: sqlite3.Row) -> Session:
        return Session(
            session_id="",  # The raw unhashed session_id is never stored
            session_hash=row["session_hash"],
            user_id=row["user_id"],
            username=row["username"],
            role=Role.from_str(row["role"]),
            csrf_token=row["csrf_token"],
            created_at=datetime.fromisoformat(row["created_at"]),
            expires_at=datetime.fromisoformat(row["expires_at"]),
            last_activity_at=datetime.fromisoformat(row["last_activity_at"]),
        )

    def get_user_by_username(self, username: str) -> Optional[User]:
        clean_username = username.strip().lower()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM auth_users WHERE lower(username) = ?",
                (clean_username,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_user(row)
        return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM auth_users WHERE id = ?",
                (user_id,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_user(row)
        return None

    def create_user(
        self,
        username: str,
        password_hash: str,
        role: Role,
        is_active: bool = True,
        user_id: Optional[str] = None,
    ) -> User:
        clean_username = username.strip()
        now = datetime.now(timezone.utc)
        uid = user_id or str(uuid.uuid4())
        now_iso = now.isoformat()
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO auth_users (id, username, password_hash, role, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        clean_username,
                        password_hash,
                        role.value,
                        1 if is_active else 0,
                        now_iso,
                        now_iso,
                    ),
                )
        except sqlite3.IntegrityError:
            raise ValueError(f"User with username '{clean_username}' already exists.") from None
        return User(
            id=uid,
            username=clean_username,
            password_hash=password_hash,
            role=role,
            is_active=is_active,
            created_at=now,
            updated_at=now,
        )

    def update_user_password(self, user_id: str, new_password_hash: str) -> bool:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (new_password_hash, now_iso, user_id),
            )
            return cursor.rowcount > 0

    def set_user_active(self, user_id: str, is_active: bool) -> bool:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "UPDATE auth_users SET is_active = ?, updated_at = ? WHERE id = ?",
                (1 if is_active else 0, now_iso, user_id),
            )
            return cursor.rowcount > 0

    def list_users(self) -> List[User]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM auth_users ORDER BY username ASC")
            return [self._row_to_user(row) for row in cursor.fetchall()]

    def save_session(self, session: Session) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO auth_sessions (
                    session_hash, user_id, username, role, csrf_token,
                    created_at, expires_at, last_activity_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_hash) DO UPDATE SET
                    last_activity_at = excluded.last_activity_at,
                    expires_at = excluded.expires_at
                """,
                (
                    session.session_hash,
                    session.user_id,
                    session.username,
                    session.role.value,
                    session.csrf_token,
                    session.created_at.isoformat(),
                    session.expires_at.isoformat(),
                    session.last_activity_at.isoformat(),
                ),
            )

    def get_session_by_hash(self, session_hash: str) -> Optional[Session]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM auth_sessions WHERE session_hash = ?",
                (session_hash,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_session(row)
        return None

    def update_session_activity(self, session_hash: str, last_activity: datetime) -> None:
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE auth_sessions SET last_activity_at = ? WHERE session_hash = ?",
                (last_activity.isoformat(), session_hash),
            )

    def delete_session(self, session_hash: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM auth_sessions WHERE session_hash = ?",
                (session_hash,),
            )
            return cursor.rowcount > 0

    def delete_sessions_for_user(self, user_id: str) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM auth_sessions WHERE user_id = ?",
                (user_id,),
            )
            return cursor.rowcount

    def cleanup_expired_sessions(self, now: Optional[datetime] = None) -> int:
        ref_time = now or datetime.now(timezone.utc)
        ref_iso = ref_time.isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM auth_sessions WHERE expires_at < ?",
                (ref_iso,),
            )
            return cursor.rowcount
