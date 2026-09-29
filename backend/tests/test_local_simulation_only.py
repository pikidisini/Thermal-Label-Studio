"""Local CI/CD deployment must not expose legacy physical printing routes."""

from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.app.main import app
from backend.app.services.print_service import PrintService


def test_legacy_physical_routes_are_blocked_before_dispatch(monkeypatch):
    monkeypatch.setenv("LOCAL_SIMULATION_ONLY", "true")
    with TestClient(app) as client:
        for path in (
            "/api/v1/print/tcp",
            "/api/v1/print/spooler",
            "/api/v1/print/batch",
            "/api/v1/print/printers",
            "/api/v1/sap/print",
        ):
            response = client.post(path, content=b"untrusted-payload")
            assert response.status_code == 404, path
        assert client.get("/health").status_code == 200


def test_default_mode_keeps_legacy_routes_disabled(monkeypatch):
    monkeypatch.delenv("LOCAL_SIMULATION_ONLY", raising=False)
    monkeypatch.setattr(PrintService, "list_available_printers", lambda: [])
    monkeypatch.delenv("LEGACY_DIRECT_PRINT_ENABLED", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/v1/print/printers")
    assert response.status_code == 404


def test_legacy_security_matrix_is_server_side(client, it_client, unauthenticated_client, monkeypatch):
    """Every legacy principal/mode rejects before the virtual transport is reached."""
    paths = ("/api/v1/print/tcp", "/api/v1/print/spooler", "/api/v1/print/batch", "/api/v1/sap/print")
    with patch("app.services.print_service.send_tcp_raw") as tcp, patch(
        "app.services.print_service.send_windows_spooler_raw"
    ) as spooler, patch("app.services.sap_service.send_tcp_raw") as sap_tcp:
        monkeypatch.delenv("LEGACY_DIRECT_PRINT_ENABLED", raising=False)
        for path in paths:
            assert unauthenticated_client.post(path, json={}).status_code == 404

        monkeypatch.setenv("LEGACY_DIRECT_PRINT_ENABLED", "true")
        monkeypatch.delenv("LOCAL_SIMULATION_ONLY", raising=False)
        with patch("app.services.print_service.list_windows_printers", return_value=["virtual-it-printer"]):
            assert unauthenticated_client.get("/api/v1/print/printers").status_code == 401
            assert client.get("/api/v1/print/printers").status_code == 403
            assert it_client.get("/api/v1/print/printers").json() == ["virtual-it-printer"]
        for path in paths:
            assert unauthenticated_client.post(path, json={}).status_code == 401
            assert client.post(path, json={}, headers={"X-CSRF-Token": "bad"}).status_code == 403
            assert it_client.post(path, json={}, headers={"X-CSRF-Token": "bad"}).status_code == 403

        for path in paths:
            assert it_client.post(path, json={}, headers={"X-CSRF-Token": ""}).status_code == 403

        assert it_client.post(
            "/api/v1/sap/print?printer_ip=127.0.0.1&printer_port=9100",
            json={},
            headers={"X-CSRF-Token": ""},
        ).status_code == 403

        monkeypatch.setenv("LOCAL_SIMULATION_ONLY", "true")
        for path in paths:
            assert it_client.post(path, json={}).status_code == 404

    assert not tcp.called
    assert not spooler.called
    assert not sap_tcp.called
