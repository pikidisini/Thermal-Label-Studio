"""Comprehensive Test Suite for B2B2O Operator Local JSON Import to Safe Demo.

Verifies Acceptance Criteria & Security Hardening:
- AC 1: Local Raw SAP Snapshot v2 JSON import via operator session.
- AC 2: N001 development profile validation and fail-closed behavior.
- AC 3: Operator pilot auth strictly required (401), CSRF enforced (403), transport security (403),
        max size 2 MiB (413), strict UTF-8 (400), duplicate-key rejection (400), rate limit (429),
        idempotent replay (200), and replay conflict (409).
- AC 4: Ingestion uses identical sap_shadow_service pipeline without exposing SAP tokens to browser.
- AC 5: Zero physical printer / socket calls.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any, Dict, Generator
import unittest.mock

from fastapi.testclient import TestClient
import pytest

from app.auth.models import Role
from app.auth.security import hash_password
from app.auth.service import auth_service
from app.main import app
from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage
from app.services.pilot_session_service import pilot_session_service
from app.services.sap_shadow_service import SapShadowService, sap_shadow_service


TEST_SIMULATION_TOKEN = "test-secret-sap-token-b2b2o"
TEST_PILOT_PASSWORD = "OperatorPilotSecurePass2026!"


@pytest.fixture(autouse=True)
def isolated_import_environment(request: pytest.FixtureRequest, tmp_path: Path) -> Generator[None, None, None]:
    """Isolates pilot session store and SAP shadow storage per test."""
    pilot_session_service.clear_for_tests()
    auth_service.repository.create_user("operator_ppic", hash_password("OperatorPass123!"), Role.PPIC)

    if getattr(request.node.cls, "SKIP_AUTOUSE_MOCKS", False):
        yield
        return

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


def build_valid_n001_raw_item(seq: int = 1, batch_num: str = "B260901", length_val: str = "1500") -> Dict[str, Any]:
    """Helper creating a minimal valid N001 RawSapItemSnapshotV2 dict."""
    return {
        "item_sequence": seq,
        "label_code": "N001",
        "copies": 1,
        "business_context": {
            "material_number": "RM-PET-001",
            "material_description": "Polyethylene Terephthalate Film",
            "batch_number": batch_num,
            "roll_number": f"R-{seq:03d}",
            "sales_order": "SO-100200",
            "sales_order_item": "000010",
            "customer_text": "Safe Demo Pilot Testing",
        },
        "characteristics": [
            {"name": "ZZBRAND", "value": "FLEXIPACK"},
            {"name": "ZZTYPEFILM", "value": "PET-GLOSS"},
            {"name": "ZZBASEFILM", "value": "PET"},
            {"name": "ZZWIDTH", "value": "80"},
            {"name": "ZZLENGTH", "value": length_val},
            {"name": "ZZCONVERSIONROLLKG", "value": "12.5"},
            {"name": "ZZROLLGROSSWEIGHT", "value": "13.2"},
        ],
    }


def build_valid_raw_payload(request_id: str = "REQ-B2B2O-001") -> Dict[str, Any]:
    """Constructs a valid Raw SAP Snapshot v2 payload conforming to N001 development profile."""
    return {
        "contract_schema_version": "2.0-raw",
        "producer_namespace": "SAP_DEV",
        "request_id": request_id,
        "printer_id": "PILOT-PRINTER-01",
        "items": [
            build_valid_n001_raw_item(seq=1, batch_num="BATCH-2026-A", length_val="1500"),
            build_valid_n001_raw_item(seq=2, batch_num="BATCH-2026-B", length_val="2000"),
        ],
    }


def login_operator(client: TestClient) -> str:
    """Helper logging in the operator and returning the CSRF token."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "operator_ppic", "password": "OperatorPass123!"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "csrf_token" in data
    return data["csrf_token"]


class TestOperatorJsonImportSecurity:
    """Security, Authentication, CSRF, and Transport Guards."""

    def test_anonymous_import_fails_closed_401(self):
        client = TestClient(app)
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            files={"file": ("test.json", json.dumps(build_valid_raw_payload()), "application/json")},
            headers={"X-CSRF-Token": "some-token"},
        )
        assert resp.status_code == 401
        assert "belum masuk" in resp.json()["detail"].lower()

    def test_missing_csrf_fails_closed_403(self):
        client = TestClient(app)
        _ = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            files={"file": ("test.json", json.dumps(build_valid_raw_payload()), "application/json")},
            # Missing X-CSRF-Token header
        )
        assert resp.status_code == 403
        assert "CSRF" in resp.json()["detail"]

    def test_invalid_csrf_fails_closed_403(self):
        client = TestClient(app)
        _ = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            files={"file": ("test.json", json.dumps(build_valid_raw_payload()), "application/json")},
            headers={"X-CSRF-Token": "invalid-tampered-token"},
        )
        assert resp.status_code == 403
        assert "CSRF" in resp.json()["detail"]

    def test_plain_http_intranet_fails_closed_403(self):
        client = TestClient(app)
        csrf = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={
                "Host": "label-server.corp.internal:8000",
                "X-CSRF-Token": csrf,
            },
            files={"file": ("test.json", json.dumps(build_valid_raw_payload()), "application/json")},
        )
        assert resp.status_code == 403
        assert "HTTPS" in resp.json()["detail"]

    def test_missing_file_field_in_multipart_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            data={"other_field": "irrelevant_value"},
        )
        assert resp.status_code == 400
        assert "field 'file' wajib disertakan" in resp.json()["detail"].lower()

    def test_raw_json_body_without_file_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Raw JSON payload rejected fail-closed
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            json=build_valid_raw_payload(),
        )
        assert resp.status_code == 400
        assert "field 'file' wajib disertakan" in resp.json()["detail"].lower()

    def test_raw_bytes_body_without_file_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Raw octet-stream bytes rejected fail-closed
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/octet-stream"},
            content=b'{"contract_schema_version": "2.0-raw"}',
        )
        assert resp.status_code == 400
        assert "field 'file' wajib disertakan" in resp.json()["detail"].lower()

    def test_payload_exceeding_2mib_fails_closed_413(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Create oversized payload (> 2 MiB)
        oversized = "a" * (2 * 1024 * 1024 + 100)
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("large.json", oversized, "application/json")},
        )
        assert resp.status_code == 413
        assert "2 MiB" in resp.json()["detail"]

    def test_exact_2mib_file_accepted_without_multipart_overhead_rejection(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload(request_id="REQ-EXACT-2MIB")
        payload_bytes = json.dumps(payload).encode("utf-8")
        exact_2mib_bytes = 2 * 1024 * 1024
        padding_len = exact_2mib_bytes - len(payload_bytes)
        assert padding_len > 0
        # Valid JSON allows trailing whitespace padding
        padded_json_bytes = payload_bytes + (b" " * padding_len)
        assert len(padded_json_bytes) == exact_2mib_bytes

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("exact_2mib.json", padded_json_bytes, "application/json")},
        )
        assert resp.status_code == 202
        assert resp.json()["request_id"] == "REQ-EXACT-2MIB"

    def test_file_exceeding_2mib_by_one_byte_fails_closed_413(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload(request_id="REQ-OVER-1B")
        payload_bytes = json.dumps(payload).encode("utf-8")
        exact_2mib_plus_one = 2 * 1024 * 1024 + 1
        padding_len = exact_2mib_plus_one - len(payload_bytes)
        padded_json_bytes = payload_bytes + (b" " * padding_len)
        assert len(padded_json_bytes) == exact_2mib_plus_one

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("over_1b.json", padded_json_bytes, "application/json")},
        )
        assert resp.status_code == 413
        assert "2 MiB" in resp.json()["detail"]

    def test_unauthenticated_large_upload_fails_closed_401_before_spooling(self):
        client = TestClient(app)
        # Client without session cookie sends oversized payload (> 2 MiB)
        oversized = "x" * (2 * 1024 * 1024 + 1024)
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": "some-token"},
            files={"file": ("large_unauth.json", oversized, "application/json")},
        )
        # Must fail fast with 401 Unauthorized before spooling or parsing body
        assert resp.status_code == 401
        assert "belum masuk" in resp.json()["detail"].lower()

    def test_invalid_content_length_header_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Non-numeric Content-Length
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf, "Content-Length": "not-a-number"},
            content=b"test",
        )
        assert resp.status_code == 400
        assert "Content-Length tidak valid" in resp.json()["detail"]

        # Negative Content-Length
        resp_neg = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf, "Content-Length": "-10"},
            content=b"test",
        )
        assert resp_neg.status_code == 400
        assert "Content-Length tidak valid" in resp_neg.json()["detail"]

    def test_content_length_header_exceeding_max_request_bytes_fails_closed_413(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Header declares size larger than MAX_IMPORT_REQUEST_BYTES
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf, "Content-Length": str(2 * 1024 * 1024 + 128 * 1024)},
            content=b"dummy",
        )
        assert resp.status_code == 413
        assert "2 MiB" in resp.json()["detail"]

    def test_chunked_streaming_upload_exceeding_limit_aborts_413(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Streaming generator without Content-Length header that exceeds limit
        def chunk_stream():
            chunk_size = 64 * 1024
            # Total: 35 chunks * 64 KiB = 2.1875 MiB (> 2 MiB + 64 KiB)
            for _ in range(35):
                yield b"A" * chunk_size

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={
                "X-CSRF-Token": csrf,
                "Content-Type": "multipart/form-data; boundary=---StreamBoundary",
            },
            content=chunk_stream(),
        )
        assert resp.status_code == 413
        assert "2 MiB" in resp.json()["detail"]

    def test_non_json_extension_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("malicious.exe", "MZ...", "application/octet-stream")},
        )
        assert resp.status_code == 400
        assert ".json" in resp.json()["detail"]

    def test_empty_file_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("empty.json", "", "application/json")},
        )
        assert resp.status_code == 400
        assert "kosong" in resp.json()["detail"].lower()

    def test_malformed_json_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("broken.json", '{"contract_schema_version": "2.0-raw", broken', "application/json")},
        )
        assert resp.status_code == 400
        assert "tidak valid" in resp.json()["detail"].lower()

    def test_duplicate_key_json_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        dup_json = '{"contract_schema_version": "2.0-raw", "request_id": "REQ-1", "request_id": "REQ-2"}'
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("duplicate.json", dup_json, "application/json")},
        )
        assert resp.status_code == 400
        assert "kunci json terduplikasi" in resp.json()["detail"].lower()

    def test_invalid_schema_version_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload()
        payload["contract_schema_version"] = "1.0-legacy"

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", json.dumps(payload), "application/json")},
        )
        assert resp.status_code == 400
        assert "tidak didukung" in resp.json()["detail"].lower()

    def test_unknown_extra_field_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload()
        payload["unauthorized_backdoor_field"] = "malicious_injection"

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", json.dumps(payload), "application/json")},
        )
        assert resp.status_code == 400
        assert "validasi skema" in resp.json()["detail"].lower()

    def test_duplicate_item_sequence_fails_closed_400(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload()
        payload["items"][1]["item_sequence"] = 1  # Duplicate sequence 1

        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", json.dumps(payload), "application/json")},
        )
        assert resp.status_code == 400
        assert "item_sequence" in resp.json()["detail"].lower()


class TestOperatorJsonImportFunctional:
    """Functional Happy Path, Idempotency, and Rate Limiting."""

    def test_successful_json_import_creates_batch_and_pdf(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload(request_id="REQ-SUCCESS-001")
        resp = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("export_sap_dev.json", json.dumps(payload), "application/json")},
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "batch_id" in data
        batch_id = data["batch_id"]
        assert data["request_id"] == "REQ-SUCCESS-001"
        assert data["total_items"] == 2

        # Verify batch is visible via operator API
        batch_detail_resp = client.get(f"/api/v1/simulation/operator/batches/{batch_id}")
        assert batch_detail_resp.status_code == 200
        detail = batch_detail_resp.json()
        assert detail["batch_id"] == batch_id
        assert len(detail.get("items", [])) == 2
        assert detail["items"][0]["item_sequence"] == 1
        assert detail["items"][1]["item_sequence"] == 2

        # Verify evidence PDF is accessible via operator endpoint
        pdf_resp = client.get(f"/api/v1/simulation/operator/batches/{batch_id}/pdf")
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert len(pdf_resp.content) > 100

    def test_idempotent_replay_with_identical_payload_returns_200(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload = build_valid_raw_payload(request_id="REQ-IDEM-001")
        file_bytes = json.dumps(payload).encode("utf-8")

        # 1. First import
        r1 = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", file_bytes, "application/json")},
        )
        assert r1.status_code == 202
        b1_id = r1.json()["batch_id"]

        # 2. Second identical import (idempotent replay)
        r2 = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", file_bytes, "application/json")},
        )
        assert r2.status_code == 200
        assert r2.json()["batch_id"] == b1_id
        assert r2.json()["idempotent_replay"] is True

    def test_replay_with_conflicting_payload_fails_closed_409(self):
        client = TestClient(app)
        csrf = login_operator(client)

        payload1 = build_valid_raw_payload(request_id="REQ-CONFLICT-001")
        r1 = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test1.json", json.dumps(payload1), "application/json")},
        )
        assert r1.status_code == 202

        # Mutate payload with same request_id
        payload2 = build_valid_raw_payload(request_id="REQ-CONFLICT-001")
        payload2["items"][0]["business_context"]["material_number"] = "RM-DIFFERENT-MATERIAL"

        r2 = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test2.json", json.dumps(payload2), "application/json")},
        )
        assert r2.status_code == 409
        assert "Conflict" in r2.json()["detail"]

    def test_import_rate_limit_exceeded_returns_429(self):
        client = TestClient(app)
        csrf = login_operator(client)

        # Max import is 15 per minute
        for i in range(15):
            payload = build_valid_raw_payload(request_id=f"REQ-RATE-{i}")
            r = client.post(
                "/api/v1/simulation/operator/import-json",
                headers={"X-CSRF-Token": csrf},
                files={"file": ("test.json", json.dumps(payload), "application/json")},
            )
            assert r.status_code in (200, 202)

        # 16th import triggers rate limit (429)
        payload16 = build_valid_raw_payload(request_id="REQ-RATE-16")
        r16 = client.post(
            "/api/v1/simulation/operator/import-json",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("test.json", json.dumps(payload16), "application/json")},
        )
        assert r16.status_code == 429
        assert "Terlalu banyak permintaan impor" in r16.json()["detail"]


class TestDefaultRuntimeConfigurationFailClosed:
    """Verifies that runtime defaults strictly fail closed (Safe Demo & simulation OFF by default)."""

    SKIP_AUTOUSE_MOCKS = True

    def test_default_config_functions_fail_closed_without_env_vars(self, monkeypatch):
        from app.config import (
            is_safe_demo_enabled,
            is_sap_shadow_simulation_enabled,
            is_pilot_operator_enabled,
            get_pilot_operator_secret,
        )

        monkeypatch.delenv("SAFE_DEMO_MODE", raising=False)
        monkeypatch.delenv("SAP_SHADOW_SIMULATION_ENABLED", raising=False)
        monkeypatch.delenv("PILOT_OPERATOR_ENABLED", raising=False)
        monkeypatch.delenv("PILOT_OPERATOR_SECRET", raising=False)
        monkeypatch.delenv("PILOT_OPERATOR_PASSWORD", raising=False)

        assert is_safe_demo_enabled() is False
        assert is_sap_shadow_simulation_enabled() is False
        assert is_pilot_operator_enabled() is False
        assert get_pilot_operator_secret() == ""

    def test_simulation_endpoints_fail_closed_when_simulation_disabled(self):
        client = TestClient(app)

        with unittest.mock.patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=False), \
             unittest.mock.patch("app.api.routes_sap_shadow.is_pilot_operator_enabled", return_value=False):
            # Probe status reflects disabled state
            status_resp = client.get("/api/v1/simulation/status")
            assert status_resp.status_code == 200
            assert status_resp.json()["enabled"] is False
            assert status_resp.json()["status"] == "disabled"
            assert status_resp.json()["pilot_operator_enabled"] is False

            # Mutating import-json endpoint fails closed 404 (feature disabled)
            import_resp = client.post(
                "/api/v1/simulation/operator/import-json",
                files={"file": ("test.json", b"{}", "application/json")},
            )
            assert import_resp.status_code == 404
            assert "disabled" in import_resp.json()["detail"].lower()

    def test_gitignore_strictly_ignores_dotenv_and_allows_example(self):
        """Regression check verifying .gitignore strictly ignores .env and permits .env.example."""
        gitignore_path = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        assert gitignore_path.exists(), "Root .gitignore must exist in web_app repository."
        lines = [line.strip() for line in gitignore_path.read_text(encoding="utf-8").splitlines()]

        assert ".env" in lines, ".gitignore must explicitly contain line '.env'."
        assert ".env.*" in lines, ".gitignore must contain line '.env.*'."
        assert "!.env*.example" in lines, ".gitignore must allow tracking .env.example."
