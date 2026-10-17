"""Validate retained print outcomes without enabling an HTTP print sink."""
from typing import Literal
from pydantic import Field, model_validator
from .results import PublicModel, IntakeError, TemplateEvidence


class PrintItem(PublicModel):
    item_index: int = Field(ge=0,le=99)
    item_id: str = Field(min_length=1,max_length=128)
    label_code: str = Field(min_length=1,max_length=128)
    copies: int = Field(ge=1,le=999)
    status: Literal['SUBMITTED','UNCERTAIN','FAILED','SKIPPED']
    template: TemplateEvidence | None
    error: IntakeError | None
    confirmed: Literal[False] | None = None
    target_id: str | None = Field(default=None,min_length=1,max_length=128)

    @model_validator(mode='after')
    def consistent(self):
        if self.status in ('SUBMITTED','UNCERTAIN') and (self.confirmed is not False or self.target_id is None or self.template is None):
            raise ValueError('Invalid claim outcome.')
        if (self.status=='SUBMITTED') != (self.error is None):
            raise ValueError('Invalid outcome error.')
        return self


class PrintSummary(PublicModel):
    total: int = Field(ge=1,le=100)
    simulated: Literal[0]
    submitted: int = Field(ge=0,le=100)
    failed: int = Field(ge=0,le=100)
    uncertain: int = Field(ge=0,le=100)
    skipped: int = Field(ge=0,le=100)


class PrintOutcome(PublicModel):
    request_id: str
    trace_id: str
    original_trace_id: str
    mode: Literal['print']
    replayed: bool
    status: Literal['COMPLETED','PARTIAL','FAILED','UNCERTAIN']
    summary: PrintSummary
    results: list[PrintItem] = Field(min_length=1,max_length=100)

    def wire(self):
        value = self.model_dump()
        for item in value['results']:
            for key in ('confirmed','target_id'):
                if item[key] is None:
                    item.pop(key)
        return value

    @model_validator(mode='after')
    def consistent(self):
        if [item.item_index for item in self.results] != list(range(len(self.results))):
            raise ValueError('Invalid item order.')
        if len({item.item_id for item in self.results}) != len(self.results):
            raise ValueError('Duplicate outcome item identity.')
        counts={key:sum(item.status==state for item in self.results) for key,state in (
            ('submitted','SUBMITTED'),('failed','FAILED'),('uncertain','UNCERTAIN'),('skipped','SKIPPED'))}
        if self.summary.total!=len(self.results) or any(getattr(self.summary,key)!=value for key,value in counts.items()):
            raise ValueError('Invalid summary.')
        expected='UNCERTAIN' if counts['uncertain'] else 'COMPLETED' if counts['submitted']==len(self.results) else 'PARTIAL' if counts['submitted'] else 'FAILED'
        if self.status!=expected:
            raise ValueError('Invalid batch outcome.')
        return self
