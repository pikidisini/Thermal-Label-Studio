"""Integration tests for Application Authentication API, transport security, and unified simulation session."""

import io
import json
from pathlib import Path
import unittest.mock
import pytest
from fastapi.testclient import TestClient

from app.auth.models import Role
from app.auth.security import hash_password
from app.auth.service import auth_service
from app.main import app


@pytest.fixture
def auth_api_setup(isolate_auth_service):
    """Seed test users in isolated repository."""
    auth_service.repository.create_user("ppic_user", hash_password("PpicPass123!"), Role.PPIC)
    auth_service.repository.create_user("it_admin", hash_password("ItAdmin123!"), Role.IT)
    auth_service.repository.create_user("inactive_user", hash_password("Inactive123!"), Role.PPIC, is_active=False)


def test_login_success_ppic(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "authenticated"
    assert data["user"]["username"] == "ppic_user"
    assert data["user"]["role"] == "PPIC"
    assert "csrf_token" in data
    assert "expires_at" in data

    # Check cookies
    assert "app_session" in client.cookies
    assert client.cookies["app_session"] is not None


def test_login_success_it(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "it_admin", "password": "ItAdmin123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "authenticated"
    assert data["user"]["username"] == "it_admin"
    assert data["user"]["role"] == "IT"


def test_login_invalid_password_returns_401(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401
    assert "tidak valid" in resp.json()["detail"].lower()


def test_login_nonexistent_user_returns_401(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent_person", "password": "AnyPassword123!"},
    )
    assert resp.status_code == 401
    # Generic message, identical to invalid password to prevent user enumeration
    assert "tidak valid" in resp.json()["detail"].lower()


def test_login_inactive_user_returns_401(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "inactive_user", "password": "Inactive123!"},
    )
    assert resp.status_code == 401
    assert "tidak valid" in resp.json()["detail"].lower()


def test_login_brute_force_lockout_returns_429(auth_api_setup):
    client = TestClient(app)
    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "ppic_user", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401

    # 6th attempt should be locked out
    resp6 = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert resp6.status_code == 429
    assert "dikunci" in resp6.json()["detail"].lower()


def test_login_transport_security_rejects_lan_http(auth_api_setup):
    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/login",
        headers={"Host": "192.168.1.150:8000"},
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert resp.status_code == 403
    assert "intranet" in resp.json()["detail"].lower() or "https" in resp.json()["detail"].lower()


def test_me_authenticated_and_unauthenticated(auth_api_setup):
    client = TestClient(app)
    # 1. Unauthenticated -> 401
    r_unauth = client.get("/api/v1/auth/me")
    assert r_unauth.status_code == 401

    # 2. Login -> 200
    client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    r_auth = client.get("/api/v1/auth/me")
    assert r_auth.status_code == 200
    info = r_auth.json()
    assert info["authenticated"] is True
    assert info["user"]["username"] == "ppic_user"
    assert info["user"]["role"] == "PPIC"
    assert info["csrf_token"] is not None


def test_csrf_token_endpoint(auth_api_setup):
    client = TestClient(app)
    client.post(
        "/api/v1/auth/login",
        json={"username": "it_admin", "password": "ItAdmin123!"},
    )
    resp = client.get("/api/v1/auth/csrf")
    assert resp.status_code == 200
    assert "csrf_token" in resp.json()
    assert len(resp.json()["csrf_token"]) > 0


def test_logout_flow(auth_api_setup):
    client = TestClient(app)
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    csrf_token = login_resp.json()["csrf_token"]

    # 1. Logout without CSRF token fails with 403
    bad_logout = client.post("/api/v1/auth/logout")
    assert bad_logout.status_code == 403

    # 2. Logout with CSRF token succeeds
    good_logout = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_token})
    assert good_logout.status_code == 200
    assert good_logout.json()["status"] == "logged_out"

    # 3. Subsequent /me returns 401
    r_after = client.get("/api/v1/auth/me")
    assert r_after.status_code == 401


def test_sensitive_studio_routes_reject_unauthenticated(unauthenticated_client):
    # Templates
    assert unauthenticated_client.get("/api/v1/templates").status_code == 401
    assert unauthenticated_client.get("/api/v1/templates/label_roll_80x200").status_code == 401

    # Render
    assert unauthenticated_client.post("/api/v1/render", json={}).status_code == 401
    assert unauthenticated_client.post("/api/v1/render/preview", json={}).status_code == 401

    # Inspect
    assert unauthenticated_client.get("/api/v1/inspect/sample-contract").status_code == 401
    assert unauthenticated_client.post("/api/v1/inspect/validate", json={}).status_code == 401


def test_unified_simulation_session_for_ppic_and_it(auth_api_setup, monkeypatch):
    """Verifies AC 1 & AC 3: PPIC and IT use the same simulation endpoints with one session."""
    monkeypatch.setenv("SAP_SHADOW_SIMULATION_ENABLED", "true")
    valid_raw_snapshot = {
        "contract_schema_version": "2.0-raw",
        "producer_namespace": "SAP_DEV",
        "request_id": "REQ-UNIFIED-001",
        "printer_id": "PILOT-PRINTER-01",
        "items": [
            {
                "item_sequence": 1,
                "label_code": "N001",
                "copies": 1,
                "business_context": {
                    "material_number": "RM-PET-001",
                    "material_description": "Polyethylene Terephthalate Film",
                    "batch_number": "B260924-01",
                    "roll_number": "R-001",
                    "sales_order": "SO-100200",
                    "sales_order_item": "000010",
                    "customer_text": "Safe Demo Testing",
                },
                "characteristics": [
                    {"name": "ZZBRAND", "value": "FLEXIPACK"},
                    {"name": "ZZTYPEFILM", "value": "PET-GLOSS"},
                    {"name": "ZZBASEFILM", "value": "PET"},
                    {"name": "ZZWIDTH", "value": "80"},
                    {"name": "ZZLENGTH", "value": "1500"},
                    {"name": "ZZCONVERSIONROLLKG", "value": "12.5"},
                    {"name": "ZZROLLGROSSWEIGHT", "value": "13.2"},
                ],
            }
        ],
    }

    # 1. PPIC User Login
    client_ppic = TestClient(app)
    login_ppic = client_ppic.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert login_ppic.status_code == 200
    csrf_ppic = login_ppic.json()["csrf_token"]

    # PPIC lists batches without secondary pilot login
    r_batches = client_ppic.get("/api/v1/simulation/batches")
    assert r_batches.status_code == 200
    assert isinstance(r_batches.json(), list)

    # PPIC imports JSON
    file_bytes = json.dumps(valid_raw_snapshot).encode("utf-8")
    r_import = client_ppic.post(
        "/api/v1/simulation/import-json",
        files={"file": ("snapshot.json", file_bytes, "application/json")},
        headers={"X-CSRF-Token": csrf_ppic},
    )
    assert r_import.status_code in (200, 202)
    batch_id = r_import.json().get("batch_id")
    assert batch_id is not None

    # PPIC views batch details
    r_detail = client_ppic.get(f"/api/v1/simulation/batches/{batch_id}")
    assert r_detail.status_code == 200
    assert r_detail.json()["batch_id"] == batch_id

    # 2. IT User Login
    client_it = TestClient(app)
    login_it = client_it.post(
        "/api/v1/auth/login",
        json={"username": "it_admin", "password": "ItAdmin123!"},
    )
    assert login_it.status_code == 200
    csrf_it = login_it.json()["csrf_token"]

    # IT accesses the same batch without secondary pilot login
    r_it_detail = client_it.get(f"/api/v1/simulation/batches/{batch_id}")
    assert r_it_detail.status_code == 200
    assert r_it_detail.json()["batch_id"] == batch_id

    # IT downloads PDF
    r_pdf = client_it.get(f"/api/v1/simulation/batches/{batch_id}/pdf")
    assert r_pdf.status_code in (200, 409)  # 200 if ready, 409 if processing in mock


def test_local_simulation_only_blocks_physical_print(client, monkeypatch):
    """Verifies that physical print routes remain 404 even for authenticated users."""
    monkeypatch.setenv("LOCAL_SIMULATION_ONLY", "true")
    assert client.post("/api/v1/print/tcp", json={}).status_code == 404
    assert client.post("/api/v1/print/spooler", json={}).status_code == 404
    assert client.post("/api/v1/print/batch", json={}).status_code == 404
    assert client.post("/api/v1/sap/print", json={}).status_code == 404


def test_studio_mutations_require_csrf(auth_api_setup):
    """P1 Review: All cookie-authenticated mutating routes (POST/DELETE) in studio require CSRF."""
    client = TestClient(app)
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]

    # 1. Read-only endpoints DO NOT require CSRF header (should succeed)
    assert client.get("/api/v1/templates").status_code == 200
    assert client.get("/api/v1/inspect/sample-contract").status_code == 200

    # 2. Mutating endpoints without CSRF token are rejected with 403
    svg_payload = {"template_id": "test_id", "svg_content": "<svg xmlns='http://www.w3.org/2000/svg'><text>test</text></svg>"}
    assert client.post("/api/v1/templates", json=svg_payload).status_code == 403
    assert client.delete("/api/v1/templates/test_id").status_code == 403
    assert client.post("/api/v1/templates/parse-raw", json={"svg_content": "<svg></svg>"}).status_code == 403
    assert client.post("/api/v1/render", json={}).status_code == 403
    assert client.post("/api/v1/render/preview", json={}).status_code == 403
    assert client.post("/api/v1/inspect/validate", json={}).status_code == 403

    # 3. Mutating endpoints with invalid/tampered CSRF token are rejected with 403
    bad_headers = {"X-CSRF-Token": "invalid-tampered-token"}
    assert client.post("/api/v1/templates", json=svg_payload, headers=bad_headers).status_code == 403
    assert client.delete("/api/v1/templates/test_id", headers=bad_headers).status_code == 403
    assert client.post("/api/v1/render", json={}, headers=bad_headers).status_code == 403
    assert client.post("/api/v1/render/preview", json={}, headers=bad_headers).status_code == 403
    assert client.post("/api/v1/inspect/validate", json={}, headers=bad_headers).status_code == 403

    # 4. Mutating endpoints with valid CSRF token pass CSRF check
    good_headers = {"X-CSRF-Token": csrf_token}
    # parse-raw with valid SVG returns 200
    r_parse = client.post(
        "/api/v1/templates/parse-raw",
        json={"svg_content": "<svg xmlns='http://www.w3.org/2000/svg'><text>{{test}}</text></svg>"},
        headers=good_headers,
    )
    assert r_parse.status_code == 200


def test_session_transport_guard_on_me_and_csrf_endpoints(auth_api_setup):
    """P2 Review: Transport security is enforced on session boundaries (/auth/me, /auth/csrf) for intranet."""
    client = TestClient(app)
    # Login on loopback succeeds
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "ppic_user", "password": "PpicPass123!"},
    )
    assert login_resp.status_code == 200

    # 1. Plain HTTP on non-loopback intranet host rejected on /auth/me with 403
    r_me_lan = client.get(
        "/api/v1/auth/me",
        headers={"Host": "label-server.corp.internal:8000"},
    )
    assert r_me_lan.status_code == 403
    assert "https" in r_me_lan.json()["detail"].lower() or "intranet" in r_me_lan.json()["detail"].lower()

    # 2. Spoofed X-Forwarded-Proto rejected with 403
    r_me_spoof = client.get(
        "/api/v1/auth/me",
        headers={
            "Host": "label-server.corp.internal:8000",
            "X-Forwarded-Proto": "https",
        },
    )
    assert r_me_spoof.status_code == 403

    # 3. Plain HTTP on non-loopback intranet host rejected on /auth/csrf with 403
    r_csrf_lan = client.get(
        "/api/v1/auth/csrf",
        headers={"Host": "label-server.corp.internal:8000"},
    )
    assert r_csrf_lan.status_code == 403

    # 4. Verified HTTPS on intranet host succeeds on /auth/me
    session_cookie = client.cookies["app_session"]
    https_client = TestClient(app, base_url="https://label-server.corp.internal:8000")
    https_client.cookies.set("app_session", session_cookie)
    r_me_https = https_client.get("/api/v1/auth/me")
    assert r_me_https.status_code == 200
    assert r_me_https.json()["authenticated"] is True
