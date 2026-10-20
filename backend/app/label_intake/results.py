"""Bounded public vocabulary and distinct simulation response schemas."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.label_data.models import LabelDataItem, LabelDataRequest


class IntakeItem(LabelDataItem):
    item_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')
    label_code: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
    copies: int = Field(ge=1, le=999)
    data: dict[str, str | int | float | bool | None] = Field(json_schema_extra={'maxProperties': 200})


class IntakeRequest(LabelDataRequest):
    """Canonical external envelope; sender.system is an assertion, not a credential."""
    sender: dict[str, str] = Field(json_schema_extra={
        'properties': {'system': {'type': 'string', 'minLength': 1, 'maxLength': 128,
            'pattern': r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$'}},
        'required': ['system'], 'additionalProperties': False})
    request_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')
    items: list[IntakeItem] = Field(min_length=1, max_length=100)
    target_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')


MESSAGES = {
    'malformed_json': 'The body must be valid UTF-8 JSON.',
    'duplicate_member': 'Duplicate JSON members are not allowed.',
    'request_too_large': 'The request exceeds 2 MiB.',
    'unsupported_media_type': 'Content-Type must be application/json with UTF-8 encoding.',
    'invalid_request': 'The canonical request is invalid.',
    'invalid_mode': 'Mode must be simulation or print.',
    'invalid_copies': 'Copies must be an integer from 1 to 999.',
    'unauthenticated': 'Sender authentication is required.',
    'sender_not_allowed': 'The asserted sender is not authorized.',
    'mode_not_allowed': 'The requested intake mode is not permitted or available.',
    'template_not_approved': 'The exact template version and copies are not approved.',
    'template_not_allowed': 'This source is not permitted to print the template.',
    'copies_not_allowed': 'Copies exceed the configured source limit.',
    'target_not_allowed': 'The configured server target is unavailable or has changed.',
    'policy_unavailable': 'External intake authorization is not configured.',
    'intake_unavailable': 'Stored-template intake is unavailable.',
    'intake_busy': 'Another intake request is in progress.',
    'ledger_unavailable': 'Durable request storage is unavailable.',
    'response_unavailable': 'The durable print outcome is unavailable. Submission may have occurred; do not resend automatically.',
    'request_conflict': 'This request identity was used with different input.',
    'request_in_progress': 'This request identity is already being processed.',
    'request_expired': 'This request identity has expired and cannot be reused.',
    'previous_uncertain': 'Submission may have occurred. Inspect before a new deliberate request.',
    'submission_uncertain': 'Submission may have occurred. Delivery is unconfirmed.',
    'preflight_aborted': 'The batch was stopped before submission.',
    'transport_failed_before_send': 'Submission failed before any payload was sent.',
    'unknown_label_code': 'No active stored template exists for this label code.',
    'layout_unavailable': 'The stored template could not be read.',
    'invalid_template': 'The stored template artifact is invalid.',
    'unsupported_feature': 'The template uses an unsupported feature.',
    'missing_binding': 'Required label data is missing.',
    'null_binding': 'Required label data is null.',
    'empty_binding': 'Required label data is empty.',
    'invalid_binding': 'Label binding is invalid.',
    'invalid_symbol': 'The symbol value is invalid.',
    'invalid_media': 'Stored media does not match the template or output limits.',
    'raster_failed': 'The bitmap could not be created.',
    'codec_failed': 'The IPL payload could not be encoded or simulated.',
    'resource_limit': 'The batch exceeds processing limits.',
    'preparation_timeout': 'The batch preparation deadline was exceeded.',
    'batch_stopped': 'The remaining batch items were skipped.',
    'processing_failed': 'Label processing failed.',
}


class IntakeAdmissionError(ValueError):
    def __init__(self, status: int, code: str):
        self.status, self.code = status, code
        super().__init__(MESSAGES[code])


class PublicModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)


class IntakeError(PublicModel):
    stage: Literal['ADMISSION', 'RESOLUTION', 'BINDING', 'PREPARATION', 'POLICY', 'CLAIM', 'TRANSPORT', 'RECOVERY']
    code: str
    message: str = Field(max_length=256)

    @model_validator(mode='after')
    def bounded_vocabulary(self):
        if self.code not in MESSAGES or self.message != MESSAGES[self.code]:
            raise ValueError('Invalid public error vocabulary.')
        return self


def error(stage, code):
    return IntakeError(stage=stage, code=code, message=MESSAGES[code])


class AdmissionResponse(PublicModel):
    request_id: str | None
    trace_id: str
    detail: IntakeError


class TemplateEvidence(PublicModel):
    version: int = Field(ge=1)
    svg_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')


class SimulationEvidence(PublicModel):
    png_base64: str
    width_px: int = Field(ge=1, le=4096)
    height_px: int = Field(ge=1, le=4096)
    dpi: float = Field(ge=72, le=600)
    payload_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    payload_bytes: int = Field(ge=1, le=2 * 1024 * 1024)


class ItemResult(PublicModel):
    item_index: int = Field(ge=0, le=99)
    item_id: str
    label_code: str
    copies: int = Field(ge=1, le=999)
    status: Literal['SIMULATED', 'FAILED', 'SKIPPED']
    template: TemplateEvidence | None
    error: IntakeError | None
    simulation: SimulationEvidence | None = None


class Summary(PublicModel):
    total: int
    simulated: int
    submitted: Literal[0] = 0
    failed: int
    uncertain: Literal[0] = 0
    skipped: int


class IntakeResponse(PublicModel):
    request_id: str
    trace_id: str
    original_trace_id: str
    mode: Literal['simulation'] = 'simulation'
    replayed: bool = False
    status: Literal['COMPLETED', 'PARTIAL', 'FAILED']
    summary: Summary
    results: list[ItemResult] = Field(max_length=100)
    target_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode='after')
    def consistent(self):
        if not self.results or [item.item_index for item in self.results] != list(range(len(self.results))):
            raise ValueError('Invalid result order.')
        if len({item.item_id for item in self.results}) != len(self.results):
            raise ValueError('Duplicate result identity.')
        for item in self.results:
            if (item.status == 'SIMULATED') != (item.simulation is not None):
                raise ValueError('Invalid simulation result.')
            if (item.status == 'SIMULATED') != (item.error is None):
                raise ValueError('Invalid result error.')
        counts = {state: sum(item.status == state for item in self.results) for state in ('SIMULATED','FAILED','SKIPPED')}
        expected = 'COMPLETED' if counts['SIMULATED'] == len(self.results) else 'PARTIAL' if counts['SIMULATED'] else 'FAILED'
        if (self.status != expected or self.summary.total != len(self.results)
                or (self.summary.simulated,self.summary.failed,self.summary.skipped) !=
                (counts['SIMULATED'],counts['FAILED'],counts['SKIPPED'])):
            raise ValueError('Invalid result summary.')
        return self

    def wire(self):
        # template/error nulls are required; simulation is present only on success.
        result = self.model_dump()
        for item in result['results']:
            if item['simulation'] is None:
                del item['simulation']
        return result
