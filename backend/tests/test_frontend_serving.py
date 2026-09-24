"""
Tests for Static Frontend SPA Serving.
"""

from fastapi.testclient import TestClient


def test_serve_frontend_index(client: TestClient):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Thermal Label" in resp.text
    assert "<title>" in resp.text


def test_serve_frontend_static_assets(client: TestClient):
    # Verify index.html contains proper script and css link tags
    resp = client.get("/")
    assert resp.status_code == 200
    assert "assets/" in resp.text or "src/main.tsx" in resp.text or "src/main.jsx" in resp.text


def test_api_status_endpoint(client: TestClient):
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "online"
    assert "/docs" in data["docs_url"]
