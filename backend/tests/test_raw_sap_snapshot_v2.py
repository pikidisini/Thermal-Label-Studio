"""Comprehensive Automated Test Suite for B2B2K: Extensible Raw SAP Snapshot v2 & N001 Rule Boundary.

Verifies all Acceptance Criteria (AC 1 through AC 8) and Codex Level 3 P1 Review Requirements:
- AC 1: Complete extensible intake, unknown fields preservation, durable round-trip, and absent/null/empty conflict detection.
- AC 2: Recursive security hygiene (forbidden keys, executable scripts, non-finite numbers, nested lists, size/depth limits, duplicate characteristics).
- AC 3: Distinct semantics for absent, null, and empty-text business facts without batch failure.
- AC 4: Route isolation (N001 only, unsupported codes fail closed, canonical B2B2I unaffected).
- AC 5: Zero fake business fallbacks in adapter, strict fail-closed on missing required facts, zero barcode/QR fabrication, production activation gate.
- AC 6: Safe Demo multi-page PDF evidence with watermark, sequence ordering (ASC), and zero physical routes.
- AC 7: Security boundary (disabled=404, unconfigured=403, invalid=401, collision-resistant SHA-256 idempotency, replay vs conflict).
- AC 8: Data minimization (sanitized summaries on status/list endpoints; raw snapshot confined to dedicated endpoint).
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import io
import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pypdf
import pytest

from app.config import (
    get_sap_simulation_auth_token,
    is_sap_shadow_simulation_enabled,
)
from app.main import app
from app.models.raw_sap_snapshot_v2 import (
    RawBusinessContext,
    RawCharacteristicItem,
    RawSapBatchSnapshotV2,
    RawSapItemSnapshotV2,
    SapSourceMetadata,
)
from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage
from app.services.n001_rule_adapter import N001DevelopmentAdapter
from app.services.pdf_evidence_service import WATERMARK_TEXT
from app.services.sap_shadow_service import (
    SapShadowService,
    sap_shadow_service,
)

TEST_AUTH_TOKEN = "test-sap-simulation-token-secret-xyz"

FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "tasks"
    / "B2B2K"
    / "fixtures"
    / "raw_sap_snapshot_v2_n001_synthetic.json"
)


def load_synthetic_raw_fixture() -> dict:
    """Loads the synthetic B2B2K raw snapshot fixture."""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(autouse=True)
def isolated_service(tmp_path: Path):
    """Provides an isolated SapShadowService instance per test backed by tmp_path.

    Guarantees zero shared state and prevents pollution of default storage.
    """
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
    service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")
    assert str(tmp_path) in str(service._batch_store_dir)
    assert str(tmp_path) in str(service._idempotency_store_dir)
    assert "backend/data/out" not in str(service._batch_store_dir).replace("\\", "/")
    assert "backend/data/out" not in str(service._idempotency_store_dir).replace("\\", "/")
    assert "backend/data/out" not in str(service.artifact_storage.root).replace("\\", "/")
    with patch("app.api.routes_sap_shadow.sap_shadow_service", service), \
         patch("app.services.sap_shadow_service.sap_shadow_service", service):
        yield service


# =====================================================================
# AC 1: Extensible Intake, Preservation & Non-Lossy Serialization
# =====================================================================

def test_ac1_complete_extensible_intake_preserves_unknown_characteristics(isolated_service: SapShadowService):
    """AC 1: Unknown valid characteristics survive ingestion and are preserved in stored record."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()

        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 202
        data = res.json()
        batch_id = data["batch_id"]
        assert data["label_code"] == "N001"
        assert data["profile_version"] == "0.1.0-dev"

        # Verify preserved raw snapshot via dedicated endpoint
        res_raw = client.get(
            f"/api/v1/simulation/sap-batches/{batch_id}/raw-snapshot",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_raw.status_code == 200
        stored_raw = res_raw.json()["raw_snapshot"]

        # Item 1 should have unknown characteristics preserved
        item1_chars = stored_raw["items"][0]["characteristics"]
        char_names = [c["name"] for c in item1_chars]
        assert "ZZFUTURE_TENSILE_STRENGTH" in char_names
        assert "ZZEXTRA_UNREAD_CHARACTERISTIC" in char_names

        # Item 2 should have ZZUNKNOWN_OPTICAL_DENSITY preserved
        item2_chars = stored_raw["items"][1]["characteristics"]
        char_names2 = [c["name"] for c in item2_chars]
        assert "ZZUNKNOWN_OPTICAL_DENSITY" in char_names2


def test_ac1_durable_round_trip_preserves_absent_null_and_empty(isolated_service: SapShadowService):
    """AC 1 & P1: Proves non-lossy serialization on disk: absent fields remain absent, null remains null, empty remains empty."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()

        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 202
        batch_id = res.json()["batch_id"]

        # Load batch record directly from disk to inspect persisted JSON
        disk_record = isolated_service._load_batch_from_disk(batch_id)
        assert disk_record is not None
        raw_snapshot = disk_record["raw_snapshot"]
        items = raw_snapshot["items"]

        # Item 1: customer_text has value
        assert items[0]["business_context"]["customer_text"] == "Deliver to Synthetic Warehouse Dock A"
        # Item 2: customer_text was explicit null -> must be null in JSON (not absent)
        assert "customer_text" in items[1]["business_context"]
        assert items[1]["business_context"]["customer_text"] is None
        # Item 3: customer_text was empty string -> must be "" in JSON (not absent, not null)
        assert items[2]["business_context"]["customer_text"] == ""

        # Check absent field: sales_order in Item 3 was absent in fixture -> must NOT exist in persisted business_context
        assert "sales_order" not in items[2]["business_context"]


def test_ac1_absent_vs_null_replay_triggers_409_conflict(isolated_service: SapShadowService):
    """P1: Replay with absent field vs null field under same request_id yields different contract hashes and returns 409 Conflict."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()
        fixture["request_id"] = "REQ-IDEM-ABSENT-VS-NULL"

        # Payload A: sales_order is absent in Item 3
        fixture_a = copy.deepcopy(fixture)
        fixture_a["items"][2]["business_context"].pop("sales_order", None)

        # 1. First submission (Payload A) -> 202 Accepted
        res_a = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture_a,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_a.status_code == 202
        batch_id_a = res_a.json()["batch_id"]

        # Payload B: sales_order is explicitly null in Item 3
        fixture_b = copy.deepcopy(fixture)
        fixture_b["items"][2]["business_context"]["sales_order"] = None

        # 2. Second submission with same request_id but sales_order=null (Payload B) -> 409 Conflict
        res_b = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture_b,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_b.status_code == 409
        assert "conflict" in res_b.json()["detail"].lower()


def test_ac1_absent_vs_empty_replay_triggers_409_conflict(isolated_service: SapShadowService):
    """P1: Replay with absent field vs empty string under same request_id yields different contract hashes and returns 409 Conflict."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()
        fixture["request_id"] = "REQ-IDEM-ABSENT-VS-EMPTY"

        # Payload A: customer_text is absent in Item 3
        fixture_a = copy.deepcopy(fixture)
        fixture_a["items"][2]["business_context"].pop("customer_text", None)

        res_a = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture_a,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_a.status_code == 202

        # Payload B: customer_text is "" in Item 3
        fixture_b = copy.deepcopy(fixture)
        fixture_b["items"][2]["business_context"]["customer_text"] = ""

        res_b = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture_b,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_b.status_code == 409
        assert "conflict" in res_b.json()["detail"].lower()


# =====================================================================
# AC 2: Recursive Security Hygiene & Invariant Validation
# =====================================================================

def test_ac2_rejects_duplicate_characteristic_names(isolated_service: SapShadowService):
    """AC 2: Duplicate characteristic names within an item are rejected deterministically."""
    fixture = load_synthetic_raw_fixture()
    dup_item = copy.deepcopy(fixture["items"][0])
    dup_item["characteristics"].append({
        "name": "ZZWIDTH",  # Duplicate of existing ZZWIDTH
        "value": 85.0,
        "value_type": "number",
        "unit": "MM",
        "source": "batch_classification",
    })
    fixture["items"][0] = dup_item

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422
        err_msg = str(res.json()).lower()
        assert "duplicate characteristic name" in err_msg or "duplicate characteristics" in err_msg


@pytest.mark.parametrize(
    "forbidden_key",
    [
        "password",
        "secret",
        "token",
        "api_key",
        "host",
        "port",
        "ip",
        "destination",
        "rfc",
        "sm59",
        "connection_string",
        "auth_header",
        "db_password",
        "service_secret",
        "remote_host",
        "internal_ip",
    ],
)
def test_ac2_rejects_forbidden_security_keys_recursively(isolated_service: SapShadowService, forbidden_key: str):
    """AC 2 & P1: Sensitive infrastructure/security keys anywhere in business_context are rejected fail-closed."""
    fixture = load_synthetic_raw_fixture()
    # Test nested dict inside business_context
    fixture["items"][0]["business_context"]["custom_envelope"] = {forbidden_key: "sensitive_val"}

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422
        assert "forbidden security/infrastructure key" in str(res.json()).lower()


@pytest.mark.parametrize(
    "exec_payload",
    [
        "<script>alert(1)</script>",
        "javascript:void(0)",
        "eval('malicious')",
        "__import__('os').system('ls')",
        "subprocess.Popen(['ls'])",
    ],
)
def test_ac2_rejects_executable_payload_patterns_recursively(isolated_service: SapShadowService, exec_payload: str):
    """AC 2 & P1: Executable script patterns in nested business_context strings are rejected fail-closed."""
    fixture = load_synthetic_raw_fixture()
    fixture["items"][0]["business_context"]["nested_info"] = {"remark": exec_payload}

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422
        assert "forbidden executable pattern" in str(res.json()).lower()


def test_ac2_rejects_nested_lists_in_business_context(isolated_service: SapShadowService):
    """P1: Arrays/lists inside business_context are rejected fail-closed to preserve strict flat/key-value mapping."""
    fixture = load_synthetic_raw_fixture()
    fixture["items"][0]["business_context"]["sub_records"] = ["record_1", "record_2"]

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422
        assert "lists/arrays are not permitted" in str(res.json()).lower()


def test_ac2_rejects_oversized_keys_values_and_depth(isolated_service: SapShadowService):
    """P1: Bounded limits (keys <= 64, strings <= 1024, depth <= 3) fail closed."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)

        # 1. Oversized key (>64 chars)
        f1 = load_synthetic_raw_fixture()
        f1["items"][0]["business_context"]["a" * 65] = "valid_val"
        res1 = client.post("/api/v1/simulation/raw-batches", json=f1, headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN})
        assert res1.status_code == 422

        # 2. Oversized string value (>1024 chars)
        f2 = load_synthetic_raw_fixture()
        f2["items"][0]["business_context"]["customer_text"] = "X" * 1025
        res2 = client.post("/api/v1/simulation/raw-batches", json=f2, headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN})
        assert res2.status_code == 422

        # 3. Excessive nesting depth (>3 levels)
        f3 = load_synthetic_raw_fixture()
        f3["items"][0]["business_context"]["lvl1"] = {"lvl2": {"lvl3": {"lvl4": "too_deep"}}}
        res3 = client.post("/api/v1/simulation/raw-batches", json=f3, headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN})
        assert res3.status_code == 422
        assert "nesting depth limit" in str(res3.json()).lower()


def test_ac2_rejects_unsafe_source_metadata(isolated_service: SapShadowService):
    """P1: Unsafe keys or executable values in source_metadata are rejected fail-closed."""
    fixture = load_synthetic_raw_fixture()
    fixture["source_metadata"]["db_password"] = "malicious"

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422


@pytest.mark.parametrize("invalid_copies", [0, 2, 5])
def test_ac2_rejects_copies_not_equal_to_one(isolated_service: SapShadowService, invalid_copies: int):
    """AC 2 & Safe Demo Invariant: copies != 1 is rejected with HTTP 422."""
    fixture = load_synthetic_raw_fixture()
    fixture["items"][0]["copies"] = invalid_copies

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 422


def test_ac2_rejects_invalid_sequence(isolated_service: SapShadowService):
    """AC 2: item_sequence < 1 or duplicate item_sequence within batch is rejected."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)

        # Sequence < 1
        f1 = load_synthetic_raw_fixture()
        f1["items"][0]["item_sequence"] = 0
        res1 = client.post("/api/v1/simulation/raw-batches", json=f1, headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN})
        assert res1.status_code == 422

        # Duplicate sequence
        f2 = load_synthetic_raw_fixture()
        f2["items"][1]["item_sequence"] = 1  # Duplicate of item 0
        res2 = client.post("/api/v1/simulation/raw-batches", json=f2, headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN})
        assert res2.status_code == 422
        assert "strictly unique" in str(res2.json()).lower()


# =====================================================================
# AC 3: Absent / Null / Empty Semantics in N001 Audit Meta
# =====================================================================

def test_ac3_handles_absent_null_and_empty_text_distinctly(isolated_service: SapShadowService):
    """AC 3: Business facts with absent, null, and empty text states are handled distinctly and do not fail the batch."""
    fixture = load_synthetic_raw_fixture()

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 202
        batch_id = res.json()["batch_id"]

        record = isolated_service.get_batch(batch_id)
        assert record is not None
        items = record["items"]
        assert len(items) == 3

        # Item 1: customer_text has value
        assert items[0]["n001_audit_meta"]["customer_text_presence"] == "value"
        # Item 2: customer_text is null
        assert items[1]["n001_audit_meta"]["customer_text_presence"] == "null"
        # Item 3: customer_text is empty
        assert items[2]["n001_audit_meta"]["customer_text_presence"] == "empty"


# =====================================================================
# AC 4: Route Isolation
# =====================================================================

def test_ac4_rejects_unsupported_label_code_fail_closed(isolated_service: SapShadowService):
    """AC 4: Only label_code == 'N001' routes to N001 adapter. Unsupported codes fail closed."""
    fixture = load_synthetic_raw_fixture()
    fixture["items"][0]["label_code"] = "STD01"  # Not N001

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 400
        assert "unsupported label_code 'std01'" in res.json()["detail"].lower()


def test_ac4_canonical_b2b2i_batches_remain_isolated_and_functional(isolated_service: SapShadowService):
    """AC 4: Canonical B2B2I endpoint POST /simulation/sap-batches continues to function normally."""
    canonical_payload = {
        "producer_namespace": "SAP_PPIC",
        "request_id": "REQ-CANONICAL-TEST-001",
        "printer_id": "PILOT-PRINTER-01",
        "items": [
            {
                "item_sequence": 1,
                "template_version_id": "label_roll_80x200",
                "copies": 1,
                "canonical_item_data": {
                    "material_code": "MAT-SYNTH-01",
                    "material_desc": "Synthetic Roll",
                    "batch_number": "BAT-2026-01",
                    "roll_number": "ROLL-01",
                    "gross_weight": "12.50 KG",
                    "net_weight": "12.10 KG",
                },
            }
        ],
    }

    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/sap-batches",
            json=canonical_payload,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 202
        assert res.json()["producer_namespace"] == "SAP_PPIC"


# =====================================================================
# AC 5: Zero Fake Fallbacks, Rule Ownership & Production Activation Gate
# =====================================================================

def test_ac5_production_activation_gate_fails_closed():
    """AC 5: N001 production activation raises RuntimeError when not business-approved."""
    assert N001DevelopmentAdapter.IS_PRODUCTION_APPROVED is False
    with pytest.raises(RuntimeError) as exc_info:
        N001DevelopmentAdapter.assert_production_allowed()
    assert "production activation is blocked" in str(exc_info.value).lower()


def test_ac5_deterministic_unit_derivations():
    """AC 5: Derived units (width_inch, length_feet, weight_lbs) are calculated deterministically."""
    fixture = load_synthetic_raw_fixture()
    raw_item = RawSapItemSnapshotV2(**fixture["items"][0])

    canonical_item, template_id, audit_meta = N001DevelopmentAdapter.adapt_item(raw_item)
    assert template_id == "label_roll_80x200"
    fields = canonical_item.fields

    # 80 mm -> 3.15 inch
    assert fields.width_inch == "3.15"
    # 2000 m -> 6562 feet
    assert fields.length_feet == "6562"
    # 12.1 kg -> 26.7 lbs
    assert fields.weight_lbs == "26.7"


@pytest.mark.parametrize(
    "missing_fact",
    [
        "material_number",
        "batch_number",
        "roll_number",
        "brand",
        "type_film",
        "base_film",
        "width_mm",
        "length_m",
        "net_weight_kg",
    ],
)
def test_ac5_n001_adapter_strictly_fails_closed_on_missing_required_facts(missing_fact: str):
    """P1: Proves zero fake fallback business facts: N001 adapter fails closed if any required fact is missing."""
    fixture = load_synthetic_raw_fixture()
    item_dict = copy.deepcopy(fixture["items"][0])

    # Strip the target required fact from item_dict
    if missing_fact in ("material_number", "batch_number", "roll_number"):
        item_dict["business_context"].pop(missing_fact, None)
    elif missing_fact == "brand":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZBRAND"]
    elif missing_fact == "type_film":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZTYPEFILM"]
    elif missing_fact == "base_film":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZBASEFILM"]
    elif missing_fact == "width_mm":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZWIDTH"]
    elif missing_fact == "length_m":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZLENGTH"]
    elif missing_fact == "net_weight_kg":
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZCONVERSIONROLLKG"]

    raw_item = RawSapItemSnapshotV2(**item_dict)
    with pytest.raises(ValueError) as exc_info:
        N001DevelopmentAdapter.adapt_item(raw_item)
    err_str = str(exc_info.value).lower()
    assert "missing required raw" in err_str and missing_fact in err_str


def test_ac5_n001_adapter_never_fabricates_barcodes_or_qr():
    """P1: Proves zero fabricated barcodes/QR: codes is strictly None until format is approved."""
    fixture = load_synthetic_raw_fixture()
    raw_item = RawSapItemSnapshotV2(**fixture["items"][0])
    canonical_item, template_id, audit_meta = N001DevelopmentAdapter.adapt_item(raw_item)

    assert canonical_item.codes is None
    assert audit_meta["barcode_qr_approved"] is False


# =====================================================================
# AC 6: Safe Demo Evidence PDF Generation & ASC Sequence
# =====================================================================

def test_ac6_safe_demo_pdf_evidence_generation_and_asc_sequence(isolated_service: SapShadowService):
    """AC 6: Ingests raw batch submitted in random sequence; verifies processing in strict ASC order and valid PDF output."""
    async def _run():
        fixture = load_synthetic_raw_fixture()
        # Randomize input sequence: 3, 1, 2
        fixture["items"] = [fixture["items"][2], fixture["items"][0], fixture["items"][1]]
        batch_req = RawSapBatchSnapshotV2(**fixture)

        result = await isolated_service.ingest_raw_batch(batch_req, auto_process=False)
        batch_id = result["batch_id"]

        # Ingested record must sort items in item_sequence ASC: 1, 2, 3
        record = isolated_service.get_batch(batch_id)
        assert [it["item_sequence"] for it in record["items"]] == [1, 2, 3]

        await isolated_service.process_batch(batch_id)
        return batch_id

    batch_id = asyncio.run(_run())

    record = isolated_service.get_batch(batch_id)
    assert record["status"] == "completed"
    assert record["artifact"] is not None

    pdf_bytes = isolated_service.get_evidence_pdf(batch_id)
    assert len(pdf_bytes) > 1000

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    # 1 cover page + 3 label pages = 4 pages
    assert len(reader.pages) == 4

    cover_text = reader.pages[0].extract_text()
    assert "SAP SHADOW PRINT SIMULATION EVIDENCE" in cover_text
    assert WATERMARK_TEXT in cover_text
    assert "REQ-SYNTH-20260922-RAW-001" in cover_text


# =====================================================================
# AC 7: Security Boundary & Collision-Resistant Idempotency
# =====================================================================

def test_ac7_fail_closed_when_disabled(isolated_service: SapShadowService):
    """AC 7: POST /raw-batches returns 404 when SAP_SHADOW_SIMULATION_ENABLED is false."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=False):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 404


def test_ac7_auth_token_enforcement(isolated_service: SapShadowService):
    """AC 7: Missing or incorrect token returns 401; unconfigured token on server returns 403."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()

        # Case 1: Server has NO token configured -> 403 Forbidden
        with patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=""):
            res_unconfigured = client.post("/api/v1/simulation/raw-batches", json=fixture)
            assert res_unconfigured.status_code == 403

        # Case 2: Server configured, missing header -> 401 Unauthorized
        with patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
            res_missing = client.post("/api/v1/simulation/raw-batches", json=fixture)
            assert res_missing.status_code == 401

            # Case 3: Wrong token -> 401 Unauthorized
            res_wrong = client.post(
                "/api/v1/simulation/raw-batches",
                json=fixture,
                headers={"X-SAP-Simulation-Token": "invalid-token"},
            )
            assert res_wrong.status_code == 401


def test_ac7_idempotent_replay_and_conflict_detection(isolated_service: SapShadowService):
    """AC 7: Identical raw submission returns 200 OK replay; mutated submission returns 409 Conflict."""
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()

        # 1. Initial submission -> 202 Accepted
        res1 = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res1.status_code == 202
        batch_id_1 = res1.json()["batch_id"]
        assert res1.json()["idempotent_replay"] is False

        # 2. Replay with exact same payload -> 200 OK, same batch_id, idempotent_replay=True
        res2 = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res2.status_code == 200
        assert res2.json()["batch_id"] == batch_id_1
        assert res2.json()["idempotent_replay"] is True

        # 3. Mutated payload with same (namespace, request_id) -> 409 Conflict
        mutated_fixture = copy.deepcopy(fixture)
        mutated_fixture["items"][0]["characteristics"][0]["value"] = "MUTATED_BRAND"
        res3 = client.post(
            "/api/v1/simulation/raw-batches",
            json=mutated_fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res3.status_code == 409
        assert "conflict" in res3.json()["detail"].lower()


def test_ac7_identity_collision_resistance_sha256(isolated_service: SapShadowService):
    """P1: Proves collision-resistant durable idempotency filename uses SHA-256 hash."""
    idempotency_key = "SAP_PPIC:REQ-COLLISION-TEST-001"
    expected_filename = hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest() + ".json"

    assert isolated_service._get_idempotency_filename(idempotency_key) == expected_filename

    # Save to disk and check file actually exists on filesystem with that name
    isolated_service._save_idempotency_to_disk(idempotency_key, "test-batch-id", "test-hash")
    file_path = isolated_service._idempotency_store_dir / expected_filename
    assert file_path.is_file()

    # Load from disk
    loaded = isolated_service._load_idempotency_from_disk(idempotency_key)
    assert loaded is not None
    assert loaded["idempotency_key"] == idempotency_key


# =====================================================================
# AC 8: Data Minimization on Status and List Endpoints
# =====================================================================

def test_ac8_data_minimization_on_status_and_list_endpoints(isolated_service: SapShadowService):
    """AC 8 & P1: Proves data minimization: status and list endpoints return sanitized summaries.

    Zero raw_snapshot or unneeded item characteristics are leaked on GET /sap-batches
    or GET /sap-batches/{batch_id}. Raw snapshot is strictly confined to GET /raw-snapshot.
    """
    with patch("app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN):
        client = TestClient(app)
        fixture = load_synthetic_raw_fixture()

        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 202
        batch_id = res.json()["batch_id"]

        # 1. GET /simulation/sap-batches/{batch_id} (Summary endpoint)
        res_status = client.get(
            f"/api/v1/simulation/sap-batches/{batch_id}",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_status.status_code == 200
        status_data = res_status.json()

        # Must NOT leak raw_snapshot
        assert "raw_snapshot" not in status_data
        assert "source_metadata" not in status_data

        # Items in summary must only contain minimal sequence/status info
        for it in status_data["items"]:
            assert "canonical_item_data" not in it
            assert "raw_characteristics" not in it
            assert "raw_business_context" not in it
            assert "n001_audit_meta" not in it
            assert "item_sequence" in it
            assert "status" in it

        # 2. GET /simulation/sap-batches (List endpoint)
        res_list = client.get(
            "/api/v1/simulation/sap-batches",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_list.status_code == 200
        list_data = res_list.json()
        target_batch = next(b for b in list_data if b["batch_id"] == batch_id)
        assert "raw_snapshot" not in target_batch
        assert "source_metadata" not in target_batch

        # 3. GET /simulation/sap-batches/{batch_id}/raw-snapshot (Dedicated endpoint)
        res_raw = client.get(
            f"/api/v1/simulation/sap-batches/{batch_id}/raw-snapshot",
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_raw.status_code == 200
        raw_data = res_raw.json()
        assert "raw_snapshot" in raw_data
        assert raw_data["raw_snapshot"]["contract_schema_version"] == "2.0-raw"


# =====================================================================
# P1-A Regressions: Zero Business Fact Substitutions in N001 Adapter
# =====================================================================

@pytest.mark.parametrize("scenario", ["absent", "null", "empty", "provided"])
def test_p1_a_material_description_never_substitutes_with_type_film(scenario: str):
    """P1-A: material_desc must strictly come from raw material_description and never substitute with type_film."""
    fixture = load_synthetic_raw_fixture()
    item_dict = copy.deepcopy(fixture["items"][0])

    # Ensure type_film is present
    type_film_char = next(c for c in item_dict["characteristics"] if c["name"] == "ZZTYPEFILM")
    assert type_film_char["value"] == "ALUMINIUM FOIL"

    if scenario == "absent":
        item_dict["business_context"].pop("material_description", None)
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.material_desc is None
        assert canonical_item.fields.material_desc != type_film_char["value"]
    elif scenario == "null":
        item_dict["business_context"]["material_description"] = None
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.material_desc is None
        assert canonical_item.fields.material_desc != type_film_char["value"]
    elif scenario == "empty":
        item_dict["business_context"]["material_description"] = ""
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.material_desc == ""
        assert canonical_item.fields.material_desc != type_film_char["value"]
    elif scenario == "provided":
        item_dict["business_context"]["material_description"] = "Explicit Material Description"
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.material_desc == "Explicit Material Description"


@pytest.mark.parametrize("scenario", ["absent", "null", "empty", "provided"])
def test_p1_a_sales_order_item_never_substitutes_with_sales_order(scenario: str):
    """P1-A: so_item must strictly come from raw sales_order_item and never substitute with sales_order."""
    fixture = load_synthetic_raw_fixture()
    item_dict = copy.deepcopy(fixture["items"][0])

    # Ensure sales_order is present
    item_dict["business_context"]["sales_order"] = "10000001"

    if scenario == "absent":
        item_dict["business_context"].pop("sales_order_item", None)
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.so_item is None
        assert canonical_item.fields.so_item != "10000001"
    elif scenario == "null":
        item_dict["business_context"]["sales_order_item"] = None
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.so_item is None
        assert canonical_item.fields.so_item != "10000001"
    elif scenario == "empty":
        item_dict["business_context"]["sales_order_item"] = ""
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.so_item == ""
        assert canonical_item.fields.so_item != "10000001"
    elif scenario == "provided":
        item_dict["business_context"]["sales_order_item"] = "20"
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.so_item == "20"


@pytest.mark.parametrize("scenario", ["absent", "null", "empty", "provided"])
def test_p1_a_gross_weight_kg_never_substitutes_with_net_weight_kg(scenario: str):
    """P1-A: gross_weight_kg must strictly come from explicit raw gross_weight_kg and never substitute with net_weight_kg."""
    fixture = load_synthetic_raw_fixture()
    item_dict = copy.deepcopy(fixture["items"][0])

    # Ensure net_weight is present (12.1 KG)
    net_char = next(c for c in item_dict["characteristics"] if c["name"] == "ZZCONVERSIONROLLKG")
    assert net_char["value"] == 12.1

    if scenario == "absent":
        item_dict["business_context"].pop("gross_weight_kg", None)
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZGROSSWEIGHT"]
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.gross_weight_kg is None
        assert canonical_item.fields.gross_weight_kg != "12.1"
    elif scenario == "null":
        item_dict["business_context"]["gross_weight_kg"] = None
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZGROSSWEIGHT"]
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.gross_weight_kg is None
        assert canonical_item.fields.gross_weight_kg != "12.1"
    elif scenario == "empty":
        item_dict["business_context"]["gross_weight_kg"] = ""
        item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZGROSSWEIGHT"]
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.gross_weight_kg == ""
        assert canonical_item.fields.gross_weight_kg != "12.1"
    elif scenario == "provided":
        item_dict["business_context"]["gross_weight_kg"] = "15.7 KG"
        raw_item = RawSapItemSnapshotV2(**item_dict)
        canonical_item, _, _ = N001DevelopmentAdapter.adapt_item(raw_item)
        assert canonical_item.fields.gross_weight_kg == "15.7"


def test_p1_a_audit_meta_honestly_reports_raw_sources_and_derivations():
    """P1-A: audit metadata must explicitly document raw sources mapped vs application-derived calculations."""
    fixture = load_synthetic_raw_fixture()
    raw_item = RawSapItemSnapshotV2(**fixture["items"][0])
    _, _, audit_meta = N001DevelopmentAdapter.adapt_item(raw_item)

    assert "raw_sources_mapped" in audit_meta
    assert "material_desc" in audit_meta["raw_sources_mapped"]
    assert "so_item" in audit_meta["raw_sources_mapped"]
    assert "gross_weight_kg" in audit_meta["raw_sources_mapped"]

    assert "application_derived_fields" in audit_meta
    assert "width_inch" in audit_meta["application_derived_fields"]
    assert "length_feet" in audit_meta["application_derived_fields"]
    assert "weight_lbs" in audit_meta["application_derived_fields"]


def test_p1_b_regression_isolated_service_uses_tmp_path_and_never_default_storage(
    isolated_service: SapShadowService, tmp_path: Path
):
    """P1-B Regression: Proves isolated_service uses tmp_path and never default backend/data/out."""
    assert str(tmp_path) in str(isolated_service._batch_store_dir)
    assert str(tmp_path) in str(isolated_service._idempotency_store_dir)
    assert "backend/data/out" not in str(isolated_service._batch_store_dir).replace("\\", "/")
    assert "backend/data/out" not in str(isolated_service._idempotency_store_dir).replace("\\", "/")
    assert "backend/data/out" not in str(isolated_service.artifact_storage.root).replace("\\", "/")
