"""Comprehensive regression test suite for Pilot Safety & Network Hardening (B2B2G).

Verifies all safety gates:
1. PostgreSQL LAN exposure prevention (127.0.0.1 binding in docker-compose.pilot.yml).
2. Fail-closed rejection of placeholder/default passwords.
3. Fail-closed physical print safety gate (PRINT_DISPATCH_ENABLED=false by default).
4. Safe Simulator transport behavior without real network sockets.
5. Environment template sanitization (dummy IP, disabled physical dispatch).
6. Printer registry overwrite protection (fail-closed on differing configuration without --force-update).
7. Audit trail generation in print_audit_events when force-update is authorized.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import socket
from unittest.mock import MagicMock, patch
import uuid

import psycopg
import pytest

from backend.app.api.routes_print_agent import PrintAgentSettings
from backend.app.print_jobs.central_dispatcher import CentralPrintDispatcher, DispatchResult, DispatchStatus
from backend.app.print_jobs.central_dispatcher_runner import (
    DispatcherRunnerConfig,
    main,
)
from backend.app.print_jobs.migrations import apply_baseline, rollback_baseline, verify_baseline
from backend.app.print_jobs.models import PrintJobStatus
from backend.app.print_jobs.security_validation import (
    FORBIDDEN_PASSWORD_SUBSTRINGS,
    validate_database_credentials,
)
from backend.app.print_jobs.seed_pilot import PrinterConflictError, seed_pilot_data
from backend.app.print_jobs.socket_transport import (
    PhysicalPrintDisabledError,
    RawTcpSocketTransport,
    SimulatorSocketTransport,
    TransportOutcome,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_DSN = os.getenv("TEST_POSTGRES_DSN")


# ------------------------------------------------------------------------------
# 1. PostgreSQL LAN Exposure Hardening Test
# ------------------------------------------------------------------------------

def test_compose_postgres_bound_to_loopback_only():
    """AC 1: docker-compose.pilot.yml must not expose PostgreSQL 5432 to 0.0.0.0/LAN."""
    compose_file = REPO_ROOT / "docker-compose.pilot.yml"
    assert compose_file.exists(), "docker-compose.pilot.yml must exist"

    content = compose_file.read_text(encoding="utf-8")
    assert "127.0.0.1:${POSTGRES_PORT:-5432}:5432" in content or "127.0.0.1:5432:5432" in content, (
        "PostgreSQL service in docker-compose.pilot.yml must be bound strictly to 127.0.0.1"
    )

    # Ensure no bare "${POSTGRES_PORT:-5432}:5432" without 127.0.0.1 exists in ports
    for line in content.splitlines():
        if "5432:5432" in line:
            assert "127.0.0.1:" in line, f"Port binding violates loopback-only rule: {line}"


def test_compose_dispatcher_has_safety_flags():
    """AC 3 & AC 4: docker-compose.pilot.yml includes safe defaults for dispatcher."""
    compose_file = REPO_ROOT / "docker-compose.pilot.yml"
    content = compose_file.read_text(encoding="utf-8")
    assert "PRINT_DISPATCH_ENABLED: ${PRINT_DISPATCH_ENABLED:-false}" in content
    assert "DISPATCHER_TRANSPORT_MODE: ${DISPATCHER_TRANSPORT_MODE:-simulator}" in content


# ------------------------------------------------------------------------------
# 2. Runtime Validation: Placeholder Password Rejection
# ------------------------------------------------------------------------------

def test_validate_credentials_rejects_placeholder_passwords():
    """AC 2: validate_database_credentials rejects default placeholder passwords."""
    placeholder_urls = [
        "postgresql://pilot_user:pilot_password_replace_in_production@db:5432/thermal_label_pilot",
        "postgresql://user:change_me_now@localhost:5432/db",
        "postgresql://admin:pilot_password@127.0.0.1:5432/test",
        "postgresql://user:short@127.0.0.1:5432/test",  # too short (< 12 chars)
    ]

    for url in placeholder_urls:
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            validate_database_credentials(url, allow_insecure=False)


def test_validate_credentials_allows_strong_passwords():
    """AC 2: Strong non-placeholder passwords pass validation cleanly."""
    valid_url = "postgresql://pilot_user:aB9_xK2_mQ7_vP4_zL1@db:5432/thermal_label_pilot"
    # Should not raise
    validate_database_credentials(valid_url, allow_insecure=False)


def test_validate_credentials_bypassed_with_test_flag():
    """AC 2: ALLOW_INSECURE_TEST_CREDENTIALS allows testing against disposable DB containers."""
    placeholder_url = "postgresql://postgres:codex-disposable-only@127.0.0.1:55432/thermal_label_test"
    # Should not raise when allow_insecure=True
    validate_database_credentials(placeholder_url, allow_insecure=True)


def test_runner_config_rejects_placeholder_from_environment(tmp_path: Path):
    """AC 2: DispatcherRunnerConfig fails closed when environment has placeholder password."""
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user:pilot_password_replace_in_production@db:5432/thermal_label_pilot",
        "PRINT_AGENT_ARTIFACT_ROOT": str(tmp_path.resolve()),
    }
    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
        DispatcherRunnerConfig.from_environment(env)


def test_validate_credentials_rejects_absent_and_empty_passwords():
    """AC 2 / P1-1: validate_database_credentials rejects absent or empty passwords."""
    invalid_urls = [
        "postgresql://pilot_user@db:5432/thermal_label_pilot",
        "postgresql://pilot_user:@db:5432/thermal_label_pilot",
        "postgresql://db:5432/thermal_label_pilot",
        "",
    ]
    for url in invalid_urls:
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            validate_database_credentials(url)

    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
        validate_database_credentials(None)  # type: ignore[arg-type]


def test_fastapi_settings_rejects_placeholder_when_postgresql_backend():
    """AC 2 / P1-1: PrintAgentSettings.from_environment() validates DB credentials when postgresql backend."""
    # 1. Reject placeholder password when postgresql backend
    env_placeholder = {
        "PRINT_AGENT_REPOSITORY_BACKEND": "postgresql",
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user:pilot_password_replace_in_production@db:5432/thermal_label_pilot",
    }
    with patch.dict(os.environ, env_placeholder, clear=True):
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            PrintAgentSettings.from_environment()

    # 2. Reject absent password when postgresql backend
    env_absent = {
        "PRINT_AGENT_REPOSITORY_BACKEND": "postgresql",
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user@db:5432/thermal_label_pilot",
    }
    with patch.dict(os.environ, env_absent, clear=True):
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            PrintAgentSettings.from_environment()

    # 3. Reject short password when postgresql backend
    env_short = {
        "PRINT_AGENT_REPOSITORY_BACKEND": "postgresql",
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user:short@db:5432/thermal_label_pilot",
    }
    with patch.dict(os.environ, env_short, clear=True):
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            PrintAgentSettings.from_environment()

    # 4. Accept strong password when postgresql backend
    env_strong = {
        "PRINT_AGENT_REPOSITORY_BACKEND": "postgresql",
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user:aB9_xK2_mQ7_vP4_zL1@db:5432/thermal_label_pilot",
    }
    with patch.dict(os.environ, env_strong, clear=True):
        settings = PrintAgentSettings.from_environment()
        assert settings.repository_backend == "postgresql"

    # 5. Test bypass with explicit argument
    with patch.dict(os.environ, env_placeholder, clear=True):
        settings_test = PrintAgentSettings.from_environment(allow_test_credentials=True)
        assert settings_test.repository_backend == "postgresql"

    # 6. Memory backend ignores placeholder database URL (does not use PostgreSQL)
    env_memory = {
        "PRINT_AGENT_REPOSITORY_BACKEND": "memory",
        "PRINT_AGENT_DATABASE_URL": "postgresql://pilot_user:pilot_password_replace_in_production@db:5432/thermal_label_pilot",
    }
    with patch.dict(os.environ, env_memory, clear=True):
        settings_memory = PrintAgentSettings.from_environment()
        assert settings_memory.repository_backend == "memory"


def test_migration_functions_reject_insecure_credentials_before_connect(monkeypatch: pytest.MonkeyPatch):
    """AC 2 / P1-1: apply_baseline, rollback_baseline, and verify_baseline reject before psycopg.connect()."""
    connect_called = False

    def guarded_connect(*args: object, **kwargs: object):
        nonlocal connect_called
        connect_called = True
        raise AssertionError("psycopg.connect must NEVER be called when credentials are insecure!")

    monkeypatch.setattr(psycopg, "connect", guarded_connect)

    insecure_urls = [
        "postgresql://pilot_user:pilot_password_replace_in_production@db:5432/thermal_label_pilot",
        "postgresql://pilot_user@db:5432/thermal_label_pilot",
        "postgresql://pilot_user:short@db:5432/thermal_label_pilot",
    ]

    for url in insecure_urls:
        # Test apply_baseline
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            apply_baseline(url)
        assert not connect_called

        # Test rollback_baseline
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            rollback_baseline(url)
        assert not connect_called

        # Test verify_baseline
        with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
            verify_baseline(url)
        assert not connect_called


def test_raw_tcp_transport_fails_closed_internally_without_socket_call(monkeypatch: pytest.MonkeyPatch):
    """AC 3 / P1-2: RawTcpSocketTransport fails closed before creating socket when dispatch_enabled is false."""
    socket_called = False

    def guarded_socket(*args: object, **kwargs: object) -> socket.socket:
        nonlocal socket_called
        socket_called = True
        raise AssertionError("socket.socket must NEVER be called when dispatch_enabled is false!")

    monkeypatch.setattr(socket, "socket", guarded_socket)

    # 1. Default creation
    transport_default = RawTcpSocketTransport()
    with pytest.raises(PhysicalPrintDisabledError, match="Physical printer dispatch is disabled"):
        transport_default.send("127.0.0.1", 9100, b"data")
    assert not socket_called

    # 2. Explicit dispatch_enabled=False
    transport_explicit = RawTcpSocketTransport(dispatch_enabled=False)
    with pytest.raises(PhysicalPrintDisabledError, match="Physical printer dispatch is disabled"):
        transport_explicit.send("127.0.0.1", 9100, b"data")
    assert not socket_called


# ------------------------------------------------------------------------------
# 3. Physical Dispatch Safety Gate & Simulator Transport
# ------------------------------------------------------------------------------

def test_runner_physical_dispatch_fails_closed_by_default(tmp_path: Path):
    """AC 3: If transport_mode is 'tcp' but PRINT_DISPATCH_ENABLED is false, runner fails closed."""
    artifact_root = str(tmp_path.resolve())
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://user:aB9_xK2_mQ7_vP4_zL1@localhost:5432/db",
        "PRINT_AGENT_ARTIFACT_ROOT": artifact_root,
        "DISPATCHER_TRANSPORT_MODE": "tcp",
        "PRINT_DISPATCH_ENABLED": "false",
    }
    with patch.dict(os.environ, env, clear=True):
        with patch("backend.app.print_jobs.central_dispatcher_runner.PostgresPrintAgentRepository") as mock_repo_cls:
            mock_repo = MagicMock()
            mock_repo_cls.return_value = mock_repo

            exit_code = main([])
            assert exit_code == 1
            mock_repo.close.assert_called_once()


def test_runner_tcp_mode_forwards_dispatch_enabled_flag(tmp_path: Path):
    """P1 Re-review: Runner constructs RawTcpSocketTransport with dispatch_enabled=True only when explicitly set."""
    artifact_root = str(tmp_path.resolve())
    env_enabled = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://user:aB9_xK2_mQ7_vP4_zL1@localhost:5432/db",
        "PRINT_AGENT_ARTIFACT_ROOT": artifact_root,
        "DISPATCHER_TRANSPORT_MODE": "tcp",
        "PRINT_DISPATCH_ENABLED": "true",
        "DISPATCHER_MAX_CYCLES": "1",
    }
    with patch.dict(os.environ, env_enabled, clear=True):
        with patch("backend.app.print_jobs.central_dispatcher_runner.PostgresPrintAgentRepository") as mock_repo_cls, \
             patch("backend.app.print_jobs.central_dispatcher_runner.RawTcpSocketTransport") as mock_transport_cls, \
             patch("backend.app.print_jobs.central_dispatcher_runner.CentralPrintDispatcher") as mock_disp_cls:

            mock_repo = MagicMock()
            mock_repo_cls.return_value = mock_repo
            mock_transport = MagicMock()
            mock_transport_cls.return_value = mock_transport
            mock_disp = MagicMock()
            mock_disp.run_once.return_value = DispatchResult(status=DispatchStatus.IDLE)
            mock_disp_cls.return_value = mock_disp

            exit_code = main([])
            assert exit_code == 0

            # Proves RawTcpSocketTransport received dispatch_enabled=True without opening real socket
            mock_transport_cls.assert_called_once()
            _, kwargs = mock_transport_cls.call_args
            assert kwargs.get("dispatch_enabled") is True
            mock_repo.close.assert_called_once()


def test_runner_physical_dispatch_fails_closed_when_flag_omitted(tmp_path: Path):
    """AC 3 / P1: When PRINT_DISPATCH_ENABLED is completely omitted, TCP mode fails closed."""
    artifact_root = str(tmp_path.resolve())
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://user:aB9_xK2_mQ7_vP4_zL1@localhost:5432/db",
        "PRINT_AGENT_ARTIFACT_ROOT": artifact_root,
        "DISPATCHER_TRANSPORT_MODE": "tcp",
    }
    with patch.dict(os.environ, env, clear=True):
        with patch("backend.app.print_jobs.central_dispatcher_runner.PostgresPrintAgentRepository") as mock_repo_cls, \
             patch("backend.app.print_jobs.central_dispatcher_runner.RawTcpSocketTransport") as mock_transport_cls:
            mock_repo = MagicMock()
            mock_repo_cls.return_value = mock_repo

            exit_code = main([])
            assert exit_code == 1
            mock_transport_cls.assert_not_called()
            mock_repo.close.assert_called_once()


def test_simulator_transport_dispatches_cleanly_without_socket(tmp_path: Path):
    """AC 4: SimulatorSocketTransport records dispatches to memory and file without network I/O."""
    log_file = tmp_path / "simulator_output.jsonl"
    transport = SimulatorSocketTransport(log_path=log_file)

    payload = b"<STX><ESC>C<ETX><STX>TEST SIMULATOR PAYLOAD<ETX>"
    result = transport.send("192.168.1.99", 9100, payload)

    assert result.outcome == TransportOutcome.SUCCESS
    assert result.bytes_sent == len(payload)
    assert len(transport.calls) == 1
    assert transport.calls[0] == ("192.168.1.99", 9100, payload)

    # Check output log file
    assert log_file.exists()
    line = log_file.read_text(encoding="utf-8").strip()
    data = json.loads(line)
    assert data["host"] == "192.168.1.99"
    assert data["port"] == 9100
    assert data["byte_count"] == len(payload)
    assert "timestamp" in data
    assert "payload_sha256" in data


# ------------------------------------------------------------------------------
# 4. Safe Environment Template Verification
# ------------------------------------------------------------------------------

def test_env_pilot_example_sanitized():
    """AC 5: .env.pilot.example uses loopback dummy IP and disabled physical dispatch."""
    env_file = REPO_ROOT / ".env.pilot.example"
    assert env_file.exists()

    content = env_file.read_text(encoding="utf-8")
    assert "PRINT_DISPATCH_ENABLED=false" in content
    assert "DISPATCHER_TRANSPORT_MODE=simulator" in content
    assert "PILOT_PRINTER_HOST=127.0.0.1" in content
    assert "192.168.1.50" not in content, "Real subnet IP 192.168.1.50 must not appear in template"


# ------------------------------------------------------------------------------
# 5. Registry Seed Safety & Audit Trail (PostgreSQL Integration)
# ------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def database_url():
    if not TEST_DSN:
        pytest.skip("TEST_POSTGRES_DSN is not configured")
    rollback_baseline(TEST_DSN)
    assert apply_baseline(TEST_DSN) is True
    verify_baseline(TEST_DSN)
    yield TEST_DSN
    rollback_baseline(TEST_DSN)


def test_seed_pilot_rejects_differing_printer_without_force_flag(database_url: str):
    """AC 6: seed_pilot refuses to overwrite an existing printer with differing config."""
    printer_id = "PRN-TEST-SAFETY-01"

    # Initial seed
    seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9100,
        dpi=203.0,
        allow_insecure_credentials=True,
    )

    # Attempt second seed with differing port (9101) without force_update
    with pytest.raises(PrinterConflictError, match="differing configuration"):
        seed_pilot_data(
            database_url=database_url,
            printer_id=printer_id,
            network_host="127.0.0.1",
            network_port=9101,  # Different!
            dpi=203.0,
            force_update=False,
            allow_insecure_credentials=True,
        )


def test_seed_pilot_allows_identical_printer_idempotent(database_url: str):
    """AC 6: seed_pilot allows re-running identical printer configuration as a safe no-op."""
    printer_id = "PRN-TEST-SAFETY-IDEMPOTENT"

    res1 = seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9100,
        dpi=203.0,
        allow_insecure_credentials=True,
    )

    # Re-run with exact same configuration
    res2 = seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9100,
        dpi=203.0,
        force_update=False,
        allow_insecure_credentials=True,
    )

    assert res1["printer_id"] == res2["printer_id"]


def test_seed_pilot_force_update_requires_reason(database_url: str):
    """AC 6: seed_pilot requires non-empty reason when force_update=True."""
    printer_id = "PRN-TEST-SAFETY-REASON"

    seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9100,
        dpi=203.0,
        allow_insecure_credentials=True,
    )

    with pytest.raises(ValueError, match="non-empty reason is required"):
        seed_pilot_data(
            database_url=database_url,
            printer_id=printer_id,
            network_host="127.0.0.1",
            network_port=9105,
            force_update=True,
            reason="",  # Empty reason forbidden
            allow_insecure_credentials=True,
        )


def test_seed_pilot_force_update_records_audit_trail(database_url: str):
    """AC 6: seed_pilot with force_update=True records audit entry in print_audit_events."""
    printer_id = "PRN-TEST-SAFETY-AUDIT"

    # Initial registration
    seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9100,
        dpi=203.0,
        allow_insecure_credentials=True,
    )

    # Force update with reason
    reason_text = "Migrating to backup port 9109 due to switch port maintenance"
    seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        network_host="127.0.0.1",
        network_port=9109,
        dpi=203.0,
        force_update=True,
        reason=reason_text,
        allow_insecure_credentials=True,
    )

    # Verify database was updated
    with psycopg.connect(database_url) as conn:
        row = conn.execute(
            "SELECT network_port FROM printer_registry WHERE printer_id = %s",
            (printer_id,),
        ).fetchone()
        assert row is not None
        assert row[0] == 9109

        # Verify audit trail in print_audit_events
        audit_row = conn.execute(
            """
            SELECT actor_type, action, aggregate_type, reason_code, metadata
            FROM print_audit_events
            WHERE action = 'printer_registry_updated' AND metadata->>'printer_id' = %s
            ORDER BY occurred_at DESC
            LIMIT 1
            """,
            (printer_id,),
        ).fetchone()

        assert audit_row is not None
        assert audit_row[0] == "operator"
        assert audit_row[1] == "printer_registry_updated"
        assert audit_row[2] == "printer"
        assert audit_row[3] == "force_update"
        meta = audit_row[4]
        assert meta["printer_id"] == printer_id
        assert meta["reason"] == reason_text
        assert "network_port" in meta["diffs"]
        assert meta["diffs"]["network_port"]["old"] == "9100"
        assert meta["diffs"]["network_port"]["new"] == "9109"
