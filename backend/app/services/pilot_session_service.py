"""Pilot Operator Authentication & Session Service for Safe Demo.

Provides lightweight, secure, server-side session management for pilot operators
reviewing SAP simulation batches and PDF evidence from a browser.

Design & Security Invariants:
1. Strict Separation: Pilot operator credentials and session tokens are completely
   isolated from the machine-to-machine SAP integration token (X-SAP-Simulation-Token).
2. Fail-Closed: Disabled by default (PILOT_OPERATOR_ENABLED=false).
   Unconfigured passwords reject all login attempts with HTTP 403.
3. Cryptographically Strong Tokens: Session IDs (32 bytes urlsafe) and CSRF tokens (24 bytes urlsafe)
   generated via `secrets.token_urlsafe`.
4. Constant-Time Verification: Password matching and CSRF validation use `secrets.compare_digest`.
5. Sliding Expiry: Active sessions automatically extend their validity up to configured TTL (default 1 hour).
6. CSRF Protected: Mutating actions (e.g. logout) require valid CSRF token.
7. Brute-Force Rate Limiting & Lockout: Maximum 5 consecutive failed attempts per client identity/IP,
   triggering a 300-second lockout.
8. Zero Leakage: Passwords, raw SAP secrets, internal session IDs, and session maps are never leaked to client JS.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import secrets
import threading
from typing import Dict, List, Optional, Tuple

from ..config import (
    get_pilot_operator_secret,
    get_pilot_session_ttl_seconds,
    is_pilot_operator_enabled,
)

logger = logging.getLogger("pilot_session_service")


@dataclass
class PilotOperatorSession:
    """Represents an active server-side session for an operator."""

    session_id: str
    csrf_token: str
    created_at: datetime
    last_activity: datetime
    expires_at: datetime
    operator_label: str = "pilot_operator"

    def is_expired(self, now: Optional[datetime] = None) -> bool:
        """Check whether the session has expired."""
        current_time = now or datetime.now(timezone.utc)
        return current_time >= self.expires_at


class PilotSessionService:
    """Thread-safe in-memory session manager for pilot operators with rate-limiting & sliding TTL."""

    MAX_CONCURRENT_SESSIONS: int = 100
    MAX_FAILED_ATTEMPTS: int = 5
    LOCKOUT_SECONDS: int = 300
    ATTEMPT_WINDOW_SECONDS: int = 300

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: Dict[str, PilotOperatorSession] = {}
        self._failed_attempts: Dict[str, List[datetime]] = {}
        self._lockouts: Dict[str, datetime] = {}

    def is_client_locked_out(
        self, client_id: str, now: Optional[datetime] = None
    ) -> Tuple[bool, int]:
        """Checks if a client identifier is currently locked out from login attempts."""
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            lockout_until = self._lockouts.get(client_id)
            if not lockout_until:
                return False, 0
            if current_time >= lockout_until:
                # Lockout expired
                del self._lockouts[client_id]
                self._failed_attempts.pop(client_id, None)
                return False, 0
            remaining_seconds = int((lockout_until - current_time).total_seconds()) + 1
            return True, remaining_seconds

    def authenticate_and_create(
        self,
        password: str,
        client_id: str = "default",
        ttl_seconds: Optional[int] = None,
        now: Optional[datetime] = None,
    ) -> Optional[PilotOperatorSession]:
        """Validates operator password and creates an authenticated session.

        Raises:
            PermissionError: If pilot operator mode is disabled on server, or client is locked out.
            ValueError: If pilot operator secret is not configured on server.
        Returns:
            PilotOperatorSession if password matches, or None if invalid.
        """
        current_time = now or datetime.now(timezone.utc)

        # 1. Feature Flag Guard
        if not is_pilot_operator_enabled():
            raise PermissionError("Pilot operator mode is disabled on server.")

        # 2. Configured Secret Guard
        configured_secret = get_pilot_operator_secret()
        if not configured_secret:
            raise ValueError("Pilot operator authentication is not configured on server.")

        # 3. Brute-Force Lockout Guard
        is_locked, remaining = self.is_client_locked_out(client_id, current_time)
        if is_locked:
            logger.warning(
                "Rejected login for locked-out client '%s' (%ds remaining)",
                client_id,
                remaining,
            )
            raise PermissionError(
                f"Terlalu banyak percobaan login gagal. Klien dikunci sementara selama {remaining} detik."
            )

        # 4. Constant-Time Password Verification
        is_valid = bool(password) and secrets.compare_digest(password.strip(), configured_secret)
        if not is_valid:
            with self._lock:
                # Record failed attempt
                attempts = self._failed_attempts.setdefault(client_id, [])
                window_cutoff = current_time - timedelta(seconds=self.ATTEMPT_WINDOW_SECONDS)
                # Keep attempts within sliding window
                attempts = [t for t in attempts if t >= window_cutoff]
                attempts.append(current_time)
                self._failed_attempts[client_id] = attempts

                if len(attempts) >= self.MAX_FAILED_ATTEMPTS:
                    lockout_until = current_time + timedelta(seconds=self.LOCKOUT_SECONDS)
                    self._lockouts[client_id] = lockout_until
                    logger.warning(
                        "Client '%s' triggered rate-limit lockout after %d failed attempts until %s",
                        client_id,
                        len(attempts),
                        lockout_until.isoformat(),
                    )
                else:
                    logger.warning(
                        "Pilot operator authentication failed: invalid password attempt (%d/%d for '%s')",
                        len(attempts),
                        self.MAX_FAILED_ATTEMPTS,
                        client_id,
                    )
            return None

        # 5. Successful Login: Clear failed attempts
        with self._lock:
            self._failed_attempts.pop(client_id, None)
            self._lockouts.pop(client_id, None)

        ttl = ttl_seconds if ttl_seconds is not None else get_pilot_session_ttl_seconds()
        expires_at = current_time + timedelta(seconds=ttl)

        session_id = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(24)

        session = PilotOperatorSession(
            session_id=session_id,
            csrf_token=csrf_token,
            created_at=current_time,
            last_activity=current_time,
            expires_at=expires_at,
            operator_label="pilot_operator",
        )

        with self._lock:
            # Cleanup expired before storing new
            self._cleanup_expired_locked(current_time)

            # Evict oldest if capacity exceeded
            if len(self._sessions) >= self.MAX_CONCURRENT_SESSIONS:
                oldest_key = min(self._sessions.keys(), key=lambda k: self._sessions[k].last_activity)
                del self._sessions[oldest_key]

            self._sessions[session_id] = session

        logger.info("Pilot operator session created: %s (expires: %s)", session_id[:8], expires_at.isoformat())
        return session

    def get_valid_session(
        self, session_id: Optional[str], now: Optional[datetime] = None
    ) -> Optional[PilotOperatorSession]:
        """Retrieves active session if valid and not expired, applying sliding TTL."""
        if not session_id:
            return None

        current_time = now or datetime.now(timezone.utc)
        ttl = get_pilot_session_ttl_seconds()

        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None

            if session.is_expired(current_time):
                del self._sessions[session_id]
                logger.info("Pilot operator session expired and removed: %s", session_id[:8])
                return None

            # Apply sliding TTL
            session.last_activity = current_time
            session.expires_at = current_time + timedelta(seconds=ttl)
            return session

    def verify_csrf(self, session: PilotOperatorSession, csrf_token: Optional[str]) -> bool:
        """Verifies CSRF token for mutating requests using constant-time comparison."""
        if not csrf_token:
            return False
        return secrets.compare_digest(csrf_token.strip(), session.csrf_token)

    def revoke_session(self, session_id: Optional[str]) -> bool:
        """Revokes an active session on logout."""
        if not session_id:
            return False
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                logger.info("Pilot operator session revoked: %s", session_id[:8])
                return True
        return False

    def clear_for_tests(self) -> None:
        """Purges all sessions, failed attempts, and lockouts for isolated testing."""
        with self._lock:
            self._sessions.clear()
            self._failed_attempts.clear()
            self._lockouts.clear()

    def _cleanup_expired_locked(self, now: datetime) -> None:
        """Internal helper to clean expired sessions under lock."""
        expired = [sid for sid, s in self._sessions.items() if s.is_expired(now)]
        for sid in expired:
            del self._sessions[sid]


# Global singleton instance
pilot_session_service = PilotSessionService()
