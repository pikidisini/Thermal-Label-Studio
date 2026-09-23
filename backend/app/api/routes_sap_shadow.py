"""SAP Shadow Print Simulation API Routes.

Exposes endpoints for SAP PPIC simulation pipeline:
- POST /simulation/sap-batches: Ingest canonical SAP batch and trigger virtual simulation.
- GET  /simulation/sap-batches: List recent simulation batches (service-token authorized).
- GET  /simulation/sap-batches/{batch_id}: Get simulation status and item sequence progress (service-token authorized).
- GET  /simulation/sap-batches/{batch_id}/pdf: Download verified evidence PDF (service-token authorized).
- GET  /simulation/status: Check simulation service status (public probe).

Fail-Closed Security (P1-A):
- Rejects requests if SAP_SHADOW_SIMULATION_ENABLED is false (HTTP 404).
- All operational endpoints (POST and GET) strictly require valid X-SAP-Simulation-Token.
- Anonymous browser access to SAP operational data or PDF evidence is forbidden (HTTP 401).
- Zero access to physical printers, TCP 9100, or Windows Spooler.

Honest Architectural Limitation:
- The web app currently lacks an authenticated user session / enterprise RBAC framework.
- In this B2B2I pilot phase, browser UI monitoring is fail-closed ("monitoring requires identity provider").
- Production deployment will integrate enterprise user SSO/OIDC/RBAC before enabling interactive UI monitoring.
"""

from __future__ import annotations

import json
import logging
import secrets
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Cookie, Depends, File, Header, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field, ValidationError

from ..config import (
    get_pilot_session_ttl_seconds,
    get_sap_simulation_auth_token,
    is_pilot_operator_enabled,
    is_sap_shadow_simulation_enabled,
)
from ..models.raw_sap_snapshot_v2 import RawSapBatchSnapshotV2
from ..services.pilot_session_service import PilotOperatorSession, pilot_session_service
from ..services.sap_shadow_service import (
    SapShadowBatchRequest,
    SimulationPersistenceError,
    sap_shadow_service,
)

logger = logging.getLogger("routes_sap_shadow")

simulation_router = APIRouter(prefix="/simulation", tags=["SAP Shadow Simulation"])


class PilotOperatorLoginRequest(BaseModel):
    """Payload for pilot operator authentication."""

    password: str = Field(..., min_length=1, max_length=128, description="Pilot operator password")


def require_simulation_enabled() -> None:
    """Dependency enforcing fail-closed behavior when SAP shadow simulation is disabled."""
    if not is_sap_shadow_simulation_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAP shadow print simulation is disabled.",
        )


def verify_simulation_token(
    x_sap_simulation_token: Optional[str] = Header(None, alias="X-SAP-Simulation-Token"),
) -> str:
    """Dependency verifying X-SAP-Simulation-Token header against server configuration.

    Fails closed (HTTP 403 if unconfigured, HTTP 401 if missing/invalid).
    Anonymous access to SAP operational data or evidence PDFs is strictly forbidden (P1-A).
    """
    configured_token = get_sap_simulation_auth_token()
    if not configured_token:
        logger.warning("Simulation request rejected: SAP_SIMULATION_AUTH_TOKEN is not configured.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SAP shadow simulation authentication token is not configured on server.",
        )

    if not x_sap_simulation_token or not secrets.compare_digest(x_sap_simulation_token, configured_token):
        logger.warning("Simulation request rejected: Invalid or missing X-SAP-Simulation-Token header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing simulation authorization token.",
        )

    return x_sap_simulation_token


def require_pilot_operator_enabled() -> None:
    """Dependency ensuring both simulation mode and pilot operator mode are active."""
    require_simulation_enabled()
    if not is_pilot_operator_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mode operator pilot dinonaktifkan.",
        )


def get_current_pilot_operator(
    request: Request,
    pilot_session_cookie: Optional[str] = Cookie(None, alias="pilot_session"),
) -> PilotOperatorSession:
    """Dependency resolving authenticated pilot operator session strictly from HttpOnly cookie.

    Fails closed (HTTP 401) if cookie is missing, invalid, or expired.
    """
    require_pilot_operator_enabled()
    if not pilot_session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi operator pilot tidak valid atau belum masuk.",
        )

    session = pilot_session_service.get_valid_session(pilot_session_cookie)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi operator pilot tidak valid atau telah berakhir. Silakan login kembali.",
        )

    return session


def verify_pilot_csrf(
    request: Request,
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: PilotOperatorSession = Depends(get_current_pilot_operator),
) -> bool:
    """Dependency verifying CSRF token for mutating operator requests."""
    if not x_csrf_token or not pilot_session_service.verify_csrf(session, x_csrf_token):
        logger.warning("CSRF verification failed for operator session: %s", session.session_id[:8])
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Validasi CSRF token gagal.",
        )
    return True


@simulation_router.get("/status")
def get_simulation_status() -> Dict[str, Any]:
    """Public probe endpoint to check whether SAP shadow simulation is enabled."""
    enabled = is_sap_shadow_simulation_enabled()
    pilot_enabled = is_pilot_operator_enabled()
    return {
        "enabled": enabled,
        "status": "online" if enabled else "disabled",
        "service": "SAP_SHADOW_SIMULATION_SINK",
        "monitoring_requires_identity_provider": not pilot_enabled,
        "pilot_operator_enabled": pilot_enabled,
    }


@simulation_router.post(
    "/sap-batches",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
async def submit_sap_simulation_batch(
    request: SapShadowBatchRequest,
    response: Response,
) -> Dict[str, Any]:
    """Ingests a canonical SAP batch for shadow simulation and evidence PDF generation.

    Replays with the same idempotency key (producer_namespace, request_id) return
    the existing batch representation without re-generating artifacts.
    """
    try:
        result = await sap_shadow_service.ingest_batch(request, auto_process=True)
        if result.get("idempotent_replay"):
            response.status_code = status.HTTP_200_OK
        return result
    except ValueError as exc:
        msg = str(exc)
        if msg.startswith("Conflict:"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    except SimulationPersistenceError as exc:
        # P1-B: Atomic persistence failure fails closed (never return false 202 Accepted)
        logger.error("Durable persistence failure during batch ingestion: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal menyimpan batch simulasi secara persisten.",
        ) from None
    except Exception as exc:
        logger.error("Internal error during simulation batch ingestion: %s", type(exc).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Simulasi batch SAP mengalami kendala teknis internal.",
        ) from None


@simulation_router.post(
    "/raw-batches",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
async def submit_raw_sap_simulation_batch(
    request: RawSapBatchSnapshotV2,
    response: Response,
) -> Dict[str, Any]:
    """Ingests a Raw SAP Snapshot v2 batch for shadow simulation and evidence PDF generation.

    Replays with the same idempotency key (producer_namespace, request_id) return
    the existing batch representation without re-generating artifacts.
    """
    try:
        result = await sap_shadow_service.ingest_raw_batch(request, auto_process=True)
        if result.get("idempotent_replay"):
            response.status_code = status.HTTP_200_OK
        return result
    except ValueError as exc:
        msg = str(exc)
        if msg.startswith("Conflict:"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    except SimulationPersistenceError as exc:
        logger.error("Durable persistence failure during raw batch ingestion: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal menyimpan batch simulasi mentah secara persisten.",
        ) from None
    except Exception as exc:
        logger.error("Internal error during raw simulation batch ingestion: %s", type(exc).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Simulasi batch mentah SAP mengalami kendala teknis internal.",
        ) from None


@simulation_router.get(
    "/sap-batches",
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
def list_simulation_batches() -> List[Dict[str, Any]]:
    """Lists recent SAP simulation batches (service-token authorized only)."""
    return sap_shadow_service.list_batches(limit=50)


@simulation_router.get(
    "/sap-batches/{batch_id}",
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
def get_simulation_batch_status(batch_id: str) -> Dict[str, Any]:
    """Retrieves simulation batch state, item sequence progression, and artifact readiness (service-token authorized)."""
    record = sap_shadow_service.get_batch_summary(batch_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' not found.",
        )
    return record


@simulation_router.get(
    "/sap-batches/{batch_id}/raw-snapshot",
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
def get_simulation_batch_raw_snapshot(batch_id: str) -> Dict[str, Any]:
    """Retrieves preserved Raw SAP Snapshot v2 associated with batch (service-token authorized)."""
    record = sap_shadow_service.get_batch(batch_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' not found.",
        )
    raw_snapshot = sap_shadow_service.get_raw_snapshot(batch_id)
    if not raw_snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw snapshot not available for batch '{batch_id}'.",
        )
    return {
        "batch_id": batch_id,
        "producer_namespace": record.get("producer_namespace"),
        "request_id": record.get("request_id"),
        "contract_type": record.get("contract_type", "canonical"),
        "label_code": record.get("label_code"),
        "profile_version": record.get("profile_version"),
        "raw_snapshot": raw_snapshot,
    }


@simulation_router.get(
    "/sap-batches/{batch_id}/pdf",
    dependencies=[Depends(require_simulation_enabled), Depends(verify_simulation_token)],
)
def download_simulation_evidence_pdf(batch_id: str) -> Response:
    """Downloads verified evidence PDF artifact produced for batch (service-token authorized)."""
    try:
        pdf_bytes = sap_shadow_service.get_evidence_pdf(batch_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="evidence_{batch_id}.pdf"',
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
            },
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Internal error retrieving simulation evidence PDF %s: %s", batch_id, type(exc).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal membaca berkas bukti PDF simulasi.",
        ) from None


# =============================================================================
# PILOT OPERATOR SELF-SERVICE ENDPOINTS (B2B2N)
# Strictly separated from machine-to-machine X-SAP-Simulation-Token.
# Protected by server-side pilot operator session strictly via HttpOnly cookie.
# =============================================================================

from .operator_import_guard import (
    MAX_IMPORT_BYTES,
    MAX_IMPORT_MULTIPART_OVERHEAD_BYTES,
    MAX_IMPORT_REQUEST_BYTES,
    evaluate_pilot_transport_security,
)



@simulation_router.post(
    "/operator/login",
    dependencies=[Depends(require_simulation_enabled)],
)
def pilot_operator_login(
    request: Request,
    payload: PilotOperatorLoginRequest,
    response: Response,
) -> Dict[str, Any]:
    """Authenticates a human pilot operator and creates a secure session strictly via HttpOnly cookie."""
    # 1. Transport Security Guard (HTTPS vs Loopback)
    is_allowed, is_secure_cookie = evaluate_pilot_transport_security(request)
    if not is_allowed:
        logger.warning(
            "Pilot operator login rejected: plain HTTP over non-loopback host '%s' (client '%s')",
            request.url.hostname,
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses operator pilot melalui jaringan intranet wajib menggunakan HTTPS.",
        )

    # 2. Extract Client Identity for Rate-Limiting Lockout
    client_id = request.client.host if request.client else "unknown"

    try:
        session = pilot_session_service.authenticate_and_create(
            payload.password, client_id=client_id
        )
    except PermissionError as exc:
        msg = str(exc)
        if "dikunci sementara" in msg or "locked out" in msg:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mode operator pilot dinonaktifkan.",
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Autentikasi operator pilot belum dikonfigurasi pada server.",
        )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kata sandi operator pilot tidak valid.",
        )

    # Set secure HttpOnly cookie strictly without leaking session_id to JavaScript
    response.set_cookie(
        key="pilot_session",
        value=session.session_id,
        httponly=True,
        samesite="strict",
        max_age=get_pilot_session_ttl_seconds(),
        path="/",
        secure=is_secure_cookie,
    )

    return {
        "status": "authenticated",
        "csrf_token": session.csrf_token,
        "expires_at": session.expires_at.isoformat(),
        "operator_label": session.operator_label,
    }


@simulation_router.post(
    "/operator/logout",
    dependencies=[Depends(verify_pilot_csrf)],
)
def pilot_operator_logout(
    response: Response,
    session: PilotOperatorSession = Depends(get_current_pilot_operator),
) -> Dict[str, Any]:
    """Logs out pilot operator, revokes session, and clears session cookie."""
    pilot_session_service.revoke_session(session.session_id)
    response.delete_cookie(key="pilot_session", path="/", samesite="strict")
    return {"status": "logged_out"}


@simulation_router.get(
    "/operator/session",
    dependencies=[Depends(require_simulation_enabled)],
)
def get_pilot_operator_session_status(
    pilot_session_cookie: Optional[str] = Cookie(None, alias="pilot_session"),
) -> Dict[str, Any]:
    """Probes session status for browser client strictly using HttpOnly cookie without exposing session_id."""
    pilot_enabled = is_pilot_operator_enabled()
    if not pilot_enabled:
        return {
            "pilot_operator_enabled": False,
            "authenticated": False,
        }

    session = (
        pilot_session_service.get_valid_session(pilot_session_cookie)
        if pilot_session_cookie
        else None
    )

    if session:
        return {
            "pilot_operator_enabled": True,
            "authenticated": True,
            "csrf_token": session.csrf_token,
            "expires_at": session.expires_at.isoformat(),
            "operator_label": session.operator_label,
        }

    return {
        "pilot_operator_enabled": True,
        "authenticated": False,
    }


@simulation_router.get(
    "/operator/batches",
    dependencies=[Depends(get_current_pilot_operator)],
)
def list_operator_simulation_batches() -> List[Dict[str, Any]]:
    """Lists sanitized simulation batch summaries for authorized pilot operator.

    Data minimization: omits raw snapshots, customer text, and sensitive business context.
    """
    raw_list = sap_shadow_service.list_batches(limit=50)
    sanitized: List[Dict[str, Any]] = []
    for b in raw_list:
        sanitized.append({
            "batch_id": b.get("batch_id"),
            "producer_namespace": b.get("producer_namespace"),
            "request_id": b.get("request_id"),
            "label_code": b.get("label_code", "N001"),
            "profile_version": b.get("profile_version", "v1.0-dev"),
            "status": b.get("status"),
            "total_items": b.get("total_items", 0),
            "completed_items": b.get("completed_items", 0),
            "created_at": b.get("created_at"),
            "completed_at": b.get("completed_at"),
            "error": b.get("error"),
            "has_pdf": b.get("artifact") is not None or b.get("status") == "completed",
        })
    return sanitized


@simulation_router.get(
    "/operator/batches/{batch_id}",
    dependencies=[Depends(get_current_pilot_operator)],
)
def get_operator_simulation_batch(batch_id: str) -> Dict[str, Any]:
    """Retrieves sanitized batch summary for authorized pilot operator."""
    record = sap_shadow_service.get_batch_summary(batch_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' tidak ditemukan.",
        )
    return record


@simulation_router.get(
    "/operator/batches/{batch_id}/pdf",
    dependencies=[Depends(get_current_pilot_operator)],
)
def download_operator_evidence_pdf(batch_id: str) -> Response:
    """Streams verified evidence PDF artifact for authorized pilot operator."""
    try:
        pdf_bytes = sap_shadow_service.get_evidence_pdf(batch_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="evidence_{batch_id}.pdf"',
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
            },
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' tidak ditemukan.",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Operator error retrieving simulation evidence PDF %s: %s", batch_id, type(exc).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal membaca berkas bukti PDF simulasi.",
        ) from None


def _parse_json_rejecting_duplicates(raw_text: str) -> Any:
    """Parses JSON text while strictly rejecting duplicate dictionary keys."""
    def _reject_dups(pairs):
        res = {}
        for k, v in pairs:
            if k in res:
                raise ValueError(f"Kunci JSON terduplikasi: '{k}'")
            res[k] = v
        return res

    return json.loads(raw_text, object_pairs_hook=_reject_dups)



@simulation_router.post(
    "/operator/import-json",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_pilot_operator_enabled), Depends(verify_pilot_csrf)],
)
async def import_operator_sap_json(
    request: Request,
    response: Response,
    file: Optional[UploadFile] = File(None),
    session: PilotOperatorSession = Depends(get_current_pilot_operator),
) -> Dict[str, Any]:
    """Imports a local Raw SAP Snapshot v2 JSON file from an authenticated pilot operator.

    Enforces:
    - Transport security (HTTPS required on intranet; plain HTTP loopback allowed for dev).
    - Rate-limiting per operator session/client.
    - Multipart file upload required as exclusive intake format.
    - Size bounded to 2 MiB before and during stream read.
    - Rejection of non-JSON, malformed JSON, and duplicate keys.
    - Strict schema validation via RawSapBatchSnapshotV2 (requires contract_schema_version='2.0-raw').
    - Dispatches to identical sap_shadow_service without exposing machine tokens or physical printers.
    """
    # 1. Transport Security Guard (HTTPS vs Loopback)
    is_allowed, _ = evaluate_pilot_transport_security(request)
    if not is_allowed:
        logger.warning(
            "Operator JSON import rejected: plain HTTP over non-loopback host '%s'",
            request.url.hostname,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses operator pilot melalui jaringan intranet wajib menggunakan HTTPS.",
        )

    # 2. Rate Limiting Check
    client_id = request.client.host if request.client else "unknown"
    rate_limit_key = f"{session.session_id}:{client_id}"
    if not pilot_session_service.check_import_rate_limit(rate_limit_key):
        logger.warning("Operator import rate limit exceeded for %s", rate_limit_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak permintaan impor JSON. Silakan tunggu beberapa saat.",
        )

    # 3. Initial Content-Length Header Check (fail-fast before streaming)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_IMPORT_REQUEST_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Ukuran berkas atau permintaan melebihi batas maksimum 2 MiB.",
                )
        except ValueError:
            pass

    # 4. Require Multipart Upload with 'file' Field (Fail-Closed)
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unggahan berkas multipart dengan field 'file' wajib disertakan.",
        )

    filename = (file.filename or "").lower()
    if not filename.endswith(".json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hanya berkas berformat .json yang diperbolehkan.",
        )

    # 5. Read & Bound Payload Chunk by Chunk
    content_bytes = bytearray()
    chunk_size = 64 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        content_bytes.extend(chunk)
        if len(content_bytes) > MAX_IMPORT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Ukuran berkas melebihi batas maksimum 2 MiB.",
            )

    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Berkas atau payload JSON kosong.",
        )

    # 4. Strict UTF-8 Decoding
    try:
        raw_text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Berkas harus berupa teks JSON berenkode UTF-8 yang valid.",
        )

    # 5. Parse JSON with Duplicate-Key Rejection
    try:
        data = _parse_json_rejecting_duplicates(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format JSON tidak valid atau memuat kunci duplikat: {exc}",
        )

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload JSON harus berupa objek (dictionary) Raw SAP Snapshot v2.",
        )

    # 6. Validate Against RawSapBatchSnapshotV2 Model
    try:
        snapshot = RawSapBatchSnapshotV2.model_validate(data)
    except ValidationError as exc:
        errors = exc.errors()
        first_err = errors[0] if errors else {}
        loc = " -> ".join(str(l) for l in first_err.get("loc", []))
        msg = first_err.get("msg", "Data tidak valid")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validasi skema Raw SAP Snapshot v2 gagal pada '{loc}': {msg}",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validasi data gagal: {exc}",
        )

    # 7. Check Schema Version (Must be 2.0-raw)
    if snapshot.contract_schema_version != "2.0-raw":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Versi skema '{snapshot.contract_schema_version}' tidak didukung. Wajib '2.0-raw'.",
        )

    # 8. Dispatch to Same sap_shadow_service
    try:
        result = await sap_shadow_service.ingest_raw_batch(snapshot, auto_process=True)
        if result.get("idempotent_replay"):
            response.status_code = status.HTTP_200_OK
        return result
    except ValueError as exc:
        msg = str(exc)
        if msg.startswith("Conflict:"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    except SimulationPersistenceError as exc:
        logger.error("Durable persistence failure during operator raw batch ingestion: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal menyimpan batch simulasi mentah secara persisten.",
        ) from None
    except Exception as exc:
        logger.error("Internal error during operator raw simulation batch ingestion: %s", type(exc).__name__, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Simulasi batch mentah SAP mengalami kendala teknis internal.",
        ) from None
