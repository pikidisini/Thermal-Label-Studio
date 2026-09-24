"""Local CI/CD deployment must not expose legacy physical printing routes."""

from fastapi.testclient import TestClient

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


def test_default_mode_does_not_change_existing_route_registration(monkeypatch):
    monkeypatch.delenv("LOCAL_SIMULATION_ONLY", raising=False)
    monkeypatch.setattr(PrintService, "list_available_printers", lambda: [])
    with TestClient(app) as client:
        response = client.get("/api/v1/print/printers")
    assert response.status_code == 200
    assert response.json() == []
