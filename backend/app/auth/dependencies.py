"""FastAPI dependencies for application authentication and authorization."""

from __future__ import annotations

import logging
from typing import Callable, Optional, Tuple
from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from .models import Role, Session
from .service import auth_service

logger = logging.getLogger("auth_dependencies")

SESSION_COOKIE_NAME = "app_session"


def evaluate_app_transport_security(request: Request) -> Tuple[bool, bool]:
    """Evaluates whether request transport satisfies security requirements.

    Returns:
        Tuple[is_allowed, is_secure_cookie]
    - Over HTTPS: always allowed, cookie secure=True.
    - Over HTTP loopback (localhost, 127.0.0.1, ::1, testserver, testclient): allowed for local dev, cookie secure=False.
    - Over HTTP non-loopback (e.g. plain intranet IP/hostname): rejected (fail-closed, HTTP 403).
    """
    if request.url.scheme == "https":
        return True, True

    host_header = request.headers.get("host", "").split(":")[0].strip().lower()
    hostname = (request.url.hostname or host_header).lower()
    client_ip = (request.client.host if request.client else "").lower()

    loopback_hosts = {"127.0.0.1", "localhost", "::1", "testserver"}
    client_is_loopback = (not client_ip) or (client_ip in loopback_hosts) or (client_ip == "testclient")
    host_is_loopback = hostname in loopback_hosts

    if host_is_loopback and client_is_loopback:
        return True, False

    return False, False


def get_current_user_optional(
    request: Request,
    app_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
) -> Optional[Session]:
    """Resolves authenticated session if cookie is present and valid, otherwise returns None."""
    if not app_session:
        # Fallback check for pilot_session cookie to ensure smooth transition
        pilot_session = request.cookies.get("pilot_session")
        if pilot_session:
            return auth_service.validate_session(pilot_session)
        return None
    return auth_service.validate_session(app_session)


def get_current_user(
    request: Request,
    session: Optional[Session] = Depends(get_current_user_optional),
) -> Session:
    """Dependency enforcing that an active, authenticated application user session is present.

    Fails closed with HTTP 401 if missing, invalid, or expired.
    """
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi aplikasi tidak valid atau telah berakhir. Silakan login kembali.",
        )
    return session


def require_role(*roles: str) -> Callable[[Session], Session]:
    """Dependency factory ensuring current user has one of the allowed roles."""
    normalized = {r.strip().upper() for r in roles}

    def _role_checker(session: Session = Depends(get_current_user)) -> Session:
        if session.role.value not in normalized:
            logger.warning(
                "Access denied for user '%s' (role '%s'): required one of %s",
                session.username,
                session.role.value,
                normalized,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: peran pengguna tidak memiliki izin untuk operasi ini.",
            )
        return session

    return _role_checker


def verify_csrf_token(
    request: Request,
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: Session = Depends(get_current_user),
) -> bool:
    """Dependency verifying CSRF token for mutating requests."""
    if not x_csrf_token or not auth_service.verify_csrf(session, x_csrf_token):
        logger.warning("CSRF token verification failed for user session: %s", session.username)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Validasi CSRF token gagal.",
        )
    return True
