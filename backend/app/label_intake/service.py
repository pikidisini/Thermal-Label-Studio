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
                      SimulationEvidence, Summary, TemplateEvidence, error)

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


def simulate_request(request: IntakeRequest, layouts, trace_id: str, *, on_pinned=None, on_prepared=None) -> IntakeResponse:
    # Defensive re-admission snapshots nested mutable model members as well.
    request = IntakeRequest.model_validate(request.model_dump())
    if request.mode != 'simulation':
        raise IntakeAdmissionError(403, 'mode_not_allowed')
    started = monotonic()
    pins, results = {}, [None] * len(request.items)
    reservation, total_pixels, total_copies = BASE_RESERVATION, 0, 0
    stopped = False

    # Resolve each unique active version once; finish ALL resolution/media/copies
    # accounting before any binder/raster call. Earlier pins survive later edits.
    for index, item in enumerate(request.items):
        select_item(index)
        stage('RESOLVING_LAYOUT')
        if stopped:
            results[index] = failure(index, item, 'batch_stopped', 'PREPARATION', skipped=True)
            continue
        if monotonic() - started >= DEADLINE_SECONDS:
            results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION')
            stopped = True
            continue
        if total_copies + item.copies > MAX_COPIES:
            results[index] = failure(index, item, 'resource_limit', 'ADMISSION')
            stopped = True
            continue
        total_copies += item.copies
        if item.label_code not in pins:
            if reservation + PIN_READ_RESERVATION > MAX_WORKING:
                results[index] = failure(index, item, 'resource_limit', 'RESOLUTION')
                stopped = True
                continue
            try:
                pin = pin_layout(layouts.get_layout(item.label_code), item.label_code)
                pins[item.label_code] = pin
                reservation += pin.reservation
            except LayoutNotFoundError:
                pins[item.label_code] = error('RESOLUTION', 'unknown_label_code')
            except LayoutArtifactError:
                pins[item.label_code] = error('RESOLUTION', 'invalid_template')
            except LayoutPersistenceError:
                pins[item.label_code] = error('RESOLUTION', 'layout_unavailable')
            except TemplateAdmissionError as exc:
                pins[item.label_code] = error('RESOLUTION', 'unsupported_feature' if exc.code == 'unsupported_feature' else 'invalid_template')
            except BindingError:
                pins[item.label_code] = error('RESOLUTION', 'invalid_media')
            except (ValueError, AttributeError, UnicodeError):
                pins[item.label_code] = error('RESOLUTION', 'invalid_template')
            except Exception:
                pins[item.label_code] = error('RESOLUTION', 'layout_unavailable')
        pin = pins[item.label_code]
        if not isinstance(pin, PinnedTemplate):
            results[index] = failure(index, item, pin.code, pin.stage)
        elif reservation > MAX_WORKING or total_pixels + pin.pixels > MAX_PIXELS:
            results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
            stopped = True
        else:
            total_pixels += pin.pixels
        if monotonic() - started >= DEADLINE_SECONDS:
            results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION',
                                     pin.evidence if isinstance(pin, PinnedTemplate) else None)
            stopped = True

    if on_pinned is not None:
        snapshot = []
        for index, item in enumerate(request.items):
            pin = pins.get(item.label_code)
            chosen = results[index].template if results[index] is not None else pin.evidence
            snapshot.append(dict(item_index=index, item_id=item.item_id, label_code=item.label_code,
                copies=item.copies, template=chosen.model_dump() if chosen else None,
                media=dict(width_mm=pin.width_mm, height_mm=pin.height_mm, dpi=pin.dpi) if chosen else None))
        on_pinned(snapshot)  # Durable admission MUST commit before any preparation.

    png_total, ipl_total = 0, 0
    preparation_stopped = False
    for index, item in enumerate(request.items):
        select_item(index)
        if results[index] is not None:
            continue
        pin = pins[item.label_code]
        if preparation_stopped:
            results[index] = failure(index, item, 'batch_stopped', 'PREPARATION', pin.evidence, skipped=True)
            continue
        if monotonic() - started >= DEADLINE_SECONDS:
            results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION', pin.evidence)
            preparation_stopped = True
            continue
        try:
            output_request = EditorOutputRequest(
                draft=dict(svg=pin.svg, width_mm=pin.width_mm, height_mm=pin.height_mm,
                           dpi=pin.dpi, binding_version=1), data=item.data,
                encoder='IPL', copies=item.copies)
            _, prepared = prepare_draft_output(output_request)
            if len(prepared.payload) > 2 * MIB or len(prepared.bitmap.bitmap_png) > MIB:
                results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
                preparation_stopped = True
                continue
            if on_prepared is not None:
                on_prepared(index, hashlib.sha256(prepared.payload).hexdigest(), len(prepared.payload))
            bitmap = simulate_prepared_output(prepared)
            png = bitmap.bitmap_png
            if (len(png) > MIB or png_total + len(png) > MAX_PNG
                    or ipl_total + len(prepared.payload) > MAX_IPL
                    or 4 * ((png_total + len(png) + 2) // 3) + RESULT_METADATA_RESERVATION > MAX_RESPONSE):
                results[index] = failure(index, item, 'resource_limit', 'PREPARATION', pin.evidence)
                preparation_stopped = True
                continue
            if monotonic() - started >= DEADLINE_SECONDS:
                results[index] = failure(index, item, 'preparation_timeout', 'PREPARATION', pin.evidence)
                preparation_stopped = True
                continue
            png_total += len(png)
            ipl_total += len(prepared.payload)
            results[index] = ItemResult(
                item_index=index, item_id=item.item_id, label_code=item.label_code, copies=item.copies,
                status='SIMULATED', template=pin.evidence, error=None,
                simulation=SimulationEvidence(png_base64=base64.b64encode(png).decode('ascii'),
                    width_px=bitmap.width_px, height_px=bitmap.height_px, dpi=bitmap.dpi,
                    payload_sha256=hashlib.sha256(prepared.payload).hexdigest(), payload_bytes=len(prepared.payload)))
        except IntakeAdmissionError:
            raise  # Never disguise unavailable/ambiguous ledger commits as item success.
        except BindingError as exc:
            code = exc.code if exc.code in ('missing_binding', 'null_binding', 'empty_binding',
                'invalid_binding', 'invalid_symbol', 'invalid_media', 'unsupported_feature', 'resource_limit') else 'invalid_symbol'
            results[index] = failure(index, item, code, 'BINDING', pin.evidence)
            preparation_stopped = code == 'resource_limit'
        except TemplateAdmissionError:
            results[index] = failure(index, item, 'invalid_template', 'BINDING', pin.evidence)
        except RasterError:
            results[index] = failure(index, item, 'raster_failed', 'PREPARATION', pin.evidence)
        except IplError:
            results[index] = failure(index, item, 'codec_failed', 'PREPARATION', pin.evidence)
        except Exception:
            results[index] = failure(index, item, 'processing_failed', 'PREPARATION', pin.evidence)
        # Drop item working buffers before preparing the next item.
        finally:
            prepared = bitmap = png = output_request = None
    counts = {status: sum(item.status == status for item in results) for status in ('SIMULATED', 'FAILED', 'SKIPPED')}
    return IntakeResponse(request_id=request.request_id, trace_id=trace_id, original_trace_id=trace_id, target_id=request.target_id,
        status='COMPLETED' if counts['SIMULATED'] == len(results) else 'PARTIAL' if counts['SIMULATED'] else 'FAILED',
        summary=Summary(total=len(results), simulated=counts['SIMULATED'], failed=counts['FAILED'], skipped=counts['SKIPPED']),
        results=results)
