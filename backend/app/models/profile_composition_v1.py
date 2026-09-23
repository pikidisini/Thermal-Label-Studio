"""Profile Composition V1 Models (B2B2L).

Defines the generic, versioned, structured label profile composition schema:
- Enables composition of text, 1D barcode (code128), and 2D QR matrix (qr) payloads.
- Elements assemble raw SAP business facts (business_context and characteristics) with fixed literals.
- Distinguishes absent, null, and empty string conditions with fail-closed policies (block, omit, marker).
- Prohibits executable expressions, arbitrary code evaluators (eval/exec), network URLs, and secrets.
- Enforces strict length, segment count, and symbology constraints.
- Guarantees extra="forbid" on all configuration structures.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Dict, List, Literal, Optional, Set, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing_extensions import Self

# Allowed business context fields (strictly vetted allowlist)
ALLOWED_BUSINESS_CONTEXT_FIELDS: Set[str] = {
    "material_number",
    "material_description",
    "batch_number",
    "roll_number",
    "sales_order",
    "sales_order_item",
    "customer_text",
    "customer_name",
    "customer_order_number",
    "production_date",
    "type_film",
    "base_film",
    "gross_weight_kg",
    "net_weight_kg",
    "width_mm",
    "length_m",
    "used_before",
    "core_inch",
    "treatment_inside",
    "treatment_outside",
    "brand",
}

# Forbidden security and infrastructure keywords in keys / literals
FORBIDDEN_KEY_SUBSTRINGS = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "private_key",
    "destination",
    "connection_string",
    "connectionstring",
    "conn_str",
    "auth_header",
    "authorization",
    "db_pass",
    "target_ip",
    "dest_host",
    "printer_port",
    "provenance",
    "audit",
    "source_metadata",
)

# Forbidden executable substrings
FORBIDDEN_EXECUTABLE_SUBSTRINGS = (
    "<script",
    "</script",
    "javascript:",
    "eval(",
    "exec(",
    "__import__",
    "subprocess.",
    "subprocess",
    "os.system",
    "os.popen",
    "os.",
    "sys.",
    "shutil.",
    "pty.spawn",
    "__",
    "${",
    "{{",
    "}}",
)

# Forbidden URL prefixes (no network endpoints in configurations)
FORBIDDEN_URL_PREFIXES = ("http://", "https://", "ftp://", "smb://", "tcp://")

EmptyPolicy = Literal["block", "omit", "marker"]
ElementOutputType = Literal["text", "barcode", "qr"]
SymbologyType = Literal["code128", "qr"]
FormattingOperation = Literal["round_decimal", "pad_left", "upper", "lower", "strip"]


def sanitize_security_text(val: str, field_desc: str) -> None:
    """Validates string against sensitive security, executable, or network patterns."""
    lower_val = val.lower()
    for sub in FORBIDDEN_KEY_SUBSTRINGS:
        if sub in lower_val:
            raise ValueError(f"Forbidden security keyword '{sub}' detected in {field_desc}.")
    for sub in FORBIDDEN_EXECUTABLE_SUBSTRINGS:
        if sub in lower_val:
            raise ValueError(f"Forbidden executable pattern '{sub}' detected in {field_desc}.")
    for prefix in FORBIDDEN_URL_PREFIXES:
        if lower_val.startswith(prefix) or f" {prefix}" in lower_val:
            raise ValueError(f"Network URLs are forbidden in {field_desc}.")


class FieldFormatConfig(BaseModel):
    """Configuration for safe, explicit formatting operations without code evaluation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    operation: Optional[FormattingOperation] = Field(
        default=None,
        description="Formatting operation to apply",
    )
    decimals: Optional[int] = Field(
        default=None,
        ge=0,
        le=6,
        description="Decimal places for round_decimal operation",
    )
    width: Optional[int] = Field(
        default=None,
        ge=1,
        le=64,
        description="Total character width for pad_left operation",
    )
    fill_char: Optional[str] = Field(
        default="0",
        min_length=1,
        max_length=1,
        description="Single fill character for pad_left (default: '0')",
    )
    unit_suffix: Optional[str] = Field(
        default=None,
        max_length=16,
        description="Optional unit suffix literal appended to formatted value (e.g. ' Meter', ' KG')",
    )

    @field_validator("unit_suffix")
    @classmethod
    def validate_unit_suffix(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            sanitize_security_text(v, "unit_suffix")
        return v

    @model_validator(mode="after")
    def validate_operation_params(self) -> Self:
        if self.operation == "round_decimal" and self.decimals is None:
            raise ValueError("Operation 'round_decimal' requires 'decimals' parameter.")
        if self.operation == "pad_left" and self.width is None:
            raise ValueError("Operation 'pad_left' requires 'width' parameter.")
        return self


class LiteralSegment(BaseModel):
    """A fixed literal text segment (e.g. 'Batch : ', '\\nPanjang : ', ' Meter')."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["literal"] = "literal"
    value: str = Field(..., max_length=256, description="Literal text content")

    @field_validator("value")
    @classmethod
    def validate_literal_value(cls, v: str) -> str:
        sanitize_security_text(v, "literal segment value")
        return v


class FieldSegment(BaseModel):
    """A raw SAP business fact reference from business_context or characteristics."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["field"] = "field"
    source: Literal["business_context", "characteristics"] = Field(
        ...,
        description="Source of raw SAP fact",
    )
    field_name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_]+$",
        description="Field name or SAP characteristic name (e.g. 'batch_number', 'ZZLENGTH')",
    )
    format: Optional[FieldFormatConfig] = Field(
        default=None,
        description="Optional safe formatting rule",
    )
    on_absent: EmptyPolicy = Field(
        default="block",
        description="Policy when field was not sent by SAP (absent)",
    )
    on_null: EmptyPolicy = Field(
        default="block",
        description="Policy when field was sent with null value",
    )
    on_empty: EmptyPolicy = Field(
        default="block",
        description="Policy when field was sent with empty string value",
    )
    marker_value: Optional[str] = Field(
        default=None,
        max_length=32,
        description="Bounded literal string used when policy resolves to 'marker' (e.g. '-', 'N/A')",
    )

    @field_validator("field_name")
    @classmethod
    def validate_field_name_security(cls, v: str) -> str:
        sanitize_security_text(v, "field_name")
        return v

    @field_validator("marker_value")
    @classmethod
    def validate_marker_value(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            sanitize_security_text(v, "marker_value")
        return v

    @model_validator(mode="after")
    def validate_field_constraints(self) -> Self:
        # Validate business_context allowlist
        if self.source == "business_context":
            if self.field_name not in ALLOWED_BUSINESS_CONTEXT_FIELDS:
                allowed_sorted = sorted(ALLOWED_BUSINESS_CONTEXT_FIELDS)
                raise ValueError(
                    f"Disallowed or unknown business_context field '{self.field_name}'. "
                    f"Allowed fields: {allowed_sorted}"
                )

        # Validate characteristic name length
        if self.source == "characteristics":
            if len(self.field_name) > 30:
                raise ValueError(
                    f"Characteristic name '{self.field_name}' exceeds SAP maximum length of 30 characters."
                )

        # Validate marker value requirement
        has_marker_policy = any(p == "marker" for p in (self.on_absent, self.on_null, self.on_empty))
        if has_marker_policy:
            if self.marker_value is None:
                raise ValueError("marker_value must be provided when any empty policy is set to 'marker'.")

        return self


SegmentConfig = Annotated[Union[LiteralSegment, FieldSegment], Field(discriminator="type")]


class ProfileElementConfig(BaseModel):
    """Configuration for a single composed label element (text slot, barcode, or QR)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    slot_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Target template slot / placeholder identifier (e.g. 'batch_barcode', 'qr_payload')",
    )
    output_type: ElementOutputType = Field(
        ...,
        description="Output element kind: 'text', 'barcode', or 'qr'",
    )
    symbology: Optional[SymbologyType] = Field(
        default=None,
        description="Symbology for code output ('code128' for barcode, 'qr' for qr, None for text)",
    )
    segments: List[SegmentConfig] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Ordered list of segments (1 to 20) assembled to build the payload",
    )
    max_length: int = Field(
        default=128,
        ge=1,
        le=512,
        description="Maximum permitted output string length",
    )

    @field_validator("slot_id")
    @classmethod
    def validate_slot_id_security(cls, v: str) -> str:
        sanitize_security_text(v, "slot_id")
        return v

    @model_validator(mode="after")
    def validate_symbology_and_limits(self) -> Self:
        if self.output_type == "barcode":
            if self.symbology != "code128":
                raise ValueError(
                    f"Barcode element '{self.slot_id}' requires symbology='code128'. "
                    f"Got '{self.symbology}'."
                )
            if self.max_length > 128:
                raise ValueError(f"1D Barcode element '{self.slot_id}' max_length cannot exceed 128.")
        elif self.output_type == "qr":
            if self.symbology != "qr":
                raise ValueError(
                    f"QR element '{self.slot_id}' requires symbology='qr'. "
                    f"Got '{self.symbology}'."
                )
            if self.max_length > 512:
                raise ValueError(f"2D QR element '{self.slot_id}' max_length cannot exceed 512.")
        elif self.output_type == "text":
            if self.symbology is not None:
                raise ValueError(f"Text element '{self.slot_id}' must not have a symbology.")
            if self.max_length > 256:
                raise ValueError(f"Text element '{self.slot_id}' max_length cannot exceed 256.")

        return self


class LabelProfileConfig(BaseModel):
    """Generic versioned label profile configuration."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    label_code: str = Field(
        ...,
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Target business label code (e.g. 'N001')",
    )
    profile_version: str = Field(
        ...,
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z0-9._-]+$",
        description="Immutable semantic profile version (e.g. '0.1.0-dev')",
    )
    status: Literal["development", "approved"] = Field(
        default="development",
        description="Profile lifecycle state ('development' or 'approved')",
    )
    is_production_approved: bool = Field(
        default=False,
        description="Strict production approval gate flag (must remain False for development profiles)",
    )
    template_version_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Target SVG template identifier (e.g. 'label_roll_80x200')",
    )
    elements: List[ProfileElementConfig] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of configured elements (1 to 50)",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=256,
        description="Human-readable description of this profile configuration",
    )

    @field_validator("description", "template_version_id")
    @classmethod
    def validate_meta_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            sanitize_security_text(v, "metadata field")
        return v

    @model_validator(mode="after")
    def validate_unique_slots_and_approval(self) -> Self:
        # Check slot_id uniqueness within profile
        seen_slots: Set[str] = set()
        for elem in self.elements:
            norm = elem.slot_id.lower()
            if norm in seen_slots:
                raise ValueError(f"Duplicate slot_id '{elem.slot_id}' in profile elements.")
            seen_slots.add(norm)

        # Enforce production approval consistency
        if self.status == "development" and self.is_production_approved:
            raise ValueError("Development profiles cannot have is_production_approved=True.")

        return self


class ProfileCompositionResult(BaseModel):
    """Result of profile composition execution for an item."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    label_code: str
    profile_version: str
    template_version_id: str
    fields: Dict[str, Any]
    codes: Dict[str, Any]
    composition_hash: str
    audit_metadata: Dict[str, Any]
