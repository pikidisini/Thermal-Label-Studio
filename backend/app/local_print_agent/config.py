"""Strict, injected configuration for the offline Local Print Agent."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..print_jobs.models import Emulation, PrinterLanguage


class LocalPrinterProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    printer_id: str = Field(min_length=1, max_length=128)
    site_id: str = Field(min_length=1, max_length=128)
    allowed_site_ids: tuple[str, ...] = ()
    language: PrinterLanguage
    emulation: Emulation
    dpi: float | None = Field(default=None, gt=0, le=1200)
    dpi_confirmed: bool
    transport_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("site_id", "printer_id")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("identifier must not be blank")
        return value

    @field_validator("allowed_site_ids")
    @classmethod
    def allowed_sites_non_blank(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not item.strip() for item in value):
            raise ValueError("allowed site identifiers must not be blank")
        return value

    @model_validator(mode="after")
    def validate_profile(self) -> "LocalPrinterProfile":
        if self.dpi_confirmed and self.dpi is None:
            raise ValueError("confirmed printer DPI is required")
        if self.language is PrinterLanguage.IPL and self.emulation is not Emulation.NATIVE:
            raise ValueError("IPL requires native emulation")
        if self.language is PrinterLanguage.ZPL and self.emulation not in {Emulation.NATIVE, Emulation.ZSIM2}:
            raise ValueError("unsupported ZPL emulation")
        return self


@dataclass(frozen=True)
class PrintAgentConfig:
    base_url: str
    bearer_token: str = field(repr=False)
    agent_id: str
    site_id: str
    request_timeout_seconds: float = 10.0
    max_artifact_bytes: int = 10 * 1024 * 1024
    profiles: tuple[LocalPrinterProfile, ...] = ()
    follow_redirects: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        parsed = urlsplit(self.base_url)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname:
            raise ValueError("base_url must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("base_url must not contain credentials, query, or fragment")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("HTTP base_url is allowed only for loopback development")
        if not self.bearer_token or not self.agent_id or not self.site_id:
            raise ValueError("agent credentials and identity are required")
        if self.request_timeout_seconds <= 0 or self.max_artifact_bytes <= 0:
            raise ValueError("timeout and maximum artifact size must be positive")
        if any(profile.site_id != self.site_id and self.site_id not in profile.allowed_site_ids for profile in self.profiles):
            raise ValueError("local printer profile is outside the agent site")

    @classmethod
    def from_environment(cls, profiles: tuple[LocalPrinterProfile, ...] = ()) -> "PrintAgentConfig":
        return cls(
            base_url=os.environ["PRINT_AGENT_BASE_URL"],
            bearer_token=os.environ["PRINT_AGENT_BEARER_TOKEN"],
            agent_id=os.environ["PRINT_AGENT_AGENT_ID"],
            site_id=os.environ["PRINT_AGENT_SITE_ID"],
            request_timeout_seconds=float(os.getenv("PRINT_AGENT_REQUEST_TIMEOUT_SECONDS", "10")),
            max_artifact_bytes=int(os.getenv("PRINT_AGENT_MAX_ARTIFACT_BYTES", str(10 * 1024 * 1024))),
            profiles=profiles,
        )
