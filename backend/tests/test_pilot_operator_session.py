"""Comprehensive Test Suite for B2B2N Pilot Operator Session & Self-Service Safe Demo.

Verifies Acceptance Criteria & Security Hardening (P1, P2, P3 Remediation):
- AC 1: Browser without session cannot read batch list/status/PDF; session_id is NEVER leaked to
        client-side JavaScript response JSON; machine SAP token is strictly separated;
        X-Pilot-Session-Token header is rejected (cookie-only authentication).
- AC 2: Pilot operator session allows reading only sanitized data; mutations require CSRF;
        sliding session expiry and logout fail closed; errors sanitized; brute-force login
        is rate-limited and locked out (HTTP 429).
- AC 3: Operator batch summary and detailed item sequence with individual status available via
        operator session; verified PDF evidence accessible via cookie-only session.
- AC 4: Inbound SAP DEV machine-to-machine intake remains strictly protected by X-SAP-Simulation-Token.
- P1 Guard: Plain HTTP non-loopback login is rejected (HTTP 403); HTTPS sets secure cookies.
- AC 7: All test assertions run with complete temporary storage isolation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Dict, Generator
import unittest.mock

from fastapi.testclient import TestClient
import pytest

from app.auth.models import Role
from app.auth.security import hash_password
from app.auth.service import auth_service
from app.main import app
from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage
from app.services.pilot_session_service import PilotOperatorSession, pilot_session_service
from app.services.sap_shadow_service import SapShadowService, sap_shadow_service


TEST_SIMULATION_TOKEN = "test-secret-sap-token-b2b2n"
TEST_PILOT_PASSWORD = "OperatorPilotSecurePass2026!"


@pytest.fixture(autouse=True)
def isolated_pilot_environment(tmp_path: Path) -> Generator[None, None, None]:
    """Isolates pilot session store and SAP shadow storage per test."""
    pilot_session_service.clear_for_tests()
    auth_service.repository.create_user("operator_ppic", hash_password("OperatorPass123!"), Role.PPIC)
    auth_service.repository.create_user("operator_it", hash_password("AdminPass123!"), Role.IT)

    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
    custom_service = SapShadowService(
        artifact_storage=storage,
        storage_base_dir=tmp_path / "sim_store",
    )

    with unittest.mock.patch("app.api.routes_sap_shadow.sap_shadow_service", custom_service), \
         unittest.mock.patch("app.services.sap_shadow_service.sap_shadow_service", custom_service), \
         unittest.mock.patch("app.config.get_sap_simulation_auth_token", return_value=TEST_SIMULATION_TOKEN), \
         unittest.mock.patch("app.config.is_sap_shadow_simulation_enabled", return_value=True), \
         unittest.mock.patch("app.config.is_pilot_operator_enabled", return_value=True), \
         unittest.mock.patch("app.config.get_pilot_operator_secret", return_value=TEST_PILOT_PASSWORD), \
         unittest.mock.patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         unittest.mock.patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_SIMULATION_TOKEN), \
         unittest.mock.patch("app.api.routes_sap_shadow.is_pilot_operator_enabled", return_value=True), \
         unittest.mock.patch("app.services.pilot_session_service.is_pilot_operator_enabled", return_value=True), \
         unittest.mock.patch("app.services.pilot_session_service.get_pilot_operator_secret", return_value=TEST_PILOT_PASSWORD):
        yield

    pilot_session_service.clear_for_tests()


def login_operator(client: TestClient) -> str:
    """Helper logging in as PPIC operator via unified app login."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "operator_ppic", "password": "OperatorPass123!"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "csrf_token" in data
    return data["csrf_token"]


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def make_sample_raw_snapshot_v2() -> Dict:
    fixture_path = Path("docs/tasks/B2B2K/fixtures/raw_sap_snapshot_v2_n001_synthetic.json")
    return json.loads(fixture_path.read_text(encoding="utf-8"))


# =============================================================================
# 1. Unit Tests for PilotSessionService
# =============================================================================

class TestPilotSessionServiceUnit:
    """Verifies internal logic of PilotSessionService."""

    def test_disabled_pilot_mode_fails_closed(self):
        """When PILOT_OPERATOR_ENABLED is false, authenticate_and_create raises PermissionError."""
        with unittest.mock.patch("app.services.pilot_session_service.is_pilot_operator_enabled", return_value=False):
            with pytest.raises(PermissionError, match="disabled"):
                pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD)

    def test_unconfigured_secret_fails_closed(self):
        """When PILOT_OPERATOR_SECRET is empty, authenticate_and_create raises ValueError."""
        with unittest.mock.patch("app.services.pilot_session_service.get_pilot_operator_secret", return_value=""):
            with pytest.raises(ValueError, match="not configured"):
                pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD)

    def test_invalid_password_returns_none(self):
        """Invalid password attempt returns None without creating session."""
        session = pilot_session_service.authenticate_and_create("WrongPassword123!")
        assert session is None

    def test_valid_password_creates_session_with_secure_tokens(self):
        """Valid password creates a session with 32-byte session_id and 24-byte csrf_token."""
        session = pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD, ttl_seconds=1800)
        assert session is not None
        assert len(session.session_id) >= 32
        assert len(session.csrf_token) >= 24
        assert session.operator_label == "pilot_operator"

        fetched = pilot_session_service.get_valid_session(session.session_id)
        assert fetched is not None
        assert fetched.session_id == session.session_id

    def test_sliding_ttl_extends_session(self):
        """Calling get_valid_session applies sliding TTL and extends expires_at."""
        t0 = datetime(2026, 9, 23, 10, 0, 0, tzinfo=timezone.utc)
        session = pilot_session_service.authenticate_and_create(
            TEST_PILOT_PASSWORD, ttl_seconds=3600, now=t0
        )
        assert session is not None
        initial_expires = session.expires_at
        assert initial_expires == t0 + timedelta(seconds=3600)

        # 30 minutes later, session is accessed
        t1 = t0 + timedelta(minutes=30)
        fetched = pilot_session_service.get_valid_session(session.session_id, now=t1)
        assert fetched is not None
        # Expiry is extended by 3600s from t1 (sliding TTL)
        assert fetched.expires_at == t1 + timedelta(seconds=3600)
        assert fetched.expires_at > initial_expires

    def test_session_expiry_removes_session(self):
        """Expired session returns None and is purged from store."""
        t0 = datetime(2026, 9, 23, 10, 0, 0, tzinfo=timezone.utc)
        session = pilot_session_service.authenticate_and_create(
            TEST_PILOT_PASSWORD, ttl_seconds=60, now=t0
        )
        assert session is not None

        # 61 seconds later
        t1 = t0 + timedelta(seconds=61)
        expired = pilot_session_service.get_valid_session(session.session_id, now=t1)
        assert expired is None

    def test_rate_limit_lockout_unit(self):
        """5 consecutive failed attempts lock out the client for LOCKOUT_SECONDS."""
        client_id = "test-client-123"
        t0 = datetime(2026, 9, 23, 10, 0, 0, tzinfo=timezone.utc)

        # 4 wrong attempts
        for i in range(4):
            assert pilot_session_service.authenticate_and_create("wrong", client_id=client_id, now=t0) is None
            is_locked, _ = pilot_session_service.is_client_locked_out(client_id, now=t0)
            assert not is_locked

        # 5th wrong attempt triggers lockout
        assert pilot_session_service.authenticate_and_create("wrong", client_id=client_id, now=t0) is None
        is_locked, remaining = pilot_session_service.is_client_locked_out(client_id, now=t0)
        assert is_locked
        assert remaining > 0

        # 6th attempt (even with correct password) raises PermissionError
        with pytest.raises(PermissionError, match="dikunci sementara"):
            pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD, client_id=client_id, now=t0)

        # Different client is unaffected
        other_session = pilot_session_service.authenticate_and_create(
            TEST_PILOT_PASSWORD, client_id="other-client", now=t0
        )
        assert other_session is not None

    def test_csrf_verification(self):
        """CSRF verification passes for exact token and fails for mismatch or empty."""
        session = pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD)
        assert session is not None

        assert pilot_session_service.verify_csrf(session, session.csrf_token) is True
        assert pilot_session_service.verify_csrf(session, "invalid-csrf-token") is False
        assert pilot_session_service.verify_csrf(session, None) is False
        assert pilot_session_service.verify_csrf(session, "") is False

    def test_revoke_session(self):
        """Revoking session removes it immediately from active sessions."""
        session = pilot_session_service.authenticate_and_create(TEST_PILOT_PASSWORD)
        assert session is not None

        assert pilot_session_service.revoke_session(session.session_id) is True
        assert pilot_session_service.get_valid_session(session.session_id) is None


# =============================================================================
# 2. Integration Tests for Pilot Operator Routes & AC 1, 2, 3, 4
# =============================================================================

class TestPilotOperatorRoutes:
    """Verifies API endpoints for pilot operator self-service and legacy decommissioning."""

    def test_public_status_probe_reports_pilot_operator_enabled(self, client: TestClient):
        """Status probe reports pilot_operator_enabled=True and monitoring_requires_identity_provider=False."""
        resp = client.get("/api/v1/simulation/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["pilot_operator_enabled"] is True
        assert data["monitoring_requires_identity_provider"] is False

    def test_legacy_operator_login_is_decommissioned_404(self, client: TestClient):
        """F3.3 Review: Legacy /simulation/operator/login is decommissioned and returns HTTP 404."""
        resp = client.post("/api/v1/simulation/operator/login", json={"password": TEST_PILOT_PASSWORD})
        assert resp.status_code == 404
        assert "dinonaktifkan" in resp.json()["detail"].lower()

    def test_legacy_pilot_session_cookie_rejected_fails_closed_401(self, client: TestClient):
        """F3.3 Review: Legacy pilot_session cookie without unified app_session is rejected with HTTP 401."""
        client_legacy = TestClient(app)
        client_legacy.cookies.set("pilot_session", "legacy-token-val")

        # 1. Batches endpoint
        r1 = client_legacy.get("/api/v1/simulation/operator/batches")
        assert r1.status_code == 401
        assert "dinonaktifkan" in r1.json()["detail"].lower()

        # 2. PDF endpoint
        r2 = client_legacy.get("/api/v1/simulation/operator/batches/REQ-001/pdf")
        assert r2.status_code == 401
        assert "dinonaktifkan" in r2.json()["detail"].lower()

        # 3. Import JSON endpoint
        r3 = client_legacy.post(
            "/api/v1/simulation/operator/import-json",
            files={"file": ("test.json", b"{}", "application/json")},
            headers={"X-CSRF-Token": "test-csrf"},
        )
        assert r3.status_code == 401
        assert "dinonaktifkan" in r3.json()["detail"].lower()

    def test_transport_security_loopback_vs_intranet(self, client: TestClient):
        """P1: Plain HTTP allowed on loopback; plain HTTP rejected on intranet host; spoofed X-Forwarded-Proto rejected; verified HTTPS allowed."""
        # 1. Plain HTTP on loopback succeeds
        resp_loopback = client.post(
            "/api/v1/auth/login",
            headers={"Host": "localhost:8000"},
            json={"username": "operator_ppic", "password": "OperatorPass123!"},
        )
        assert resp_loopback.status_code == 200
        set_cookie_loopback = resp_loopback.headers.get("set-cookie", "").lower()
        assert "secure" not in set_cookie_loopback
        assert "samesite=lax" in set_cookie_loopback
        assert "httponly" in set_cookie_loopback

        # 2. Plain HTTP on non-loopback intranet host fails closed (HTTP 403)
        resp_intranet_http = client.post(
            "/api/v1/auth/login",
            headers={"Host": "label-server.corp.internal:8000"},
            json={"username": "operator_ppic", "password": "OperatorPass123!"},
        )
        assert resp_intranet_http.status_code == 403
        assert "https" in resp_intranet_http.json()["detail"].lower() or "intranet" in resp_intranet_http.json()["detail"].lower()

        # 3. Spoofed X-Forwarded-Proto: https from untrusted client over plain HTTP MUST BE REJECTED (HTTP 403)
        resp_spoofed_https = client.post(
            "/api/v1/auth/login",
            headers={
                "Host": "label-server.corp.internal:8000",
                "X-Forwarded-Proto": "https",
            },
            json={"username": "operator_ppic", "password": "OperatorPass123!"},
        )
        assert resp_spoofed_https.status_code == 403
        assert "https" in resp_spoofed_https.json()["detail"].lower() or "intranet" in resp_spoofed_https.json()["detail"].lower()

        # 4. Verified HTTPS on intranet host succeeds and sets secure cookie
        https_client = TestClient(app, base_url="https://label-server.corp.internal:8000")
        resp_intranet_https = https_client.post(
            "/api/v1/auth/login",
            json={"username": "operator_ppic", "password": "OperatorPass123!"},
        )
        assert resp_intranet_https.status_code == 200
        set_cookie_https = resp_intranet_https.headers.get("set-cookie", "").lower()
        assert "secure" in set_cookie_https
        assert "samesite=lax" in set_cookie_https
        assert "httponly" in set_cookie_https

    def test_rate_limit_lockout_http_429(self, client: TestClient):
        """P2: 5 consecutive invalid login attempts from same client trigger HTTP 429 lockout."""
        for _ in range(5):
            r = client.post("/api/v1/auth/login", json={"username": "operator_ppic", "password": "WrongPassword"})
            assert r.status_code == 401

        # 6th attempt is locked out with 429
        locked_resp = client.post("/api/v1/auth/login", json={"username": "operator_ppic", "password": "OperatorPass123!"})
        assert locked_resp.status_code == 429
        assert "dikunci sementara" in locked_resp.json()["detail"]

    def test_session_probe_unauthenticated_returns_200_false(self, client: TestClient):
        """Probe /simulation/operator/session without cookie returns authenticated=False without 401."""
        resp = client.get("/api/v1/simulation/operator/session")
        assert resp.status_code == 200
        data = resp.json()
        assert data["pilot_operator_enabled"] is True
        assert data["authenticated"] is False

    def test_session_probe_authenticated_via_cookie(self, client: TestClient):
        """Probe /simulation/operator/session with authenticated cookie returns authenticated=True."""
        login_operator(client)

        # Client automatically retains cookie jar
        resp = client.get("/api/v1/simulation/operator/session")
        assert resp.status_code == 200
        data = resp.json()
        assert data["authenticated"] is True
        assert "csrf_token" in data
        assert "session_id" not in data

    def test_session_probe_authenticated_on_plain_http_intranet_fails_closed_403(self, client: TestClient):
        """P2: Probe /simulation/operator/session with authenticated cookie over plain HTTP intranet is rejected with 403."""
        login_operator(client)

        # Non-loopback plain HTTP intranet host must be rejected fail-closed with 403
        resp = client.get(
            "/api/v1/simulation/operator/session",
            headers={"Host": "192.168.1.50:8000"},
        )
        assert resp.status_code == 403
        assert "wajib menggunakan https" in resp.json()["detail"].lower()

    def test_anonymous_access_to_operator_batches_fails_closed_401(self, client: TestClient):
        """AC 1: Anonymous request to /simulation/operator/batches returns HTTP 401."""
        resp = client.get("/api/v1/simulation/operator/batches")
        assert resp.status_code == 401

    def test_header_session_token_rejected_fails_closed_401(self, client: TestClient):
        """P1: Authentication strictly requires cookie; X-Pilot-Session-Token header alone is rejected."""
        # Create valid session
        login_operator(client)
        session_cookie = client.cookies["app_session"]

        # Request using separate client with header only (no cookie) must be rejected
        isolated_client = TestClient(app)
        resp = isolated_client.get(
            "/api/v1/simulation/operator/batches",
            headers={"X-Pilot-Session-Token": session_cookie},
        )
        assert resp.status_code == 401

    def test_machine_sap_token_cannot_access_operator_endpoints_fails_closed_401(self, client: TestClient):
        """AC 1: Passing X-SAP-Simulation-Token to operator endpoints is rejected with 401."""
        resp = client.get(
            "/api/v1/simulation/operator/batches",
            headers={"X-SAP-Simulation-Token": TEST_SIMULATION_TOKEN},
        )
        assert resp.status_code == 401

    def test_authenticated_operator_can_list_batches_with_data_minimization(self, client: TestClient):
        """AC 2 & 3: Operator session allows listing batches; raw customer text and snapshots are omitted."""
        # 1. Ingest synthetic raw SAP batch via machine-to-machine endpoint
        raw_payload = make_sample_raw_snapshot_v2()
        ingest_resp = client.post(
            "/api/v1/simulation/raw-batches",
            headers={"X-SAP-Simulation-Token": TEST_SIMULATION_TOKEN},
            json=raw_payload,
        )
        assert ingest_resp.status_code in (200, 202)
        batch_id = ingest_resp.json()["batch_id"]

        # 2. Login as unified operator
        login_operator(client)

        # 3. Retrieve batches as operator (via client cookie jar)
        list_resp = client.get("/api/v1/simulation/operator/batches")
        assert list_resp.status_code == 200
        batches = list_resp.json()
        assert len(batches) >= 1

        target_batch = next(b for b in batches if b["batch_id"] == batch_id)
        assert target_batch["status"] == "completed"
        assert target_batch["total_items"] == 3
        assert target_batch["completed_items"] == 3
        assert target_batch["label_code"] == "N001"
        assert target_batch["has_pdf"] is True

        # Data minimization assertion: No raw snapshot, no characteristics, no customer text
        assert "raw_snapshot" not in target_batch
        assert "characteristics" not in target_batch
        assert "raw_business_context" not in target_batch

    def test_authenticated_operator_can_get_batch_detail_with_item_sequence(self, client: TestClient):
        """P2 (AC 3): Operator can retrieve batch detail with individual item sequences and status."""
        raw_payload = make_sample_raw_snapshot_v2()
        ingest_resp = client.post(
            "/api/v1/simulation/raw-batches",
            headers={"X-SAP-Simulation-Token": TEST_SIMULATION_TOKEN},
            json=raw_payload,
        )
        batch_id = ingest_resp.json()["batch_id"]

        # Login
        login_operator(client)

        # Get batch detail
        detail_resp = client.get(f"/api/v1/simulation/operator/batches/{batch_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()

        assert detail["batch_id"] == batch_id
        assert detail["status"] == "completed"
        assert "items" in detail
        assert len(detail["items"]) == 3

        # Verify sequential ordering: item_sequence 1, 2, 3
        sequences = [it["item_sequence"] for it in detail["items"]]
        assert sequences == [1, 2, 3]

        for it in detail["items"]:
            assert it["status"] == "completed"
            assert "item_id" in it
            assert "template_version_id" in it
            # Data minimization: raw facts omitted
            assert "canonical_item_data" not in it

    def test_authenticated_operator_can_download_evidence_pdf(self, client: TestClient):
        """AC 3: Operator can download verified evidence PDF strictly with cookie session."""
        raw_payload = make_sample_raw_snapshot_v2()
        ingest_resp = client.post(
            "/api/v1/simulation/raw-batches",
            headers={"X-SAP-Simulation-Token": TEST_SIMULATION_TOKEN},
            json=raw_payload,
        )
        batch_id = ingest_resp.json()["batch_id"]

        # Anonymous PDF download rejected
        anon_client = TestClient(app)
        anon_pdf = anon_client.get(f"/api/v1/simulation/operator/batches/{batch_id}/pdf")
        assert anon_pdf.status_code == 401

        # Authorized operator login
        login_operator(client)

        # Authorized operator PDF download succeeds (via cookie stored on client)
        auth_pdf = client.get(f"/api/v1/simulation/operator/batches/{batch_id}/pdf")
        assert auth_pdf.status_code == 200
        assert auth_pdf.headers["Content-Type"] == "application/pdf"
        assert auth_pdf.content.startswith(b"%PDF")

    def test_operator_logout_requires_csrf_and_revokes_session(self, client: TestClient):
        """AC 2: Logout requires CSRF token; after logout, session is revoked and cookie cleared."""
        csrf_token = login_operator(client)

        # 1. Logout without CSRF header rejected with 403
        logout_no_csrf = client.post("/api/v1/simulation/operator/logout")
        assert logout_no_csrf.status_code == 403

        # 2. Logout with wrong CSRF header rejected with 403
        logout_wrong_csrf = client.post(
            "/api/v1/simulation/operator/logout",
            headers={"X-CSRF-Token": "wrong-csrf-value"},
        )
        assert logout_wrong_csrf.status_code == 403

        # 3. Logout with valid CSRF succeeds
        logout_ok = client.post(
            "/api/v1/simulation/operator/logout",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert logout_ok.status_code == 200
        assert logout_ok.json()["status"] == "logged_out"

        # 4. Subsequent requests using revoked session return 401
        after_logout = client.get("/api/v1/simulation/operator/batches")
        assert after_logout.status_code == 401

    def test_operator_session_expiry_fails_closed(self, client: TestClient):
        """AC 2: When session expires, requests fail closed with 401."""
        login_operator(client)
        session_id = client.cookies["app_session"]
        # Delete / revoke session to simulate expiration
        auth_service.logout(session_id)

        resp = client.get("/api/v1/simulation/operator/batches")
        assert resp.status_code == 401
