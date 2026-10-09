"""Editor-canvas simulation HTTP boundary for the Phase 7 local studio."""

import base64
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.observability import record_event, request_context
from app.engine.pipeline import prepare_editor_output
from app.protocols.ipl.errors import IplError
from app.simulation.service import simulate_prepared_output
from app.svg_safety import MAX_SVG_BYTES


router = APIRouter()


class EditorPreviewRequest(BaseModel):
    """A bounded, already-composed SVG emitted by the local Studio canvas."""

    model_config = ConfigDict(extra="forbid", strict=True)

    svg: str = Field(min_length=1, max_length=MAX_SVG_BYTES)
    width_mm: float = Field(ge=10, le=500)
    height_mm: float = Field(ge=10, le=500)
    dpi: float = Field(ge=72, le=600)
    encoder: Literal["IPL"] = "IPL"


class EditorPreviewResponse(BaseModel):
    request_id: str
    media_type: Literal["image/png"] = "image/png"
    width_px: int = Field(ge=1, le=4096)
    height_px: int = Field(ge=1, le=4096)
    dpi: float
    png_base64: str = Field(min_length=1)


@router.post("/simulation/editor-preview", response_model=EditorPreviewResponse)
def simulate_editor_preview(request: EditorPreviewRequest) -> EditorPreviewResponse:
    """Render the current local canvas to the same server-owned bitmap used by preview."""
    with request_context() as request_id:
        try:
            prepared = prepare_editor_output(request.svg, request.width_mm, request.height_mm, request.dpi, language=request.encoder)
        except IplError:
            record_event("FAILED", error_code="processing_failed")
            raise HTTPException(status_code=500, detail={"code": "editor_preview_failed"}) from None
        except ValueError:
            record_event("FAILED", error_code="invalid_request")
            raise HTTPException(status_code=422, detail={"code": "invalid_editor_layout"}) from None
        except RuntimeError:
            record_event("FAILED", error_code="raster_failed")
            raise HTTPException(status_code=500, detail={"code": "editor_preview_failed"}) from None
        try:
            bitmap = simulate_prepared_output(prepared)
        except IplError:
            record_event("FAILED", error_code="processing_failed")
            raise HTTPException(status_code=500, detail={"code": "editor_preview_failed"}) from None
        record_event("CAPTURED")
        return EditorPreviewResponse(
            request_id=request_id,
            width_px=bitmap.width_px,
            height_px=bitmap.height_px,
            dpi=request.dpi,
            png_base64=base64.b64encode(bitmap.bitmap_png).decode("ascii"),
        )
