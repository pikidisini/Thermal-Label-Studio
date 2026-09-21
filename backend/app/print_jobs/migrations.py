"""Explicit, operator-run PostgreSQL baseline migration support.

Migrations are never executed from application startup.  The database URL is
read from the environment so credentials do not appear in process arguments.
"""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path

import psycopg

from .security_validation import validate_database_credentials


BASELINE_VERSION = "print_pipeline_v1"
MIGRATION_LOCK_ID = 824_221_731
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
BASELINE_SQL_PATH = REPOSITORY_ROOT / "docs" / "database" / "print_pipeline_v1.sql"
ROLLBACK_SQL_PATH = REPOSITORY_ROOT / "docs" / "database" / "print_pipeline_v1_rollback.sql"


class MigrationConflictError(RuntimeError):
    """Raised when an installed migration differs from the repository asset."""


def baseline_checksum(sql_path: Path = BASELINE_SQL_PATH) -> str:
    return hashlib.sha256(sql_path.read_bytes()).hexdigest()


def apply_baseline(
    database_url: str,
    sql_path: Path = BASELINE_SQL_PATH,
    *,
    allow_test_credentials: bool = False,
    allow_insecure: bool = False,
) -> bool:
    """Apply the fail-fast v1 baseline once and record its exact checksum.

    Returns ``True`` when the schema was created and ``False`` when the exact
    migration was already installed.
    """
    validate_database_credentials(
        database_url,
        allow_test_credentials=allow_test_credentials,
        allow_insecure=allow_insecure,
    )
    sql_bytes = sql_path.read_bytes()
    sql = sql_bytes.decode("utf-8")
    checksum = hashlib.sha256(sql_bytes).hexdigest()
    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            connection.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS thermal_label_schema_migrations (
                    version VARCHAR(128) PRIMARY KEY,
                    sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            installed = connection.execute(
                "SELECT sha256 FROM thermal_label_schema_migrations WHERE version = %s",
                (BASELINE_VERSION,),
            ).fetchone()
            if installed is not None:
                if installed[0] != checksum:
                    raise MigrationConflictError(
                        f"installed migration {BASELINE_VERSION} has a different checksum"
                    )
                return False
            existing = connection.execute("SELECT to_regclass('public.print_jobs')").fetchone()[0]
            if existing is not None:
                raise MigrationConflictError(
                    "print pipeline objects already exist without a recorded baseline migration"
                )
            connection.execute(sql)
            connection.execute(
                "INSERT INTO thermal_label_schema_migrations (version, sha256) VALUES (%s, %s)",
                (BASELINE_VERSION, checksum),
            )
    return True


def rollback_baseline(
    database_url: str,
    sql_path: Path = ROLLBACK_SQL_PATH,
    *,
    allow_test_credentials: bool = False,
    allow_insecure: bool = False,
) -> bool:
    """Roll back the fail-fast v1 baseline and remove its migration record.

    Returns ``True`` when the schema was rolled back and ``False`` when
    the baseline migration was not installed.
    """
    validate_database_credentials(
        database_url,
        allow_test_credentials=allow_test_credentials,
        allow_insecure=allow_insecure,
    )
    sql_bytes = sql_path.read_bytes()
    sql = sql_bytes.decode("utf-8")
    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            connection.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
            installed = connection.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'thermal_label_schema_migrations'
                """
            ).fetchone()
            if installed is None:
                return False
            recorded = connection.execute(
                "SELECT sha256 FROM thermal_label_schema_migrations WHERE version = %s",
                (BASELINE_VERSION,),
            ).fetchone()
            if recorded is None:
                return False
            connection.execute(sql)
            connection.execute(
                "DELETE FROM thermal_label_schema_migrations WHERE version = %s",
                (BASELINE_VERSION,),
            )
            count = connection.execute(
                "SELECT count(*) FROM thermal_label_schema_migrations"
            ).fetchone()[0]
            if count == 0:
                connection.execute("DROP TABLE thermal_label_schema_migrations")
    return True


def verify_baseline(
    database_url: str,
    sql_path: Path = BASELINE_SQL_PATH,
    *,
    allow_test_credentials: bool = False,
    allow_insecure: bool = False,
) -> None:
    validate_database_credentials(
        database_url,
        allow_test_credentials=allow_test_credentials,
        allow_insecure=allow_insecure,
    )
    checksum = baseline_checksum(sql_path)
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT sha256 FROM thermal_label_schema_migrations WHERE version = %s",
            (BASELINE_VERSION,),
        ).fetchone()
    if row is None or row[0] != checksum:
        raise MigrationConflictError("database baseline is missing or does not match repository SQL")


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage the Thermal Label Studio PostgreSQL baseline")
    parser.add_argument("command", choices=("apply", "verify", "rollback"))
    args = parser.parse_args()
    database_url = os.environ.get("PRINT_AGENT_DATABASE_URL")
    if not database_url:
        parser.error("PRINT_AGENT_DATABASE_URL is required")
    validate_database_credentials(database_url)
    if args.command == "apply":
        created = apply_baseline(database_url)
        print("baseline applied" if created else "baseline already installed")
    elif args.command == "verify":
        verify_baseline(database_url)
        print("baseline verified")
    else:
        rolled_back = rollback_baseline(database_url)
        print("baseline rolled back" if rolled_back else "baseline was not installed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
