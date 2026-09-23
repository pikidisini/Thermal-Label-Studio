"""ASGI Middleware enforcing early payload bounding and fail-fast authentication.

Protects against resource and disk exhaustion on multipart intake before
FastAPI / Starlette parses the form body or writes temporary files to disk.
"""

from __future__ import annotations

import logging
from typing import Tuple
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from ..services.pilot_session_service import pilot_session_service

logger = logging.getLogger("operator_import_guard")

MAX_IMPORT_BYTES = 2 * 1024 * 1024  # 2 MiB (file content limit)
MAX_IMPORT_MULTIPART_OVERHEAD_BYTES = 64 * 1024  # 64 KiB allowance for multipart headers/boundaries
MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_BYTES + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES


class RequestBodyTooLargeError(StarletteHTTPException):
    """Raised when the streaming request body exceeds MAX_IMPORT_REQUEST_BYTES."""

    def __init__(self, detail: str = "Ukuran berkas atau permintaan melebihi batas maksimum 2 MiB."):
        super().__init__(status_code=413, detail=detail)


def evaluate_pilot_transport_security(request: Request) -> Tuple[bool, bool]:
    """Evaluates whether the request transport satisfies pilot security requirements.

    Returns:
        Tuple[is_allowed, is_secure_cookie]
    - Over verified HTTPS (ASGI scheme == 'https'): always allowed, cookie secure=True.
    - Over HTTP loopback (localhost, 127.0.0.1, ::1, testserver): allowed for local dev, cookie secure=False.
    - Over HTTP non-loopback (e.g. intranet IP/hostname): rejected (fail closed, HTTP 403).
      Raw X-Forwarded-Proto headers from client are never blindly trusted; HTTPS verification
      must be established by the ASGI layer (e.g. native TLS or trusted proxy middleware).
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


class OperatorImportGuardMiddleware:
    """ASGI Middleware to protect operator import-json from disk/temp exhaustion.

    Executes BEFORE Starlette's MultiPartParser can spool files to disk.
    Enforces:
    1. Early mode check (simulation + pilot operator enabled).
    2. Early transport security check (HTTPS or loopback dev).
    3. Early authentication (valid pilot_session HttpOnly cookie).
    4. Early CSRF verification (valid X-CSRF-Token).
    5. Early Content-Length validation (reject > 2 MiB + 64 KiB or malformed).
    6. Streaming chunk byte counting to abort unbounded / chunked streams immediately.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.guarded_paths = {
            "/api/v1/simulation/operator/import-json",
            "/simulation/operator/import-json",
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path not in self.guarded_paths and not path.endswith("/simulation/operator/import-json"):
            await self.app(scope, receive, send)
            return

        # 1. Early Mode Check (Fail-Closed)
        from .routes_sap_shadow import (
            is_pilot_operator_enabled,
            is_sap_shadow_simulation_enabled,
        )

        if not is_sap_shadow_simulation_enabled():
            response = JSONResponse(
                status_code=404,
                content={"detail": "SAP shadow print simulation is disabled."},
            )
            await response(scope, receive, send)
            return

        if not is_pilot_operator_enabled():
            response = JSONResponse(
                status_code=404,
                content={"detail": "Mode operator pilot dinonaktifkan."},
            )
            await response(scope, receive, send)
            return

        # 2. Early Transport Security Check (Fail-Closed)
        # Construct lightweight Starlette Request object from scope without reading the body.
        req = Request(scope)
        is_allowed, _ = evaluate_pilot_transport_security(req)
        if not is_allowed:
            logger.warning(
                "Early guard: Operator JSON import rejected: plain HTTP over non-loopback host '%s'",
                req.url.hostname,
            )
            response = JSONResponse(
                status_code=403,
                content={"detail": "Akses operator pilot melalui jaringan intranet wajib menggunakan HTTPS."},
            )
            await response(scope, receive, send)
            return

        # 3. Early Authentication Check (HttpOnly Cookie)
        session_cookie = req.cookies.get("pilot_session")
        if not session_cookie:
            logger.warning("Early guard: Missing pilot_session cookie on import-json.")
            response = JSONResponse(
                status_code=401,
                content={"detail": "Sesi operator pilot tidak valid atau belum masuk."},
            )
            await response(scope, receive, send)
            return

        session = pilot_session_service.get_valid_session(session_cookie)
        if not session:
            logger.warning("Early guard: Invalid or expired pilot_session cookie on import-json.")
            response = JSONResponse(
                status_code=401,
                content={"detail": "Sesi operator pilot tidak valid atau telah berakhir. Silakan login kembali."},
            )
            await response(scope, receive, send)
            return

        # 4. Early CSRF Verification
        csrf_token = req.headers.get("x-csrf-token")
        if not csrf_token or not pilot_session_service.verify_csrf(session, csrf_token):
            logger.warning("Early guard: CSRF verification failed on import-json for session: %s", session.session_id[:8])
            response = JSONResponse(
                status_code=403,
                content={"detail": "Validasi CSRF token gagal."},
            )
            await response(scope, receive, send)
            return

        # 5. Early Content-Length Header Check
        content_length_header = req.headers.get("content-length")
        if content_length_header is not None:
            try:
                content_length = int(content_length_header)
                if content_length < 0:
                    raise ValueError("Negative Content-Length")
            except ValueError:
                logger.warning("Early guard: Malformed Content-Length: %s", content_length_header)
                response = JSONResponse(
                    status_code=400,
                    content={"detail": "Header Content-Length tidak valid."},
                )
                await response(scope, receive, send)
                return

            if content_length > MAX_IMPORT_REQUEST_BYTES:
                logger.warning(
                    "Early guard: Content-Length %d exceeds MAX_IMPORT_REQUEST_BYTES (%d)",
                    content_length,
                    MAX_IMPORT_REQUEST_BYTES,
                )
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Ukuran berkas atau permintaan melebihi batas maksimum 2 MiB."},
                )
                await response(scope, receive, send)
                return

        # 6. Guarded Streaming Body Bounding (protects against chunked or spoofed Content-Length)
        total_bytes_received = 0
        response_started = False

        async def guarded_receive() -> dict:
            nonlocal total_bytes_received
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                total_bytes_received += len(chunk)
                if total_bytes_received > MAX_IMPORT_REQUEST_BYTES:
                    logger.warning(
                        "Early guard: Streamed request bytes (%d) exceeded limit (%d)",
                        total_bytes_received,
                        MAX_IMPORT_REQUEST_BYTES,
                    )
                    raise RequestBodyTooLargeError("Ukuran berkas atau permintaan melebihi batas maksimum 2 MiB.")
            return message

        async def guarded_send(message: dict) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, guarded_receive, guarded_send)
        except RequestBodyTooLargeError as exc:
            if not response_started:
                response = JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail},
                )
                await response(scope, receive, send)
            return
