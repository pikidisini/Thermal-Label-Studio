"""Application Authentication API Routes.

Exposes endpoints for user login, session inspection, logout, and CSRF token retrieval.
"""

from __future__ import annotations

import logging
from typing import Any, Dict
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status

from ..auth.dependencies import (
    SESSION_COOKIE_NAME,
    evaluate_app_transport_security,
    get_current_user,
    get_current_user_optional,
    verify_csrf_token,
)
from ..auth.models import LoginRequest, LoginResponse, Session, SessionInfo, UserProfile
from ..auth.service import auth_service

logger = logging.getLogger("routes_auth")

auth_router = APIRouter(prefix="/auth", tags=["Application Authentication"])


@auth_router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate user and issue application session cookie",
)
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
) -> LoginResponse:
    """Authenticates application user and establishes an HttpOnly session."""
    # 1. Transport Security Check
    is_allowed, is_secure_cookie = evaluate_app_transport_security(request)
    if not is_allowed:
        logger.warning(
            "Login rejected: plain HTTP over non-loopback host '%s' (client '%s')",
            request.url.hostname,
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses aplikasi melalui jaringan intranet wajib menggunakan HTTPS.",
        )

    # 2. Extract Client IP for Rate-Limiting
    client_ip = request.client.host if request.client else "unknown"

    # 3. Authenticate
    session, err_code = auth_service.authenticate(
        username=payload.username,
        password=payload.password,
        client_ip=client_ip,
    )

    if err_code == "LOCKED_OUT":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak percobaan login yang gagal. Akun dikunci sementara selama 5 menit.",
        )

    if not session or err_code == "INVALID_CREDENTIALS":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nama pengguna atau kata sandi tidak valid.",
        )

    # 4. Set HttpOnly session cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.session_id,
        httponly=True,
        samesite="lax",
        max_age=auth_service.session_ttl_seconds,
        path="/",
        secure=is_secure_cookie,
    )
    # Also set pilot_session cookie for backward compatibility with pilot components
    response.set_cookie(
        key="pilot_session",
        value=session.session_id,
        httponly=True,
        samesite="strict",
        max_age=auth_service.session_ttl_seconds,
        path="/",
        secure=is_secure_cookie,
    )

    return LoginResponse(
        status="authenticated",
        user=UserProfile(
            id=session.user_id,
            username=session.username,
            role=session.role.value,
            is_active=True,
        ),
        csrf_token=session.csrf_token,
        expires_at=session.expires_at.isoformat(),
    )


@auth_router.post(
    "/logout",
    dependencies=[Depends(verify_csrf_token)],
    summary="Revoke active application session and clear cookie",
)
def logout(
    response: Response,
    session: Session = Depends(get_current_user),
    app_session_cookie: str = Cookie(None, alias=SESSION_COOKIE_NAME),
) -> Dict[str, str]:
    """Logs out user, revokes session in repository, and deletes cookie."""
    auth_service.logout(app_session_cookie or session.session_id)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/", samesite="lax")
    response.delete_cookie(key="pilot_session", path="/", samesite="strict")
    logger.info("Auth: User '%s' logged out.", session.username)
    return {"status": "logged_out"}


@auth_router.get(
    "/me",
    response_model=SessionInfo,
    summary="Inspect current user session status",
)
def get_current_session(
    session: Session = Depends(get_current_user_optional),
) -> SessionInfo:
    """Probes whether client holds an active, authenticated application session."""
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi aplikasi tidak valid atau belum masuk.",
        )

    return SessionInfo(
        authenticated=True,
        user=UserProfile(
            id=session.user_id,
            username=session.username,
            role=session.role.value,
            is_active=True,
        ),
        csrf_token=session.csrf_token,
        expires_at=session.expires_at.isoformat(),
    )


@auth_router.get(
    "/csrf",
    summary="Retrieve CSRF token for active session",
)
def get_csrf_token(
    session: Session = Depends(get_current_user),
) -> Dict[str, str]:
    """Returns CSRF token for the authenticated session."""
    return {"csrf_token": session.csrf_token}
