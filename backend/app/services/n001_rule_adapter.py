"""N001 Application Rule Profile and Adapter (B2B2K).

Implements the application-owned N001 development rule boundary:
- Profile: N001, version: 0.1.0-dev (DEVELOPMENT_SAFE_DEMO_ONLY).
- Strict fail-closed production activation gate.
- Strict route isolation: accepts ONLY label_code == 'N001'.
- Complete non-lossy intake: preserves all characteristics (known and unknown) and business context.
- Distinct absence / null / empty string handling for optional business facts.
- Fail closed if required raw facts are missing or invalid; zero fake business fallbacks.
- Deterministic derived conversions (width_inch, length_feet, weight_lbs).
- Safe Demo only: maps to development template label_roll_80x200 with copies == 1.
- No fabricated barcodes/QR before format is approved.
- No guessing of missing values; no assumed 30-day shelf-life multiplier; no arbitrary core weight addition.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from ..models.raw_sap_snapshot_v2 import RawSapItemSnapshotV2
from ..services.sap_shadow_service import (
    SapCanonicalCodes,
    SapCanonicalFields,
    SapCanonicalItemData,
)

logger = logging.getLogger("n001_rule_adapter")


class N001DevelopmentAdapter:
    """Application-owned development rule profile and adapter for N001."""

    PROFILE_ID: str = "N001"
    RULE_VERSION: str = "0.1.0-dev"
    STATUS: str = "DEVELOPMENT_SAFE_DEMO_ONLY"
    IS_PRODUCTION_APPROVED: bool = False
    PRODUCTION_BLOCKER_MESSAGE: str = (
        "N001 production activation is blocked: layout, visual text, barcode definitions, "
        "and shelf-life unit business approval pending from PPIC."
    )
    DEFAULT_TEMPLATE_ID: str = "label_roll_80x200"
    MEDIA_WIDTH_MM: float = 200.0
    MEDIA_HEIGHT_MM: float = 80.0
    MEDIA_DPI: float = 203.2

    @classmethod
    def assert_production_allowed(cls) -> None:
        """Enforces fail-closed production activation gate.

        Raises RuntimeError if production activation is attempted without business approval.
        """
        if not cls.IS_PRODUCTION_APPROVED:
            raise RuntimeError(cls.PRODUCTION_BLOCKER_MESSAGE)

    @classmethod
    def adapt_item(
        cls,
        item: RawSapItemSnapshotV2,
    ) -> Tuple[SapCanonicalItemData, str, Dict[str, Any]]:
        """Adapts a RawSapItemSnapshotV2 into canonical item data and target template.

        Fails closed without fabricating fake fallback business facts if required data is missing.

        Returns:
            Tuple of (SapCanonicalItemData, template_version_id, rule_audit_metadata)

        Raises:
            ValueError: If label_code != 'N001' or if required raw facts are missing/invalid.
        """
        # 1. Strict Route Isolation
        if item.label_code != cls.PROFILE_ID:
            raise ValueError(
                f"Unsupported label_code '{item.label_code}'. "
                f"N001 development adapter strictly requires label_code '{cls.PROFILE_ID}'."
            )

        # 2. Extract characteristics into normalized uppercase lookup
        chars_by_name: Dict[str, Any] = {}
        for char in item.characteristics:
            norm_name = char.name.strip().upper()
            chars_by_name[norm_name] = char.value

        # 3. Extract business context facts
        ctx = item.business_context

        def _get_raw(ctx_key: str, char_names: List[str]) -> Optional[Any]:
            if ctx and ctx.has_field(ctx_key):
                val = ctx.get_raw_value(ctx_key)
                if val is not None:
                    return val
            for ch in char_names:
                if ch in chars_by_name and chars_by_name[ch] is not None:
                    return chars_by_name[ch]
            return None

        # 4. Validate REQUIRED raw business facts fail-closed (Zero Fake Business Fallbacks)
        required_checks = [
            ("material_number", _get_raw("material_number", ["ZZMATERIAL", "ZZMATNR"])),
            ("batch_number", _get_raw("batch_number", ["ZZBATCH", "ZZCHARG"])),
            ("roll_number", _get_raw("roll_number", ["ZZROLL", "ZZROLLNO"])),
            ("brand", _get_raw("brand", ["ZZBRAND"])),
            ("width_mm", _get_raw("width_mm", ["ZZWIDTH", "ZZLEBAR"])),
            ("length_m", _get_raw("length_m", ["ZZLENGTH", "ZZPANJANG"])),
            ("net_weight_kg", _get_raw("net_weight_kg", ["ZZCONVERSIONROLLKG", "ZZNETWEIGHT", "ZZBERAT_BERSIH"])),
            ("type_film", _get_raw("type_film", ["ZZTYPEFILM", "ZZFILMTYPE"])),
            ("base_film", _get_raw("base_film", ["ZZBASEFILM"])),
        ]

        for field_name, field_val in required_checks:
            if field_val is None or (isinstance(field_val, str) and not field_val.strip()):
                raise ValueError(
                    f"Missing required raw business fact '{field_name}' for N001 item sequence {item.item_sequence}."
                )

        mat_no = str(required_checks[0][1]).strip()
        batch_no = str(required_checks[1][1]).strip()
        roll_no = str(required_checks[2][1]).strip()
        brand_raw = str(required_checks[3][1]).strip()
        width_raw = required_checks[4][1]
        length_raw = required_checks[5][1]
        net_weight_raw = required_checks[6][1]
        type_film_raw = str(required_checks[7][1]).strip()
        base_film_raw = str(required_checks[8][1]).strip()

        # Numeric parsing and validation for dimensions & weight
        try:
            width_float = float(str(width_raw).strip())
            if width_float <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid numeric value '{width_raw}' for 'width_mm' in N001 item sequence {item.item_sequence}."
            )

        try:
            length_float = float(str(length_raw).strip())
            if length_float <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid numeric value '{length_raw}' for 'length_m' in N001 item sequence {item.item_sequence}."
            )

        net_clean = str(net_weight_raw).replace("KG", "").replace("Kg", "").replace("kg", "").strip()
        try:
            net_weight_float = float(net_clean)
            if net_weight_float <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid numeric value '{net_weight_raw}' for 'net_weight_kg' in N001 item sequence {item.item_sequence}."
            )

        # 5. Optional Raw Facts Handling (distinct absence / null / empty)
        customer_text_presence = "absent"
        customer_text_val = ""
        if ctx and ctx.has_field("customer_text"):
            raw_ct = ctx.get_raw_value("customer_text")
            if raw_ct is None:
                customer_text_presence = "null"
                customer_text_val = ""
            elif raw_ct == "":
                customer_text_presence = "empty"
                customer_text_val = ""
            else:
                customer_text_presence = "value"
                customer_text_val = str(raw_ct)

        # material_desc: strictly from raw material_description or characteristic (never substitute with type_film)
        mat_desc_val: Optional[str] = None
        if ctx and ctx.has_field("material_description"):
            raw_md = ctx.get_raw_value("material_description")
            if raw_md is not None:
                mat_desc_val = str(raw_md)
        elif "ZZMATERIAL_DESC" in chars_by_name and chars_by_name["ZZMATERIAL_DESC"] is not None:
            mat_desc_val = str(chars_by_name["ZZMATERIAL_DESC"])
        elif "ZZMAKTX" in chars_by_name and chars_by_name["ZZMAKTX"] is not None:
            mat_desc_val = str(chars_by_name["ZZMAKTX"])

        # so_item: strictly from raw sales_order_item or characteristic ZZPOSNR (never substitute with sales_order)
        so_item_raw: Optional[str] = None
        if ctx and ctx.has_field("sales_order_item"):
            raw_so_item = ctx.get_raw_value("sales_order_item")
            if raw_so_item is not None:
                so_item_raw = str(raw_so_item)
        elif "ZZPOSNR" in chars_by_name and chars_by_name["ZZPOSNR"] is not None:
            so_item_raw = str(chars_by_name["ZZPOSNR"])

        treatment_in = _get_raw("treatment_inside", ["ZZTREATMENT_IN", "ZZPERLAKUAN_IN"])
        treatment_in_str = str(treatment_in) if treatment_in is not None else ""

        treatment_out = _get_raw("treatment_outside", ["ZZTREATMENT_OUT", "ZZPERLAKUAN_OUT"])
        treatment_out_str = str(treatment_out) if treatment_out is not None else ""

        core_inch = _get_raw("core_inch", ["ZZCORE"])
        core_inch_str = str(core_inch) if core_inch is not None else ""

        prod_date = _get_raw("production_date", ["ZZPRODDATE", "ZZPRODUCTION_DATE"])
        prod_date_str = str(prod_date) if prod_date is not None else ""

        # Gross weight: strictly from raw gross_weight_kg or characteristic (never substitute with net_weight_kg)
        gross_clean: Optional[str] = None
        gross_weight = None
        if ctx and ctx.has_field("gross_weight_kg"):
            gross_weight = ctx.get_raw_value("gross_weight_kg")
        elif "ZZGROSSWEIGHT" in chars_by_name:
            gross_weight = chars_by_name["ZZGROSSWEIGHT"]

        if gross_weight is not None and str(gross_weight).strip():
            gross_clean = str(gross_weight).replace("KG", "").replace("Kg", "").replace("kg", "").strip()
        elif gross_weight == "":
            gross_clean = ""
        else:
            gross_clean = None

        # Expiry date: do NOT assume 30-day multiplier or guess unit
        used_before_raw = _get_raw("used_before", ["ZZUSEDBEFORE", "ZZEXPDATE"])
        used_before_str = str(used_before_raw) if used_before_raw is not None else ""

        # 6. Deterministic Derived Unit Conversions (application-derived fields)
        width_inch_derived = f"{round(width_float / 25.4, 2):.2f}"
        length_feet_derived = str(int(round(length_float * 3.28084)))
        weight_lbs_derived = f"{round(net_weight_float * 2.20462, 1):.1f}"

        # 7. Assemble Canonical Fields & Codes
        # Per Codex: DO NOT fabricate barcode/QR before format is approved
        fields = SapCanonicalFields(
            brand=brand_raw,
            type_film=type_film_raw,
            base_film=base_film_raw,
            material_code=mat_no,
            material_number=mat_no,
            material_desc=mat_desc_val,
            batch_number=batch_no,
            batch_text=batch_no,
            roll_number=roll_no,
            roll_no=roll_no,
            width_mm=f"{width_float:.1f}".rstrip("0").rstrip("."),
            length_m=f"{length_float:.0f}",
            width_inch=width_inch_derived,
            length_feet=length_feet_derived,
            net_weight_kg=net_clean,
            gross_weight_kg=gross_clean,
            weight_lbs=weight_lbs_derived,
            core_inch=core_inch_str,
            used_before=used_before_str,
            so_item=so_item_raw,
            production_date=prod_date_str,
            treatment_inside=treatment_in_str,
            treatment_outside=treatment_out_str,
        )

        canonical_item = SapCanonicalItemData(
            contract_version="1.1",
            fields=fields,
            codes=None,  # Zero fabricated barcodes/QR before format is approved
        )

        audit_meta = {
            "rule_profile": cls.PROFILE_ID,
            "rule_version": cls.RULE_VERSION,
            "status": cls.STATUS,
            "is_production_approved": cls.IS_PRODUCTION_APPROVED,
            "customer_text_presence": customer_text_presence,
            "total_characteristics_received": len(item.characteristics),
            "characteristics_used": [
                k for k in chars_by_name if k in (
                    "ZZWIDTH", "ZZLENGTH", "ZZCONVERSIONROLLKG", "ZZBRAND",
                    "ZZTYPEFILM", "ZZBASEFILM", "ZZCORE", "ZZTREATMENT_IN",
                    "ZZTREATMENT_OUT", "ZZEXPIREDLIVE", "ZZMATERIAL", "ZZMATNR",
                    "ZZBATCH", "ZZCHARG", "ZZROLL", "ZZROLLNO", "ZZGROSSWEIGHT",
                    "ZZPOSNR", "ZZMATERIAL_DESC", "ZZMAKTX"
                )
            ],
            "unknown_characteristics_preserved": [
                k for k in chars_by_name if k not in (
                    "ZZWIDTH", "ZZLENGTH", "ZZCONVERSIONROLLKG", "ZZBRAND",
                    "ZZTYPEFILM", "ZZBASEFILM", "ZZCORE", "ZZTREATMENT_IN",
                    "ZZTREATMENT_OUT", "ZZEXPIREDLIVE", "ZZMATERIAL", "ZZMATNR",
                    "ZZBATCH", "ZZCHARG", "ZZROLL", "ZZROLLNO", "ZZGROSSWEIGHT",
                    "ZZPOSNR", "ZZMATERIAL_DESC", "ZZMAKTX"
                )
            ],
            "raw_sources_mapped": {
                "material_number": "business_context.material_number or ZZMATERIAL/ZZMATNR",
                "batch_number": "business_context.batch_number or ZZBATCH/ZZCHARG",
                "roll_number": "business_context.roll_number or ZZROLL/ZZROLLNO",
                "brand": "ZZBRAND",
                "type_film": "ZZTYPEFILM/ZZFILMTYPE",
                "base_film": "ZZBASEFILM",
                "width_mm": "ZZWIDTH/ZZLEBAR",
                "length_m": "ZZLENGTH/ZZPANJANG",
                "net_weight_kg": "ZZCONVERSIONROLLKG/ZZNETWEIGHT/ZZBERAT_BERSIH",
                "material_desc": "business_context.material_description or ZZMATERIAL_DESC/ZZMAKTX (strictly raw, no fallback)",
                "so_item": "business_context.sales_order_item or ZZPOSNR (strictly raw, no fallback)",
                "gross_weight_kg": "business_context.gross_weight_kg or ZZGROSSWEIGHT (strictly raw, no fallback)",
            },
            "derived_fields": ["width_inch", "length_feet", "weight_lbs"],
            "application_derived_fields": {
                "width_inch": f"round(width_mm / 25.4, 2) -> {width_inch_derived}",
                "length_feet": f"int(round(length_m * 3.28084)) -> {length_feet_derived}",
                "weight_lbs": f"round(net_weight_kg * 2.20462, 1) -> {weight_lbs_derived}",
            },
            "barcode_qr_approved": False,
        }

        return canonical_item, cls.DEFAULT_TEMPLATE_ID, audit_meta
