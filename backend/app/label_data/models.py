"""Typed canonical model with validation owned by label_data."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, model_serializer
from .validation import validate_payload
class LabelDataItem(BaseModel):
    model_config=ConfigDict(extra="forbid",strict=True,frozen=True,hide_input_in_errors=True)
    item_id: str
    label_code: str
    copies: int
    data: dict[str,Any]
    @model_validator(mode="before")
    @classmethod
    def canonical(cls,value):
        validate_payload({"sender":{"system":"MODEL"},"request_id":"MODEL","mode":"simulation","items":[value]})
        return {**value,"copies":int(value["copies"])}
class LabelDataRequest(BaseModel):
    model_config=ConfigDict(extra="forbid",strict=True,frozen=True,hide_input_in_errors=True)
    sender: dict[str,str]
    request_id: str
    mode: Literal["simulation","print"]
    items: list[LabelDataItem]
    field_descriptions: dict[str,str] = Field(default_factory=dict)
    target_id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')
    @model_serializer(mode='wrap')
    def omit_absent_target(self, handler):
        # Preserve the historical canonical payload/HMAC when no target was sent.
        result = handler(self)
        if self.target_id is None:
            result.pop('target_id', None)
        return result
    @model_validator(mode="before")
    @classmethod
    def canonical(cls,value): return validate_payload(value)
