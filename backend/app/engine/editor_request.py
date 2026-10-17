"""Shared editor draft admission. Route chooses the sink, never the input."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.label_data.validation import fields
from app.svg_safety import MAX_SVG_BYTES
from app.label_data.validation import MAX_BYTES, decode_json, LabelDataError
from starlette.responses import JSONResponse
from app.observability import current_request_id


class EditorBodyMiddleware:
    """Count streamed bytes before JSON parsing; reject ambiguous duplicate data."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path') not in {
                '/api/v1/design/validate', '/api/v1/simulation/editor-preview', '/api/v1/printing/editor', '/api/v1/label-print/preview',
                '/api/v1/label-print/print-package', '/api/v1/label-print/print', '/api/v1/label-print/printer-status'}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        media = headers.get(b'content-type', b'').decode('latin1').split(';')[0].strip().lower()
        code, status = None, 400
        body = bytearray()
        if media != 'application/json':
            code, status = 'unsupported_media_type', 415
        else:
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                if len(body) + len(chunk) > MAX_BYTES:
                    code, status = 'request_too_large', 413
                    break
                body.extend(chunk)
                if not message.get('more_body', False):
                    break
            if code is None:
                try:
                    decode_json(bytes(body))
                except LabelDataError as exc:
                    code = exc.code
        if code:
            return await JSONResponse(status_code=status, content={
                'detail': {'code': code, 'message': 'Editor request admission failed.'},
                'request_id': current_request_id(),
            })(scope, receive, send)
        delivered = False
        async def replay():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
        return await self.app(scope, replay, send)


class EditorDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    svg: str = Field(min_length=1, max_length=MAX_SVG_BYTES)
    width_mm: float = Field(ge=10, le=500, allow_inf_nan=False)
    height_mm: float = Field(ge=10, le=500, allow_inf_nan=False)
    dpi: float = Field(ge=72, le=600, allow_inf_nan=False)
    binding_version: Literal[1]

    @field_validator("binding_version", mode="before")
    @classmethod
    def version(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError("Invalid binding version.")
        return value


class EditorOutputRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    draft: EditorDraft
    data: dict
    field_descriptions: dict = Field(default_factory=dict)
    encoder: Literal["IPL"]
    copies: int = Field(ge=1, le=999)

    @field_validator("copies", mode="before")
    @classmethod
    def integral_copies(cls, value):
        if type(value) not in (int, float) or not 1 <= value <= 999 or value != int(value):
            raise ValueError("Invalid copies.")
        return int(value)

    @field_validator("data", "field_descriptions")
    @classmethod
    def canonical_fields(cls, value, info):
        fields(value, descriptions=info.field_name == "field_descriptions")
        return value
