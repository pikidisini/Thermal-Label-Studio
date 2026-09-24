"""Profile Composition Engine and Registry (B2B2L).

Implements the generic versioned label profile composition engine:
- Immutable profile registry keyed by (label_code, profile_version).
- Pre-registers default N001 development profile (0.1.0-dev).
- Assembles text, 1D barcode (code128), and 2D QR matrix (qr) payloads from raw SAP facts.
- Distinguishes absent, null, and empty string conditions with fail-closed policies (block, omit, marker).
- Validates symbology constraints and template slot compatibility.
- Emits deterministic composition hash and structured audit metadata.
- Strictly zero executable code evaluation, zero fake business fact substitutions.
"""

from __future__ import annotations

import copy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
import logging
import re
import threading
from typing import Any, Dict, List, Optional, Set, Tuple

from ..models.profile_composition_v1 import (
    ElementOutputType,
    EmptyPolicy,
    FieldFormatConfig,
    FieldSegment,
    LabelProfileConfig,
    LiteralSegment,
    ProfileCompositionResult,
    ProfileElementConfig,
    SegmentConfig,
)
from ..models.raw_sap_snapshot_v2 import RawSapItemSnapshotV2
from ..services.template_service import TemplateService

logger = logging.getLogger("profile_composer")


class ProfileCompositionError(ValueError):
    """Base exception for profile composition failures."""
    pass


class ProfileNotFoundError(ProfileCompositionError):
    """Raised when a label_code or specific profile_version is not registered."""
    pass


class ProfileImmutabilityError(ProfileCompositionError):
    """Raised when attempting to overwrite an already registered immutable profile version."""
    pass


class TemplateSlotMissingError(ProfileCompositionError):
    """Raised when the target SVG template lacks a slot or placeholder required by the profile."""
    pass


class EmptyFieldBlockedError(ProfileCompositionError):
    """Raised when a raw field is absent/null/empty and the corresponding policy is 'block'."""
    pass


class SymbologyMismatchError(ProfileCompositionError):
    """Raised when composed data violates symbology character set or length constraints."""
    pass


def apply_field_formatting(raw_val: Any, format_cfg: Optional[FieldFormatConfig]) -> str:
    """Applies safe, explicit formatting operations to a raw field value without code evaluation."""
    if raw_val is None:
        return ""
    val_str = str(raw_val)
    if not format_cfg:
        return val_str

    res = val_str
    if format_cfg.operation == "round_decimal":
        if format_cfg.decimals is None:
            raise ProfileCompositionError("Operation 'round_decimal' requires 'decimals' parameter.")
        clean_str = val_str.strip()
        try:
            d = Decimal(clean_str)
            if not d.is_finite():
                raise ProfileCompositionError(
                    "Cannot format value with operation 'round_decimal': non-finite decimal value."
                )
            exp = Decimal("10") ** -format_cfg.decimals
            rounded = d.quantize(exp, rounding=ROUND_HALF_UP)
            res = f"{rounded:.{format_cfg.decimals}f}"
        except ProfileCompositionError:
            raise
        except (InvalidOperation, ValueError, TypeError) as exc:
            raise ProfileCompositionError(
                "Cannot format value with operation 'round_decimal': invalid numeric value."
            ) from exc

    elif format_cfg.operation == "pad_left":
        if format_cfg.width is None:
            raise ProfileCompositionError("Operation 'pad_left' requires 'width' parameter.")
        fill_char = format_cfg.fill_char or "0"
        width = format_cfg.width
        res = val_str.rjust(width, fill_char)

    elif format_cfg.operation == "upper":
        res = val_str.upper()

    elif format_cfg.operation == "lower":
        res = val_str.lower()

    elif format_cfg.operation == "strip":
        res = val_str.strip()

    if format_cfg.unit_suffix:
        res += format_cfg.unit_suffix

    return res


def validate_code128_payload(payload: str, slot_id: str) -> None:
    """Validates that payload conforms to Code128-B printable ASCII (32-126) and contains no newlines."""
    if not payload:
        raise SymbologyMismatchError(f"Barcode payload for slot '{slot_id}' cannot be empty.")
    if "\n" in payload or "\r" in payload or "\t" in payload:
        raise SymbologyMismatchError(
            f"Barcode payload for slot '{slot_id}' contains newline or tab characters, which are forbidden in Code128."
        )
    for ch in payload:
        code = ord(ch)
        if code < 32 or code > 126:
            raise SymbologyMismatchError(
                f"Barcode payload for slot '{slot_id}' contains character (ASCII {code}) outside printable Code128."
            )


def validate_qr_payload(payload: str, slot_id: str, max_length: int = 512) -> None:
    """Validates that QR payload is non-empty and within length limits."""
    if not payload:
        raise SymbologyMismatchError(f"QR payload for slot '{slot_id}' cannot be empty.")
    if len(payload) > max_length:
        raise SymbologyMismatchError(
            f"QR payload for slot '{slot_id}' exceeds max length {max_length} (got {len(payload)})."
        )


class ProfileComposer:
    """Stateless composition engine resolving raw SAP facts into structured element values."""

    @classmethod
    def resolve_field_segment(
        cls,
        item: RawSapItemSnapshotV2,
        segment: FieldSegment,
        chars_by_name: Dict[str, Any],
        simulation_tolerant: bool = False,
        missing_fields: Optional[List[str]] = None,
    ) -> str:
        """Resolves a FieldSegment against an item snapshot, distinguishing absent vs null vs empty."""
        state = "absent"
        raw_val = None

        if segment.source == "business_context":
            ctx = item.business_context
            if ctx is not None and ctx.has_field(segment.field_name):
                val = ctx.get_raw_value(segment.field_name)
                if val is None:
                    state = "null"
                elif isinstance(val, str) and not val.strip():
                    state = "empty"
                else:
                    state = "present"
                    raw_val = val
            else:
                state = "absent"

        elif segment.source == "characteristics":
            target_name = segment.field_name.strip().upper()
            if target_name in chars_by_name:
                val = chars_by_name[target_name]
                if val is None:
                    state = "null"
                elif isinstance(val, str) and not val.strip():
                    state = "empty"
                else:
                    state = "present"
                    raw_val = val
            else:
                state = "absent"

        # Apply granular policy for non-present states
        if state != "present":
            if simulation_tolerant:
                if missing_fields is not None:
                    missing_fields.append(segment.field_name)
                return "--"
            policy: EmptyPolicy = getattr(segment, f"on_{state}")
            if policy == "block":
                raise EmptyFieldBlockedError(
                    f"Field '{segment.source}.{segment.field_name}' is {state} in item sequence {item.item_sequence} "
                    f"and on_{state} policy is 'block'."
                )
            elif policy == "omit":
                return ""
            elif policy == "marker":
                return segment.marker_value or ""

        # Value is present -> apply safe formatting
        return apply_field_formatting(raw_val, segment.format)

    @classmethod
    def compose_item(
        cls,
        item: RawSapItemSnapshotV2,
        profile: LabelProfileConfig,
        simulation_tolerant: bool = False,
    ) -> ProfileCompositionResult:
        """Composes all configured elements for a single raw item according to profile rules."""
        # Normalize characteristics lookup once
        chars_by_name: Dict[str, Any] = {}
        for char in item.characteristics:
            norm_name = char.name.strip().upper()
            chars_by_name[norm_name] = char.value

        composed_fields: Dict[str, Any] = {}
        composed_codes: Dict[str, Any] = {}
        element_audit: Dict[str, Any] = {}
        missing_fields: List[str] = []

        for elem in profile.elements:
            assembled_parts: List[str] = []
            missing_before_element = len(missing_fields)
            for seg in elem.segments:
                if isinstance(seg, LiteralSegment) or seg.type == "literal":
                    assembled_parts.append(seg.value)
                elif isinstance(seg, FieldSegment) or seg.type == "field":
                    part = cls.resolve_field_segment(
                        item,
                        seg,
                        chars_by_name,
                        simulation_tolerant=simulation_tolerant,
                        missing_fields=missing_fields,
                    )
                    assembled_parts.append(part)

            assembled_str = "".join(assembled_parts)

            # Length validation
            if len(assembled_str) > elem.max_length:
                raise ProfileCompositionError(
                    f"Assembled output for slot '{elem.slot_id}' length ({len(assembled_str)}) "
                    f"exceeds maximum allowed length {elem.max_length}."
                )

            # Symbology validation
            if elem.output_type == "barcode":
                if not (simulation_tolerant and len(missing_fields) > missing_before_element):
                    validate_code128_payload(assembled_str, elem.slot_id)
                    composed_codes[elem.slot_id] = assembled_str
            elif elem.output_type == "qr":
                if not (simulation_tolerant and len(missing_fields) > missing_before_element):
                    validate_qr_payload(assembled_str, elem.slot_id, max_length=elem.max_length)
                    composed_codes[elem.slot_id] = assembled_str
            elif elem.output_type == "text":
                composed_fields[elem.slot_id] = assembled_str

            element_audit[elem.slot_id] = {
                "output_type": elem.output_type,
                "symbology": elem.symbology,
                "length": len(assembled_str),
                "segments_count": len(elem.segments),
            }

        # Deterministic composition hash (SHA-256 over normalized composed envelope)
        comp_envelope = {
            "fields": composed_fields,
            "codes": composed_codes,
            "label_code": profile.label_code,
            "profile_version": profile.profile_version,
        }
        comp_json = json.dumps(comp_envelope, sort_keys=True)
        comp_hash = hashlib.sha256(comp_json.encode("utf-8")).hexdigest()

        audit_metadata = {
            "label_code": profile.label_code,
            "profile_version": profile.profile_version,
            "status": profile.status,
            "is_production_approved": profile.is_production_approved,
            "template_version_id": profile.template_version_id,
            "composition_hash": comp_hash,
            "elements": element_audit,
            "missing_fields": sorted(set(missing_fields)),
            "simulation_tolerant": simulation_tolerant,
        }

        return ProfileCompositionResult(
            label_code=profile.label_code,
            profile_version=profile.profile_version,
            template_version_id=profile.template_version_id,
            fields=composed_fields,
            codes=composed_codes,
            composition_hash=comp_hash,
            audit_metadata=audit_metadata,
        )

    @classmethod
    def validate_template_compatibility(
        cls,
        profile: LabelProfileConfig,
        template_version_id: Optional[str] = None,
    ) -> None:
        """Validates that the target SVG template contains all slots declared in profile elements."""
        target_template = template_version_id or profile.template_version_id
        detail = TemplateService.get_template_detail(target_template)
        if not detail:
            raise ValueError(f"Target SVG template '{target_template}' was not found on filesystem.")

        for elem in profile.elements:
            slot = elem.slot_id
            if elem.output_type == "barcode":
                if slot in detail.qr_fields or slot not in detail.barcode_fields:
                    raise TemplateSlotMissingError(
                        f"Template '{target_template}' is missing 1D barcode slot '{slot}' "
                        f"required by profile '{profile.label_code}' version '{profile.profile_version}'. "
                        f"(Found barcode slots: {detail.barcode_fields})"
                    )
                if slot not in ("batch_barcode", "roll_barcode", "material_barcode"):
                    raise TemplateSlotMissingError(
                        f"Barcode slot '{slot}' is not supported by the renderer contract."
                    )
            elif elem.output_type == "qr":
                if slot in detail.barcode_fields or slot not in detail.qr_fields:
                    raise TemplateSlotMissingError(
                        f"Template '{target_template}' is missing 2D QR slot '{slot}' "
                        f"required by profile '{profile.label_code}' version '{profile.profile_version}'. "
                        f"(Found QR slots: {detail.qr_fields})"
                    )
                if slot not in ("qr_payload",):
                    raise TemplateSlotMissingError(
                        f"QR slot '{slot}' is not supported by the renderer contract."
                    )
            elif elem.output_type == "text":
                if slot in detail.barcode_fields or slot in detail.qr_fields:
                    raise TemplateSlotMissingError(
                        f"Slot '{slot}' is a code slot in template '{target_template}', not a text token."
                    )
                if slot not in detail.tokens:
                    raise TemplateSlotMissingError(
                        f"Template '{target_template}' is missing text token '{{{{{slot}}}}}' "
                        f"required by profile '{profile.label_code}' version '{profile.profile_version}'."
                    )

    @classmethod
    def adapt_generic_item(
        cls,
        item: RawSapItemSnapshotV2,
        profile: LabelProfileConfig,
    ) -> Tuple[Any, str, Dict[str, Any]]:
        """Adapts a generic RawSapItemSnapshotV2 into canonical item data using the given profile."""
        from .sap_shadow_service import (
            SapCanonicalCodes,
            SapCanonicalFields,
            SapCanonicalItemData,
        )

        comp_result = cls.compose_item(item, profile)

        chars_by_name: Dict[str, Any] = {}
        for char in item.characteristics:
            norm_name = char.name.strip().upper()
            chars_by_name[norm_name] = char.value

        ctx = item.business_context

        def _get_val(ctx_key: str, char_keys: List[str]) -> Optional[Any]:
            if ctx and ctx.has_field(ctx_key):
                v = ctx.get_raw_value(ctx_key)
                if v is not None:
                    return v
            for ck in char_keys:
                if ck in chars_by_name and chars_by_name[ck] is not None:
                    return chars_by_name[ck]
            return None

        fields_dict: Dict[str, Any] = {}
        mat_no = _get_val("material_number", ["ZZMATERIAL", "ZZMATNR"])
        if mat_no is not None:
            fields_dict["material_number"] = str(mat_no)
            fields_dict["material_code"] = str(mat_no)

        batch_no = _get_val("batch_number", ["ZZBATCH", "ZZCHARG"])
        if batch_no is not None:
            fields_dict["batch_number"] = str(batch_no)
            fields_dict["batch_text"] = str(batch_no)

        roll_no = _get_val("roll_number", ["ZZROLL", "ZZROLLNO"])
        if roll_no is not None:
            fields_dict["roll_number"] = str(roll_no)
            fields_dict["roll_no"] = str(roll_no)

        brand = _get_val("brand", ["ZZBRAND"])
        if brand is not None:
            fields_dict["brand"] = str(brand)

        type_film = _get_val("type_film", ["ZZTYPEFILM", "ZZFILMTYPE"])
        if type_film is not None:
            fields_dict["type_film"] = str(type_film)

        base_film = _get_val("base_film", ["ZZBASEFILM"])
        if base_film is not None:
            fields_dict["base_film"] = str(base_film)

        # Merge text elements composed by profile
        fields_dict.update(comp_result.fields)

        canonical_fields = SapCanonicalFields(**fields_dict)

        canonical_codes = None
        if comp_result.codes:
            canonical_codes = SapCanonicalCodes(
                batch_barcode=comp_result.codes.get("batch_barcode"),
                roll_barcode=comp_result.codes.get("roll_barcode"),
                material_barcode=comp_result.codes.get("material_barcode"),
                qr_payload=comp_result.codes.get("qr_payload"),
            )

        canonical_item = SapCanonicalItemData(
            contract_version="1.1",
            fields=canonical_fields,
            codes=canonical_codes,
        )

        return canonical_item, profile.template_version_id, comp_result.audit_metadata


class ProfileRegistry:
    """Thread-safe registry of immutable versioned label profiles."""

    _lock = threading.RLock()
    _profiles: Dict[Tuple[str, str], LabelProfileConfig] = {}
    _latest_versions: Dict[str, str] = {}
    _active_versions: Dict[str, str] = {}

    @classmethod
    def register(cls, profile: LabelProfileConfig) -> None:
        """Registers an immutable profile configuration. Rejects conflicting re-registrations."""
        with cls._lock:
            key = (profile.label_code, profile.profile_version)
            if key in cls._profiles:
                existing = cls._profiles[key]
                if existing.model_dump() != profile.model_dump():
                    raise ProfileImmutabilityError(
                        f"Profile '{profile.label_code}' version '{profile.profile_version}' is already registered "
                        "with a different configuration. Profile versions are strictly immutable."
                    )
                return

            profile_copy = copy.deepcopy(profile)
            cls._profiles[key] = profile_copy
            cls._latest_versions[profile.label_code] = profile.profile_version
            if profile.label_code not in cls._active_versions:
                cls._active_versions[profile.label_code] = profile.profile_version
            logger.info("Registered label profile: %s version %s (status: %s)", profile.label_code, profile.profile_version, profile.status)

    @classmethod
    def get(cls, label_code: str, profile_version: Optional[str] = None) -> Optional[LabelProfileConfig]:
        """Retrieves profile configuration by label_code and optional version."""
        with cls._lock:
            if not profile_version:
                profile_version = cls._active_versions.get(label_code) or cls._latest_versions.get(label_code)
                if not profile_version:
                    return None
            profile = cls._profiles.get((label_code, profile_version))
            return copy.deepcopy(profile) if profile else None

    @classmethod
    def set_active_version(cls, label_code: str, version: str) -> None:
        """Pins the application-approved active version for a label_code."""
        with cls._lock:
            if (label_code, version) not in cls._profiles:
                raise ProfileNotFoundError(
                    f"Cannot set active version: Profile '{label_code}' version '{version}' is not registered."
                )
            cls._active_versions[label_code] = version
            logger.info("Pinned active version for %s: %s", label_code, version)

    @classmethod
    def get_active_version(cls, label_code: str) -> Optional[str]:
        """Returns the application-approved active version for a label_code."""
        with cls._lock:
            return cls._active_versions.get(label_code)

    @classmethod
    def has_profile(cls, label_code: str, profile_version: Optional[str] = None) -> bool:
        """Checks whether a profile exists."""
        return cls.get(label_code, profile_version) is not None

    @classmethod
    def list_profiles(cls) -> List[LabelProfileConfig]:
        """Returns deep copies of all registered profiles."""
        with cls._lock:
            return [copy.deepcopy(p) for p in cls._profiles.values()]

    @classmethod
    def clear_for_tests(cls) -> None:
        """Resets registry to clean state and re-registers standard default development profiles."""
        with cls._lock:
            cls._profiles.clear()
            cls._latest_versions.clear()
            cls._active_versions.clear()
            cls._register_defaults()

    @classmethod
    def _register_defaults(cls) -> None:
        """Pre-registers default development profiles for Safe Demo."""
        # N001 Development Profile v0.1.0-dev
        n001_qr_element = ProfileElementConfig(
            slot_id="qr_payload",
            output_type="qr",
            symbology="qr",
            max_length=512,
            segments=[
                LiteralSegment(value="Batch : "),
                FieldSegment(source="business_context", field_name="batch_number", on_absent="block"),
                LiteralSegment(value="\nPanjang : "),
                FieldSegment(source="characteristics", field_name="ZZLENGTH", on_absent="block"),
                LiteralSegment(value=" Meter"),
            ],
        )

        n001_barcode_element = ProfileElementConfig(
            slot_id="batch_barcode",
            output_type="barcode",
            symbology="code128",
            max_length=128,
            segments=[
                FieldSegment(source="business_context", field_name="batch_number", on_absent="block"),
            ],
        )

        n001_dev_profile = LabelProfileConfig(
            label_code="N001",
            profile_version="0.1.0-dev",
            status="development",
            is_production_approved=False,
            template_version_id="label_roll_80x200",
            elements=[n001_qr_element, n001_barcode_element],
            description="N001 Development Safe Demo Profile assembling synthetic QR and Code128 batch barcode.",
        )
        cls.register(n001_dev_profile)


# Initialize default profiles on module load
ProfileRegistry._register_defaults()
