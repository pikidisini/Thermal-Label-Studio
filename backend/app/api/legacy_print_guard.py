"""Server-side guard for the compatibility direct-print routes."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..config import is_legacy_direct_print_enabled


def require_legacy_direct_print_enabled() -> None:
    """Reject legacy physical dispatch unless it was explicitly enabled."""
    if not is_legacy_direct_print_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
