"""Capture one existing renderer result per ordered item, without output IO."""

from dataclasses import dataclass, replace
from typing import Literal

from pydantic import ValidationError

from app.engine.pipeline import prepare_label_item
from app.engine.output import PreparedOutput
from app.protocols.registry import codec_for
from app.observability import record_event, request_context
from app.engine.raster import RasterError, RenderStage
from app.engine.bitmap import RenderedLabel
from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutSource, UnknownLabelCodeError
from app.labels.templates import TemplateError


SimulationStatus = Literal[
    "RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING", "CAPTURED", "FAILED"
]


@dataclass(frozen=True)
class TraceEntry:
    status: SimulationStatus
    message: str


@dataclass(frozen=True)
class SimulationError:
    code: str
    message: str


@dataclass(frozen=True)
class SimulationItemResult:
    item_index: int
    item_id: str
    status: Literal["CAPTURED", "FAILED"]
    trace: tuple[TraceEntry, ...]
    bitmap: RenderedLabel | None
    error: SimulationError | None
    payload: bytes | None = None
    prepared: PreparedOutput | None = None


class SimulationRequestError(ValueError):
    """A request cannot enter simulation; no item has been rendered."""

    code = "invalid_simulation_request"


_STAGE_MESSAGES = {
    "RESOLVING_LAYOUT": "Resolving the registered layout.",
    "BINDING_TEMPLATE": "Validating required facts and binding the template.",
    "RASTERIZING": "Creating the monochrome bitmap.",
}


def simulate_prepared_output(output: PreparedOutput) -> RenderedLabel:
    """Decode the exact prepared payload without rendering, encoding or IO."""
    _, decoder = codec_for(output.language)
    bitmap = output.bitmap
    return replace(bitmap, bitmap_png=decoder(output.payload, bitmap.width_px, bitmap.height_px, bitmap.dpi))


def _simulate_label_request(
    request: LabelProcessRequest, registry: LayoutSource, *, encoder: str = "IPL",
) -> tuple[SimulationItemResult, ...]:
    """Return ordered capture evidence in memory; failures do not stop later items.

    Only simulation mode and 1-100 validated items may enter this service. Each
    renderer call owns resolution, binding, and rasterization, and reports its
    real stage boundaries. Shared preparation encodes once; capture decodes that exact
    payload to PNG. It performs no rerendering, file write, or transport.
    """
    try:
        # Revalidate even model_construct/mutated callers. Serializer warnings
        # can include raw input values, so suppress them and use bounded errors.
        validated = LabelProcessRequest.model_validate(request.model_dump(warnings=False))
    except (ValidationError, AttributeError, TypeError, ValueError) as exc:
        raise SimulationRequestError("A valid label processing request is required.") from exc
    if validated.mode != "simulation" or not validated.items:
        raise SimulationRequestError("Simulation requires simulation mode and at least one item.")

    try:
        codec_for(encoder)
    except ValueError:
        raise SimulationRequestError("Unsupported simulation output language.") from None

    results = []
    for index, item in enumerate(validated.items):
        trace = [TraceEntry("RECEIVED", "Item received for simulation.")]
        record_event("RECEIVED", item_index=index)

        def record_stage(stage: RenderStage) -> None:
            trace.append(TraceEntry(stage, _STAGE_MESSAGES[stage]))
            record_event(stage, item_index=index)

        bitmap = None
        error = None
        payload = None
        prepared = None
        try:
            prepared = prepare_label_item(
                validated.label_code, item.facts, registry, language=encoder, on_stage=record_stage,
            )
            payload = prepared.payload
            bitmap = simulate_prepared_output(prepared)
        except UnknownLabelCodeError:
            error = SimulationError("unknown_label_code", "No active layout is registered for this label_code.")
        except TemplateError:
            error = SimulationError("invalid_template_or_facts", "The layout template, media, or required facts are invalid.")
        except RasterError:
            error = SimulationError("raster_failed", "The bitmap could not be created.")
        except Exception:
            # Never expose exception text, input facts, stderr, or private paths.
            error = SimulationError("processing_failed", "Label processing failed.")
        if error is None:
            status = "CAPTURED"
            trace.append(TraceEntry(status, "Bitmap captured in memory for preview."))
        else:
            bitmap = None
            payload = None
            prepared = None
            status = "FAILED"
            trace.append(TraceEntry(status, error.message))
        record_event(status, item_index=index, error_code=error.code if error else None)
        results.append(SimulationItemResult(index, item.item_id, status, tuple(trace), bitmap, error, payload, prepared))
    return tuple(results)


def simulate_label_request(request: LabelProcessRequest, registry: LayoutSource, *, encoder: str = "IPL") -> tuple[SimulationItemResult, ...]:
    """Correlate all item stages while retaining decoded payload capture semantics."""
    with request_context():
        try:
            return _simulate_label_request(request, registry, encoder=encoder)
        except SimulationRequestError:
            record_event("REQUEST_FAILED", error_code="invalid_request")
            raise
