"""Typed canonical model with validation owned by label_data."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
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
    @model_validator(mode="before")
    @classmethod
    def canonical(cls,value): return validate_payload(value)
