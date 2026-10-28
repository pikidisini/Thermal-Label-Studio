"""Sequential stored-template simulation with immutable pins and finite budgets.

The HTTP owner holds the single process slot. This internal service has no
authentication, replay ledger, dataset writer or physical transport dependency.
"""
import base64
from dataclasses import dataclass
import hashlib
import math
from time import monotonic
from app.engine.editor_request import EditorOutputRequest
from app.engine.pipeline import prepare_draft_output
from app.activity.context import select_item, stage
from app.engine.raster import RasterError
from app.layouts.service import LayoutArtifactError, LayoutNotFoundError, LayoutPersistenceError
from app.protocols.ipl.errors import IplError
from app.simulation.service import simulate_prepared_output
from app.template_binding.composition import BindingError
from app.template_binding.models import TemplateAdmissionError
from app.template_binding.validation import admit_template
from .results import (IntakeAdmissionError, IntakeRequest, IntakeResponse, ItemResult,
                      SimulationEvidence, Summary, TemplateEvidence, error, batch_status)

MIB = 1024 * 1024
MAX_PIXELS = 16_000_000
MAX_COPIES = 9990
MAX_PNG = 8 * MIB
MAX_IPL = 16 * MIB
MAX_RESPONSE = 12 * MIB
MAX_WORKING = 128 * MIB
DEADLINE_SECONDS = 60
RESULT_METADATA_RESERVATION = 128 * 1024
# Conservative application reservation: body/decoded scalars, result JSON/base64,
# and one sequential binder/raster/codec working set. No raw IPL is retained.
BASE_RESERVATION = 16 * MIB + 12 * MIB + 48 * MIB + MIB
PIN_READ_RESERVATION = 512 * 1024 * 8 + 10_000 * 1024


@dataclass(frozen=True)
class PinnedTemplate:
    svg: str
    width_mm: float
    height_mm: float
    dpi: float
    evidence: TemplateEvidence
    pixels: int
    reservation: int


def pin_layout(layout, label_code):
    """Validate storage provenance and media before using the shared engine."""
    svg_bytes = layout.svg.encode('utf-8')
    if (layout.label_code != label_code or type(layout.version) is not int or layout.version < 1
            or len(svg_bytes) > 512 * 1024
            or hashlib.sha256(svg_bytes).hexdigest() != layout.svg_sha256):
        raise TemplateAdmissionError('invalid_template')
    evidence = TemplateEvidence(version=layout.version, svg_sha256=layout.svg_sha256)
    if len(evidence.model_dump_json()) > 256:
        raise TemplateAdmissionError('invalid_template')
    manifest = admit_template(layout.svg)
    width, height, dpi = layout.width_mm, layout.height_mm, layout.dpi
    if (any(type(v) not in (int, float) or not math.isfinite(v) for v in (width, height, dpi))
            or not (10 <= width <= 500 and 10 <= height <= 500 and 72 <= dpi <= 600)
            or (manifest.width_mm, manifest.height_mm) != (width, height)
            or manifest.view_box != (0, 0, width * 4, height * 4)):
        raise BindingError('invalid_media')
    x, y = round(width * dpi / 25.4), round(height * dpi / 25.4)
    if min(x, y) < 1 or max(x, y) > 4096 or x * y > 4_000_000:
        raise BindingError('invalid_media')
    return PinnedTemplate(layout.svg, width, height, dpi, evidence, x * y,
                          len(svg_bytes) * 8 + manifest.node_count * 1024)


def failure(index, item, code, stage, template=None, *, skipped=False):
    return ItemResult(item_index=index, item_id=item.item_id, label_code=item.label_code,
                      copies=item.copies, status='SKIPPED' if skipped else 'FAILED',
                      template=template, error=error(stage, code))


class _SimulationBatch:
    """Sequential simulation with batch-local pins and bounded retained output."""

    def __init__(self, request, layouts, on_prepared):
        self.request = request
        self.layouts = layouts
        self.on_prepared = on_prepared
        self.started = monotonic()
        self.pins = {}
        self.results = [None] * len(request.items)
        self.reservation = BASE_RESERVATION
        self.total_pixels = self.total_copies = 0
        self.stopped = False
        self.png_total = self.ipl_total = 0
        self.preparation_stopped = False

    def _resolve_pin(self, index, item):
        if item.label_code in self.pins:
            return True
        if self.reservation + PIN_READ_RESERVATION > MAX_WORKING:
            self.results[index] = failure(index, item, 'resource_limit', 'RESOLUTION')
            self.stopped = True
            return False
        try:
            pin = pin_layout(self.layouts.get_layout(item.label_code), item.label_code)
            self.pins[item.label_code] = pin
            self.reservation += pin.reservation
        except LayoutNotFoundError:
            self.pins[item.label_code] = error('RESOLUTION', 'unknown_label_code')
        except LayoutArtifactError:
            self.pins[item.label_code] = error('RESOLUTION', 'invalid_template')
        except LayoutPersistenceError:
            self.pins[item.label_code] = error('RESOLUTION', 'layout_unavailable')
        except TemplateAdmissionError as exc:
            self.pins[item.label_code] = error('RESOLUTION', 'unsupported_feature' if exc.code == 'unsupported_feature' else 'invalid_template')
        except BindingError:
            self.pins[item.label_code] = error('RESOLUTION', 'invalid_media')
        except (ValueError, AttributeError):
            self.pins[item.label_code] = error('RESOLUTION', 'invalid_template')
        except Exception:
            self.pins[item.label_code] = error('RESOLUTION', 'layout_unavailable')
        return True

    def _account_pin(self, index, item):
        pin = self.pins[item.label_code]
        if not isinstance(pin, PinnedTemplate):
            self.results[index] = failure(index, item, pin.code, pin.stage)
        elif self.reservation > MAX_WORKING or self.total_pixels + pin.pixels > MAX_PIXELS:
            self.results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
            self.stopped = True
        else:
            self.total_pixels += pin.pixels
        return pin

    def resolve_item(self, index, item):
        select_item(index)
        stage('RESOLVING_LAYOUT')
        if self.stopped:
            self.results[index] = failure(index, item, 'batch_stopped', 'PREPARATION', skipped=True)
            return
        if monotonic() - self.started >= DEADLINE_SECONDS:
            self.results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION')
            self.stopped = True
            return
        if self.total_copies + item.copies > MAX_COPIES:
            self.results[index] = failure(index, item, 'resource_limit', 'ADMISSION')
            self.stopped = True
            return
        self.total_copies += item.copies
        if not self._resolve_pin(index, item):
            return
        pin = self._account_pin(index, item)
        if monotonic() - self.started >= DEADLINE_SECONDS:
            self.results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION', pin.evidence if isinstance(pin, PinnedTemplate) else None)
            self.stopped = True

    def _prepare_output(self, index, item, pin):
        output_request = EditorOutputRequest(draft={'svg': pin.svg, 'width_mm': pin.width_mm, 'height_mm': pin.height_mm, 'dpi': pin.dpi, 'binding_version': 1}, data=item.data, encoder='IPL', copies=item.copies)
        _, prepared = prepare_draft_output(output_request)
        if len(prepared.payload) > 2 * MIB or len(prepared.bitmap.bitmap_png) > MIB:
            self.results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
            self.preparation_stopped = True
            return
        if self.on_prepared is not None:
            self.on_prepared(index, hashlib.sha256(prepared.payload).hexdigest(), len(prepared.payload))
        bitmap = simulate_prepared_output(prepared)
        png = bitmap.bitmap_png
        if len(png) > MIB or self.png_total + len(png) > MAX_PNG or self.ipl_total + len(prepared.payload) > MAX_IPL or (4 * ((self.png_total + len(png) + 2) // 3) + RESULT_METADATA_RESERVATION > MAX_RESPONSE):
            self.results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
            self.preparation_stopped = True
            return
        if monotonic() - self.started >= DEADLINE_SECONDS:
            self.results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION', pin.evidence)
            self.preparation_stopped = True
            return
        self.png_total += len(png)
        self.ipl_total += len(prepared.payload)
        self.results[index] = ItemResult(item_index=index, item_id=item.item_id, label_code=item.label_code, copies=item.copies, status='SIMULATED', template=pin.evidence, error=None, simulation=SimulationEvidence(png_base64=base64.b64encode(png).decode('ascii'), width_px=bitmap.width_px, height_px=bitmap.height_px, dpi=bitmap.dpi, payload_sha256=hashlib.sha256(prepared.payload).hexdigest(), payload_bytes=len(prepared.payload)))

    def prepare_item(self, index, item):
        select_item(index)
        if self.results[index] is not None:
            return
        pin = self.pins[item.label_code]
        if self.preparation_stopped:
            self.results[index] = failure(index, item, 'batch_stopped', 'PREPARATION', pin.evidence, skipped=True)
            return
        if monotonic() - self.started >= DEADLINE_SECONDS:
            self.results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION', pin.evidence)
            self.preparation_stopped = True
            return
        try:
            self._prepare_output(index, item, pin)
        except IntakeAdmissionError:
            raise
        except BindingError as exc:
            code = exc.code if exc.code in ('missing_binding', 'null_binding', 'empty_binding', 'invalid_binding', 'invalid_symbol', 'invalid_media', 'unsupported_feature', 'resource_limit') else 'invalid_symbol'
            self.results[index] = failure(index, item, code, 'BINDING', pin.evidence)
            self.preparation_stopped = code == 'resource_limit'
        except TemplateAdmissionError:
            self.results[index] = failure(index, item, 'invalid_template', 'BINDING', pin.evidence)
        except RasterError:
            self.results[index] = failure(index, item, 'raster_failed', 'PREPARATION', pin.evidence)
        except IplError:
            self.results[index] = failure(index, item, 'codec_failed', 'PREPARATION', pin.evidence)
        except Exception:
            self.results[index] = failure(index, item, 'processing_failed', 'PREPARATION', pin.evidence)

    def snapshot(self):
        snapshot = []
        for index, item in enumerate(self.request.items):
            pin = self.pins.get(item.label_code)
            chosen = self.results[index].template if self.results[index] is not None else pin.evidence
            snapshot.append({'item_index': index, 'item_id': item.item_id, 'label_code': item.label_code, 'copies': item.copies, 'template': chosen.model_dump() if chosen else None, 'media': {'width_mm': pin.width_mm, 'height_mm': pin.height_mm, 'dpi': pin.dpi} if chosen else None})
        return snapshot

def simulate_request(request: IntakeRequest, layouts, trace_id: str, *, on_pinned=None, on_prepared=None) -> IntakeResponse:
    # Defensive re-admission snapshots nested mutable model members as well.
    request = IntakeRequest.model_validate(request.model_dump())
    if request.mode != 'simulation':
        raise IntakeAdmissionError(403, 'mode_not_allowed')
    batch = _SimulationBatch(request, layouts, on_prepared)
    for index, item in enumerate(request.items):
        batch.resolve_item(index, item)
    if on_pinned is not None:
        on_pinned(batch.snapshot())  # Commit before any preparation.
    for index, item in enumerate(request.items):
        batch.prepare_item(index, item)
    results = batch.results
    counts = {status: sum(item.status == status for item in results) for status in ('SIMULATED', 'FAILED', 'SKIPPED')}
    return IntakeResponse(request_id=request.request_id, trace_id=trace_id, original_trace_id=trace_id, target_id=request.target_id,
        status=batch_status(counts['SIMULATED'], len(results)),
        summary=Summary(total=len(results), simulated=counts['SIMULATED'], failed=counts['FAILED'], skipped=counts['SKIPPED']),
        results=results)
