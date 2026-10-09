"""Small in-memory correlation and allowlisted structured diagnostics."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import asdict, dataclass
import logging
import json
from typing import Literal
from uuid import UUID, uuid4

from starlette.responses import JSONResponse

_current_id: ContextVar[str | None] = ContextVar("request_id", default=None)
logger = logging.getLogger("thermal_label_studio.events")
EventName = Literal["REQUEST_RECEIVED", "REQUEST_COMPLETED", "REQUEST_FAILED", "RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING", "CAPTURED", "SUBMITTED", "FAILED"]
EVENT_NAMES = frozenset(EventName.__args__)
ERROR_CODES = frozenset({"unknown_label_code", "invalid_template_or_facts", "raster_failed", "processing_failed", "invalid_request", "fixture_simulation_failed", "print_submission_uncertain"})


def new_request_id() -> str:
    return str(uuid4())


def current_request_id() -> str | None:
    return _current_id.get()


@contextmanager
def request_context(request_id: str | None = None):
    """Reuse server context; caller-supplied external headers never enter it."""
    value = request_id or current_request_id() or new_request_id()
    parsed = UUID(value)
    if parsed.version != 4 or str(parsed) != value:
        raise ValueError("A canonical UUIDv4 request ID is required.")
    token = _current_id.set(value)
    try:
        yield value
    finally:
        _current_id.reset(token)


@dataclass(frozen=True)
class DiagnosticEvent:
    request_id: str
    event: EventName
    item_index: int | None = None
    error_code: str | None = None
    status_code: int | None = None

    def __post_init__(self):
        parsed = UUID(self.request_id)
        if parsed.version != 4 or str(parsed) != self.request_id:
            raise ValueError("Invalid request ID.")
        if self.event not in EVENT_NAMES:
            raise ValueError("Unknown diagnostic event.")
        if self.item_index is not None and (type(self.item_index) is not int or not 0 <= self.item_index < 100):
            raise ValueError("Invalid item index.")
        if self.error_code is not None and self.error_code not in ERROR_CODES:
            raise ValueError("Unknown diagnostic error.")
        if self.status_code is not None and (type(self.status_code) is not int or not 100 <= self.status_code <= 599):
            raise ValueError("Invalid HTTP status.")


def record_event(event: EventName, *, item_index: int | None = None,
                 error_code: str | None = None, status_code: int | None = None) -> None:
    request_id = current_request_id()
    if request_id is None:
        return
    diagnostic = DiagnosticEvent(request_id, event, item_index, error_code, status_code)
    # No body, facts, label values, path, headers, exception text or traceback.
    fields = asdict(diagnostic)
    logger.info(json.dumps(fields, separators=(",", ":")), extra={"diagnostic": fields})


class CorrelationMiddleware:
    """Pure ASGI correlation, with no file handler or external telemetry sink."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        with request_context(new_request_id()) as request_id:
            record_event("REQUEST_RECEIVED")
            status = None

            async def correlated_send(message):
                nonlocal status
                if message["type"] == "http.response.start":
                    status = message["status"]
                    headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"x-request-id"]
                    message = {**message, "headers": headers + [(b"x-request-id", request_id.encode("ascii"))]}
                await send(message)

            try:
                await self.app(scope, receive, correlated_send)
            except Exception:
                record_event("REQUEST_FAILED", error_code="processing_failed", status_code=status or 500)
                if status is not None:
                    raise
                response = JSONResponse(status_code=500, content={
                    "detail": {"code": "processing_failed", "message": "Label processing failed."},
                    "request_id": request_id,
                })
                await response(scope, receive, correlated_send)
            else:
                record_event("REQUEST_FAILED" if status is not None and status >= 400 else "REQUEST_COMPLETED", status_code=status)
