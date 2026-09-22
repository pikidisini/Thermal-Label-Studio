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

import logging
import secrets
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from ..config import get_sap_simulation_auth_token, is_sap_shadow_simulation_enabled
from ..services.sap_shadow_service import (
    SapShadowBatchRequest,
    SimulationPersistenceError,
    sap_shadow_service,
)

logger = logging.getLogger("routes_sap_shadow")

simulation_router = APIRouter(prefix="/simulation", tags=["SAP Shadow Simulation"])


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


@simulation_router.get("/status")
def get_simulation_status() -> Dict[str, Any]:
    """Public probe endpoint to check whether SAP shadow simulation is enabled."""
    enabled = is_sap_shadow_simulation_enabled()
    return {
        "enabled": enabled,
        "status": "online" if enabled else "disabled",
        "service": "SAP_SHADOW_SIMULATION_SINK",
        "monitoring_requires_identity_provider": True,
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
    record = sap_shadow_service.get_batch(batch_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{batch_id}' not found.",
        )
    return record


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
