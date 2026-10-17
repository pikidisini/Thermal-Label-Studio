"""Shared command and persisted document contracts."""
from pydantic import BaseModel, ConfigDict, Field
from app.label_intake.policy import ID, Policy
from .templates.records import Review
from app.sap_rfc.models import Configuration

class Command(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    revision: str = Field(pattern=ID)
    note: str = Field(default='', max_length=500)



class Document(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sap_rfc: Configuration = Field(default_factory=Configuration)
    policy: Policy
    reviews: list[Review] = Field(default_factory=list, max_length=10000)
