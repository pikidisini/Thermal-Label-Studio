"""Core authentication and session management service.

Implements:
- OWASP rate-limiting / account lockout protection against brute-force attacks.
- Constant-time verification to prevent username enumeration via timing attacks.
- Cryptographically secure random session and CSRF token generation.
- Session revocation on logout, account deactivation, or password change.
- Generic error messages that do not reveal whether an account exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
import secrets
from threading import RLock
from typing import Dict, List, Optional, Tuple

from ..config import BACKEND_DIR
from .models import Role, Session, User
from .repository import AuthRepository, SqliteAuthRepository
from .security import generate_secure_token, hash_password, hash_token, verify_password

logger = logging.getLogger("auth_service")

# Security Parameters
MAX_LOGIN_FAILURES = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes
DEFAULT_SESSION_TTL_SECONDS = 8 * 3600  # 8 hours

# Precomputed dummy hash for timing attack mitigation when username does not exist
DUMMY_PASSWORD_HASH = hash_password("dummy_password_for_timing_mitigation_owasp")


@dataclass
class LockoutState:
    failure_count: int
    first_failure_at: datetime
    locked_until: Optional[datetime] = None


class AuthService:
    """Manages application authentication, rate-limiting, and session validation."""

    def __init__(
        self,
        repository: Optional[AuthRepository] = None,
        session_ttl_seconds: int = DEFAULT_SESSION_TTL_SECONDS,
    ) -> None:
        if repository is None:
            db_path = BACKEND_DIR / "data" / "auth.db"
            repository = SqliteAuthRepository(db_path)
        self.repository = repository
        self.session_ttl_seconds = session_ttl_seconds
        self._lock = RLock()
        self._lockouts: Dict[str, LockoutState] = {}

    def _get_rate_limit_key(self, client_ip: str, username: str) -> str:
        return f"{client_ip.strip().lower()}:{username.strip().lower()}"

    def check_lockout(self, client_ip: str, username: str, now: Optional[datetime] = None) -> bool:
        """Returns True if the client is currently locked out."""
        curr_time = now or datetime.now(timezone.utc)
        key = self._get_rate_limit_key(client_ip, username)
        with self._lock:
            state = self._lockouts.get(key)
            if not state:
                return False
            if state.locked_until and curr_time < state.locked_until:
                return True
            if state.locked_until and curr_time >= state.locked_until:
                del self._lockouts[key]
                return False
            return False

    def _record_failure(self, client_ip: str, username: str, now: Optional[datetime] = None) -> None:
        curr_time = now or datetime.now(timezone.utc)
        key = self._get_rate_limit_key(client_ip, username)
        with self._lock:
            state = self._lockouts.get(key)
            if not state or (curr_time - state.first_failure_at).total_seconds() > LOCKOUT_DURATION_SECONDS:
                self._lockouts[key] = LockoutState(failure_count=1, first_failure_at=curr_time)
                return

            state.failure_count += 1
            if state.failure_count >= MAX_LOGIN_FAILURES:
                state.locked_until = curr_time + timedelta(seconds=LOCKOUT_DURATION_SECONDS)
                logger.warning(
                    "Auth: Too many failed login attempts for %s from IP %s. Account locked out for %ds.",
                    username,
                    client_ip,
                    LOCKOUT_DURATION_SECONDS,
                )

    def _record_success(self, client_ip: str, username: str) -> None:
        key = self._get_rate_limit_key(client_ip, username)
        with self._lock:
            self._lockouts.pop(key, None)

    def authenticate(
        self,
        username: str,
        password: str,
        client_ip: str = "unknown",
        now: Optional[datetime] = None,
    ) -> Tuple[Optional[Session], Optional[str]]:
        """Authenticates user credentials.

        Returns:
            (Session, None) on success.
            (None, "LOCKED_OUT") if rate-limit locked out.
            (None, "INVALID_CREDENTIALS") if authentication fails.
        """
        curr_time = now or datetime.now(timezone.utc)
        clean_user = username.strip()

        # 1. Rate-limiting check
        if self.check_lockout(client_ip, clean_user, curr_time):
            return None, "LOCKED_OUT"

        # 2. Fetch user
        user = self.repository.get_user_by_username(clean_user)

        # 3. Timing-attack mitigation: always compute password verify even if user not found
        hash_to_verify = user.password_hash if user else DUMMY_PASSWORD_HASH
        password_valid = verify_password(password, hash_to_verify)

        if not user or not password_valid or not user.is_active:
            self._record_failure(client_ip, clean_user, curr_time)
            return None, "INVALID_CREDENTIALS"

        # 4. Success: clear failure counters
        self._record_success(client_ip, clean_user)

        # 5. Generate secure session token and CSRF token
        raw_session_id = generate_secure_token(32)  # 64 hex chars
        stored_hash = hash_token(raw_session_id)
        csrf_token = generate_secure_token(32)
        expires_at = curr_time + timedelta(seconds=self.session_ttl_seconds)

        session = Session(
            session_id=raw_session_id,
            session_hash=stored_hash,
            user_id=user.id,
            username=user.username,
            role=user.role,
            csrf_token=csrf_token,
            created_at=curr_time,
            expires_at=expires_at,
            last_activity_at=curr_time,
        )

        self.repository.save_session(session)
        logger.info("Auth: User '%s' (%s) logged in successfully from %s.", user.username, user.role.value, client_ip)
        return session, None

    def validate_session(self, session_cookie: Optional[str], now: Optional[datetime] = None) -> Optional[Session]:
        """Validates session cookie from browser request.

        Fails closed if missing, malformed, expired, or user is inactive.
        """
        if not session_cookie or len(session_cookie) < 32:
            return None

        curr_time = now or datetime.now(timezone.utc)
        session_hash = hash_token(session_cookie)
        session = self.repository.get_session_by_hash(session_hash)
        if not session:
            return None

        # Check expiration
        if curr_time >= session.expires_at:
            logger.info("Auth: Session expired for user '%s'. Revoking.", session.username)
            self.repository.delete_session(session_hash)
            return None

        # Verify underlying user still active
        user = self.repository.get_user_by_id(session.user_id)
        if not user or not user.is_active:
            logger.warning("Auth: User '%s' is inactive or deleted. Revoking session.", session.username)
            self.repository.delete_session(session_hash)
            return None

        # Update last activity if more than 60 seconds elapsed
        if (curr_time - session.last_activity_at).total_seconds() > 60:
            self.repository.update_session_activity(session_hash, curr_time)

        return session

    def logout(self, session_cookie: Optional[str]) -> bool:
        """Revokes an active session."""
        if not session_cookie:
            return False
        session_hash = hash_token(session_cookie)
        return self.repository.delete_session(session_hash)

    def revoke_all_user_sessions(self, user_id: str) -> int:
        """Revokes all active sessions for a specific user (e.g. upon password change/deactivation)."""
        return self.repository.delete_sessions_for_user(user_id)

    @staticmethod
    def verify_csrf(session: Session, csrf_header: Optional[str]) -> bool:
        """Verifies CSRF token header against session in constant time."""
        if not csrf_header or not session.csrf_token:
            return False
        return secrets.compare_digest(session.csrf_token, csrf_header.strip())


# Default global singleton service
auth_service = AuthService()
