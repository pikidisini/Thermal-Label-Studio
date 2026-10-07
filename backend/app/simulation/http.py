"""Fixture-only HTTP preview; no external sources, jobs, or output sinks."""

import base64
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.observability import request_context
from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutDefinition, LayoutRegistry
from app.simulation.service import SimulationItemResult, simulate_label_request

router = APIRouter()
MAX_PNG_BYTES = 65_536
STAGE_MESSAGES = {
    "RECEIVED": "Item received for simulation.",
    "RESOLVING_LAYOUT": "Resolving the registered layout.",
    "BINDING_TEMPLATE": "Validating required facts and binding the template.",
    "RASTERIZING": "Creating the monochrome bitmap.",
    "CAPTURED": "Bitmap captured in memory for preview.",
    "FAILED": "Label processing failed.",
}
ERROR_MESSAGES = {
    "unknown_label_code": "No active layout is registered for this label_code.",
    "invalid_template_or_facts": "The layout template, media, or required facts are invalid.",
    "raster_failed": "The bitmap could not be created.",
    "processing_failed": "Label processing failed.",
}


class FixtureSimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    scenario: Literal["sample", "mixed"]


class Preview(BaseModel):
    media_type: Literal["image/png"] = "image/png"
    width_px: Literal[640] = 640
    height_px: Literal[1600] = 1600
    dpi: Literal[203.2] = 203.2
    png_base64: str = Field(min_length=1, max_length=87_384)


class Trace(BaseModel):
    status: Literal["RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING", "CAPTURED", "FAILED"]
    message: str = Field(max_length=128)


class ItemError(BaseModel):
    code: Literal["unknown_label_code", "invalid_template_or_facts", "raster_failed", "processing_failed"]
    message: str = Field(max_length=128)


class PreviewItem(BaseModel):
    item_index: int = Field(ge=0, le=2)
    item_id: str = Field(pattern=r"^fixture-[1-3]$")
    status: Literal["CAPTURED", "FAILED"]
    trace: list[Trace] = Field(min_length=2, max_length=5)
    preview: Preview | None
    error: ItemError | None


class FixtureSimulationResponse(BaseModel):
    request_id: str = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    schema_version: Literal[1] = 1
    label_code: Literal["roll_80x200"] = "roll_80x200"
    layout_version: Literal["fixture-v1"] = "fixture-v1"
    items: list[PreviewItem] = Field(min_length=1, max_length=3)


# Application-owned development fixture, independent of test files/storage.
FIXTURE_LAYOUTS = LayoutRegistry({"roll_80x200": LayoutDefinition(
    label_code="roll_80x200", version="fixture-v1", width_mm=80,
    height_mm=200, dpi=203.2, required_facts=("batch", "material"),
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1600" viewBox="0 0 640 1600">'
        '<rect x="0" y="0" width="640" height="1600" fill="white" />'
        '<rect x="32" y="32" width="576" height="8" fill="black" />'
        '<text x="32" y="100" font-family="Arial" font-size="32" fill="black">BATCH</text>'
        '<text x="32" y="145" font-family="Arial" font-size="32" fill="black" data-fact="batch" />'
        '<text x="32" y="215" font-family="Arial" font-size="32" fill="black">MATERIAL</text>'
        '<text x="32" y="260" font-family="Arial" font-size="32" fill="black" data-fact="material" />'
        '</svg>',
)})


def serialize_fixture_results(results: tuple[SimulationItemResult, ...]) -> FixtureSimulationResponse:
    """Expose exact captured PNG bytes and allowlisted evidence only."""
    items = []
    if not 1 <= len(results) <= 3:
        raise ValueError("Invalid fixture result count.")
    for index, item in enumerate(results):
        if item.item_index != index or item.item_id != f"fixture-{index + 1}":
            raise ValueError("Invalid fixture identity.")
        if not 2 <= len(item.trace) <= 5 or item.trace[0].status != "RECEIVED" or item.trace[-1].status != item.status:
            raise ValueError("Invalid fixture trace.")
        stages = ("RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING")
        if tuple(t.status for t in item.trace[:-1]) != stages[:len(item.trace) - 1]:
            raise ValueError("Invalid fixture stage order.")
        preview = None
        error = None
        if item.status == "CAPTURED":
            if len(item.trace) != 5:
                raise ValueError("Incomplete fixture capture trace.")
            bitmap = item.bitmap
            if bitmap is None or item.error is not None or (
                bitmap.label_code, bitmap.layout_version, bitmap.width_px, bitmap.height_px, bitmap.dpi
            ) != ("roll_80x200", "fixture-v1", 640, 1600, 203.2):
                raise ValueError("Invalid fixture capture.")
            if type(bitmap.bitmap_png) is not bytes or not 8 <= len(bitmap.bitmap_png) <= MAX_PNG_BYTES or not bitmap.bitmap_png.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid fixture bitmap.")
            preview = Preview(png_base64=base64.b64encode(bitmap.bitmap_png).decode("ascii"))
        elif item.status == "FAILED" and item.bitmap is None and item.error is not None:
            error = ItemError(code=item.error.code, message=ERROR_MESSAGES[item.error.code])
        else:
            raise ValueError("Invalid fixture outcome.")
        items.append(PreviewItem(
            item_index=index, item_id=item.item_id, status=item.status,
            trace=[Trace(status=t.status, message=STAGE_MESSAGES[t.status]) for t in item.trace],
            preview=preview, error=error,
        ))
    with request_context() as request_id:
        return FixtureSimulationResponse(request_id=request_id, items=items)


def _simulate_fixture(request: FixtureSimulationRequest) -> FixtureSimulationResponse:
    """Run one sample or an ordered good/bad/good fixture through the real pipeline."""
    try:
        validated = FixtureSimulationRequest.model_validate(request.model_dump())
        items = [{"item_id": "fixture-1", "facts": {"batch": "BATCH-001", "material": "MATERIAL-001"}}]
        if validated.scenario == "mixed":
            items.extend([
                {"item_id": "fixture-2", "facts": {"batch": "BATCH-002"}},
                {"item_id": "fixture-3", "facts": {"batch": "BATCH-003", "material": "MATERIAL-003"}},
            ])
        result = simulate_label_request(LabelProcessRequest(
            label_code="roll_80x200", mode="simulation", items=items,
        ), FIXTURE_LAYOUTS)
        return serialize_fixture_results(result)
    except Exception:
        raise HTTPException(status_code=500, detail={
            "code": "fixture_simulation_failed", "message": "Fixture simulation could not be completed.",
        }) from None


@router.post("/simulation/fixture", response_model=FixtureSimulationResponse)
def simulate_fixture(request: FixtureSimulationRequest) -> FixtureSimulationResponse:
    with request_context():
        return _simulate_fixture(request)
