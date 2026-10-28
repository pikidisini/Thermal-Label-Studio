"""Editor-canvas simulation HTTP boundary for the Phase 7 local studio."""

import base64
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.observability import record_event, request_context
from app.engine.pipeline import prepare_draft_output
from app.engine.editor_request import EditorOutputRequest
from app.template_binding.composition import BindingError
from app.template_binding.models import TemplateAdmissionError
from app.protocols.ipl.errors import IplError
from app.simulation.service import simulate_prepared_output
from app.activity.context import studio_identity, studio_outcome


router = APIRouter()


class EditorPreviewRequest(EditorOutputRequest):
    """Current unsaved draft and explicit canonical values."""
    purpose: Literal['preview', 'simulation'] = 'preview'


class EditorPreviewResponse(BaseModel):
    request_id: str
    template_sha256: str
    binding_version: Literal[1] = 1
    media_type: Literal["image/png"] = "image/png"
    width_px: int = Field(ge=1, le=4096)
    height_px: int = Field(ge=1, le=4096)
    dpi: float
    png_base64: str = Field(min_length=1)


@router.post('/simulation/editor-preview', response_model=EditorPreviewResponse, responses={422: {'description': 'Unprocessable Content'}, 500: {'description': 'Internal Server Error'}})
def simulate_editor_preview(request: EditorPreviewRequest) -> EditorPreviewResponse:
    """Render the current local canvas to the same server-owned bitmap used by preview."""
    with request_context() as request_id:
        studio_identity(request)
        try:
            bound, prepared = prepare_draft_output(request)
        except BindingError as exc:
            raise HTTPException(status_code=422, detail={"code": exc.code}) from None
        except TemplateAdmissionError:
            raise HTTPException(status_code=422, detail={"code": "invalid_editor_layout"}) from None
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
        result = EditorPreviewResponse(
            request_id=request_id,
            template_sha256=bound.manifest.svg_sha256,
            width_px=bitmap.width_px,
            height_px=bitmap.height_px,
            dpi=request.draft.dpi,
            png_base64=base64.b64encode(bitmap.bitmap_png).decode("ascii"),
        )
        studio_outcome(result)
        return result
