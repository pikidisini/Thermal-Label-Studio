"""Request-local, metadata-only progress; no payloads or exception messages."""
from app.activity.context import stage
from typing import Literal
from pydantic import BaseModel

StageName = Literal['FETCH_DATA', 'VALIDATE_DATA', 'RESOLVE_LAYOUT', 'BIND_TEMPLATE',
                    'RASTERIZE', 'ENCODE_IPL', 'DECODE_IPL', 'ACCEPT_PREVIEW']
STAGES = ('FETCH_DATA', 'VALIDATE_DATA', 'RESOLVE_LAYOUT', 'BIND_TEMPLATE',
          'RASTERIZE', 'ENCODE_IPL', 'DECODE_IPL', 'ACCEPT_PREVIEW')


class PreviewStep(BaseModel):
    stage: StageName
    status: Literal['PASSED', 'FAILED', 'NOT_RUN'] = 'NOT_RUN'


class Progress:
    def __init__(self):
        self.steps = [PreviewStep(stage=name) for name in STAGES]
        self.active = 'FETCH_DATA'

    def passed(self, name, next_stage):
        self.set_status(name, 'PASSED')
        self.active = next_stage
        stage(next_stage)

    def set_status(self, name, status):
        next(step for step in self.steps if step.stage == name).status = status

    def event(self, name):
        transitions = {
            'FETCHED': ('FETCH_DATA', 'VALIDATE_DATA'),
            'BOUND': ('BIND_TEMPLATE', 'RASTERIZE'),
            'RASTERIZED': ('RASTERIZE', 'ENCODE_IPL'),
            'PREPARED': ('ENCODE_IPL', 'DECODE_IPL'),
        }
        current, following = transitions[name]
        self.passed(current, following)

    def failed(self):
        self.set_status(self.active, 'FAILED')
        return self.active
