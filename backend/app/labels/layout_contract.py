"""Pure contracts for a durable, versioned Studio layout.

This module has no database, object-storage, filesystem, renderer, or network
dependency. It describes one exact SVG artifact and the metadata a later
repository will store separately from that artifact.
"""

from __future__ import annotations

import hashlib
import re
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


MAX_LAYOUT_SVG_BYTES = 512 * 1024
_LAYOUT_CODE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")


class LayoutStatus(str, Enum):
    """Lifecycle state for one immutable layout version."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class LayoutDraft(BaseModel):
    """The authored canvas submitted before a server assigns a version."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    label_code: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=160)
    svg: str = Field(min_length=1, max_length=MAX_LAYOUT_SVG_BYTES)
    width_mm: float = Field(ge=10, le=500)
    height_mm: float = Field(ge=10, le=500)
    dpi: float = Field(ge=72, le=600)

    @field_validator("label_code")
    @classmethod
    def require_safe_label_code(cls, value: str) -> str:
        if not _LAYOUT_CODE.fullmatch(value):
            raise ValueError("label_code must be a safe layout identifier")
        return value

    @field_validator("title")
    @classmethod
    def require_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value

    @field_validator("svg")
    @classmethod
    def require_bounded_svg_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > MAX_LAYOUT_SVG_BYTES:
            raise ValueError("svg exceeds its byte limit")
        return value


class LayoutVersion(BaseModel):
    """Durable metadata; the SVG itself belongs in immutable object storage."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    label_code: str = Field(min_length=1, max_length=128)
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=160)
    width_mm: float = Field(ge=10, le=500)
    height_mm: float = Field(ge=10, le=500)
    dpi: float = Field(ge=72, le=600)
    status: LayoutStatus
    svg_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("label_code")
    @classmethod
    def require_safe_label_code(cls, value: str) -> str:
        if not _LAYOUT_CODE.fullmatch(value):
            raise ValueError("label_code must be a safe layout identifier")
        return value

    @field_validator("title")
    @classmethod
    def require_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value

    @property
    def object_key(self) -> str:
        """Server-owned location for the exact immutable SVG bytes."""
        return f"layouts/{self.label_code}/v{self.version}/layout.svg"


def create_layout_version(
    draft: LayoutDraft, *, version: int, status: LayoutStatus = LayoutStatus.DRAFT,
) -> LayoutVersion:
    """Assign a server-owned sequence/version and hash exact authored bytes."""
    if type(version) is not int or version < 1:
        raise ValueError("version must be a positive integer")
    if not isinstance(status, LayoutStatus):
        raise ValueError("status must be a LayoutStatus")
    return LayoutVersion(
        label_code=draft.label_code,
        version=version,
        title=draft.title,
        width_mm=draft.width_mm,
        height_mm=draft.height_mm,
        dpi=draft.dpi,
        status=status,
        svg_sha256=hashlib.sha256(draft.svg.encode("utf-8")).hexdigest(),
    )
