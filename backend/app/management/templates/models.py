"""Template review and decision commands."""
from typing import Literal
from pydantic import Field
from pydantic import field_validator
from app.label_intake.policy import CODE, ID
from ..models import Command

class ReviewCommand(Command):
    label_code: str = Field(pattern=CODE)
    version: int = Field(ge=1)
    svg_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')


class TemplateCommand(ReviewCommand):
    action: Literal['update', 'delete']
    title: str = Field(min_length=1, max_length=160, pattern=r'\S')
    new_code: str = Field(pattern=CODE)
    previous_title: str = Field(min_length=1, max_length=160)

    @field_validator('title')
    @classmethod
    def trim_title(cls, value):
        return value.strip()



class DecisionCommand(Command):
    action: Literal['approve', 'reject', 'revoke']
    sender: str = Field(pattern=ID)
    target_id: str = Field(pattern=ID)
    max_copies: int = Field(ge=1, le=999)
