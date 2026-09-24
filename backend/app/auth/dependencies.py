"""FastAPI dependencies for application authentication and authorization."""

from __future__ import annotations

import ipaddress
import logging
import os
from typing import Callable, Optional, Set, Tuple
from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from .models import Role, Session
from .service import auth_service

logger = logging.getLogger("auth_dependencies")

SESSION_COOKIE_NAME = "app_session"

LOOPBACK_HOSTS: Set[str] = {"127.0.0.1", "localhost", "::1", "testserver"}
LOOPBACK_CLIENTS: Set[str] = {"127.0.0.1", "localhost", "::1", "testserver", "testclient"}
DOCKER_KNOWN_GATEWAYS: Set[str] = {"172.17.0.1", "192.168.65.1"}
DOCKER_DEFAULT_BRIDGE_NETWORK = ipaddress.ip_network("172.17.0.0/16")
DOCKER_DESKTOP_NETWORK = ipaddress.ip_network("192.168.65.0/24")


def _get_linux_default_gateways() -> Set[str]:
    """Extracts default route gateways from Linux /proc/net/route if running in a container."""
    gateways: Set[str] = set()
    try:
        with open("/proc/net/route", "r", encoding="utf-8") as f:
            for line in f.readlines()[1:]:
                parts = line.strip().split()
                if len(parts) >= 3 and parts[1] == "00000000":
                    import socket
                    import struct

                    gw_hex = int(parts[2], 16)
                    if gw_hex != 0:
                        gw_ip = socket.inet_ntoa(struct.pack("<L", gw_hex))
                        gateways.add(gw_ip)
    except Exception:
        pass
    return gateways


def is_loopback_or_docker_bridge_client(client_ip: str) -> bool:
    """Verifies whether client IP is a local loopback origin or a recognized Docker bridge gateway.

    Handles containerized environments where port forwarding (e.g. -p 127.0.0.1:8000:8000)
    forwards host loopback traffic across the Docker bridge gateway (typically 172.17.0.1
    or Docker Desktop 192.168.65.1).
    """
    if not client_ip:
        return True

    clean_ip = client_ip.lower().strip()
    if clean_ip in LOOPBACK_CLIENTS:
        return True

    if clean_ip in DOCKER_KNOWN_GATEWAYS:
        return True

    if clean_ip in _get_linux_default_gateways():
        return True

    try:
        ip_obj = ipaddress.ip_address(clean_ip)
        if ip_obj in DOCKER_DEFAULT_BRIDGE_NETWORK or ip_obj in DOCKER_DESKTOP_NETWORK:
            return True
        # If running in a container (/.dockerenv exists), allow user-defined Docker bridge networks
        if os.path.exists("/.dockerenv") and ip_obj in ipaddress.ip_network("172.16.0.0/12"):
            return True
    except Exception:
        pass

    return False


def evaluate_app_transport_security(request: Request) -> Tuple[bool, bool]:
    """Evaluates whether request transport satisfies security requirements.

    Returns:
        Tuple[is_allowed, is_secure_cookie]
    - Over HTTPS: always allowed, cookie secure=True.
    - Over HTTP loopback (localhost, 127.0.0.1, ::1, testserver, testclient): allowed for local dev, cookie secure=False.
    - Over HTTP Docker bridge (forwarded from host loopback via docker-proxy / bridge gateway): allowed for local dev, cookie secure=False.
    - Over HTTP non-loopback (e.g. plain intranet IP/hostname): rejected (fail-closed, HTTP 403).
    """
    if request.url.scheme == "https":
        return True, True

    host_header = request.headers.get("host", "").split(":")[0].strip().lower()
    hostname = (request.url.hostname or host_header).lower()
    client_ip = (request.client.host if request.client else "").lower()

    host_is_loopback = hostname in LOOPBACK_HOSTS
    client_is_allowed = is_loopback_or_docker_bridge_client(client_ip)

    if host_is_loopback and client_is_allowed:
        return True, False

    return False, False


def get_current_user_optional(
    request: Request,
    app_session: Optional[str] = Cookie(None, alias=SESSION_COOKIE_NAME),
) -> Optional[Session]:
    """Resolves authenticated session if cookie is present and valid, otherwise returns None."""
    if not app_session:
        return None

    # P2 Transport check on session boundary (fail-closed HTTP 403 on plain HTTP intranet)
    is_allowed, _ = evaluate_app_transport_security(request)
    if not is_allowed:
        logger.warning(
            "Session access rejected: plain HTTP over non-loopback host '%s'",
            request.url.hostname,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses sesi aplikasi melalui jaringan intranet wajib menggunakan HTTPS.",
        )

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
