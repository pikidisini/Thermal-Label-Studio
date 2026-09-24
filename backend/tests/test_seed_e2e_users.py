"""Regression tests for E2E user seeder safety invariants.

Verifies:
1. Missing AUTH_DB_PATH fails closed with exit code 1 and zero mutation.
2. Target path pointing to live 'auth.db' or operational names fails closed with exit code 1.
3. Unrecognized non-test database name fails closed with exit code 1.
4. Valid isolated test path (e.g. auth_e2e.db) succeeds and seeds deterministic users.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

import pytest

from backend.app.auth.repository import SqliteAuthRepository
from backend.app.auth.security import verify_password

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed_e2e_users.py"


def run_seeder(env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    """Runs seed_e2e_users.py as a separate subprocess with the specified environment."""
    run_env = os.environ.copy()
    if env is not None:
        run_env.update(env)

    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH)],
        env=run_env,
        capture_output=True,
        text=True,
    )


def test_seeder_fails_closed_when_auth_db_path_missing():
    """Missing AUTH_DB_PATH exits non-zero and refuses to seed."""
    env = os.environ.copy()
    env.pop("AUTH_DB_PATH", None)

    proc = subprocess.run(
        [sys.executable, str(SCRIPT_PATH)],
        env=env,
        capture_output=True,
        text=True,
    )

    assert proc.returncode != 0
    assert "FATAL: E2E Seeder Safety Rejection" in proc.stderr
    assert "AUTH_DB_PATH environment variable is required" in proc.stderr


def test_seeder_fails_closed_when_targeting_live_auth_db(tmp_path: Path):
    """Targeting live 'auth.db' name exits non-zero and does not create or mutate the file."""
    forbidden_file = tmp_path / "auth.db"

    proc = run_seeder({"AUTH_DB_PATH": str(forbidden_file)})

    assert proc.returncode != 0
    assert "FATAL: E2E Seeder Safety Rejection" in proc.stderr
    assert "protected live/operational database name" in proc.stderr
    assert not forbidden_file.exists(), "Forbidden live database must NOT be created"


def test_seeder_fails_closed_when_targeting_unrecognized_db_name(tmp_path: Path):
    """Targeting arbitrary database without 'e2e' or 'test' in name exits non-zero."""
    random_file = tmp_path / "user_data.sqlite"

    proc = run_seeder({"AUTH_DB_PATH": str(random_file)})

    assert proc.returncode != 0
    assert "FATAL: E2E Seeder Safety Rejection" in proc.stderr
    assert "does not match expected E2E test naming pattern" in proc.stderr
    assert not random_file.exists()


def test_seeder_succeeds_with_isolated_e2e_db(tmp_path: Path):
    """Targeting explicit test database (e.g. auth_e2e.db) succeeds with exit code 0 and seeds users."""
    test_db = tmp_path / "auth_e2e.db"

    proc = run_seeder({"AUTH_DB_PATH": str(test_db)})

    assert proc.returncode == 0
    assert "Created E2E test user 'ppic_operator'" in proc.stdout
    assert "Created E2E test user 'it_admin'" in proc.stdout
    assert test_db.exists()

    # Verify seeded accounts in SQLite
    repo = SqliteAuthRepository(test_db)
    ppic = repo.get_user_by_username("ppic_operator")
    assert ppic is not None
    assert ppic.role.value == "PPIC"
    assert verify_password("PpicPassword2026!", ppic.password_hash) is True

    it_user = repo.get_user_by_username("it_admin")
    assert it_user is not None
    assert it_user.role.value == "IT"
    assert verify_password("ItAdminPassword2026!", it_user.password_hash) is True

    # Re-running seeder refreshes accounts cleanly
    proc2 = run_seeder({"AUTH_DB_PATH": str(test_db)})
    assert proc2.returncode == 0
    assert "Refreshed E2E test user 'ppic_operator'" in proc2.stdout
