"""Source permission command with strict JSON-array admission."""
import json
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.label_intake.policy import Source
from ..models import Command

class SourceCommand(Command):
    source: Source
    create_key: bool = False

    @field_validator('source', mode='before')
    @classmethod
    def json_permissions(cls, value):
        # Policy's strict tuple fields use JSON-array admission, just like the
        # existing policy loader; FastAPI otherwise passes decoded Python lists.
        if isinstance(value, dict):
            if value.get('deleted', False):
                raise ValueError('Deletion must use the source deletion endpoint.')
            if value.get('access_key') is not None:
                raise ValueError('Access keys must use the key lifecycle endpoint.')
            return Source.model_validate_json(json.dumps(value))
        return value


class KeyCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    revision: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
    action: Literal['create', 'rotate', 'revoke', 'migrate', 'reveal']
