"""HTTP and stored shapes for versioned Studio layouts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.labels.layout_contract import LayoutDraft, LayoutStatus, LayoutVersion, create_layout_version


class SaveLayoutRequest(LayoutDraft):
    """One authored Studio canvas; each save creates a new active version."""


class RenameLayoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1, max_length=160)

    @field_validator("title")
    @classmethod
    def require_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()


class LayoutSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    label_code: str
    title: str
    version: int = Field(ge=1)
    status: Literal["published"] = "published"
    width_mm: float
    height_mm: float
    dpi: float
    svg_sha256: str
    object_key: str
    created_at: datetime

    @classmethod
    def from_version(cls, version: LayoutVersion, created_at: datetime) -> "LayoutSummary":
        return cls(
            label_code=version.label_code,
            title=version.title,
            version=version.version,
            width_mm=version.width_mm,
            height_mm=version.height_mm,
            dpi=version.dpi,
            svg_sha256=version.svg_sha256,
            object_key=version.object_key,
            created_at=created_at,
        )


class StoredLayout(LayoutSummary):
    svg: str


def published_version(draft: SaveLayoutRequest, version: int) -> LayoutVersion:
    return create_layout_version(draft, version=version, status=LayoutStatus.PUBLISHED)
