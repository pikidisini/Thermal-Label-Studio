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


def resolve(request, layouts, admission, started):
    """Freeze each stored version once and ALL routing/media budgets before render."""
    cache, pins, grants, details = {}, [], [], []
    reservation, pixels, copies = BASE_RESERVATION, 0, 0
    stopped = False
    for index, item in enumerate(request.items):
        select_item(index)
        stage('RESOLVING_LAYOUT')
        pin = grant = detail = None
        if stopped:
            pins.append(None); grants.append(None); details.append(None)
            continue
        try:
            if monotonic() - started >= DEADLINE_SECONDS:
                raise BindingError('preparation_timeout')
            copies += item.copies
            if copies > MAX_COPIES:
                raise BindingError('resource_limit')
            if item.label_code not in cache:
                if reservation + PIN_READ_RESERVATION > MAX_WORKING:
                    raise BindingError('resource_limit')
                try:
                    cache[item.label_code] = pin_layout(layouts.get_layout(item.label_code), item.label_code)
                except LayoutNotFoundError: cache[item.label_code] = error('RESOLUTION','unknown_label_code')
                except LayoutArtifactError: cache[item.label_code] = error('RESOLUTION','invalid_template')
                except LayoutPersistenceError: cache[item.label_code] = error('RESOLUTION','layout_unavailable')
                except TemplateAdmissionError as exc:
                    cache[item.label_code] = error('RESOLUTION','unsupported_feature' if exc.code=='unsupported_feature' else 'invalid_template')
                except BindingError: cache[item.label_code] = error('RESOLUTION','invalid_media')
                except (ValueError, AttributeError, UnicodeError): cache[item.label_code] = error('RESOLUTION','invalid_template')
                except Exception: cache[item.label_code] = error('RESOLUTION','layout_unavailable')
                if isinstance(cache[item.label_code], PinnedTemplate):
                    reservation += cache[item.label_code].reservation
            resolved = cache[item.label_code]
            if isinstance(resolved, PinnedTemplate):
                pin = resolved
                pixels += pin.pixels
                if pixels > MAX_PIXELS or reservation > MAX_WORKING:
                    raise BindingError('resource_limit')
                grant = preflight_print(admission, item.label_code, pin.evidence, item.copies, request.target_id)
            else:
                detail = resolved
            if monotonic() - started >= DEADLINE_SECONDS:
                raise BindingError('preparation_timeout')
        except PolicyDenied as exc:
            detail = exc.detail
        except BindingError as exc:
            detail = error('PREPARATION',exc.code)
            stopped = True
        pins.append(pin); grants.append(grant); details.append(detail)
    return pins, grants, details, reservation


def print_durable(request, admission, layouts, ledger, trace_id, factory, current_policy):
    request = IntakeRequest.model_validate(request.model_dump())
    authorize(admission, request)
    if request.mode != 'print':
        raise IntakeAdmissionError(403,'mode_not_allowed')
    if ledger is None:
        raise LedgerUnavailable()
    sender = admission.source.identity
    replay = ledger.lookup(sender, request, trace_id)
    if replay is not None:
        return PrintOutcome.model_validate(replay)
    if layouts is None:
        raise IntakeAdmissionError(503,'intake_unavailable')
    started = monotonic()
    pins, grants, details, reservation = resolve(request, layouts, admission, started)
    snapshot = []
    for index, (item, pin, grant) in enumerate(zip(request.items,pins,grants)):
        snapshot.append(dict(item_index=index,item_id=item.item_id,label_code=item.label_code,copies=item.copies,
            template=pin.evidence.model_dump() if pin else None,
            media=dict(width_mm=pin.width_mm,height_mm=pin.height_mm,dpi=pin.dpi) if pin else None,
            target_id=grant.target_id if grant else None,policy_revision=admission.policy.revision))
    receipt = ledger.admit(sender,request,trace_id,snapshot)
    if not isinstance(receipt, Receipt):
        return PrintOutcome.model_validate(receipt)
    if any(details):
        fail_batch(ledger,receipt,details)
        return finish(ledger,receipt,request)

    outputs, png_total, ipl_total = [], 0, 0
    for index, (item, pin) in enumerate(zip(request.items,pins)):
        select_item(index)
        try:
            if monotonic() - started >= DEADLINE_SECONDS:
                raise BindingError('preparation_timeout')
            output_request = EditorOutputRequest(draft=dict(svg=pin.svg,width_mm=pin.width_mm,
                height_mm=pin.height_mm,dpi=pin.dpi,binding_version=1),data=item.data,
                encoder='IPL',copies=item.copies)
            _, output = prepare_draft_output(output_request)
            if (type(output) is not PreparedOutput or type(output.payload) is not bytes or not output.payload
                    or output.language != 'IPL' or type(output.copies) is not int or output.copies != item.copies
                    or (output.bitmap.width_px,output.bitmap.height_px,output.bitmap.dpi) !=
                       (round(pin.width_mm*pin.dpi/25.4),round(pin.height_mm*pin.dpi/25.4),pin.dpi)):
                raise IplError('Invalid prepared output.')
            png_total += len(output.bitmap.bitmap_png)
            ipl_total += len(output.payload)
            if (len(output.payload)>2*MIB or len(output.bitmap.bitmap_png)>MIB or
                    png_total>MAX_PNG or ipl_total>MAX_IPL or reservation+png_total+ipl_total>MAX_WORKING
                    or 4*((png_total+2)//3)+RESULT_METADATA_RESERVATION>MAX_RESPONSE):
                raise BindingError('resource_limit')
            if monotonic() - started >= DEADLINE_SECONDS:
                raise BindingError('preparation_timeout')
            ledger.prepared(receipt,index,hashlib.sha256(output.payload).hexdigest(),len(output.payload))
            outputs.append(output)
        except IntakeAdmissionError:
            raise
        except BindingError as exc:
            code=exc.code if exc.code in ('missing_binding','null_binding','empty_binding','invalid_binding',
                'invalid_symbol','invalid_media','unsupported_feature','resource_limit','preparation_timeout') else 'invalid_symbol'
            details[index]=error('PREPARATION' if code in ('resource_limit','preparation_timeout') else 'BINDING',code)
        except TemplateAdmissionError: details[index]=error('BINDING','invalid_template')
        except RasterError: details[index]=error('PREPARATION','raster_failed')
        except IplError: details[index]=error('PREPARATION','codec_failed')
        except Exception: details[index]=error('PREPARATION','processing_failed')
        if details[index] is not None:
            outputs.clear()
            fail_batch(ledger,receipt,details)
            return finish(ledger,receipt,request)

    # Validate/reserve the largest public outcome BEFORE any claim/socket. Raw
    # output remains transient; every state uses the same bounded public fields.
    worst = [PrintItem(item_index=i,item_id=item.item_id,label_code=item.label_code,copies=item.copies,
        status='UNCERTAIN',template=pins[i].evidence,error=error('TRANSPORT','submission_uncertain'),
        confirmed=False,target_id=grants[i].target_id) for i,item in enumerate(request.items)]
    packed(PrintOutcome(request_id=request.request_id,trace_id=trace_id,original_trace_id=trace_id,
        mode='print',replayed=False,status='UNCERTAIN',summary=PrintSummary(total=len(worst),
        simulated=0,submitted=0,failed=0,uncertain=len(worst),skipped=0),results=worst).model_dump(),
        RESULT_METADATA_RESERVATION)
    claim_attempted = False
    try:
        for index, (grant, output) in enumerate(zip(grants,outputs)):
            select_item(index)
            try:
                checked = revalidate_claim(grant,admission,current_policy())
            except (PolicyDenied, IntakeAdmissionError) as exc:
                detail = exc.detail if isinstance(exc,PolicyDenied) else error('POLICY','target_not_allowed')
                ledger.fail_pre_send(receipt,index,detail=detail)
                skip_later(ledger,receipt,index,len(outputs))
                break
            claim_attempted = True  # Lost commit ACK may have durably claimed it.
            if ledger.claim_send(receipt,index,target_id=checked.target_id,policy_revision=checked.policy_revision) is not True:
                raise LedgerUnavailable()
            stage('SEND_CLAIMED')
            try:
                # Factory construction is AFTER durable claim. Failure here has
                # no submit invocation; injected factories must not perform IO.
                transport = factory(checked.target)
            except Exception:
                ledger.settle_not_sent(receipt,index)
                skip_later(ledger,receipt,index,len(outputs))
                break
            try:
                stage('SUBMITTING')
                submit_prepared_output(output,transport)
            except (PrintBeforeSendError,PrintInputError):
                ledger.settle_not_sent(receipt,index)
                skip_later(ledger,receipt,index,len(outputs))
                break
            except PrintSubmissionError:
                ledger.settle_send(receipt,index,'UNCERTAIN')
                stage('UNCERTAIN')
                break  # Ledger atomically skips all later unclaimed items.
            ledger.settle_send(receipt,index,'SUBMITTED')
            stage('SUBMITTED')
        return finish(ledger,receipt,request)
    except IntakeAdmissionError:
        if claim_attempted:
            raise IntakeAdmissionError(503,'response_unavailable') from None
        raise
    except Exception:
        raise IntakeAdmissionError(503,'response_unavailable' if claim_attempted else 'ledger_unavailable') from None
    finally:
        outputs.clear()
