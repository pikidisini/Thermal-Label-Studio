"""Security validation utilities for pilot deployment.

Centralizes credential checks and network boundary validations across the
FastAPI control plane, Central Dispatcher runner, database migrations, and
pilot seeding scripts.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

FORBIDDEN_PASSWORD_SUBSTRINGS: tuple[str, ...] = (
    "pilot_password_replace_in_production",
    "change_me",
    "replace",
    "pilot_password",
    "password",
    "postgres",
    "admin",
)


def validate_database_credentials(
    database_url: str | None,
    *,
    allow_test_credentials: bool = False,
    allow_insecure: bool = False,
) -> None:
    """Validate that database URL does not use absent, default, or placeholder passwords.

    Enforces fail-closed security for pilot environments:
    - Rejects None or non-string database URLs.
    - Rejects absent or empty passwords.
    - Rejects known default/placeholder substrings.
    - Rejects passwords shorter than 12 characters.

    The test-only bypass (allow_test_credentials or allow_insecure) is only
    honored when passed explicitly by test fixtures, never by normal pilot entrypoints.
    """
    if allow_test_credentials or allow_insecure:
        return

    if not database_url or not isinstance(database_url, str):
        raise ValueError(
            "CRITICAL SECURITY ERROR: Database URL is required and must be a valid connection string."
        )

    parsed = urlparse(database_url)
    password = parsed.password

    if not password:
        raise ValueError(
            "CRITICAL SECURITY ERROR: Database password is required and cannot be absent or empty for pilot deployment."
        )

    lowered = password.lower()
    for forbidden in FORBIDDEN_PASSWORD_SUBSTRINGS:
        if forbidden in lowered:
            raise ValueError(
                f"CRITICAL SECURITY ERROR: Default/placeholder password pattern '{forbidden}' "
                "detected in database credentials. You must configure a secure, non-default "
                "password before running pilot."
            )

    if len(password) < 12:
        raise ValueError(
            "CRITICAL SECURITY ERROR: Database password is too short (minimum 12 characters required for pilot deployment)."
        )
