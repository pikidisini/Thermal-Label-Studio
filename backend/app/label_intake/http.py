"""Fail-closed HTTP admission with a non-queued process-wide intake slot."""
from app.http_body import BodyLimitExceeded, read_bounded_body, replay_body
from threading import Lock, BoundedSemaphore
from uuid import uuid4
from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPBearer
from starlette.responses import JSONResponse
from app.label_data.validation import MAX_BYTES, LabelDataError, admit_json
from app.observability import current_request_id
from .results import AdmissionResponse, IntakeAdmissionError, IntakeRequest, IntakeResponse, error
from .durable_service import simulate_durable
from .policy import Admission, authenticate, authorize, load_policy, validate_transition
from .ledger_models import PrintOutcome
from .print_service import print_durable
from app.printing.transport import TcpRawTransport
from app.activity.context import intake_identity, intake_outcome

router = APIRouter()
_slot = Lock()
_queue_body_slots = BoundedSemaphore(4)
_policy_lock = Lock()
_bearer = HTTPBearer(auto_error=False)


def admission_response(status, code, request_id=None):
    body = AdmissionResponse(request_id=request_id, trace_id=current_request_id() or str(uuid4()),
                             detail=error('ADMISSION', code))
    return JSONResponse(status_code=status, content=body.model_dump(),
                        headers={'WWW-Authenticate': 'Bearer'} if status == 401 else None)


class IntakeBodyMiddleware:
    """Reserve the slot before buffering/parsing; release after response or failure."""

    def __init__(self, app, path='/api/v1/label-intake', queued=False):
        self.app, self.path = app, path
        self.slot = _queue_body_slots if queued else _slot

    @staticmethod
    def accepts_json(headers):
        media = headers.get(b'content-type', b'').decode('latin1').lower().split(';')
        parameters = [part.strip() for part in media[1:]]
        return media[0].strip() == 'application/json' and not any(
            part.startswith('charset=') and part.split('=', 1)[1].strip('" ') not in ('utf-8', 'utf8')
            for part in parameters)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path') != self.path:
            return await self.app(scope, receive, send)
        if not self.slot.acquire(blocking=False):
            return await admission_response(429, 'intake_busy')(scope, receive, send)
        try:
            if not self.accepts_json(dict(scope.get('headers', []))):
                return await admission_response(415, 'unsupported_media_type')(scope, receive, send)
            try:
                body = await read_bounded_body(receive, MAX_BYTES)
            except BodyLimitExceeded:
                return await admission_response(413, 'request_too_large')(scope, receive, send)
            if body is None:
                return
            try:
                payload = admit_json(body)
            except LabelDataError as exc:
                status = {'malformed_json': 400, 'duplicate_member': 400, 'request_too_large': 413}.get(exc.code, 422)
                return await admission_response(status, exc.code)(scope, receive, send)
            scope.setdefault('state', {})['intake_request_id'] = payload['request_id']
            return await self.app(scope, replay_body(body, receive), send)
        finally:
            self.slot.release()



def configured_policy(transport: Request):
    # Explicit server-owned injection supports controlled snapshots/revocation.
    policy = getattr(transport.app.state, 'intake_policy', None)
    if policy is not None:
        return policy
    # Opt-in managed snapshots replace environment policy only after explicit
    # provisioning. Store failure denies admission; never fall back to old grants.
    from app.management import configured_store, ManagementError
    try:
        store = configured_store(transport)
        if store is not None:
            return store.read().policy
    except ManagementError:
        raise IntakeAdmissionError(503, 'policy_unavailable') from None
    with _policy_lock:
        current = load_policy()
        previous = getattr(transport.app.state, 'intake_policy_previous', None)
        if previous is not None:
            validate_transition(previous, current)
        transport.app.state.intake_policy_previous = current
        return current


def authorized_sender(request: IntakeRequest, transport: Request,
                      credential=Depends(_bearer)) -> Admission:
    headers = transport.headers.getlist('authorization')
    if credential is None or len(headers) != 1:
        raise IntakeAdmissionError(401, 'unauthenticated')
    admission = authenticate(configured_policy(transport), headers[0])
    if admission.source.async_only and transport.url.path == '/api/v1/label-intake':
        raise IntakeAdmissionError(403, 'mode_not_allowed')
    intake_identity(request, admission)
    authorize(admission, request)
    return admission


def stored_layouts(request: Request):
    return getattr(request.app.state, 'layout_service', None)


def durable_ledger(request: Request):
    # No auto-initialization or process-memory fallback. T11 owns authorized setup.
    return getattr(request.app.state, 'intake_ledger', None)


def intake_transport_factory():
    # Returning a constructor performs no socket IO; invocation follows claim.
    return TcpRawTransport


@router.post('/label-intake', response_model=IntakeResponse | PrintOutcome,
             responses={status: {'model': AdmissionResponse} for status in (400, 401, 403, 409, 413, 415, 422, 429, 503)})
def intake(request: IntakeRequest, connection: Request, sender: Admission = Depends(authorized_sender), layouts=Depends(stored_layouts), ledger=Depends(durable_ledger), factory=Depends(intake_transport_factory)):
    if sender.source.identity != request.sender['system']:
        return admission_response(403, 'sender_not_allowed', request.request_id)
    authorize(sender,request)
    intake_identity(request, sender)
    trace = current_request_id() or str(uuid4())
    if request.mode == 'print':
        result = print_durable(request,sender,layouts,ledger,trace,factory,lambda:configured_policy(connection))
    else:
        result = simulate_durable(request, sender.source.identity, layouts, ledger, trace)
    intake_outcome(result)
    try:
        return JSONResponse(content=result.wire())
    except Exception:
        if request.mode == 'print':
            raise IntakeAdmissionError(503,'response_unavailable') from None
        raise


def admission_exception(request: Request, exc: IntakeAdmissionError):
    return admission_response(exc.status, exc.code, getattr(request.state, 'intake_request_id', None))
