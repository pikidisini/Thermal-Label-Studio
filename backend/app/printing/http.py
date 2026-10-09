"""Explicit Studio print quantity against a validated action target."""
from typing import Callable, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.config import get_settings, PrinterTarget
from app.engine.pipeline import prepare_editor_output
from app.engine.raster import RasterError
from app.observability import record_event, request_context
from app.printing.service import BitmapTransport, PrintSubmissionError, submit_prepared_output
from app.printing.transport import TcpRawTransport
from app.protocols.ipl.errors import IplError
from app.svg_safety import MAX_SVG_BYTES

router = APIRouter()

class PrintTargetInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    host: str = Field(min_length=1, max_length=63)
    port: int = Field(ge=1, le=65535)

    @model_validator(mode="after")
    def validate_numeric_target(self):
        PrinterTarget(self.host, self.port)
        return self


class EditorPrintRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    svg: str = Field(min_length=1, max_length=MAX_SVG_BYTES)
    width_mm: float = Field(ge=10, le=500)
    height_mm: float = Field(ge=10, le=500)
    dpi: float = Field(ge=72, le=600)
    encoder: Literal["IPL"] = "IPL"
    target: PrintTargetInput | None = None
    copies: int = Field(default=1, ge=1, le=999)

class PrintTargetResponse(BaseModel):
    available: bool
    host: str | None = None
    port: int | None = None
    encoder: Literal["IPL"] = "IPL"

class EditorPrintResponse(BaseModel):
    request_id: str
    status: Literal["SUBMITTED"] = "SUBMITTED"
    confirmed: Literal[False] = False
    width_px: int
    height_px: int
    dpi: float
    encoder: Literal["IPL"] = "IPL"
    payload_bytes: int
    target: PrintTargetInput
    copies: int = Field(ge=1, le=999)

def configured_target() -> PrinterTarget | None:
    return get_settings().printer

def print_transport_factory() -> Callable[[PrinterTarget], BitmapTransport]:
    """Inject construction for tests; constructing a transport performs no IO."""
    return TcpRawTransport

@router.get("/printing/target", response_model=PrintTargetResponse)
def get_print_target(target: PrinterTarget | None = Depends(configured_target)):
    # Configuration only. Opening a dialog never probes/connects to a printer.
    return PrintTargetResponse(available=target is not None, host=target.host if target else None,
                               port=target.port if target else None)

@router.post("/printing/editor", response_model=EditorPrintResponse)
def print_editor(
    request: EditorPrintRequest,
    factory: Callable[[PrinterTarget], BitmapTransport] = Depends(print_transport_factory),
    default_target: PrinterTarget | None = Depends(configured_target),
):
    with request_context() as request_id:
        # Pydantic validated the explicit target before entering the endpoint.
        target = PrinterTarget(request.target.host, request.target.port) if request.target else default_target
        if target is None:
            raise HTTPException(status_code=503, detail={"code": "printer_unavailable"})
        transport = factory(target)
        try:
            prepared = prepare_editor_output(request.svg, request.width_mm, request.height_mm,
                                             request.dpi, language=request.encoder, copies=request.copies)
        except IplError:
            record_event("FAILED", error_code="processing_failed")
            raise HTTPException(status_code=500, detail={"code": "print_preparation_failed"}) from None
        except ValueError:
            record_event("FAILED", error_code="invalid_request")
            raise HTTPException(status_code=422, detail={"code": "invalid_print_layout"}) from None
        except RasterError:
            record_event("FAILED", error_code="raster_failed")
            raise HTTPException(status_code=500, detail={"code": "print_preparation_failed"}) from None
        try:
            submission = submit_prepared_output(prepared, transport)
        except PrintSubmissionError:
            record_event("FAILED", error_code="print_submission_uncertain")
            raise HTTPException(status_code=502, detail={"code": "print_submission_uncertain"}) from None
        record_event("SUBMITTED")
        bitmap = submission.output.bitmap
        return EditorPrintResponse(request_id=request_id, width_px=bitmap.width_px,
                                   height_px=bitmap.height_px, dpi=bitmap.dpi,
                                   payload_bytes=len(submission.output.payload),
                                   target=PrintTargetInput(host=target.host, port=target.port),
                                   copies=submission.output.copies)
