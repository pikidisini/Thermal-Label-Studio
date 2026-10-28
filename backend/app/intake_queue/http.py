"""Machine API v2 and authenticated operator metadata APIs."""
import re
from uuid import UUID, uuid4
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from app.label_intake.http import authorized_sender, configured_policy, _bearer
from app.label_intake.policy import Admission, authenticate
from app.label_intake.results import IntakeRequest, IntakeAdmissionError, IntakeResponse
from app.label_intake.ledger_models import PrintOutcome
from app.observability import current_request_id
from .store import QueueError

machine = APIRouter()
operator = APIRouter()


def store(request: Request):
    value = getattr(request.app.state,'intake_queue',None)
    if value is None:
        raise QueueError()
    return value


def queue_exception(_request, exc):
    return JSONResponse(status_code=exc.status, content={'detail': {'code':exc.code,
        'message':'Queue request could not be completed. Check status before resubmitting.'}},
        headers={'Cache-Control':'no-store'})


class Acceptance(BaseModel):
    model_config = ConfigDict(extra='forbid',frozen=True)
    request_id: str
    trace_id: str
    status: Literal['QUEUED','PROCESSING']
    status_url: str


@machine.post('/label-intake', status_code=202, response_model=Acceptance | IntakeResponse | PrintOutcome)
def enqueue(request: IntakeRequest, connection: Request, sender: Annotated[Admission, Depends(authorized_sender)]):
    result = store(connection).enqueue(request,sender,current_request_id() or str(uuid4()))
    status = 202 if result.get('status') in ('QUEUED','PROCESSING') else 200
    headers = {'Cache-Control':'no-store'}
    if 'status_url' in result:
        headers['Location'] = result['status_url']
        headers['Retry-After'] = '5'
    return JSONResponse(result,status_code=status,headers=headers)


def machine_reader(request: Request, credential=Depends(_bearer)):
    headers = request.headers.getlist('authorization')
    if credential is None or len(headers)!=1:
        raise IntakeAdmissionError(401,'unauthenticated')
    return authenticate(configured_policy(request),headers[0])


@machine.get('/label-intake/{request_id}', response_model=Acceptance | IntakeResponse | PrintOutcome)
def status(request_id: str, request: Request, sender: Annotated[Admission, Depends(machine_reader)]):
    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', request_id) is None:
        raise QueueError('invalid_request',422)
    return JSONResponse(store(request).status(sender.source.identity,request_id,admission=sender),headers={'Cache-Control':'no-store'})


@operator.get('/sap-requests')
def requests(request: Request):
    return JSONResponse({'items':store(request).view()},headers={'Cache-Control':'no-store'})


@operator.get('/sap-requests/operations')
def operations(request: Request):
    queue = store(request)
    checks = queue.operational()
    from app.config import get_settings
    settings = get_settings()
    checks['database'] = 'PASS'
    checks['object_store'] = 'NOT RUN'
    # Bounded read-only bucket reachability; no bucket creation or writes.
    if settings.persistence is not None:
        from minio import Minio
        import urllib3
        persistence = settings.persistence
        client = Minio(persistence.minio_endpoint,access_key=persistence.minio_access_key,
                       secret_key=persistence.minio_secret_key,secure=persistence.minio_secure,
                       http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=3,read=3),retries=False))
        try:
            checks['object_store'] = 'PASS' if client.bucket_exists(persistence.minio_bucket) else 'FAIL'
        except Exception:
            checks['object_store'] = 'FAIL'
    return JSONResponse(checks,headers={'Cache-Control':'no-store'})


@operator.get('/sap-requests/holds')
def holds(request: Request):
    return JSONResponse({'items':store(request).holds()},headers={'Cache-Control':'no-store'})


@operator.get('/sap-requests/{job_id}/history')
def history(job_id: UUID, request: Request):
    return JSONResponse({'items':store(request).history(str(job_id))},headers={'Cache-Control':'no-store'})


class AuditInput(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    note: str = Field(min_length=1,max_length=1000)


@operator.post('/sap-requests/{job_id}/physical-check')
def physical_check(job_id: UUID, body: AuditInput, request: Request):
    store(request).audit(str(job_id),request.state.auth_user['id'],'PHYSICAL_CHECK',body.note)
    return {'status':'RECORDED'}


@operator.post('/sap-requests/{job_id}/release-hold')
def release_hold(job_id: UUID, body: AuditInput, request: Request):
    store(request).audit(str(job_id),request.state.auth_user['id'],'RELEASE_HOLD',body.note)
    return {'status':'RELEASED','resent':False}


@operator.post('/sap-requests/printer-holds/{owner}/physical-check')
def check_printer_hold(owner: UUID, body: AuditInput, request: Request):
    store(request).audit_hold(str(owner),request.state.auth_user['id'],'PHYSICAL_CHECK',body.note)
    return {'status':'RECORDED'}


@operator.post('/sap-requests/printer-holds/{owner}/release-hold')
def release_printer_hold(owner: UUID, body: AuditInput, request: Request):
    store(request).audit_hold(str(owner),request.state.auth_user['id'],'RELEASE_HOLD',body.note)
    return {'status':'RELEASED','resent':False}
