"""Seeds deterministic user accounts for Playwright browser E2E test runs."""

from __future__ import annotations

import os
from pathlib import Path
import sys

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.auth.models import Role
from app.auth.repository import SqliteAuthRepository
from app.auth.security import hash_password


def seed_e2e_users() -> None:
    env_db = os.environ.get("AUTH_DB_PATH")
    if env_db:
        db_path = Path(env_db)
    else:
        db_path = backend_dir / "data" / "auth.db"

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


if __name__ == "__main__":
    seed_e2e_users()
