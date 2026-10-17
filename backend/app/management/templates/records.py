"""Persisted template review record."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict

class Review(BaseModel):
    model_config = ConfigDict(extra='forbid')
    review_id: str
    label_code: str
    version: int
    svg_sha256: str
    status: Literal['Pending review', 'Approved', 'Rejected', 'Revoked']
    note: str
    at: datetime
