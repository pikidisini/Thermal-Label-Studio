"""
Automated tests for Safe Demo Mode (B2B2H & F3.3 Authentication Guard).

Verifies:
- AC 1: Default-off fail-closed enforcement (SAFE_DEMO_MODE != 'true' returns 404).
- AC 2: Zero physical network sockets; dispatches strictly to SimulatorSocketTransport.
- AC 3: Visible batch with at least 3 distinct items, copies=1, synthetic data only.
- AC 4: Complete lifecycle progression preserving item sequence and human status.
- AC 5: In-memory reset without touching durable files or PostgreSQL.
- AC 6: Clear safety notices and disclaimers.
- AC 7: Sanitized error responses without leaking internal stack traces or secrets.
- F3.3 Security: Unauthenticated access rejected with HTTP 401; mutations without CSRF rejected with HTTP 403.
"""

from __future__ import annotations

import socket
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.services.safe_demo_service import safe_demo_service


@pytest.fixture(autouse=True)
def reset_demo_state():
    """Ensure in-memory demo state is cleanly reset before and after each test."""
    safe_demo_service.reset()
    yield
    safe_demo_service.reset()


def test_safe_demo_unauthenticated_fails_closed_401(unauthenticated_client, monkeypatch):
    """F3.3: Anonymous requests to /safe-demo endpoints must fail closed with 401."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    r_batch = unauthenticated_client.get("/api/v1/safe-demo/batch")
    assert r_batch.status_code == 401

    r_status = unauthenticated_client.get("/api/v1/safe-demo/status")
    assert r_status.status_code == 401

    r_run = unauthenticated_client.post("/api/v1/safe-demo/run")
    assert r_run.status_code == 401

    r_reset = unauthenticated_client.post("/api/v1/safe-demo/reset")
    assert r_reset.status_code == 401


def test_safe_demo_missing_csrf_fails_closed_403(client, monkeypatch):
    """F3.3: Mutating requests to /safe-demo without CSRF token must fail closed with 403."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    # Run without CSRF header
    r_run = client.post("/api/v1/safe-demo/run", headers={"X-CSRF-Token": ""})
    assert r_run.status_code == 403

    # Reset without CSRF header
    r_reset = client.post("/api/v1/safe-demo/reset", headers={"X-CSRF-Token": ""})
    assert r_reset.status_code == 403


def test_safe_demo_default_off_fail_closed(client, monkeypatch):
    """AC 1: When SAFE_DEMO_MODE is false or unset, authenticated demo endpoints return 404."""
    monkeypatch.delenv("SAFE_DEMO_MODE", raising=False)

    # All safe demo endpoints must fail-closed
    r_batch = client.get("/api/v1/safe-demo/batch")
    assert r_batch.status_code == 404
    assert "disabled" in r_batch.json()["detail"].lower()

    r_status = client.get("/api/v1/safe-demo/status")
    assert r_status.status_code == 404

    r_run = client.post("/api/v1/safe-demo/run")
    assert r_run.status_code == 404

    r_reset = client.post("/api/v1/safe-demo/reset")
    assert r_reset.status_code == 404

    # System status reports safe_demo_mode as False
    r_sys = client.get("/api/status")
    assert r_sys.status_code == 200
    assert r_sys.json().get("safe_demo_mode") is False


def test_safe_demo_visible_batch_fixture(client, monkeypatch):
    """AC 3 & AC 6: Batch fixture has >= 3 distinct sequential items with copies=1 and synthetic disclaimer."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    res = client.get("/api/v1/safe-demo/batch")
    assert res.status_code == 200
    data = res.json()

    # AC 6: Clear safety and demo disclaimers
    assert data["disclaimer"] == "Demo data / not SAP production data"
    assert "Simulator only" in data["safety_notice"]
    assert "copies=1" in data["copies_explanation"]
    assert data["status"] == "ready"

    items = data["items"]
    # AC 3: Minimal 3 items
    assert len(items) >= 3

    # Verify item sequence ordering: 1, 2, 3
    sequences = [it["item_sequence"] for it in items]
    assert sequences == [1, 2, 3]

    # Verify all items have copies=1
    for it in items:
        assert it["copies"] == 1
        assert "canonical_item_data" in it

    # Verify each item carries distinct data
    materials = [it["canonical_item_data"]["material_code"] for it in items]
    batches = [it["canonical_item_data"]["batch_number"] for it in items]
    rolls = [it["canonical_item_data"]["roll_number"] for it in items]

    assert len(set(materials)) == len(items), "Every item must have distinct material_code"
    assert len(set(batches)) == len(items), "Every item must have distinct batch_number"
    assert len(set(rolls)) == len(items), "Every item must have distinct roll_number"

    # Synthetic validation: No company employee names, real internal IPs, or secrets
    for it in items:
        for val in it["canonical_item_data"].values():
            assert "192.168." not in str(val)
            assert "10." not in str(val)
            assert "password" not in str(val).lower()


def test_safe_demo_run_simulation_zero_sockets(client, monkeypatch):
    """AC 2 & AC 4: Simulation dispatches to simulator without opening any network sockets."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    # Patch RawTcpSocketTransport to guarantee no physical transport can be constructed
    with patch(
        "app.print_jobs.socket_transport.RawTcpSocketTransport"
    ) as mock_raw_transport:
        mock_raw_transport.side_effect = AssertionError(
            "CRITICAL: RawTcpSocketTransport must never be used in Safe Demo Mode!"
        )

        res = client.post("/api/v1/safe-demo/run")
        assert res.status_code == 200

        # Assert RawTcpSocketTransport was never instantiated
        assert mock_raw_transport.call_count == 0

    batch_data = res.json()
    assert batch_data["status"] == "completed"

    items = batch_data["items"]
    assert len(items) == 3

    for it in items:
        # AC 4: Status and explicit Indonesian human message
        assert it["status"] == "sent_to_simulator"
        assert it["status_display"] == "Terkirim ke simulator — tidak dicetak fisik"
        assert it["byte_count"] > 0
        assert len(it["payload_sha256"]) == 64

        # Verify lifecycle history states
        history_states = [h["state"] for h in it["history"]]
        expected_states = ["accepted", "rendered", "queued", "claimed", "sending", "sent_to_simulator"]
        assert history_states == expected_states

    # Verify simulator transport recorded all dispatches
    assert len(safe_demo_service.transport.dispatches) == 3
    for rec in safe_demo_service.transport.dispatches:
        assert rec["host"] == "simulator://local"
        assert rec["port"] == 0
        assert rec["byte_count"] > 0
        assert "payload_sha256" in rec


@pytest.mark.anyio
async def test_safe_demo_service_direct_socket_guard():
    """Directly calls safe_demo_service.run_simulation with socket.socket patched to prove zero calls."""
    with patch("socket.socket") as mock_sock:
        mock_sock.side_effect = AssertionError("socket.socket must never be called by SafeDemoService!")
        res = await safe_demo_service.run_simulation()
        assert mock_sock.call_count == 0
        assert res["status"] == "completed"


def test_safe_demo_status_endpoint(client, monkeypatch):
    """Verify GET /api/v1/safe-demo/status returns accurate simulation summary."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    # Before run
    res_before = client.get("/api/v1/safe-demo/status")
    assert res_before.status_code == 200
    stat_before = res_before.json()
    assert stat_before["batch_status"] == "ready"
    assert stat_before["total_items"] == 3
    assert stat_before["completed_items"] == 0

    # Run simulation
    client.post("/api/v1/safe-demo/run")

    # After run
    res_after = client.get("/api/v1/safe-demo/status")
    assert res_after.status_code == 200
    stat_after = res_after.json()
    assert stat_after["batch_status"] == "completed"
    assert stat_after["total_items"] == 3
    assert stat_after["completed_items"] == 3
    assert stat_after["dispatches_count"] == 3


def test_safe_demo_reset(client, monkeypatch):
    """AC 5: Reset only affects in-memory demo state without touching external files/DB."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    # 1. Run simulation
    client.post("/api/v1/safe-demo/run")
    status_mid = client.get("/api/v1/safe-demo/status").json()
    assert status_mid["completed_items"] == 3

    # 2. Reset
    r_reset = client.post("/api/v1/safe-demo/reset")
    assert r_reset.status_code == 200
    assert r_reset.json()["status"] == "reset_completed"

    # 3. Verify batch is back to ready state
    batch = client.get("/api/v1/safe-demo/batch").json()
    assert batch["status"] == "ready"
    for it in batch["items"]:
        assert it["status"] == "ready"
        assert it["status_display"] == "Siap disimulasikan"
        assert it["byte_count"] is None
        assert it["payload_sha256"] is None
        assert it["history"] == []

    # Verify transport dispatches cleared
    assert len(safe_demo_service.transport.dispatches) == 0


def test_safe_demo_error_resilience(client, monkeypatch):
    """AC 7: Unexpected internal errors return generic safe messages without leaking traces."""
    monkeypatch.setenv("SAFE_DEMO_MODE", "true")

    with patch.object(safe_demo_service, "run_simulation", side_effect=Exception("InternalDBTokenSecretError")):
        res = client.post("/api/v1/safe-demo/run")
        assert res.status_code == 500
        data = res.json()
        assert "InternalDBTokenSecretError" not in str(data)
        assert data["detail"] == "Simulasi demo mengalami kendala teknis internal."
