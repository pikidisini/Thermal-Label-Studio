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
import math
from typing import Any, Dict, List, Optional, Tuple

from ..models.raw_sap_snapshot_v2 import RawSapItemSnapshotV2
from ..services.sap_shadow_service import (
    SapCanonicalCodes,
    SapCanonicalFields,
    SapCanonicalItemData,
)

logger = logging.getLogger("n001_rule_adapter")
SIMULATION_TEXT_FIELDS = (
    "type_film", "base_film", "brand", "width_mm", "length_m", "width_inch",
    "length_feet", "treatment_inside", "treatment_outside", "batch_text",
    "net_weight_kg", "weight_lbs",
    "core_inch", "used_before", "splice_1_m", "splice_1_feet", "splice_2_m",
    "splice_2_feet", "roll_no", "so_item",
)


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


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
        profile_version: Optional[str] = None,
        compose_profile: Optional[bool] = None,
        simulation_tolerant: bool = False,
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

        missing_raw_fields = [name for name, value in required_checks if _is_missing(value)]
        if missing_raw_fields and not simulation_tolerant:
            field_name = missing_raw_fields[0]
            field_val = next(value for name, value in required_checks if name == field_name)
            if _is_missing(field_val):
                raise ValueError(
                    f"Missing required raw business fact '{field_name}' for N001 item sequence {item.item_sequence}."
                )

        def _raw_text(index: int) -> Optional[str]:
            value = required_checks[index][1]
            return None if _is_missing(value) else str(value).strip()

        mat_no = _raw_text(0)
        batch_no = _raw_text(1)
        roll_no = _raw_text(2)
        brand_raw = _raw_text(3)
        width_raw = required_checks[4][1]
        length_raw = required_checks[5][1]
        net_weight_raw = required_checks[6][1]
        type_film_raw = _raw_text(7)
        base_film_raw = _raw_text(8)

        # Numeric parsing and validation for dimensions & weight
        def _positive_number(field_name: str, value: Any) -> Optional[float]:
            try:
                number = float(str(value).strip())
                if not math.isfinite(number) or number <= 0:
                    raise ValueError()
                return number
            except (ValueError, TypeError):
                if simulation_tolerant:
                    return None
                raise ValueError(
                    f"Invalid numeric value for '{field_name}' in N001 item sequence {item.item_sequence}."
                )

        width_float = _positive_number("width_mm", width_raw)

        length_float = _positive_number("length_m", length_raw)

        net_clean = (
            None if _is_missing(net_weight_raw)
            else str(net_weight_raw).replace("KG", "").replace("Kg", "").replace("kg", "").strip()
        )
        net_weight_float = _positive_number("net_weight_kg", net_clean)

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

        # Splice 1 & 2: strictly from proven raw business facts if present (ZMMR_LABEL_JSON.abap: ZZSPLICE-1, ZZSPLICE-2)
        # Feet conversion is deferred until explicit business approval from PPIC
        splice_1_m_raw = _get_raw("splice_1_m", ["ZZSPLICE-1", "ZZSPLICE1"])
        splice_1_m_val: Optional[str] = None
        if splice_1_m_raw is not None and str(splice_1_m_raw).strip():
            try:
                s1_float = float(str(splice_1_m_raw).replace("M", "").replace("m", "").strip())
                if s1_float >= 0:
                    splice_1_m_val = f"{s1_float:.0f}"
            except (ValueError, TypeError):
                splice_1_m_val = str(splice_1_m_raw).strip()

        splice_2_m_raw = _get_raw("splice_2_m", ["ZZSPLICE-2", "ZZSPLICE2"])
        splice_2_m_val: Optional[str] = None
        if splice_2_m_raw is not None and str(splice_2_m_raw).strip():
            try:
                s2_float = float(str(splice_2_m_raw).replace("M", "").replace("m", "").strip())
                if s2_float >= 0:
                    splice_2_m_val = f"{s2_float:.0f}"
            except (ValueError, TypeError):
                splice_2_m_val = str(splice_2_m_raw).strip()

        # 6. Deterministic Derived Unit Conversions (application-derived fields)
        width_inch_derived = f"{round(width_float / 25.4, 2):.2f}" if width_float is not None else None
        length_feet_derived = str(int(round(length_float * 3.28084))) if length_float is not None else None
        weight_lbs_derived = f"{round(net_weight_float * 2.20462, 1):.1f}" if net_weight_float is not None else None

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
            width_mm=f"{width_float:.1f}".rstrip("0").rstrip(".") if width_float is not None else None,
            length_m=f"{length_float:.0f}" if length_float is not None else None,
            width_inch=width_inch_derived,
            length_feet=length_feet_derived,
            net_weight_kg=net_clean,
            gross_weight_kg=gross_clean,
            weight_lbs=weight_lbs_derived,
            core_inch=core_inch_str,
            used_before=used_before_str,
            so_item=so_item_raw,
            splice_1_m=splice_1_m_val,
            splice_1_feet=None,
            splice_2_m=splice_2_m_val,
            splice_2_feet=None,
            production_date=prod_date_str,
            treatment_inside=treatment_in_str,
            treatment_outside=treatment_out_str,
        )

        # Determine whether to execute versioned profile composition
        should_compose: bool
        if compose_profile is True:
            should_compose = True
        elif compose_profile is False:
            should_compose = False
        else:
            should_compose = bool(profile_version or getattr(item, "profile_version", None))

        codes = None
        target_template_id = cls.DEFAULT_TEMPLATE_ID
        active_version = cls.RULE_VERSION
        composition_hash = None
        composed_elements: List[str] = []

        if should_compose:
            from .profile_composer import ProfileComposer, ProfileRegistry
            target_ver = profile_version or getattr(item, "profile_version", None) or cls.RULE_VERSION
            profile = ProfileRegistry.get(cls.PROFILE_ID, target_ver)
            if not profile:
                raise ValueError(
                    f"Profile '{cls.PROFILE_ID}' version '{target_ver}' not found in ProfileRegistry."
                )

            comp_result = ProfileComposer.compose_item(
                item, profile, simulation_tolerant=simulation_tolerant
            )
            active_version = profile.profile_version
            target_template_id = profile.template_version_id
            composition_hash = comp_result.composition_hash
            composed_elements = list(comp_result.codes.keys()) + list(comp_result.fields.keys())

            if comp_result.fields:
                fields_dict = fields.model_dump()
                for k, v in comp_result.fields.items():
                    if k in fields_dict:
                        fields_dict[k] = v
                    else:
                        raise ValueError(
                            f"Composed text element '{k}' is not a recognized canonical field for {cls.PROFILE_ID}."
                        )
                fields = SapCanonicalFields(**fields_dict)

            if comp_result.codes:
                codes = SapCanonicalCodes(
                    batch_barcode=comp_result.codes.get("batch_barcode"),
                    roll_barcode=comp_result.codes.get("roll_barcode"),
                    material_barcode=comp_result.codes.get("material_barcode"),
                    qr_payload=comp_result.codes.get("qr_payload"),
                )

        canonical_item = SapCanonicalItemData(
            contract_version="1.1",
            fields=fields,
            codes=codes,
        )

        missing_display_fields: List[str] = []
        invalid_numeric_fields = [
            name for name, raw, parsed in (
                ("width_mm", width_raw, width_float),
                ("length_m", length_raw, length_float),
                ("net_weight_kg", net_weight_raw, net_weight_float),
            )
            if not _is_missing(raw) and parsed is None
        ]
        if simulation_tolerant:
            field_values = fields.model_dump()
            missing_display_fields = [
                name for name in SIMULATION_TEXT_FIELDS
                if _is_missing(field_values.get(name)) and name not in invalid_numeric_fields
            ]
            # Profile composition may depend on raw facts that are not text tokens.
            if should_compose and comp_result.audit_metadata.get("missing_fields"):
                missing_display_fields.extend(comp_result.audit_metadata["missing_fields"])
            missing_display_fields = sorted(set(missing_display_fields))
            fields = SapCanonicalFields(**{
                **field_values,
                **{name: "--" for name in SIMULATION_TEXT_FIELDS if _is_missing(field_values.get(name))},
            })
            canonical_item = SapCanonicalItemData(
                contract_version="1.1",
                fields=fields,
                codes=codes,
            )

        warning_records = [
            {
                "item_sequence": item.item_sequence,
                "field": name,
                "reason": "missing",
                "message": f"Informasi '{name}' tidak ditemukan pada item {item.item_sequence}; label menampilkan --.",
            }
            for name in missing_display_fields
        ]
        warning_records.extend(
            {
                "item_sequence": item.item_sequence,
                "field": name,
                "reason": "invalid",
                "message": f"Informasi '{name}' tidak valid pada item {item.item_sequence}; label menampilkan --.",
            }
            for name in invalid_numeric_fields
        )

        audit_meta = {
            "rule_profile": cls.PROFILE_ID,
            "rule_version": active_version,
            "status": cls.STATUS,
            "is_production_approved": cls.IS_PRODUCTION_APPROVED,
            "composition_hash": composition_hash,
            "composed_elements": composed_elements,
            "customer_text_presence": customer_text_presence,
            "total_characteristics_received": len(item.characteristics),
            "characteristics_used": [
                k for k in chars_by_name if k in (
                    "ZZWIDTH", "ZZLENGTH", "ZZCONVERSIONROLLKG", "ZZBRAND",
                    "ZZTYPEFILM", "ZZBASEFILM", "ZZCORE", "ZZTREATMENT_IN",
                    "ZZTREATMENT_OUT", "ZZEXPIREDLIVE", "ZZMATERIAL", "ZZMATNR",
                    "ZZBATCH", "ZZCHARG", "ZZROLL", "ZZROLLNO", "ZZGROSSWEIGHT",
                    "ZZPOSNR", "ZZMATERIAL_DESC", "ZZMAKTX",
                    "ZZSPLICE-1", "ZZSPLICE-2", "ZZSPLICE1", "ZZSPLICE2",
                )
            ],
            "unknown_characteristics_preserved": [
                k for k in chars_by_name if k not in (
                    "ZZWIDTH", "ZZLENGTH", "ZZCONVERSIONROLLKG", "ZZBRAND",
                    "ZZTYPEFILM", "ZZBASEFILM", "ZZCORE", "ZZTREATMENT_IN",
                    "ZZTREATMENT_OUT", "ZZEXPIREDLIVE", "ZZMATERIAL", "ZZMATNR",
                    "ZZBATCH", "ZZCHARG", "ZZROLL", "ZZROLLNO", "ZZGROSSWEIGHT",
                    "ZZPOSNR", "ZZMATERIAL_DESC", "ZZMAKTX",
                    "ZZSPLICE-1", "ZZSPLICE-2", "ZZSPLICE1", "ZZSPLICE2",
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
                "splice_1_m": "business_context.splice_1_m or ZZSPLICE-1/ZZSPLICE1 (strictly raw if present)",
                "splice_2_m": "business_context.splice_2_m or ZZSPLICE-2/ZZSPLICE2 (strictly raw if present)",
            },
            "derived_fields": ["width_inch", "length_feet", "weight_lbs"],
            "application_derived_fields": {
                "width_inch": f"round(width_mm / 25.4, 2) -> {width_inch_derived}",
                "length_feet": f"int(round(length_m * 3.28084)) -> {length_feet_derived}",
                "weight_lbs": f"round(net_weight_kg * 2.20462, 1) -> {weight_lbs_derived}",
            },
            "barcode_qr_approved": False,
            "simulation_tolerant": simulation_tolerant,
            "item_sequence": item.item_sequence,
            "missing_fields": missing_display_fields,
            "invalid_fields": invalid_numeric_fields if simulation_tolerant else [],
            "warning_count": len(warning_records),
            "warnings": warning_records,
        }

        return canonical_item, target_template_id, audit_meta
