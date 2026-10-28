"""All-batch preparation, committed claims and one-attempt existing print sink.

No operational setup. Hard cancellation/native memory still require the T07
execution-boundary replan; cooperative checks never establish those guarantees.
"""
import hashlib
from time import monotonic
from app.engine.editor_request import EditorOutputRequest
from app.engine.output import PreparedOutput
from app.engine.pipeline import prepare_draft_output
from app.activity.context import select_item, stage
from app.engine.raster import RasterError
from app.layouts.service import LayoutArtifactError, LayoutNotFoundError, LayoutPersistenceError
from app.printing.service import (submit_prepared_output, PrintBeforeSendError,
                                  PrintInputError, PrintSubmissionError)
from app.protocols.ipl.errors import IplError
from app.template_binding.composition import BindingError
from app.template_binding.models import TemplateAdmissionError
from .ledger import Receipt, LedgerUnavailable, packed
from .ledger_models import PrintItem, PrintOutcome, PrintSummary
from .policy import authorize, preflight_print, revalidate_claim, PolicyDenied
from .results import IntakeRequest, IntakeAdmissionError, error
from .service import (pin_layout, PinnedTemplate, BASE_RESERVATION, PIN_READ_RESERVATION,
    MAX_WORKING, MAX_PIXELS, MAX_COPIES, MAX_IPL, MAX_PNG, MAX_RESPONSE,
    RESULT_METADATA_RESERVATION, DEADLINE_SECONDS, MIB)


def finish(ledger, receipt, request):
    metadata = ledger.complete_print(receipt)  # Return only after terminal commit acknowledgment.
    return PrintOutcome.model_validate({**metadata, 'request_id': request.request_id})


def fail_batch(ledger, receipt, details):
    for index, detail in enumerate(details):
        ledger.fail_pre_send(receipt, index, detail=detail or error('POLICY','preflight_aborted'),
                             skipped=detail is None)


def skip_later(ledger, receipt, index, total):
    for later in range(index + 1, total):
        ledger.fail_pre_send(receipt, later, detail=error('TRANSPORT','batch_stopped'), skipped=True)


def _read_pin(layouts, label_code):
    """Map stored-template failures without retaining raw storage exceptions."""
    try:
        return pin_layout(layouts.get_layout(label_code), label_code)
    except LayoutNotFoundError:
        return error('RESOLUTION', 'unknown_label_code')
    except LayoutArtifactError:
        return error('RESOLUTION', 'invalid_template')
    except LayoutPersistenceError:
        return error('RESOLUTION', 'layout_unavailable')
    except TemplateAdmissionError as exc:
        code = 'unsupported_feature' if exc.code == 'unsupported_feature' else 'invalid_template'
        return error('RESOLUTION', code)
    except BindingError:
        return error('RESOLUTION', 'invalid_media')
    except (ValueError, AttributeError):
        return error('RESOLUTION', 'invalid_template')
    except Exception:
        return error('RESOLUTION', 'layout_unavailable')


class _PrintResolution:
    """One batch's immutable pins and cumulative pre-render resource accounting."""

    def __init__(self, request, layouts, admission, started):
        self.request = request
        self.layouts = layouts
        self.admission = admission
        self.started = started
        self.cache = {}
        self.reservation = BASE_RESERVATION
        self.pixels = self.copies = 0
        self.stopped = False

    def _deadline(self):
        if monotonic() - self.started >= DEADLINE_SECONDS:
            raise BindingError('preparation_timeout')

    def _pin(self, label_code):
        if label_code not in self.cache:
            if self.reservation + PIN_READ_RESERVATION > MAX_WORKING:
                raise BindingError('resource_limit')
            resolved = _read_pin(self.layouts, label_code)
            self.cache[label_code] = resolved
            if isinstance(resolved, PinnedTemplate):
                self.reservation += resolved.reservation
        return self.cache[label_code]

    def item(self, item):
        pin = grant = detail = None
        if self.stopped:
            return pin, grant, detail
        try:
            self._deadline()
            self.copies += item.copies
            if self.copies > MAX_COPIES:
                raise BindingError('resource_limit')
            resolved = self._pin(item.label_code)
            if isinstance(resolved, PinnedTemplate):
                pin = resolved
                self.pixels += pin.pixels
                if self.pixels > MAX_PIXELS or self.reservation > MAX_WORKING:
                    raise BindingError('resource_limit')
                grant = preflight_print(self.admission, item.label_code, pin.evidence,
                                        item.copies, self.request.target_id)
            else:
                detail = resolved
            self._deadline()
        except PolicyDenied as exc:
            detail = exc.detail
        except BindingError as exc:
            detail = error('PREPARATION', exc.code)
            self.stopped = True
        return pin, grant, detail


def resolve(request, layouts, admission, started):
    """Freeze each stored version once and ALL routing/media budgets before render."""
    resolution = _PrintResolution(request, layouts, admission, started)
    pins, grants, details = [], [], []
    for index, item in enumerate(request.items):
        select_item(index)
        stage('RESOLVING_LAYOUT')
        pin, grant, detail = resolution.item(item)
        pins.append(pin)
        grants.append(grant)
        details.append(detail)
    return pins, grants, details, resolution.reservation


class _PrintPreparation:
    """Account for retained output buffers before any send can be claimed."""

    def __init__(self, started, reservation):
        self.started = started
        self.reservation = reservation
        self.png_total = self.ipl_total = 0

    def prepare(self, item, pin):
        if monotonic() - self.started >= DEADLINE_SECONDS:
            raise BindingError('preparation_timeout')
        output_request = EditorOutputRequest(draft={'svg': pin.svg, 'width_mm': pin.width_mm, 'height_mm': pin.height_mm, 'dpi': pin.dpi, 'binding_version': 1},data=item.data,
            encoder='IPL',copies=item.copies)
        _, output = prepare_draft_output(output_request)
        if (type(output) is not PreparedOutput or type(output.payload) is not bytes or not output.payload
                or output.language != 'IPL' or type(output.copies) is not int or output.copies != item.copies
                or (output.bitmap.width_px,output.bitmap.height_px,output.bitmap.dpi) !=
                   (round(pin.width_mm*pin.dpi/25.4),round(pin.height_mm*pin.dpi/25.4),pin.dpi)):
            raise IplError('Invalid prepared output.')
        self.png_total += len(output.bitmap.bitmap_png)
        self.ipl_total += len(output.payload)
        if (len(output.payload)>2*MIB or len(output.bitmap.bitmap_png)>MIB or
                self.png_total>MAX_PNG or self.ipl_total>MAX_IPL or self.reservation+self.png_total+self.ipl_total>MAX_WORKING
                or 4*((self.png_total+2)//3)+RESULT_METADATA_RESERVATION>MAX_RESPONSE):
            raise BindingError('resource_limit')
        if monotonic() - self.started >= DEADLINE_SECONDS:
            raise BindingError('preparation_timeout')
        return output


def _prepare_item(preparation, item, pin, ledger, receipt, index):
    try:
        output = preparation.prepare(item, pin)
        ledger.prepared(receipt, index, hashlib.sha256(output.payload).hexdigest(), len(output.payload))
        return output, None
    except IntakeAdmissionError:
        raise
    except BindingError as exc:
        code=exc.code if exc.code in ('missing_binding','null_binding','empty_binding','invalid_binding',
            'invalid_symbol','invalid_media','unsupported_feature','resource_limit','preparation_timeout') else 'invalid_symbol'
        return None, error('PREPARATION' if code in ('resource_limit','preparation_timeout') else 'BINDING',code)
    except TemplateAdmissionError: return None, error('BINDING','invalid_template')
    except RasterError: return None, error('PREPARATION','raster_failed')
    except IplError: return None, error('PREPARATION','codec_failed')
    except Exception: return None, error('PREPARATION','processing_failed')


def _prepare_outputs(request, pins, ledger, receipt, started, reservation, details):
    preparation = _PrintPreparation(started, reservation)
    outputs = []
    for index, (item, pin) in enumerate(zip(request.items, pins)):
        select_item(index)
        output, details[index] = _prepare_item(preparation, item, pin, ledger, receipt, index)
        if details[index] is not None:
            outputs.clear()
            return None
        outputs.append(output)
    return outputs


def _pin_snapshot(request, pins, grants, policy_revision):
    snapshot = []
    for index, (item, pin, grant) in enumerate(zip(request.items, pins, grants)):
        snapshot.append({'item_index': index, 'item_id': item.item_id,
            'label_code': item.label_code, 'copies': item.copies,
            'template': pin.evidence.model_dump() if pin else None,
            'media': {'width_mm': pin.width_mm, 'height_mm': pin.height_mm,
                      'dpi': pin.dpi} if pin else None,
            'target_id': grant.target_id if grant else None,
            'policy_revision': policy_revision})
    return snapshot


def print_durable(request, admission, layouts, ledger, trace_id, factory, current_policy, *, receipt=None, before_send=None):
    request = IntakeRequest.model_validate(request.model_dump())
    authorize(admission, request)
    if request.mode != 'print':
        raise IntakeAdmissionError(403,'mode_not_allowed')
    if ledger is None:
        raise LedgerUnavailable()
    sender = admission.source.identity
    replay = ledger.lookup(sender, request, trace_id) if receipt is None else None
    if replay is not None:
        return PrintOutcome.model_validate(replay)
    if layouts is None:
        raise IntakeAdmissionError(503,'intake_unavailable')
    started = monotonic()
    pins, grants, details, reservation = resolve(request, layouts, admission, started)
    snapshot = _pin_snapshot(request, pins, grants, admission.policy.revision)
    if receipt is None:
        receipt = ledger.admit(sender,request,trace_id,snapshot)
    else:
        ledger.pin_received(receipt, snapshot)
    if not isinstance(receipt, Receipt):
        return PrintOutcome.model_validate(receipt)
    if any(details):
        fail_batch(ledger,receipt,details)
        return finish(ledger,receipt,request)

    outputs = _prepare_outputs(request, pins, ledger, receipt, started, reservation, details)
    if outputs is None:
        fail_batch(ledger, receipt, details)
        return finish(ledger, receipt, request)

    _reserve_outcome(request, pins, grants, trace_id)
    return _send_outputs(request, admission, ledger, receipt, grants, outputs,
                         factory, current_policy, before_send)


def _reserve_outcome(request, pins, grants, trace_id):
    # Validate/reserve the largest public outcome BEFORE any claim/socket. Raw
    # output remains transient; every state uses the same bounded public fields.
    worst = [PrintItem(item_index=i,item_id=item.item_id,label_code=item.label_code,copies=item.copies,
        status='UNCERTAIN',template=pins[i].evidence,error=error('TRANSPORT','submission_uncertain'),
        confirmed=False,target_id=grants[i].target_id) for i,item in enumerate(request.items)]
    packed(PrintOutcome(request_id=request.request_id,trace_id=trace_id,original_trace_id=trace_id,
        mode='print',replayed=False,status='UNCERTAIN',summary=PrintSummary(total=len(worst),
        simulated=0,submitted=0,failed=0,uncertain=len(worst),skipped=0),results=worst).model_dump(),
        RESULT_METADATA_RESERVATION)


def _checked_grant(grant, admission, current_policy, ledger, receipt, index, total):
    try:
        return revalidate_claim(grant, admission, current_policy())
    except (PolicyDenied, IntakeAdmissionError) as exc:
        detail = exc.detail if isinstance(exc, PolicyDenied) else error('POLICY', 'target_not_allowed')
        ledger.fail_pre_send(receipt, index, detail=detail)
        skip_later(ledger, receipt, index, total)
        return None


def _submit_claimed(output, checked, factory, ledger, receipt, index, total):
    # Construction follows the durable claim. Injected factories must not do IO.
    try:
        transport = factory(checked.target)
    except Exception:
        ledger.settle_not_sent(receipt, index)
        skip_later(ledger, receipt, index, total)
        return False
    try:
        stage('SUBMITTING')
        submit_prepared_output(output, transport)
    except (PrintBeforeSendError, PrintInputError):
        ledger.settle_not_sent(receipt, index)
        skip_later(ledger, receipt, index, total)
        return False
    except PrintSubmissionError:
        ledger.settle_send(receipt, index, 'UNCERTAIN')
        stage('UNCERTAIN')
        return False  # Settlement atomically skips all later unclaimed items.
    ledger.settle_send(receipt, index, 'SUBMITTED')
    stage('SUBMITTED')
    return True


def _send_outputs(request, admission, ledger, receipt, grants, outputs,
                  factory, current_policy, before_send):
    claim_attempted = False
    if before_send is not None:
        before_send()
    try:
        for index, (grant, output) in enumerate(zip(grants,outputs)):
            select_item(index)
            checked = _checked_grant(grant, admission, current_policy,
                                     ledger, receipt, index, len(outputs))
            if checked is None:
                break
            claim_attempted = True  # Lost commit ACK may have durably claimed it.
            if ledger.claim_send(receipt,index,target_id=checked.target_id,policy_revision=checked.policy_revision) is not True:
                raise LedgerUnavailable()
            stage('SEND_CLAIMED')
            if not _submit_claimed(output, checked, factory, ledger, receipt, index, len(outputs)):
                break
        return finish(ledger,receipt,request)
    except IntakeAdmissionError:
        if claim_attempted:
            raise IntakeAdmissionError(503,'response_unavailable') from None
        raise
    except Exception:
        raise IntakeAdmissionError(503,'response_unavailable' if claim_attempted else 'ledger_unavailable') from None
    finally:
        outputs.clear()
