"""Comprehensive Automated Test Suite for B2B2I: SAP Shadow Print Simulation & PDF Evidence.

Verifies all Acceptance Criteria (AC 1 through AC 8):
- AC 1: Fail-closed boundary (disabled by default, strict token authorization).
- AC 2: Canonical SAP contract, extra-field prohibition, and idempotent replay.
- AC 3: Zero physical route (no socket, no spooler, server-side virtual profile only).
- AC 4: Pipeline fidelity and strict item_sequence ASC ordering.
- AC 5: Multi-page PDF evidence (manifest cover, ordered label pages, exact points, watermark).
- AC 6: Durable artifact storage integrity, manifest verification, and 7-day retention.
- AC 7: PPIC monitoring API and PDF evidence download.
- AC 8: Sanitized error reporting and strict data hygiene.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import socket
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pypdf
import pytest

from app.config import (
    SAP_SHADOW_SIMULATION_ENABLED,
    get_sap_simulation_auth_token,
    is_sap_shadow_simulation_enabled,
)
from app.main import app
from app.print_jobs.artifact_storage import (
    DEFAULT_RETENTION,
    DurableFilesystemArtifactStorage,
)
from app.services.pdf_evidence_service import WATERMARK_TEXT, PdfEvidenceService
from app.services.sap_shadow_service import (
    SapShadowBatchRequest,
    SapShadowItemInput,
    SapShadowService,
    sap_shadow_service,
)

TEST_AUTH_TOKEN = "test-sap-simulation-token-secret-xyz"


def make_canonical_fixture_items() -> list[dict]:
    """Returns synthetic, non-production SAP canonical items for testing."""
    return [
        {
            "item_sequence": 1,
            "template_version_id": "label_roll_80x200",
            "copies": 1,
            "canonical_item_data": {
                "material_code": "MAT-SYNTH-ALUM-01",
                "material_desc": "Synthetic Roll Foil Grade A",
                "batch_number": "BAT-2026-X01",
                "roll_number": "ROLL-001-A",
                "gross_weight": "12.50 KG",
                "net_weight": "12.10 KG",
            },
        },
        {
            "item_sequence": 2,
            "template_version_id": "label_roll_80x200",
            "copies": 1,
            "canonical_item_data": {
                "material_code": "MAT-SYNTH-ALUM-02",
                "material_desc": "Synthetic Roll Foil Grade B",
                "batch_number": "BAT-2026-X02",
                "roll_number": "ROLL-002-B",
                "gross_weight": "15.80 KG",
                "net_weight": "15.40 KG",
            },
        },
        {
            "item_sequence": 3,
            "template_version_id": "label_roll_80x200",
            "copies": 1,
            "canonical_item_data": {
                "material_code": "MAT-SYNTH-ALUM-03",
                "material_desc": "Synthetic Roll Foil Grade C",
                "batch_number": "BAT-2026-X03",
                "roll_number": "ROLL-003-C",
                "gross_weight": "18.20 KG",
                "net_weight": "17.75 KG",
            },
        },
    ]


@pytest.fixture(autouse=True)
def reset_service_state():
    """Resets singleton state before and after each test."""
    sap_shadow_service.clear_for_tests()
    yield
    sap_shadow_service.clear_for_tests()


# =====================================================================
# AC 1: Dedicated Fail-Closed Boundary & Authentication
# =====================================================================

def test_ac1_fail_closed_when_disabled_by_default():
    """AC 1: When SAP_SHADOW_SIMULATION_ENABLED is false, endpoints return 404."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=False):
        client = TestClient(app)

        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-TEST-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # POST should be rejected with 404
        res_post = client.post(
            "/api/v1/simulation/sap-batches",
            json=payload,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_post.status_code == 404
        assert "disabled" in res_post.json()["detail"].lower()

        # GET batch should be rejected with 404
        res_get = client.get(
            "/api/v1/simulation/sap-batches/some-batch-id",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_get.status_code == 404

        # GET pdf should be rejected with 404
        res_pdf = client.get(
            "/api/v1/simulation/sap-batches/some-batch-id/pdf",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_pdf.status_code == 404


def test_ac1_auth_token_enforcement():
    """AC 1: Requires configured token and matching X-SAP-Simulation-Token header."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True):
        client = TestClient(app)
        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-TEST-002",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # Case 1: Server has NO token configured -> 403 Forbidden
        with patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=""):
            res = client.post("/api/v1/simulation/sap-batches", json=payload)
            assert res.status_code == 403
            assert "not configured" in res.json()["detail"].lower()

        # Case 2: Server has token configured, but request header missing -> 401 Unauthorized
        with patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
            res = client.post("/api/v1/simulation/sap-batches", json=payload)
            assert res.status_code == 401

            # Case 3: Request header has invalid token -> 401 Unauthorized
            res_wrong = client.post(
                "/api/v1/simulation/sap-batches",
                json=payload,
                headers={"X-SAP-Simulation-Token": "wrong-token-abc"},
            )
            assert res_wrong.status_code == 401

            # Case 4: Valid header -> 202 Accepted
            res_valid = client.post(
                "/api/v1/simulation/sap-batches",
                json=payload,
                headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
            )
            assert res_valid.status_code == 202
            assert res_valid.json()["status"] == "accepted"


# =====================================================================
# AC 2: Canonical SAP Contract & Idempotency
# =====================================================================

def test_ac2_rejects_extra_fields_and_malformed_schemas():
    """AC 2: Strict contract validation with extra='forbid'."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        # 1. Payload with forbidden top-level extra field
        payload_extra = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-EXTRA-01",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
            "unexpected_host": "192.168.1.100",  # FORBIDDEN
        }
        res1 = client.post("/api/v1/simulation/sap-batches", json=payload_extra, headers=headers)
        assert res1.status_code == 422

        # 2. Payload with forbidden item extra field
        items_with_extra = make_canonical_fixture_items()
        items_with_extra[0]["raw_tcp_port"] = 9100  # FORBIDDEN
        payload_item_extra = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-EXTRA-02",
            "printer_id": "PILOT-PRINTER-01",
            "items": items_with_extra,
        }
        res2 = client.post("/api/v1/simulation/sap-batches", json=payload_item_extra, headers=headers)
        assert res2.status_code == 422

        # 3. Duplicate item_sequence
        items_duplicate_seq = make_canonical_fixture_items()
        items_duplicate_seq[1]["item_sequence"] = 1  # Duplicate sequence 1
        payload_dup = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-DUP-01",
            "printer_id": "PILOT-PRINTER-01",
            "items": items_duplicate_seq,
        }
        res3 = client.post("/api/v1/simulation/sap-batches", json=payload_dup, headers=headers)
        assert res3.status_code == 400
        assert "item_sequence" in res3.json()["detail"].lower()


def test_ac2_idempotent_replay_and_conflict_handling():
    """AC 2: Replay returns existing batch (200/202) without duplicating artifacts; conflicting payload raises 409."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-IDEM-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # 1. First submission -> 202 Accepted
        res1 = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
        assert res1.status_code == 202
        data1 = res1.json()
        batch_id_1 = data1["batch_id"]
        assert data1["idempotent_replay"] is False

        # 2. Identical replay -> 200 OK with same batch_id and idempotent_replay=True
        res2 = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["batch_id"] == batch_id_1
        assert data2["idempotent_replay"] is True

        # 3. Conflicting payload under same request_id -> 409 Conflict
        conflicting_payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-IDEM-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": [make_canonical_fixture_items()[0]],  # Only 1 item instead of 3
        }
        res3 = client.post("/api/v1/simulation/sap-batches", json=conflicting_payload, headers=headers)
        assert res3.status_code == 409
        assert "conflict" in res3.json()["detail"].lower()


# =====================================================================
# AC 3: No Physical Route & Server-side Virtual Registry Only
# =====================================================================

def test_ac3_zero_sockets_or_physical_transports_invoked(tmp_path: Path):
    """AC 3: Asserts zero socket calls or spooler transport calls occur during simulation."""
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)
        service = SapShadowService(artifact_storage=storage)

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-ZERO-SOCKET",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        with (
            patch("socket.socket") as mock_socket,
            patch("app.print_jobs.socket_transport.RawTcpSocketTransport") as mock_transport,
        ):
            result = await service.ingest_batch(req, auto_process=False)
            batch_id = result["batch_id"]
            # Run processing
            await service.process_batch(batch_id)

            # Assert no socket calls
            assert mock_socket.call_count == 0
            assert mock_transport.call_count == 0

            # Assert batch completed virtually
            batch = service.get_batch(batch_id)
            assert batch["status"] == "completed"
            assert batch["artifact"] is not None

    asyncio.run(_run())


def test_ac3_unknown_printer_id_rejected():
    """AC 3: Unknown printer_id is rejected by server-side registry resolution."""
    service = SapShadowService()
    with pytest.raises(ValueError, match="Unknown or unauthorized printer_id"):
        service.resolve_virtual_printer("PHYSICAL-NETWORK-PRINTER-99")


# =====================================================================
# AC 4: Pipeline Fidelity & Strict Item Sequence Ordering
# =====================================================================

def test_ac4_sequential_order_preserved(tmp_path: Path):
    """AC 4: Items are processed strictly in item_sequence ASC order."""
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)
        service = SapShadowService(artifact_storage=storage)

        # Provide items in reverse sequence order
        items_raw = make_canonical_fixture_items()
        items_raw.reverse()  # Seq 3, 2, 1

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-ORDER-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in items_raw],
        )

        result = await service.ingest_batch(req, auto_process=False)
        batch_id = result["batch_id"]
        await service.process_batch(batch_id)

        batch = service.get_batch(batch_id)
        assert batch["status"] == "completed"

        # Verify item sequences in stored batch are strictly ASC
        sequences = [it["item_sequence"] for it in batch["items"]]
        assert sequences == [1, 2, 3]

    asyncio.run(_run())


# =====================================================================
# AC 5: Multi-page PDF Evidence & Watermark Verification
# =====================================================================

def test_ac5_pdf_evidence_manifest_pages_and_dimensions():
    """AC 5: Verifies Cover page (P1) + N Label pages, exact mm-to-point sizing, and watermark."""
    items = make_canonical_fixture_items()
    profile = {
        "width_mm": 200.0,
        "height_mm": 80.0,
        "dpi": 203.2,
        "orientation": "portrait",
        "printer_language": "zpl",
    }
    batch_id = "BATCH-TEST-PDF-001"
    contract_hash = hashlib.sha256(b"dummy-contract").hexdigest()

    pdf_bytes = PdfEvidenceService.generate_batch_pdf(
        batch_id=batch_id,
        producer_namespace="SAP_PPIC",
        request_id="REQ-PDF-001",
        printer_id="PILOT-PRINTER-01",
        virtual_profile=profile,
        items=items,
        raw_contract_sha256=contract_hash,
        created_at=datetime.now(timezone.utc),
    )

    # Read generated PDF with PyPDF
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))

    # Page count must be 1 Cover + 3 Items = 4 pages
    assert len(reader.pages) == 4

    # Page 1: Cover / Manifest
    cover_page = reader.pages[0]
    cover_text = cover_page.extract_text()
    assert "SAP SHADOW PRINT SIMULATION EVIDENCE" in cover_text
    assert WATERMARK_TEXT in cover_text
    assert batch_id in cover_text
    assert "PILOT-PRINTER-01" in cover_text

    # Pages 2, 3, 4: Exact label dimensions in points
    expected_w_pt = round((200.0 / 25.4) * 72.0, 2)
    expected_h_pt = round((80.0 / 25.4) * 72.0, 2)

    for i in range(1, 4):
        label_page = reader.pages[i]
        box = label_page.mediabox
        actual_w = round(float(box.width), 2)
        actual_h = round(float(box.height), 2)

        # Zero silent auto-scale: must match within 0.1 pt
        assert abs(actual_w - expected_w_pt) < 0.1
        assert abs(actual_h - expected_h_pt) < 0.1

        # Must contain watermark
        label_text = label_page.extract_text()
        assert WATERMARK_TEXT in label_text


# =====================================================================
# AC 6: Durable Artifact Integrity, Manifest & 7-Day Retention
# =====================================================================

def test_ac6_durable_artifact_integrity_and_manifest(tmp_path: Path):
    """AC 6: Evidence PDF is stored with integrity manifest, exact sha256, and 7-day retention."""
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)
        service = SapShadowService(artifact_storage=storage)

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-RETENTION-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        result = await service.ingest_batch(req, auto_process=False)
        batch_id = result["batch_id"]
        await service.process_batch(batch_id)

        batch = service.get_batch(batch_id)
        artifact_meta = batch["artifact"]
        payload_ref = artifact_meta["payload_ref"]

        # Check manifest file on disk
        manifest_file = tmp_path / f"{payload_ref}.manifest.json"
        assert manifest_file.is_file()

        manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
        assert manifest_data["filename"] == "evidence.pdf"
        assert manifest_data["media_type"] == "application/pdf"
        assert manifest_data["sha256"] == artifact_meta["sha256"]

        # Verify retention is 7 days
        created_at = datetime.fromisoformat(manifest_data["created_at"])
        retention_expires_at = datetime.fromisoformat(manifest_data["retention_expires_at"])
        assert retention_expires_at - created_at == DEFAULT_RETENTION

        # Verify binary read matches
        retrieved_bytes = service.get_evidence_pdf(batch_id)
        assert hashlib.sha256(retrieved_bytes).hexdigest() == artifact_meta["sha256"]

    asyncio.run(_run())


# =====================================================================
# AC 7 & AC 8: Monitoring, Download & Error Sanitization
# =====================================================================

def test_ac7_monitoring_and_pdf_download_workflow(tmp_path: Path):
    """AC 7: End-to-end API test verifying status check and PDF binary download."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-E2E-DOWNLOAD",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # 1. Submit batch
        res = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
        assert res.status_code == 202
        batch_id = res.json()["batch_id"]

        # Ensure batch is completed
        batch = sap_shadow_service.get_batch(batch_id)
        if batch and batch.get("status") != "completed":
            asyncio.run(sap_shadow_service.process_batch(batch_id))

        # 2. Check batch status
        status_res = client.get(f"/api/v1/simulation/sap-batches/{batch_id}", headers=headers)
        assert status_res.status_code == 200
        batch_data = status_res.json()
        assert batch_data["status"] == "completed"
        assert batch_data["completed_items"] == 3
        assert "evidence.pdf" in batch_data["artifact"]["filename"]

        # 3. Download PDF
        pdf_res = client.get(f"/api/v1/simulation/sap-batches/{batch_id}/pdf", headers=headers)
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert len(pdf_res.content) > 1000

        # Verify downloaded PDF bytes
        reader = pypdf.PdfReader(io.BytesIO(pdf_res.content))
        assert len(reader.pages) == 4


def test_ac8_error_sanitization():
    """AC 8: Errors do not leak internal file paths, tracebacks, or secret tokens."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        # Force an unexpected internal error during ingest
        with patch.object(sap_shadow_service, "ingest_batch", side_effect=RuntimeError("Internal database crash /secret/path/token_12345")):
            payload = {
                "producer_namespace": "SAP_PPIC",
                "request_id": "REQ-ERROR-01",
                "printer_id": "PILOT-PRINTER-01",
                "items": make_canonical_fixture_items(),
            }
            res = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
            assert res.status_code == 500
            detail = res.json()["detail"]
            # Assert detail does not leak the internal exception message or path/token
            assert "token_12345" not in detail
            assert "/secret/path" not in detail
            assert "Traceback" not in detail


# =====================================================================
# Review Finding Verifications: P1-1, P1-2, P1-3, P2-1, P2-2
# =====================================================================

def test_p2_2_strict_copies_one_enforced():
    """P2-2: Enforce copies == 1. Passing copies != 1 must be rejected by validation."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        # Case 1: copies = 2 (rejected)
        items_copies_2 = make_canonical_fixture_items()
        items_copies_2[0]["copies"] = 2
        payload2 = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-COPIES-02",
            "printer_id": "PILOT-PRINTER-01",
            "items": items_copies_2,
        }
        res2 = client.post("/api/v1/simulation/sap-batches", json=payload2, headers=headers)
        assert res2.status_code == 422
        assert "copies" in str(res2.json()).lower()

        # Case 2: copies = 0 (rejected)
        items_copies_0 = make_canonical_fixture_items()
        items_copies_0[0]["copies"] = 0
        payload0 = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-COPIES-00",
            "printer_id": "PILOT-PRINTER-01",
            "items": items_copies_0,
        }
        res0 = client.post("/api/v1/simulation/sap-batches", json=payload0, headers=headers)
        assert res0.status_code == 422


def test_p2_1_strict_canonical_contract_and_source_metadata():
    """P2-1: Strict canonical contract rejects extra fields in items and source_metadata."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        # Case 1: Extra field in canonical_item_data
        items_extra_field = make_canonical_fixture_items()
        items_extra_field[0]["canonical_item_data"]["unauthorized_field"] = "malicious_val"
        payload1 = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-STRICT-01",
            "printer_id": "PILOT-PRINTER-01",
            "items": items_extra_field,
        }
        res1 = client.post("/api/v1/simulation/sap-batches", json=payload1, headers=headers)
        assert res1.status_code == 422
        assert "extra_forbidden" in str(res1.json()).lower() or "unauthorized_field" in str(res1.json()).lower()

        # Case 2: Extra field in source_metadata
        payload2 = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-STRICT-02",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
            "source_metadata": {
                "werks": "1100",
                "forbidden_admin_flag": True,  # FORBIDDEN
            },
        }
        res2 = client.post("/api/v1/simulation/sap-batches", json=payload2, headers=headers)
        assert res2.status_code == 422


def test_p1_1_pipeline_fidelity_real_rendering_executed(tmp_path: Path):
    """P1-1: Proves the real rendering pipeline (inject_data, inject_barcodes_and_qr, svg_to_png) is invoked.

    Evidence PDF must contain rendered raster image bytes, not mock vector fallback.
    """
    async def _run():
        from engine.rasterizer import svg_to_png as real_svg_to_png

        storage = DurableFilesystemArtifactStorage(tmp_path)
        service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-RENDER-FIDELITY",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        with patch("app.services.sap_shadow_service.svg_to_png", wraps=real_svg_to_png) as spy_svg_to_png:
            result = await service.ingest_batch(req, auto_process=False)
            batch_id = result["batch_id"]

            await service.process_batch(batch_id)

            # Assert svg_to_png was called for all 3 items
            assert spy_svg_to_png.call_count == 3

            # Verify batch status and artifact
            batch = service.get_batch(batch_id)
            assert batch["status"] == "completed"
            assert batch["completed_items"] == 3

            # Verify PDF bytes contains actual raster image stream
            pdf_bytes = service.get_evidence_pdf(batch_id)
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            assert len(reader.pages) == 4

            # Verify pages 2, 3, 4 contain image XObjects (rasterized labels)
            for p_idx in range(1, 4):
                page = reader.pages[p_idx]
                x_objects = page.get("/Resources", {}).get("/XObject", {})
                has_image = any(obj.get("/Subtype") == "/Image" for obj in x_objects.values()) if hasattr(x_objects, "values") else False
                assert has_image or len(page.images) > 0, f"Page {p_idx} must contain rasterized label image"

    asyncio.run(_run())


def test_p1_3_durable_filesystem_persistence_across_service_reboot(tmp_path: Path):
    """P1-3: Proves batches, idempotency index, and artifact references survive service reboots/restarts.

    A brand new service instance reading from the same directory must:
    1. Retrieve the existing batch from disk without in-memory state.
    2. Handle identical replay idempotently without re-generating artifacts or conflicting.
    """
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)

        # 1. Instance 1 ingests and processes
        service1 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)
        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-REBOOT-TEST-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        result1 = await service1.ingest_batch(req, auto_process=False)
        batch_id1 = result1["batch_id"]
        assert result1["idempotent_replay"] is False

        await service1.process_batch(batch_id1)
        pdf_bytes_1 = service1.get_evidence_pdf(batch_id1)

        # 2. Simulate Server Reboot: create brand new service instance reading same directory
        service2 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)
        # Memory caches are clean in service2
        assert batch_id1 not in service2._batches

        # 3. Retrieve batch from disk
        loaded_batch = service2.get_batch(batch_id1)
        assert loaded_batch is not None
        assert loaded_batch["batch_id"] == batch_id1
        assert loaded_batch["status"] == "completed"
        assert loaded_batch["artifact"]["filename"] == "evidence.pdf"

        # 4. Verify evidence PDF can still be read
        pdf_bytes_2 = service2.get_evidence_pdf(batch_id1)
        assert hashlib.sha256(pdf_bytes_2).hexdigest() == hashlib.sha256(pdf_bytes_1).hexdigest()

        # 5. Idempotent replay on service2: must detect persisted idempotency key and return existing batch
        replay_result = await service2.ingest_batch(req, auto_process=False)
        assert replay_result["batch_id"] == batch_id1
        assert replay_result["idempotent_replay"] is True

        # 6. List batches must include persisted batch
        batch_list = service2.list_batches()
        assert any(b["batch_id"] == batch_id1 for b in batch_list)

    asyncio.run(_run())


def test_p1_2_list_simulation_batches_monitoring():
    """P1-2: GET /api/v1/simulation/sap-batches lists recent batches for authorized monitoring."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)

        # Submit a batch via M2M SAP endpoint with token
        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-LIST-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }
        res_submit = client.post(
            "/api/v1/simulation/sap-batches",
            json=payload,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_submit.status_code == 202
        batch_id = res_submit.json()["batch_id"]

        # P1-A: Authorized monitoring fetches batch list with token
        res_list = client.get(
            "/api/v1/simulation/sap-batches",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_list.status_code == 200
        batch_list = res_list.json()
        assert isinstance(batch_list, list)
        assert any(b["batch_id"] == batch_id for b in batch_list)


# =====================================================================
# Review Pass 3 Verifications: P1-A & P1-B
# =====================================================================

def test_p1_a_anonymous_get_endpoints_rejected_with_401():
    """P1-A: All operational GET endpoints reject anonymous requests with HTTP 401.

    Zero SAP operational data or evidence PDFs can be extracted without valid authentication.
    Public probe /simulation/status remains accessible and indicates monitoring requires IdP.
    """
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)

        # 1. Public probe /status is accessible anonymously
        res_status = client.get("/api/v1/simulation/status")
        assert res_status.status_code == 200
        status_data = res_status.json()
        assert status_data["enabled"] is True
        assert status_data["monitoring_requires_identity_provider"] is True

        # 2. GET /simulation/sap-batches without header -> 401
        res_batches = client.get("/api/v1/simulation/sap-batches")
        assert res_batches.status_code == 401
        assert "unauthorized" in res_batches.json()["detail"].lower() or "token" in res_batches.json()["detail"].lower()

        # 3. GET /simulation/sap-batches/{batch_id} without header -> 401
        res_batch_id = client.get("/api/v1/simulation/sap-batches/some-batch-uuid")
        assert res_batch_id.status_code == 401

        # 4. GET /simulation/sap-batches/{batch_id}/pdf without header -> 401
        res_pdf = client.get("/api/v1/simulation/sap-batches/some-batch-uuid/pdf")
        assert res_pdf.status_code == 401

        # 5. Invalid token header -> 401
        res_invalid = client.get(
            "/api/v1/simulation/sap-batches",
            headers={"X-SAP-Simulation-Token": "invalid-token-xyz"},
        )
        assert res_invalid.status_code == 401


def test_p1_b_startup_recovery_resumes_interrupted_batches(tmp_path: Path):
    """P1-B: Startup recovery scans disk for accepted/processing batches and completes virtual simulation.

    Ensures no batch is permanently stuck if server crashed or was restarted during execution.
    """
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)
        service1 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)

        # Ingest a batch without auto-processing to leave it in 'accepted' status on disk
        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-RECOVERY-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )
        result = await service1.ingest_batch(req, auto_process=False)
        batch_id = result["batch_id"]
        assert result["status"] == "accepted"

        # Verify batch record is on disk in 'accepted' state
        disk_record = service1._load_batch_from_disk(batch_id)
        assert disk_record is not None
        assert disk_record["status"] == "accepted"

        # Simulate fresh service instance upon server startup
        service2 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)
        assert batch_id not in service2._batches

        # Run startup recovery
        recovered_count = service2.recover_on_startup()
        assert recovered_count == 1
        assert batch_id in service2._batches

        # Wait for resumed background processing tasks to finish
        if service2._background_tasks:
            await asyncio.gather(*service2._background_tasks)

        # Verify batch completed and artifact generated
        recovered_batch = service2.get_batch(batch_id)
        assert recovered_batch["status"] == "completed"
        assert recovered_batch["artifact"] is not None

        # Verify evidence PDF can be extracted
        pdf_bytes = service2.get_evidence_pdf(batch_id)
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        assert len(reader.pages) == 4

    asyncio.run(_run())


def test_p1_b_retry_interrupted_batch_resumes_execution(tmp_path: Path):
    """P1-B: Idempotent replay of an interrupted (accepted/processing) batch triggers resume and completes."""
    async def _run():
        storage = DurableFilesystemArtifactStorage(tmp_path)
        service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path)

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-RETRY-RESUME-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        # Initial ingest with auto_process=False -> batch saved as 'accepted'
        res1 = await service.ingest_batch(req, auto_process=False)
        batch_id = res1["batch_id"]
        assert res1["idempotent_replay"] is False
        assert service.get_batch(batch_id)["status"] == "accepted"

        # Retry identical request with auto_process=True
        res2 = await service.ingest_batch(req, auto_process=True)
        assert res2["batch_id"] == batch_id
        assert res2["idempotent_replay"] is True

        # Wait for background task
        if service._background_tasks:
            await asyncio.gather(*service._background_tasks)

        # Batch must be completed, not stuck in accepted
        completed_batch = service.get_batch(batch_id)
        assert completed_batch["status"] == "completed"
        assert completed_batch["artifact"] is not None

    asyncio.run(_run())


def test_p1_b_simulated_disk_write_failure_fails_closed():
    """P1-B: Disk write failure rolls back in-memory state and returns HTTP 500 (no false 202 Accepted)."""
    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}

        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-DISK-FAIL-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # Mock _save_batch_to_disk to simulate disk full or permission error
        from app.services.sap_shadow_service import SimulationPersistenceError

        with patch.object(
            sap_shadow_service,
            "_save_batch_to_disk",
            side_effect=SimulationPersistenceError("Simulated disk write failure: No space left on device"),
        ):
            res = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
            # Must return 500, NOT 202
            assert res.status_code == 500
            assert "gagal menyimpan batch" in res.json()["detail"].lower()

            # Verify memory state was rolled back cleanly (no phantom batch)
            key = "SAP_PPIC:REQ-DISK-FAIL-001"
            assert key not in sap_shadow_service._idempotency_map
            assert len(sap_shadow_service._batches) == 0


def test_p1_atomicity_idempotency_failure_cleans_orphan_and_retry_succeeds(tmp_path: Path):
    """P1: Verifies atomicity between batch record and idempotency index.

    Scenario:
    1. _save_batch_to_disk() succeeds.
    2. _save_idempotency_to_disk() fails.
    3. API returns HTTP 500 (fails closed, no false 202).
    4. Memory state is rolled back and disk orphan is cleaned up or poisoned.
    5. recover_on_startup() does NOT recover any orphan batch.
    6. Retrying the exact same request succeeds (HTTP 202) creating exactly 1 valid batch.
    7. Batch completes and produces exactly 1 PDF evidence.
    """
    from app.services.sap_shadow_service import SimulationPersistenceError, SapShadowService
    from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage

    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
    service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")

    with (
        patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True),
        patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN),
        patch("app.api.routes_sap_shadow.sap_shadow_service", service),
    ):
        client = TestClient(app)
        headers = {"X-SAP-Simulation-Token": TEST_AUTH_TOKEN}
        payload = {
            "producer_namespace": "SAP_PPIC",
            "request_id": "REQ-ATOMIC-001",
            "printer_id": "PILOT-PRINTER-01",
            "items": make_canonical_fixture_items(),
        }

        # Step 1 & 2: First attempt - _save_batch_to_disk succeeds, but _save_idempotency_to_disk raises error
        original_save_batch = service._save_batch_to_disk
        recorded_batches = []

        def spy_save_batch(batch_record):
            recorded_batches.append(batch_record["batch_id"])
            return original_save_batch(batch_record)

        with (
            patch.object(service, "_save_batch_to_disk", side_effect=spy_save_batch),
            patch.object(
                service,
                "_save_idempotency_to_disk",
                side_effect=SimulationPersistenceError("Disk error writing idempotency key"),
            ),
        ):
            res1 = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
            # Step 3: API returns 500
            assert res1.status_code == 500

        # Step 4: Memory state rolled back
        assert len(service._batches) == 0
        assert len(service._idempotency_map) == 0
        assert len(recorded_batches) == 1
        failed_batch_id = recorded_batches[0]

        # Verify disk orphan file was either unlinked or marked persistence_aborted
        orphan_file = service._batch_store_dir / f"{failed_batch_id}.json"
        if orphan_file.exists():
            disk_rec = service._load_batch_from_disk(failed_batch_id)
            assert disk_rec["status"] == "persistence_aborted"

        # Step 5: Startup recovery does NOT recover the orphan batch
        service_reboot = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")
        recovered = service_reboot.recover_on_startup()
        assert recovered == 0
        assert failed_batch_id not in service_reboot._batches

        # Step 6: Retry identical request now succeeds
        with patch("app.api.routes_sap_shadow.sap_shadow_service", service_reboot):
            res2 = client.post("/api/v1/simulation/sap-batches", json=payload, headers=headers)
            assert res2.status_code == 202
            retry_data = res2.json()
            new_batch_id = retry_data["batch_id"]
            assert new_batch_id != failed_batch_id

            # Wait for background task to complete
            if service_reboot._background_tasks:
                asyncio.run(asyncio.gather(*service_reboot._background_tasks))

            # Step 7: Completed and exactly one PDF evidence generated
            batch_record = service_reboot.get_batch(new_batch_id)
            assert batch_record["status"] == "completed"
            assert batch_record["artifact"] is not None

            # Verify only 1 PDF artifact exists on disk
            pdf_files = list((tmp_path / "artifacts").glob("*.payload"))
            assert len(pdf_files) == 1

            # And verify PDF bytes are readable and valid
            pdf_bytes = service_reboot.get_evidence_pdf(new_batch_id)
            assert len(pdf_bytes) > 500


def test_p1_startup_recovery_failure_logs_and_fails_closed(caplog):
    """P1: Verifies startup recovery does NOT hide errors with 'pass'.

    If storage recovery raises an exception (e.g. unreadable disk partition),
    lifespan logs a critical error and raises RuntimeError to fail closed.
    """
    import logging
    from app.main import lifespan
    from app.services.sap_shadow_service import SimulationPersistenceError

    async def _test():
        with caplog.at_level(logging.CRITICAL, logger="main"):
            with pytest.raises(RuntimeError, match="SAP shadow simulation startup recovery failed"):
                async with lifespan(app):
                    pass

    with (
        patch("app.main.is_sap_shadow_simulation_enabled", return_value=True),
        patch(
            "app.services.sap_shadow_service.sap_shadow_service.recover_on_startup",
            side_effect=SimulationPersistenceError("Unreadable disk partition / EIO"),
        ),
    ):
        asyncio.run(_test())

    # Assert critical error was logged
    assert any("startup recovery failed" in record.message.lower() for record in caplog.records)


# =====================================================================
# Additional Regression Tests: Missing Template & Idempotency Hash Mismatch
# =====================================================================

def test_regression_template_not_found_fails_closed_without_fallback(tmp_path: Path):
    """Regression Test: Template not found must fail closed without mockup fallback.

    Invariant:
    - If a template is not found on the filesystem during simulation processing,
      the system must NOT silently fall back to mockup vectors or generate a fallback PDF.
    - The batch status must transition to 'failed' (NOT 'completed').
    - No PDF artifact must be created or stored in durable storage.
    - get_evidence_pdf() must raise ValueError indicating the PDF is not ready.
    """
    async def _run():
        from app.services.sap_shadow_service import SapShadowService
        from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage

        storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
        service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-MISSING-TMPL-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        # Ingest batch with auto_process=False
        result = await service.ingest_batch(req, auto_process=False)
        batch_id = result["batch_id"]
        assert result["status"] == "accepted"

        # Simulate template missing during rendering (e.g. template file deleted or get_template_path returns None)
        with patch("app.services.sap_shadow_service.TemplateService.get_template_path", return_value=None):
            await service.process_batch(batch_id)

        # Verify batch status is 'failed', NOT 'completed'
        batch = service.get_batch(batch_id)
        assert batch is not None
        assert batch["status"] == "failed"
        assert batch["status"] != "completed"
        assert batch.get("error") is not None
        assert batch["artifact"] is None

        # Verify no PDF artifact exists in durable storage
        stored_payloads = list((tmp_path / "artifacts").glob("*.payload"))
        assert len(stored_payloads) == 0

        # Attempting to fetch evidence PDF must raise ValueError
        with pytest.raises(ValueError, match="Evidence PDF is not ready"):
            service.get_evidence_pdf(batch_id)

    asyncio.run(_run())


def test_regression_contract_hash_mismatch_rejected_by_startup_recovery(tmp_path: Path):
    """Regression Test: Mismatched contract_hash in idempotency index rejected by recovery.

    Invariant:
    - If an accepted/processing batch record is found on disk, but its idempotency index
      has a different contract_hash (desynchronization / contract mismatch / corruption),
      startup recovery must strictly reject that batch.
    - The batch must NOT be resumed or added to in-memory processing.
    - recover_on_startup() must return 0 recovered batches.
    - The orphan/mismatched record is cleaned up from disk.
    """
    async def _run():
        from app.services.sap_shadow_service import SapShadowService
        from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage

        storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
        service1 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")

        req = SapShadowBatchRequest(
            producer_namespace="SAP_PPIC",
            request_id="REQ-HASH-MISMATCH-001",
            printer_id="PILOT-PRINTER-01",
            items=[SapShadowItemInput(**it) for it in make_canonical_fixture_items()],
        )

        # 1. Ingest batch without auto_process -> batch record is saved on disk as 'accepted'
        result = await service1.ingest_batch(req, auto_process=False)
        batch_id = result["batch_id"]
        assert result["status"] == "accepted"

        # Verify batch is saved on disk
        batch_on_disk = service1._load_batch_from_disk(batch_id)
        assert batch_on_disk is not None
        assert batch_on_disk["status"] == "accepted"

        # 2. Tamper the idempotency index file on disk: keep matching batch_id but change contract_hash!
        idempotency_key = "SAP_PPIC:REQ-HASH-MISMATCH-001"
        safe_key_name = service1._sanitize_filename_key(idempotency_key)
        idem_path = service1._idempotency_store_dir / f"{safe_key_name}.json"
        assert idem_path.is_file()

        tampered_idem_data = {
            "idempotency_key": idempotency_key,
            "batch_id": batch_id,  # MATCHES
            "contract_hash": "tampered-different-contract-hash-12345",  # MISMATCHED!
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        idem_path.write_text(json.dumps(tampered_idem_data), encoding="utf-8")

        # 3. Fresh service instance simulates server reboot
        service2 = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")
        assert batch_id not in service2._batches

        # 4. Run startup recovery -> must reject the mismatched batch
        recovered_count = service2.recover_on_startup()
        assert recovered_count == 0
        assert batch_id not in service2._batches

        # Batch record on disk should have been unlinked / rejected
        assert not (service2._batch_store_dir / f"{batch_id}.json").exists()

    asyncio.run(_run())
