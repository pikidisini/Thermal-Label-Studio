"""
Safe Demo Mode API Routes.

Exposes endpoints for local in-memory simulation and batch monitoring.
Strictly fail-closed: All endpoints reject requests if SAFE_DEMO_MODE is not true.
Never touches real network sockets or physical printers.
"""

from __future__ import annotations

import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from ..config import is_safe_demo_enabled
from ..services.safe_demo_service import safe_demo_service

logger = logging.getLogger("safe_demo_router")

safe_demo_router = APIRouter(prefix="/safe-demo", tags=["Safe Demo"])


def require_safe_demo_enabled() -> None:
    """Dependency that enforces fail-closed behavior if safe demo is disabled."""
    if not is_safe_demo_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Safe demo mode is disabled.",
        )


@safe_demo_router.get("/batch", dependencies=[Depends(require_safe_demo_enabled)])
def get_demo_batch() -> Dict[str, Any]:
    """Retrieve the current demo batch definition and items."""
    return safe_demo_service.get_batch()


@safe_demo_router.get("/status", dependencies=[Depends(require_safe_demo_enabled)])
def get_demo_status() -> Dict[str, Any]:
    """Retrieve simulation status and progress summary."""
    return safe_demo_service.get_status()


@safe_demo_router.post("/run", dependencies=[Depends(require_safe_demo_enabled)])
async def run_demo_simulation() -> Dict[str, Any]:
    """Execute the in-memory batch simulation.

    Dispatches strictly to SimulatorSocketTransport with zero network I/O.
    """
    try:
        return await safe_demo_service.run_simulation()
    except Exception as exc:
        logger.error("Error during safe demo simulation: %s", type(exc).__name__)
        # AC 7: Sanitize error response without leaking stack traces or internal secrets
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Simulasi demo mengalami kendala teknis internal.",
        ) from None


@safe_demo_router.post("/reset", dependencies=[Depends(require_safe_demo_enabled)])
def reset_demo_simulation() -> Dict[str, Any]:
    """Reset the demo state in-memory back to its initial fixture.

    Does not modify persistent storage or databases.
    """
    return safe_demo_service.reset()
