"""Pydantic models for the design-time print-job v1 contract."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PrinterLanguage(StrEnum):
    ZPL = "zpl"
    IPL = "ipl"


class Emulation(StrEnum):
    NATIVE = "native"
    ZSIM2 = "zsim2"


class PrintJobStatus(StrEnum):
    ACCEPTED = "accepted"
    RENDERED = "rendered"
    QUEUED = "queued"
    CLAIMED = "claimed"
    SENDING = "sending"
    SENT_TO_PRINTER = "sent_to_printer"
    DELIVERY_UNKNOWN = "delivery_unknown"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ArtifactReference(StrictModel):
    payload_ref: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    )
    filename: Literal["label.ipl", "label.zpl"]
    media_type: Literal["application/octet-stream"]
    byte_length: int = Field(gt=0, le=10 * 1024 * 1024)


class Claim(StrictModel):
    agent_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    )
    claimed_at: datetime
    lease_expires_at: datetime

    @field_validator("claimed_at", "lease_expires_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
        return value

    @model_validator(mode="after")
    def validate_lease_order(self) -> "Claim":
        if self.lease_expires_at <= self.claimed_at:
            raise ValueError("lease_expires_at must be greater than claimed_at")
        return self


class SourceContractMetadata(StrictModel):
    label_type: Optional[str] = Field(default=None, max_length=64)
    label_code: Optional[str] = Field(default=None, max_length=128)
    contract_version: Optional[str] = Field(default=None, max_length=32)


class SourceMetadata(StrictModel):
    producer_type: Literal["sap"]
    program: Optional[str] = Field(default=None, min_length=1, max_length=128)
    sap_system: Optional[str] = Field(default=None, min_length=1, max_length=128)
    transaction_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    metadata: Optional[SourceContractMetadata] = None


class PrintJob(StrictModel):
    contract_version: Literal["1.0"]
    job_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    request_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    created_at: datetime
    expires_at: datetime
    site_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    printer_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    printer_language: PrinterLanguage
    emulation: Emulation
    dpi: float = Field(gt=0, le=1200)
    copies: int = Field(ge=1, le=100)
    artifact: Optional[ArtifactReference] = None
    artifact_sha256: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    status: PrintJobStatus
    attempt_count: int = Field(ge=0, le=10)
    last_error: Optional[str] = Field(default=None, max_length=2000)
    claim: Optional[Claim] = None
    source: SourceMetadata

    @field_validator("created_at", "expires_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
        return value

    @model_validator(mode="after")
    def validate_contract_invariants(self) -> "PrintJob":
        if self.expires_at <= self.created_at:
            raise ValueError("expires_at must be greater than created_at")
        if self.printer_language is PrinterLanguage.IPL and self.emulation is not Emulation.NATIVE:
            raise ValueError("IPL requires native emulation")
        if self.emulation is Emulation.ZSIM2 and self.printer_language is not PrinterLanguage.ZPL:
            raise ValueError("zsim2 requires ZPL")
        if self.artifact is not None:
            expected_filename = "label.ipl" if self.printer_language is PrinterLanguage.IPL else "label.zpl"
            if self.artifact.filename != expected_filename:
                raise ValueError(f"{self.printer_language.value} requires {expected_filename}")

        if self.status is PrintJobStatus.ACCEPTED:
            if self.artifact is not None or self.artifact_sha256 is not None or self.claim is not None:
                raise ValueError("accepted jobs require null artifact, checksum, and claim")
        elif self.status in {PrintJobStatus.RENDERED, PrintJobStatus.QUEUED}:
            if self.artifact is None or self.artifact_sha256 is None or self.claim is not None:
                raise ValueError("rendered and queued jobs require artifact/checksum and null claim")
        elif self.status in {
            PrintJobStatus.CLAIMED,
            PrintJobStatus.SENDING,
            PrintJobStatus.SENT_TO_PRINTER,
            PrintJobStatus.DELIVERY_UNKNOWN,
        }:
            if self.artifact is None or self.artifact_sha256 is None or self.claim is None:
                raise ValueError("active delivery jobs require artifact, checksum, and claim")
        return self


class PrinterProfile(StrictModel):
    printer_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    language: PrinterLanguage
    emulation: Emulation
    site_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    allowed_site_ids: list[str] = Field(default_factory=list, min_length=1)
    dpi: Optional[float] = Field(default=None, gt=0, le=1200)
    dpi_confirmed: bool = False

    @model_validator(mode="after")
    def validate_language_emulation(self) -> "PrinterProfile":
        if self.site_id is None and not self.allowed_site_ids:
            raise ValueError("printer profile requires site_id or allowed_site_ids")
        if self.language is PrinterLanguage.IPL and self.emulation is not Emulation.NATIVE:
            raise ValueError("IPL requires native emulation")
        if self.emulation is Emulation.ZSIM2 and self.language is not PrinterLanguage.ZPL:
            raise ValueError("zsim2 requires ZPL")
        if self.dpi_confirmed and self.dpi is None:
            raise ValueError("confirmed DPI requires a numeric dpi")
        return self
