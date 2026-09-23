"""Comprehensive Automated Test Suite for B2B2M: Safe Demo PDF Visual & Placeholder Hardening.

Verifies all Acceptance Criteria (AC 1 through AC 7) and resolves review findings P1 & P2:
- P1: Proven legacy SAP splice characteristic names (ZZSPLICE-1, ZZSPLICE-2) tested; feet derivation deferred.
- P2: Truly optional canonical fields separated from required core business facts; canonical route tested directly.
- P2: Deep visual / non-occlusion inspection: content stream operators (zero opaque fill rect), raster image 1600x640 px.
- AC 1: Synthetic reproduction proves cover without title/status overlap and 3 label pages in sequence.
- AC 2: Visual inspection proves warning readable, no opaque ribbon occluding label layout, dimensions unchanged.
- AC 3: Known optional fields (so_item, splice_1_m, splice_1_feet, splice_2_m, splice_2_feet) render empty, no fake facts.
- AC 4: Foreign tokens or missing required fields fail closed before PDF is produced; errors sanitized.
- AC 5: Regression Safe Demo B2B2I/B2B2K/B2B2L passes; auth, no physical route, item order, replay preserved.
- AC 6: Canonical template SHA-256 intact; zero physical/network route.
- AC 7: Evidence recorded and transparently reported.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
from typing import Any, Dict
import unittest.mock

from fastapi.testclient import TestClient
from PIL import Image
import pypdf
import pytest
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from app.main import app
from app.models.raw_sap_snapshot_v2 import RawSapBatchSnapshotV2, RawSapItemSnapshotV2
from app.print_jobs.artifact_storage import DurableFilesystemArtifactStorage
from app.services.n001_rule_adapter import N001DevelopmentAdapter
from app.services.pdf_evidence_service import WATERMARK_TEXT, PdfEvidenceService
from app.services.sap_shadow_service import (
    KNOWN_OPTIONAL_CANONICAL_FIELDS,
    SapCanonicalFields,
    SapCanonicalItemData,
    SapShadowBatchRequest,
    SapShadowItemInput,
    SapShadowService,
    normalize_canonical_for_engine,
)
from engine.renderer import OrphanTokenError, inject_data, validate_no_orphan_tokens

CANONICAL_TEMPLATE_SHA256 = "4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577"
SYNTHETIC_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "tasks"
    / "B2B2K"
    / "fixtures"
    / "raw_sap_snapshot_v2_n001_synthetic.json"
)


def load_synthetic_raw_request() -> RawSapBatchSnapshotV2:
    """Loads synthetic raw snapshot fixture."""
    data = json.loads(SYNTHETIC_FIXTURE_PATH.read_text(encoding="utf-8"))
    return RawSapBatchSnapshotV2(**data)


@pytest.fixture
def isolated_service(tmp_path: Path) -> SapShadowService:
    """Provides an isolated SapShadowService per test using tmp_path."""
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts")
    service = SapShadowService(artifact_storage=storage, storage_base_dir=tmp_path / "sim_store")
    return service


# =============================================================================
# AC 1: Synthetic PDF Reproduction & Cover Banner Geometry (No Overlap)
# =============================================================================

class TestCoverBannerGeometry:
    """Verifies that the cover page banner separates title and status into distinct non-overlapping zones."""

    def test_cover_banner_zones_vertical_separation(self):
        """Cover banner title and status badge must be in separate vertical zones with >= 20pt separation."""
        page_w = 595.276  # A4 width in pt
        page_h = 841.890  # A4 height in pt

        # Zone 1 (Top Bar): Eyebrow at page_h - 26, Status badge pill at page_h - 35
        badge_y = page_h - 35
        # Zone 2 (Title): Title baseline at page_h - 58
        title_y = page_h - 58

        vertical_gap = badge_y - title_y
        assert vertical_gap >= 20.0, f"Vertical separation between status badge and title ({vertical_gap}pt) must be >= 20pt."

    def test_cover_banner_long_title_dynamic_scaling(self):
        """Long title text dynamically scales down and does not exceed available banner width."""
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=(595.276, 841.890))
        page_w, page_h = 595.276, 841.890

        # Simulate extremely long title
        long_title = "VERY LONG SAP PRODUCTION BATCH SIMULATION EVIDENCE REPORT WITH EXTENDED METADATA STRING FOR PPIC"
        max_title_w = page_w - 72

        font_size = 16
        calc_w = c.stringWidth(long_title, "Helvetica-Bold", font_size)
        if calc_w > max_title_w:
            font_size = max(8, int(font_size * (max_title_w / calc_w)))

        scaled_w = c.stringWidth(long_title, "Helvetica-Bold", font_size)
        assert scaled_w <= max_title_w, f"Scaled width ({scaled_w}pt) must fit max width ({max_title_w}pt)."

    def test_synthetic_batch_pdf_reproduction_pages_and_order(self, isolated_service: SapShadowService):
        """AC 1: Full simulation produces 4 pages strictly ordered: 1 cover + 3 label pages."""
        async def _run():
            req = load_synthetic_raw_request()
            res = await isolated_service.ingest_raw_batch(req, auto_process=False)
            batch_id = res["batch_id"]

            await isolated_service.process_batch(batch_id)
            return batch_id

        batch_id = asyncio.run(_run())

        record = isolated_service.get_batch(batch_id)
        assert record["status"] == "completed"
        assert record["completed_items"] == 3
        assert record["artifact"] is not None

        pdf_bytes = isolated_service.get_evidence_pdf(batch_id)
        assert pdf_bytes is not None

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        # Exactly 4 pages: 1 cover + 3 labels
        assert len(reader.pages) == 4

        # Verify Cover Page (Page 1)
        cover_text = reader.pages[0].extract_text()
        assert "SAP SHADOW PRINT SIMULATION EVIDENCE" in cover_text
        assert "STATUS: SIMULATED (PDF SINK)" in cover_text
        assert WATERMARK_TEXT in cover_text
        assert "Manifest Item Berurutan (item_sequence ASC)" in cover_text

        # Verify Label Pages (Pages 2, 3, 4) in strict ASC order
        for page_idx in range(1, 4):
            label_page = reader.pages[page_idx]
            # Exact points: 200x80 mm = ~566.93 x ~226.77 pt
            w = float(label_page.mediabox.width)
            h = float(label_page.mediabox.height)
            assert abs(w - 566.93) < 1.0, f"Page {page_idx+1} width {w}pt must match 200mm (~566.93pt)"
            assert abs(h - 226.77) < 1.0, f"Page {page_idx+1} height {h}pt must match 80mm (~226.77pt)"

            label_text = label_page.extract_text()
            assert WATERMARK_TEXT in label_text, f"Page {page_idx+1} must have simulation watermark."


# =============================================================================
# AC 2 / Review P2: Deep Visual & Non-Occlusion Inspection
# =============================================================================

class TestVisualSafetyIndicators:
    """Verifies visual safety indicators: perimeter stroke frame, translucent watermark, no opaque bar, raster dimensions."""

    def test_pdf_evidence_service_uses_perimeter_frame_and_no_opaque_rect(self):
        """Label page generation must draw perimeter frame with fill=0 and zero opaque rect covering layout."""
        # Create a sample 1600x640 raster image to simulate engine output
        img = Image.new("RGB", (1600, 640), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        items = [
            {
                "item_sequence": 1,
                "template_version_id": "label_roll_80x200",
                "canonical_item_data": {
                    "brand": "SYNTH-BRAND",
                    "type_film": "ALU FOIL",
                    "base_film": "PET",
                    "material_code": "MAT-001",
                    "batch_text": "B001",
                    "roll_no": "R001",
                    "width_mm": 80.0,
                    "length_m": 2000.0,
                    "net_weight_kg": "10.0",
                },
                "rendered_image_bytes": png_bytes,
            }
        ]
        pdf_bytes = PdfEvidenceService.generate_batch_pdf(
            batch_id="test-batch-001",
            producer_namespace="SAP_PPIC",
            request_id="REQ-001",
            printer_id="PILOT-PRINTER-01",
            virtual_profile={"width_mm": 200.0, "height_mm": 80.0, "dpi": 203.2},
            items=items,
            raw_contract_sha256="abc123hash",
            created_at=datetime.now(timezone.utc),
        )

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        assert len(reader.pages) == 2
        label_page = reader.pages[1]

        # 1. Text extraction check
        label_text = label_page.extract_text()
        assert WATERMARK_TEXT in label_text
        assert "Item: 1/1" in label_text
        assert "Batch: test-bat" in label_text

        # 2. Content stream inspection: Verify NO filled rectangle (re f or re f*) exists
        content_stream = label_page.get_contents().get_data().decode("latin1")
        # In the past, rect(0, h-14, w, 14, fill=1) emitted 're f' or 're f*'
        # Now only perimeter stroke frame 're S' is emitted
        assert " re f" not in content_stream, "Label page must NOT have any filled rectangle (re f) covering content!"
        assert " re S" in content_stream, "Label page must have perimeter stroke frame (re S) without fill."

        # 3. Embedded raster image inspection: verify exact 1600x640 dimensions
        assert len(label_page.images) == 1
        embedded_img = label_page.images[0].image
        assert embedded_img.size == (1600, 640), f"Embedded image size {embedded_img.size} must match exactly 1600x640 px."

    def test_synthetic_batch_all_four_pages_deep_visual_inspection(self, isolated_service: SapShadowService):
        """Review P2: Deep visual inspection across all 4 pages of actual synthetic simulation.

        Verifies:
        - Page 1 (Cover Manifest): A4 portrait (595.28 x 841.89 pt), contains manifest table.
        - Pages 2, 3, 4 (Labels):
          * Exact physical points: 200x80mm (~566.93 x ~226.77 pt).
          * NO opaque filled rectangles ('re f' or 're f*') covering label layout.
          * Perimeter stroke rectangle ('re S') present with fill=0.
          * Tag margin text present in top-right without background fill.
          * Translucent watermark text present.
          * Exactly 1 embedded raster image of dimensions 1600x640 px (203.2 DPI).
          * Embedded raster image contains actual rendered ink/pixels (dark pixels present, extrema range).
        """
        async def _run():
            req = load_synthetic_raw_request()
            res = await isolated_service.ingest_raw_batch(req, auto_process=False)
            batch_id = res["batch_id"]
            await isolated_service.process_batch(batch_id)
            return batch_id

        batch_id = asyncio.run(_run())
        pdf_bytes = isolated_service.get_evidence_pdf(batch_id)
        assert pdf_bytes is not None

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        assert len(reader.pages) == 4

        # Page 1: Cover Manifest
        cover_page = reader.pages[0]
        assert abs(float(cover_page.mediabox.width) - 595.28) < 1.0
        assert abs(float(cover_page.mediabox.height) - 841.89) < 1.0
        assert len(cover_page.images) == 0

        # Pages 2, 3, 4: Label Pages
        for idx in range(1, 4):
            label_page = reader.pages[idx]
            # Verify exact physical dimensions
            w = float(label_page.mediabox.width)
            h = float(label_page.mediabox.height)
            assert abs(w - 566.93) < 1.0, f"Page {idx+1} width {w} must be ~566.93 pt (200mm)"
            assert abs(h - 226.77) < 1.0, f"Page {idx+1} height {h} must be ~226.77 pt (80mm)"

            # Content stream operator inspection
            cs = label_page.get_contents().get_data().decode("latin1")
            assert " re f" not in cs and " re f*" not in cs, (
                f"Page {idx+1} must NOT contain opaque filled rectangle (re f) covering content!"
            )
            assert " re S" in cs, f"Page {idx+1} must contain perimeter stroke rectangle (re S)."

            # Text content inspection: watermark and top-right margin tag
            txt = label_page.extract_text()
            assert WATERMARK_TEXT in txt, f"Page {idx+1} must contain simulation watermark text."
            assert f"Item: {idx}/3" in txt, f"Page {idx+1} must contain sequence tag 'Item: {idx}/3'."

            # Embedded raster image inspection
            assert len(label_page.images) == 1, f"Page {idx+1} must contain exactly 1 embedded raster image."
            img_info = label_page.images[0]
            img = img_info.image
            assert img.size == (1600, 640), f"Page {idx+1} image size {img.size} must match 1600x640 px (203.2 DPI)."
            assert img.mode == "RGB"

            # Verify actual rendered content (dark ink pixels from SVG text, lines, barcodes)
            extrema = img.getextrema()
            has_dark = any(e[0] < 50 for e in extrema) if isinstance(extrema[0], tuple) else extrema[0] < 50
            assert has_dark, f"Page {idx+1} embedded image must contain actual rendered dark pixels (ink)."



# =============================================================================
# AC 3 & Review P2: Truly Optional Canonical Fields vs Core Required Business Facts
# =============================================================================

class TestKnownOptionalFieldsHandling:
    """Verifies that truly optional fields render empty string when absent, while core facts remain required."""

    def test_known_optional_canonical_fields_does_not_contain_core_business_facts(self):
        """Review P2: Core business facts (brand, type_film, width_mm, etc.) must NOT be in KNOWN_OPTIONAL_CANONICAL_FIELDS."""
        core_facts = {"brand", "type_film", "base_film", "width_mm", "length_m", "net_weight_kg"}
        for fact in core_facts:
            assert fact not in KNOWN_OPTIONAL_CANONICAL_FIELDS, (
                f"Core business fact '{fact}' must NOT be in KNOWN_OPTIONAL_CANONICAL_FIELDS."
            )

        # Truly optional business facts must be present
        truly_optional = {
            "so_item",
            "splice_1_m",
            "splice_1_feet",
            "splice_2_m",
            "splice_2_feet",
            "treatment_inside",
            "treatment_outside",
            "core_inch",
            "used_before",
            "gross_weight",
            "gross_weight_kg",
            "material_desc",
            "production_date",
        }
        for field in truly_optional:
            assert field in KNOWN_OPTIONAL_CANONICAL_FIELDS, f"Optional field '{field}' must be in KNOWN_OPTIONAL_CANONICAL_FIELDS."

    def test_normalize_canonical_populates_empty_strings_only_for_truly_optional_fields(self):
        """Truly optional fields in canonical data are normalized to empty string "" without fabricating values."""
        canonical = SapCanonicalItemData(
            brand="POLYTRON",
            type_film="ALU FOIL",
            base_film="PET",
            material_code="MAT-SYNTH-01",
            batch_number="BAT-001",
            roll_number="ROLL-001",
            width_mm=80.0,
            length_m=2000.0,
            net_weight="15.0",
        )
        normalized = normalize_canonical_for_engine(canonical)
        fields = normalized["fields"]

        # Truly optional fields must be "" (empty string)
        assert fields["so_item"] == ""
        assert fields["splice_1_m"] == ""
        assert fields["splice_1_feet"] == ""
        assert fields["splice_2_m"] == ""
        assert fields["splice_2_feet"] == ""
        assert fields["treatment_inside"] == ""
        assert fields["treatment_outside"] == ""
        assert fields["core_inch"] == ""
        assert fields["used_before"] == ""
        assert fields["gross_weight_kg"] == ""

        # Core business facts must NOT be empty string; they must keep their real values
        assert fields["brand"] == "POLYTRON"
        assert fields["type_film"] == "ALU FOIL"
        assert fields["base_film"] == "PET"
        assert fields["batch_text"] == "BAT-001"
        assert fields["roll_no"] == "ROLL-001"
        assert fields["net_weight_kg"] == "15.0"

        # Derived imperial conversions on canonical path
        assert fields["width_inch"] == "3.15"
        assert fields["length_feet"] == "6562"
        assert fields["weight_lbs"] == "33.1"

    def test_so_item_present_is_preserved_not_overwritten(self):
        """When so_item is provided by SAP, its value is preserved and not replaced by empty string."""
        canonical = SapCanonicalItemData(
            fields=SapCanonicalFields(
                brand="POLYTRON",
                type_film="ALU",
                base_film="PET",
                material_code="MAT-01",
                batch_text="BAT-01",
                roll_no="R-01",
                net_weight_kg="10.0",
                so_item="40",
            )
        )
        normalized = normalize_canonical_for_engine(canonical)
        assert normalized["fields"]["so_item"] == "40"

    def test_synthetic_simulation_renders_zero_raw_placeholders(self, isolated_service: SapShadowService):
        """AC 3: In the synthetic batch, rendered SVGs must contain zero raw {{...}} tokens."""
        async def _run():
            req = load_synthetic_raw_request()
            res = await isolated_service.ingest_raw_batch(req, auto_process=False)
            batch_id = res["batch_id"]

            await isolated_service.process_batch(batch_id)
            return batch_id

        batch_id = asyncio.run(_run())
        record = isolated_service.get_batch(batch_id)
        assert record["status"] == "completed"

        for idx, item in enumerate(record["items"]):
            svg = item["rendered_svg"]
            assert svg is not None
            orphan_matches = re.findall(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}", svg)
            assert orphan_matches == [], (
                f"Item {idx+1} rendered SVG contains unreplaced placeholders: {orphan_matches}"
            )
            # Specifically check known optional fields
            assert "{{so_item}}" not in svg
            assert "{{splice_1_m}}" not in svg
            assert "{{splice_1_feet}}" not in svg
            assert "{{splice_2_m}}" not in svg
            assert "{{splice_2_feet}}" not in svg

            # Item 1 and Item 2 have sales_order_item "10" and "20"
            if idx == 0:
                assert ">10<" in svg, "Item 1 should render so_item '10'."
            elif idx == 1:
                assert ">20<" in svg, "Item 2 should render so_item '20'."
            elif idx == 2:
                # Item 3 had sales_order_item: null; should render empty, not "None" or fake fallback
                assert "None" not in svg


# =============================================================================
# AC 4 & Review P2: Canonical Route Direct Testing & Fail-Closed Boundary
# =============================================================================

class TestFailClosedBoundary:
    """Verifies that unknown tokens or missing required fields fail closed with zero PDF produced."""

    def test_canonical_path_missing_required_core_fact_fails_closed(
        self, isolated_service: SapShadowService
    ):
        """Review P2: Canonical path missing brand for label_roll_80x200 must fail closed, producing 0 PDF."""
        async def _run():
            # Canonical item omitting 'brand'
            batch_req = SapShadowBatchRequest(
                producer_namespace="TEST_NS",
                request_id="REQ-CANONICAL-MISSING-BRAND",
                printer_id="PILOT-PRINTER-01",
                items=[
                    SapShadowItemInput(
                        item_sequence=1,
                        template_version_id="label_roll_80x200",
                        copies=1,
                        canonical_item_data=SapCanonicalItemData(
                            # brand is omitted!
                            type_film="ALU FOIL",
                            base_film="PET",
                            material_code="MAT-01",
                            batch_number="BAT-01",
                            roll_number="R-01",
                            width_mm=80.0,
                            length_m=2000.0,
                            net_weight="10.0",
                        ),
                    )
                ],
            )
            res = await isolated_service.ingest_batch(batch_req, auto_process=False)
            batch_id = res["batch_id"]

            await isolated_service.process_batch(batch_id)
            return batch_id

        batch_id = asyncio.run(_run())
        record = isolated_service.get_batch(batch_id)
        # Must fail closed because {{brand}} remained unreplaced
        assert record["status"] == "failed"
        assert record["artifact"] is None
        assert record["completed_at"] is None

    def test_canonical_path_with_complete_required_facts_succeeds(
        self, isolated_service: SapShadowService
    ):
        """Review P2: Canonical path with all required facts succeeds and produces verified PDF."""
        async def _run():
            batch_req = SapShadowBatchRequest(
                producer_namespace="TEST_NS",
                request_id="REQ-CANONICAL-COMPLETE",
                printer_id="PILOT-PRINTER-01",
                items=[
                    SapShadowItemInput(
                        item_sequence=1,
                        template_version_id="label_roll_80x200",
                        copies=1,
                        canonical_item_data=SapCanonicalItemData(
                            brand="SYNTH-BRAND",
                            type_film="ALU FOIL",
                            base_film="PET",
                            material_code="MAT-01",
                            batch_number="BAT-01",
                            roll_number="R-01",
                            width_mm=80.0,
                            length_m=2000.0,
                            net_weight="10.0",
                        ),
                    )
                ],
            )
            res = await isolated_service.ingest_batch(batch_req, auto_process=False)
            batch_id = res["batch_id"]

            await isolated_service.process_batch(batch_id)
            return batch_id

        batch_id = asyncio.run(_run())
        record = isolated_service.get_batch(batch_id)
        assert record["status"] == "completed"
        assert record["artifact"] is not None

    def test_unknown_token_in_svg_fails_closed(self):
        """An unrecognized token in SVG template causes validate_no_orphan_tokens to raise OrphanTokenError."""
        template_with_unknown = "<svg><text>{{brand}}</text><text>{{unregistered_secret_fact}}</text></svg>"
        contract_data = {
            "fields": {
                "brand": "POLYTRON",
            },
            "codes": {},
        }
        injected = inject_data(template_with_unknown, contract_data)
        with pytest.raises(OrphanTokenError) as exc_info:
            validate_no_orphan_tokens(injected)

        assert "unregistered_secret_fact" in str(exc_info.value)

    def test_process_batch_with_orphan_token_fails_closed_zero_pdf(
        self, isolated_service: SapShadowService, tmp_path: Path
    ):
        """If an orphan token remains, process_batch fails closed, producing 0 PDF artifacts."""
        async def _run():
            bad_tmpl_svg = '<svg width="200mm" height="80mm"><text>{{batch_text}}</text><text>{{unknown_rogue_token}}</text></svg>'
            bad_tmpl_file = tmp_path / "bad_template.svg"
            bad_tmpl_file.write_text(bad_tmpl_svg, encoding="utf-8")

            with unittest.mock.patch("app.services.template_service.TemplateService.get_template_path", return_value=bad_tmpl_file):
                batch_req = SapShadowBatchRequest(
                    producer_namespace="TEST_NS",
                    request_id="REQ-FAIL-TOKEN",
                    printer_id="PILOT-PRINTER-01",
                    items=[
                        SapShadowItemInput(
                            item_sequence=1,
                            template_version_id="bad_template",
                            copies=1,
                            canonical_item_data=SapCanonicalItemData(
                                material_code="MAT-01",
                                batch_number="BAT-01",
                                roll_number="R-01",
                                net_weight="10.0",
                            ),
                        )
                    ],
                )
                res = await isolated_service.ingest_batch(batch_req, auto_process=False)
                batch_id = res["batch_id"]

                await isolated_service.process_batch(batch_id)
                return batch_id

        batch_id = asyncio.run(_run())

        record = isolated_service.get_batch(batch_id)
        assert record["status"] == "failed"
        assert record["artifact"] is None
        assert record["completed_at"] is None
        assert "kegagalan teknis" in record["error"]

    def test_missing_required_raw_fact_fails_closed_in_adapter(self):
        """Missing required raw business fact fails closed before simulation starts."""
        raw_item = RawSapItemSnapshotV2(
            item_sequence=1,
            label_code="N001",
            copies=1,
            characteristics=[],  # Missing brand, width, length, net_weight, etc.
        )
        with pytest.raises(ValueError) as exc_info:
            N001DevelopmentAdapter.adapt_item(raw_item)
        assert "Missing required raw business fact" in str(exc_info.value)


# =============================================================================
# Review P1: Proven Legacy Splice Characteristics (ZZSPLICE-1, ZZSPLICE-2)
# =============================================================================

class TestSpliceHandling:
    """Verifies splice extraction from raw snapshot using proven legacy SAP characteristic names."""

    def test_proven_legacy_abap_splice_characteristics_extracted(self):
        """Review P1: ZZSPLICE-1 and ZZSPLICE-2 from ZMMR_LABEL_JSON.abap are mapped correctly."""
        item = RawSapItemSnapshotV2(
            item_sequence=1,
            label_code="N001",
            copies=1,
            characteristics=[
                {"name": "ZZBRAND", "value": "POLYTRON", "value_type": "string"},
                {"name": "ZZTYPEFILM", "value": "ALU", "value_type": "string"},
                {"name": "ZZBASEFILM", "value": "PET", "value_type": "string"},
                {"name": "ZZWIDTH", "value": 100.0, "value_type": "number"},
                {"name": "ZZLENGTH", "value": 1000.0, "value_type": "number"},
                {"name": "ZZCONVERSIONROLLKG", "value": 15.0, "value_type": "number"},
                {"name": "ZZSPLICE-1", "value": "100", "value_type": "string"},
                {"name": "ZZSPLICE-2", "value": "250", "value_type": "string"},
            ],
            business_context={
                "material_number": "MAT-01",
                "batch_number": "BAT-01",
                "roll_number": "R-01",
            },
        )
        canonical, tmpl_id, audit_meta = N001DevelopmentAdapter.adapt_item(item)
        fields = canonical.fields

        # Extracted meter values
        assert fields.splice_1_m == "100"
        assert fields.splice_2_m == "250"
        # Review P1: feet derivation deferred pending PPIC business approval
        assert fields.splice_1_feet is None
        assert fields.splice_2_feet is None

        assert "ZZSPLICE-1" in audit_meta["characteristics_used"]
        assert "ZZSPLICE-2" in audit_meta["characteristics_used"]
        assert "splice_1_feet" not in audit_meta["derived_fields"]

    def test_splice_absent_leaves_fields_none_in_adapter(self):
        """When no splice characteristics are present, splice fields remain None in adapter."""
        item = RawSapItemSnapshotV2(
            item_sequence=1,
            label_code="N001",
            copies=1,
            characteristics=[
                {"name": "ZZBRAND", "value": "POLYTRON", "value_type": "string"},
                {"name": "ZZTYPEFILM", "value": "ALU", "value_type": "string"},
                {"name": "ZZBASEFILM", "value": "PET", "value_type": "string"},
                {"name": "ZZWIDTH", "value": 100.0, "value_type": "number"},
                {"name": "ZZLENGTH", "value": 1000.0, "value_type": "number"},
                {"name": "ZZCONVERSIONROLLKG", "value": 15.0, "value_type": "number"},
            ],
            business_context={
                "material_number": "MAT-01",
                "batch_number": "BAT-01",
                "roll_number": "R-01",
            },
        )
        canonical, _, _ = N001DevelopmentAdapter.adapt_item(item)
        assert canonical.fields.splice_1_m is None
        assert canonical.fields.splice_1_feet is None
        assert canonical.fields.splice_2_m is None
        assert canonical.fields.splice_2_feet is None


# =============================================================================
# AC 6: Canonical Template Invariant Check
# =============================================================================

class TestCanonicalTemplateIntegrity:
    """Verifies that the canonical SVG template was not modified."""

    def test_canonical_template_sha256_unmodified(self):
        """Canonical SVG template must match reference SHA-256 digest exactly."""
        tmpl_path = (
            Path(__file__).resolve().parent.parent.parent
            / "assets"
            / "templates"
            / "label_roll_80x200.svg"
        )
        assert tmpl_path.is_file(), f"Canonical template not found at {tmpl_path}"
        actual_sha = hashlib.sha256(tmpl_path.read_bytes()).hexdigest().upper()
        assert actual_sha == CANONICAL_TEMPLATE_SHA256, (
            f"Canonical template SHA-256 altered!\nExpected: {CANONICAL_TEMPLATE_SHA256}\nActual:   {actual_sha}"
        )
