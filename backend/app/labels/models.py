"""Wire models for the in-memory label acceptance foundation."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LabelItemInput(BaseModel):
    """One input item; its position in ``items`` is its processing order."""

    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(min_length=1, max_length=128)
    facts: dict[str, Any] = Field(default_factory=dict)

    @field_validator("item_id")
    @classmethod
    def item_id_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("item_id must not be blank")
        return value


class LabelProcessRequest(BaseModel):
    """Accepted request shape before layout binding and output are implemented."""

    model_config = ConfigDict(extra="forbid")

    label_code: str = Field(min_length=1, max_length=128)
    items: list[LabelItemInput] = Field(default_factory=list, max_length=100)
    mode: Literal["simulation", "print"]

    @field_validator("label_code")
    @classmethod
    def label_code_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label_code must not be blank")
        return value


class LabelProcessAccepted(BaseModel):
    """Acceptance evidence only; no label output has been produced."""

    status: Literal["accepted"] = "accepted"
    label_code: str
    layout_version: str
    mode: Literal["simulation", "print"]
    item_count: int
