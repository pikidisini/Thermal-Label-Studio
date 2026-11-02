"""Explicit Studio print quantity against a validated action target."""
from typing import Callable, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.config import get_settings, PrinterTarget
from app.engine.pipeline import prepare_draft_output
from app.engine.editor_request import EditorOutputRequest
from app.template_binding.composition import BindingError
from app.template_binding.models import TemplateAdmissionError
from app.engine.raster import RasterError
from app.observability import record_event, request_context
from app.printing.service import BitmapTransport
from app.printing.transport import TcpRawTransport
from app.protocols.ipl.errors import IplError
from app.activity.context import studio_identity, studio_outcome, stage

router = APIRouter()

class PrintTargetInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    host: str = Field(min_length=1, max_length=63)
    port: int = Field(ge=1, le=65535)

    @model_validator(mode="after")
    def validate_numeric_target(self):
        PrinterTarget(self.host, self.port)
        return self


class EditorPrintRequest(EditorOutputRequest):
    job_id: str = Field(pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    target: PrintTargetInput | None = None

class PrintTargetResponse(BaseModel):
    available: bool
    host: str | None = None
    port: int | None = None
    encoder: Literal["IPL"] = "IPL"

class EditorPrintResponse(BaseModel):
    request_id: str
    template_sha256: str
    binding_version: Literal[1] = 1
    status: Literal["SUBMITTED"] = "SUBMITTED"
    confirmed: Literal[False] = False
    width_px: int
    height_px: int
    dpi: float
    encoder: Literal["IPL"] = "IPL"
    payload_bytes: int
    target: PrintTargetInput
    copies: int = Field(ge=1, le=999)

def configured_target() -> PrinterTarget | None:
    return get_settings().printer

def print_transport_factory() -> Callable[[PrinterTarget], BitmapTransport]:
    """Inject construction for tests; constructing a transport performs no IO."""
    return TcpRawTransport

@router.get("/printing/target", response_model=PrintTargetResponse)
def get_print_target(target: PrinterTarget | None = Depends(configured_target)):
    # Configuration only. Opening a dialog never probes/connects to a printer.
    return PrintTargetResponse(available=target is not None, host=target.host if target else None,
                               port=target.port if target else None)

@router.post('/printing/editor', response_model=EditorPrintResponse, responses={422: {'description': 'Unprocessable Content'}, 500: {'description': 'Internal Server Error'}, 502: {'description': 'Bad Gateway'}, 503: {'description': 'Service Unavailable'}})
def print_editor(
    request: EditorPrintRequest,
    connection: Request,
    factory: Callable[[PrinterTarget], BitmapTransport] = Depends(print_transport_factory),
    default_target: PrinterTarget | None = Depends(configured_target),
):
    from .durable import configured_store, fingerprint
    from fastapi.responses import JSONResponse
    store = configured_store(connection)
    account = connection.state.auth_user['id']
    digest = fingerprint('studio', request.model_dump())
    previous = store.lookup(request.job_id, account, digest)
    if previous is not None:
        if previous['status'] == 'SUBMITTED':
            return previous['response']
        return JSONResponse(previous,status_code=202 if previous['status']=='PROCESSING' else 409,
                            headers={'Cache-Control':'no-store'})
    with request_context() as request_id:
        studio_identity(request)
        # Pydantic validated the explicit target before entering the endpoint.
        target = PrinterTarget(request.target.host, request.target.port) if request.target else default_target
        if target is None:
            raise HTTPException(status_code=503, detail={"code": "printer_unavailable"})
        try:
            bound, prepared = prepare_draft_output(request)
        except BindingError as exc:
            raise HTTPException(status_code=422, detail={"code": exc.code}) from None
        except TemplateAdmissionError:
            raise HTTPException(status_code=422, detail={"code": "invalid_print_layout"}) from None
        except IplError:
            record_event("FAILED", error_code="processing_failed")
            raise HTTPException(status_code=500, detail={"code": "print_preparation_failed"}) from None
        except ValueError:
            record_event("FAILED", error_code="invalid_request")
            raise HTTPException(status_code=422, detail={"code": "invalid_print_layout"}) from None
        except RasterError:
            record_event("FAILED", error_code="raster_failed")
            raise HTTPException(status_code=500, detail={"code": "print_preparation_failed"}) from None
        bitmap = prepared.bitmap
        result = EditorPrintResponse(request_id=request_id, template_sha256=bound.manifest.svg_sha256,
            width_px=bitmap.width_px, height_px=bitmap.height_px, dpi=bitmap.dpi,
            payload_bytes=len(prepared.payload), target=PrintTargetInput(host=target.host,port=target.port),
            copies=prepared.copies)
        stage('SUBMITTING')
        outcome = store.execute(request.job_id,account,'studio',digest,target,[prepared.payload],factory,result.model_dump())
        if outcome['status'] != 'SUBMITTED':
            return JSONResponse(outcome,status_code=202 if outcome['status']=='PROCESSING' else 502,
                                headers={'Cache-Control':'no-store'})
        record_event('SUBMITTED')
        studio_outcome(result)
        return outcome['response']


@router.get('/printing/jobs/{job_id}')
def print_job(job_id: str, request: Request, response: Response):
    from .durable import configured_store, PrintSafetyError
    from uuid import UUID
    try:
        if str(UUID(job_id)) != job_id or UUID(job_id).version != 4:
            raise ValueError()
    except ValueError:
        raise PrintSafetyError('print_job_not_found',404) from None
    response.headers['Cache-Control']='no-store'
    result = configured_store(request).lookup(job_id,request.state.auth_user['id'])
    if result is None:
        raise PrintSafetyError('print_job_not_found',404)
    return result


@router.get('/printing/holds')
def printer_holds(request: Request, response: Response):
    from .durable import configured_store
    response.headers['Cache-Control']='no-store'
    return {'items':configured_store(request).holds()}


class PhysicalCheck(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    note: str = Field(min_length=1,max_length=1000)


@router.post('/printing/holds/{owner}/physical-check')
def check_hold(owner: UUID, body: PhysicalCheck, request: Request):
    from .durable import configured_store
    configured_store(request).audit_hold(str(owner),request.state.auth_user['id'],'PHYSICAL_CHECK',body.note)
    return {'status':'RECORDED','resent':False}


@router.post('/printing/holds/{owner}/release-hold')
def release_hold(owner: UUID, body: PhysicalCheck, request: Request):
    from .durable import configured_store
    configured_store(request).audit_hold(str(owner),request.state.auth_user['id'],'RELEASE_HOLD',body.note)
    return {'status':'RELEASED','resent':False}
