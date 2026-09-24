"""Seeds deterministic user accounts strictly for Playwright browser E2E test runs.

Safety invariants:
- Mandatory explicit AUTH_DB_PATH environment variable (zero fallback to default/live db).
- Strictly rejects live/operational database targets (e.g. 'auth.db', live volumes).
- Fails closed with non-zero exit code before instantiating repository or touching disk.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys

FORBIDDEN_DB_NAMES = {"auth.db", "auth_production.db", "production.db", "auth_live.db"}


def validate_e2e_db_path(raw_path: str | None) -> Path:
    """Validates that the provided path is explicitly designated for E2E testing."""
    if not raw_path or not raw_path.strip():
        raise ValueError(
            "AUTH_DB_PATH environment variable is required for E2E seed script. "
            "Refusing to execute with empty or missing path."
        )

    resolved = Path(raw_path.strip()).resolve()
    base_name = resolved.name.lower()

    if base_name in FORBIDDEN_DB_NAMES:
        raise ValueError(
            f"Target database '{resolved.name}' is a protected live/operational database name. "
            "E2E seed script is strictly forbidden from mutating live databases."
        )

    # Must be explicitly identifiable as an E2E/test database
    if not ("e2e" in base_name or "test" in base_name):
        raise ValueError(
            f"Target database '{resolved.name}' does not match expected E2E test naming pattern "
            "(must contain 'e2e' or 'test', e.g. 'auth_e2e.db')."
        )

    return resolved


def seed_e2e_users(db_path: Path | None = None) -> None:
    if db_path is None:
        raw_env = os.environ.get("AUTH_DB_PATH")
        db_path = validate_e2e_db_path(raw_env)
    else:
        db_path = validate_e2e_db_path(str(db_path))

    # Lazy import app modules only AFTER path validation succeeds
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.auth.models import Role
    from app.auth.repository import SqliteAuthRepository
    from app.auth.security import hash_password

    repo = SqliteAuthRepository(db_path)

    test_users = [
        ("ppic_operator", "PpicPassword2026!", Role.PPIC),
        ("it_admin", "ItAdminPassword2026!", Role.IT),
    ]

    for username, password, role in test_users:
        existing = repo.get_user_by_username(username)
        if not existing:
            repo.create_user(
                username=username,
                password_hash=hash_password(password),
                role=role,
                is_active=True,
            )
            print(f"Created E2E test user '{username}' (role: {role.value}) in {db_path.name}")
        else:
            repo.update_user_password(existing.id, hash_password(password))
            repo.set_user_active(existing.id, True)
            print(f"Refreshed E2E test user '{username}' (role: {role.value}) in {db_path.name}")


def main() -> int:
    try:
        raw_env = os.environ.get("AUTH_DB_PATH")
        db_path = validate_e2e_db_path(raw_env)
        seed_e2e_users(db_path)
        return 0
    except Exception as exc:
        print(f"FATAL: E2E Seeder Safety Rejection: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
