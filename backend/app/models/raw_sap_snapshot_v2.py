"""Raw SAP Snapshot v2 Pydantic and Domain Models.

Implements the extensible raw SAP snapshot ingestion contract for B2B2K:
- Preserves complete batch characteristics collection (known and unknown).
- Preserves extensible business_context with strict distinction between absent, null, and empty.
- Rejects duplicate characteristic names, malformed scalar types, and unbounded structures.
- Enforces strict recursive data hygiene: rejects secrets, network endpoints, and executable strings.
- Enforces copies == 1 and positive item_sequence for Safe Demo simulation.
- Reusable server-side validation boundary ensuring zero live SAP or physical printer dependencies.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing_extensions import Self

# Forbidden key substrings for security & infrastructure hygiene
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
)

# Forbidden tokenized key segments (splitting by '_', '-', '.', '/', space)
FORBIDDEN_KEY_SEGMENTS = {
    "host",
    "port",
    "ip",
    "rfc",
    "sm59",
    "dest",
    "key",
}

# Forbidden executable substrings in string values
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
    "shutil.",
    "pty.spawn",
)


def check_key_security(key: str, path: str = "") -> None:
    """Validates key against sensitive security/infrastructure patterns."""
    if len(key) > 64:
        raise ValueError(f"Key '{key}' at '{path}' exceeds maximum permitted length of 64 characters.")

    clean_key = key.strip()
    if not clean_key:
        raise ValueError(f"Blank key at '{path}' is forbidden.")

    lower_key = clean_key.lower()
    for sub in FORBIDDEN_KEY_SUBSTRINGS:
        if sub in lower_key:
            raise ValueError(f"Forbidden security/infrastructure key pattern '{sub}' detected in '{key}' at '{path}'.")

    # Check tokenized segments (e.g. "my_host", "dest", "printer_port", "ip", "rfc")
    segments = set(re.split(r"[_.\-/\s]+", lower_key))
    matched_segments = segments.intersection(FORBIDDEN_KEY_SEGMENTS)
    if matched_segments:
        raise ValueError(
            f"Forbidden security/infrastructure key segment {matched_segments} detected in '{key}' at '{path}'."
        )


def validate_untrusted_data(
    val: Any,
    path: str = "root",
    depth: int = 0,
    max_depth: int = 3,
    allow_lists: bool = True,
) -> None:
    """Recursively validates untrusted input values and structures."""
    if depth > max_depth:
        raise ValueError(f"Nesting depth limit ({max_depth}) exceeded at '{path}'.")

    # Reject non-finite numbers (NaN, Infinity, -Infinity)
    if isinstance(val, (float, int)) and not isinstance(val, bool):
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            raise ValueError(f"Non-finite numeric value (NaN/Infinity) is strictly forbidden at '{path}'.")
        return

    if val is None or isinstance(val, bool):
        return

    if isinstance(val, str):
        if len(val) > 512:
            raise ValueError(f"String value at '{path}' exceeds maximum length of 512 characters ({len(val)} chars).")
        lower_val = val.lower()
        for pat in FORBIDDEN_EXECUTABLE_SUBSTRINGS:
            if pat in lower_val:
                raise ValueError(f"Forbidden executable pattern '{pat}' detected in value at '{path}'.")
        for pat in ("password=", "passwd=", "bearer ", "token="):
            if pat in lower_val:
                raise ValueError(f"Sensitive credential pattern detected in value at '{path}'.")
        return

    if isinstance(val, dict):
        if len(val) > 30:
            raise ValueError(f"Dictionary at '{path}' contains {len(val)} entries, exceeding maximum 30.")
        for k, v in val.items():
            if not isinstance(k, str):
                raise ValueError(f"Non-string dictionary key at '{path}': {type(k).__name__}")
            sub_path = f"{path}.{k}"
            check_key_security(k, path=sub_path)
            validate_untrusted_data(v, path=sub_path, depth=depth + 1, max_depth=max_depth, allow_lists=allow_lists)
        return

    if isinstance(val, list):
        if not allow_lists:
            raise ValueError(f"Lists/arrays are not permitted in business_context at '{path}'.")
        if len(val) > 100:
            raise ValueError(f"List at '{path}' exceeds maximum 100 entries.")
        for idx, item in enumerate(val):
            validate_untrusted_data(item, path=f"{path}[{idx}]", depth=depth + 1, max_depth=max_depth, allow_lists=allow_lists)
        return

    raise ValueError(f"Unsupported value type '{type(val).__name__}' at '{path}'.")


class SapSourceMetadata(BaseModel):
    """Restricted audit metadata originating from SAP."""

    model_config = ConfigDict(extra="forbid")

    werks: Optional[str] = Field(default=None, max_length=8, description="SAP Plant code (e.g. 1100)")
    lgort: Optional[str] = Field(default=None, max_length=8, description="SAP Storage location (e.g. 0001)")
    sap_user: Optional[str] = Field(default=None, max_length=32, description="SAP User ID (e.g. M_PPIC)")
    system_id: Optional[str] = Field(default=None, max_length=16, description="SAP System ID (e.g. PRD, QAS)")
    transaction_code: Optional[str] = Field(default=None, max_length=20, description="SAP T-Code (e.g. ZLABEL)")

    @model_validator(mode="after")
    def validate_metadata_hygiene(self) -> Self:
        for k in self.model_fields_set:
            v = getattr(self, k)
            if v is not None:
                validate_untrusted_data(v, path=f"source_metadata.{k}", depth=1, max_depth=2, allow_lists=False)
        return self


class RawCharacteristicItem(BaseModel):
    """Represents a single raw SAP batch characteristic item.

    Extensible and non-lossy: any valid SAP characteristic is preserved even if
    current application rules do not reference it.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_./-]+$",
        description="SAP characteristic name (e.g. ZZWIDTH, ZZCONVERSIONROLLKG)",
    )
    value: Optional[Union[str, int, float, bool]] = Field(
        default=None,
        description="Scalar characteristic value (string, numeric, boolean, or null)",
    )
    value_type: Optional[str] = Field(
        default=None,
        max_length=32,
        description="Optional scalar type indicator (e.g. string, number, char, date)",
    )
    unit: Optional[str] = Field(
        default=None,
        max_length=16,
        description="Optional unit of measurement (e.g. KG, MM, M, or null)",
    )
    source: Optional[str] = Field(
        default="batch_classification",
        max_length=64,
        description="Source classification category within SAP",
    )

    @field_validator("name")
    @classmethod
    def validate_name_hygiene(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Characteristic name cannot be blank or whitespace.")
        check_key_security(clean, path="characteristic.name")
        return clean

    @field_validator("value")
    @classmethod
    def validate_value_hygiene(cls, v: Optional[Union[str, int, float, bool]]) -> Optional[Union[str, int, float, bool]]:
        validate_untrusted_data(v, path="characteristic.value", depth=1, max_depth=2, allow_lists=False)
        return v

    @field_validator("unit", "value_type", "source")
    @classmethod
    def validate_other_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            validate_untrusted_data(v, path="characteristic.field", depth=1, max_depth=2, allow_lists=False)
        return v


class RawBusinessContext(BaseModel):
    """Extensible non-characteristic facts for a label item.

    Maintains distinct semantics for:
    - Key absent: fact is not provided by this SAP interface.
    - Key present with null: SAP provides the field but has no value for this item.
    - Key present with "": SAP provides an intentionally empty text value.

    Permits extensible business facts while forbidding secrets, network configurations,
    or executable payloads.
    """

    model_config = ConfigDict(extra="allow")

    # Common non-characteristic facts
    material_number: Optional[str] = Field(default=None, max_length=64)
    material_description: Optional[str] = Field(default=None, max_length=128)
    batch_number: Optional[str] = Field(default=None, max_length=64)
    roll_number: Optional[str] = Field(default=None, max_length=64)
    sales_order: Optional[str] = Field(default=None, max_length=64)
    sales_order_item: Optional[str] = Field(default=None, max_length=32)
    customer_text: Optional[str] = Field(default=None, max_length=256)
    customer_name: Optional[str] = Field(default=None, max_length=128)
    customer_order_number: Optional[str] = Field(default=None, max_length=64)
    production_date: Optional[str] = Field(default=None, max_length=32)
    production_date_provenance: Optional[Dict[str, Any]] = None

    def has_field(self, field_name: str) -> bool:
        """Returns True if field_name was explicitly sent in the incoming payload (even if null or empty)."""
        if field_name in self.model_fields_set:
            return True
        if self.__pydantic_extra__ and field_name in self.__pydantic_extra__:
            return True
        return False

    def get_raw_value(self, field_name: str) -> Any:
        """Retrieves value if field was explicitly sent; otherwise returns None."""
        if not self.has_field(field_name):
            return None
        if field_name in self.__class__.model_fields:
            return getattr(self, field_name)
        if self.__pydantic_extra__:
            return self.__pydantic_extra__.get(field_name)
        return None

    @model_validator(mode="after")
    def validate_security_and_hygiene(self) -> Self:
        """Validates all fields (defined and extra) recursively against security rules and depth limits."""
        all_items: Dict[str, Any] = {}
        for k in self.model_fields_set:
            all_items[k] = getattr(self, k)
        if self.__pydantic_extra__:
            if len(self.__pydantic_extra__) > 30:
                raise ValueError(
                    f"Too many extra fields in business_context ({len(self.__pydantic_extra__)}), maximum permitted is 30."
                )
            all_items.update(self.__pydantic_extra__)

        for key, val in all_items.items():
            check_key_security(key, path=f"business_context.{key}")
            # Recursively validate value, strictly forbidding lists in business_context
            validate_untrusted_data(val, path=f"business_context.{key}", depth=1, max_depth=3, allow_lists=False)

        return self


class RawSapItemSnapshotV2(BaseModel):
    """Raw SAP snapshot item for simulation."""

    model_config = ConfigDict(extra="forbid")

    item_sequence: int = Field(
        ...,
        ge=1,
        description="Sequence number of label within batch (1-indexed, strictly unique, positive)",
    )
    label_code: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Business label code (e.g. N001). Checked fail-closed by rule router.",
    )
    copies: Literal[1] = Field(
        default=1,
        description="Number of copies (strictly 1 for Safe Demo simulation per AC 6 / P2-2)",
    )
    characteristics: List[RawCharacteristicItem] = Field(
        default_factory=list,
        max_length=100,
        description="Extensible batch characteristics collection",
    )
    business_context: Optional[RawBusinessContext] = Field(
        default=None,
        description="Optional extensible non-characteristic facts",
    )

    @field_validator("label_code")
    @classmethod
    def validate_label_code_hygiene(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("label_code cannot be blank or whitespace.")
        validate_untrusted_data(clean, path="item.label_code", depth=1, max_depth=1, allow_lists=False)
        return clean

    @model_validator(mode="after")
    def validate_no_duplicate_characteristics(self) -> Self:
        """Enforces that characteristic names within an item are strictly unique (case-insensitive)."""
        seen: set[str] = set()
        for char in self.characteristics:
            normalized = char.name.strip().upper()
            if normalized in seen:
                raise ValueError(
                    f"Duplicate characteristic name '{char.name}' in item sequence {self.item_sequence}. "
                    "Duplicate characteristics are strictly forbidden."
                )
            seen.add(normalized)
        return self


class RawSapBatchSnapshotV2(BaseModel):
    """Extensible Raw SAP Snapshot v2 batch envelope."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    contract_schema_version: str = Field(
        default="2.0-raw",
        max_length=16,
        description="Raw snapshot schema version",
    )
    notice: Optional[str] = Field(default=None, alias="_notice", max_length=512)
    fixture_notice: Optional[str] = Field(default=None, alias="_fixture_notice", max_length=512)
    producer_namespace: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="SAP producer namespace (e.g. SAP_PPIC, SAP_WM)",
    )
    request_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Unique business request/idempotency key from SAP transaction",
    )
    printer_id: Optional[str] = Field(
        default="PILOT-PRINTER-01",
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Logical printer target resolved server-side to virtual profile",
    )
    items: List[RawSapItemSnapshotV2] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of raw label snapshot items ordered by item_sequence",
    )
    source_metadata: Optional[SapSourceMetadata] = Field(
        default=None,
        description="Optional non-functional metadata from SAP (restricted audit fields)",
    )

    @field_validator("notice", "fixture_notice")
    @classmethod
    def validate_notice_hygiene(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            validate_untrusted_data(v, path="notice", depth=1, max_depth=1, allow_lists=False)
        return v

    @model_validator(mode="after")
    def validate_unique_item_sequences(self) -> Self:
        """Enforces that item_sequence values are strictly unique within the batch."""
        seqs = [it.item_sequence for it in self.items]
        if len(seqs) != len(set(seqs)):
            raise ValueError("item_sequence values within raw batch must be strictly unique.")
        return self
