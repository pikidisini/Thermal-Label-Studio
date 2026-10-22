"""HTTP composition: acceptance foundation plus explicit fixture simulation."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .auth.middleware import AuthenticationMiddleware
from .auth.http import router as auth_router
from .auth.service import AuthError
from .observability import CorrelationMiddleware, current_request_id
from .config import get_settings
from .labels.models import LabelProcessAccepted, LabelProcessRequest
from .labels.resolver import ACTIVE_LAYOUTS, UnknownLabelCodeError
from .labels.service import InvalidLabelCodeError, accept_label_process_request
from .simulation.http import router as simulation_router
from .simulation.editor_http import router as editor_simulation_router
from .simulation.design_http import router as design_router
from .printing.http import router as printing_router
from .label_print.http import router as label_print_router
from .runtime import configure_fixture_serving, readiness_response
from .layouts.http import router as layouts_router
from .layouts.service import LayoutPersistenceError, LayoutService

from .studio_datasets.http import router as studio_datasets_router
from .studio_datasets.service import StudioDatasetService, DatasetPersistenceError
from .label_intake.http import router as intake_router, IntakeBodyMiddleware, admission_exception
from .label_intake.results import IntakeAdmissionError
from .label_intake.runtime import create_runtime_ledger
from .management.router import router as management_router
from .management.errors import management_exception, ManagementError
from .management.middleware import ManagementBodyMiddleware
from .activity.middleware import ActivityMiddleware
from .graphics.http import router as graphics_router
from .graphics.service import GraphicsService

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate explicit intake configuration before any persistence initialization.
    # Construction is local only: never connect or apply intake schema here.
    intake_ledger = create_runtime_ledger()
    if intake_ledger is not None and getattr(app.state, 'intake_ledger', None) is not None:
        raise RuntimeError('Intake ledger is already configured.')
    if settings.persistence is not None:
        layout_service = LayoutService(settings.persistence)
        try:
            layout_service.initialize()
        except LayoutPersistenceError as exc:
            raise RuntimeError("Layout persistence startup failed.") from exc
        app.state.layout_service = layout_service
        dataset_service = StudioDatasetService(settings.persistence)
        try:
            dataset_service.initialize()
        except DatasetPersistenceError as exc:
            raise RuntimeError("Sample dataset persistence startup failed.") from exc
        app.state.studio_dataset_service = dataset_service
        # Construction only. Graphics DDL requires separate named-target provisioning.
        app.state.graphics_service = GraphicsService(settings.persistence)
    if intake_ledger is not None:
        app.state.intake_ledger = intake_ledger
    try:
        yield
    finally:
        if intake_ledger is not None:
            del app.state.intake_ledger


app = FastAPI(title=settings.application_name, lifespan=lifespan)
from .engine.editor_request import EditorBodyMiddleware
app.add_middleware(EditorBodyMiddleware)
app.add_middleware(IntakeBodyMiddleware, path=f"{settings.api_prefix}/label-intake")
app.add_middleware(ManagementBodyMiddleware, prefix=f"{settings.api_prefix}/management")
app.add_middleware(ActivityMiddleware, api_prefix=settings.api_prefix)
app.add_middleware(AuthenticationMiddleware, api_prefix=settings.api_prefix)
app.add_middleware(CorrelationMiddleware)

@app.exception_handler(AuthError)
async def auth_exception(_request, exc):
    return JSONResponse(status_code=exc.status, content={'detail': {'code': exc.code, 'message': 'Authentication or account operation failed.'}}, headers={'Cache-Control': 'no-store'})

app.include_router(auth_router, prefix=settings.api_prefix)
app.add_exception_handler(IntakeAdmissionError, admission_exception)
app.add_exception_handler(ManagementError, management_exception)
app.include_router(management_router, prefix=settings.api_prefix)
app.include_router(intake_router, prefix=settings.api_prefix)
app.include_router(simulation_router, prefix=settings.api_prefix)
app.include_router(editor_simulation_router, prefix=settings.api_prefix)
app.include_router(design_router, prefix=settings.api_prefix)
app.include_router(printing_router, prefix=settings.api_prefix)
app.include_router(label_print_router, prefix=settings.api_prefix)
app.include_router(layouts_router, prefix=settings.api_prefix)
app.include_router(studio_datasets_router, prefix=settings.api_prefix)
app.include_router(graphics_router, prefix=settings.api_prefix)
configure_fixture_serving(app, settings)


def request_validation_detail(errors: list[dict[str, object]], *, print_request: bool = False) -> dict[str, str]:
    """Convert framework validation data into the bounded public error shape."""
    location = errors[0].get("loc", ()) if errors else ()
    field = location[-1] if location else "request"
    error_type = errors[0].get("type", "") if errors else ""

    if print_request and tuple(location) == ("body", "copies"):
        return {"code": "invalid_print_copies", "message": "Copies must be an integer from 1 to 999."}
    if "target" in location:
        return {"code": "invalid_printer_target", "message": "Enter a valid numeric printer IP address and TCP port (1-65535)."}
    if field == "label_code":
        message = (
            "label_code is required."
            if error_type == "missing"
            else "label_code must not be blank."
        )
        code = "invalid_label_code"
    elif field == "mode":
        code = "invalid_mode"
        message = "mode must be either simulation or print."
    elif field == "item_id":
        code = "invalid_item"
        message = "item_id must not be blank."
    else:
        code = "invalid_request"
        message = "Request validation failed."

    return {"code": code, "message": message}


@app.exception_handler(RequestValidationError)
async def stable_request_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": request_validation_detail(exc.errors(), print_request=_request.scope.get("path") == f"{settings.api_prefix}/printing/editor"), "request_id": current_request_id()})


@app.exception_handler(HTTPException)
async def correlated_http_error(_request: Request, exc: HTTPException) -> JSONResponse:
    safe_messages = {
        "graphics_local_only": "Graphics is available locally only.",
        "graphics_unavailable": "Graphics storage is unavailable. Contact the application administrator.",
        "graphic_not_found": "The graphic was not found.",
        "graphic_too_large": "Image is too large for this template. Use a smaller image.",
        "invalid_graphic": "Choose a valid single-frame PNG, JPEG or WebP within the image limits.",
        "preview_busy": "Another preview request is still running. Wait before trying again.",
        "print_busy": "The server is printing or checking printer status. Try again later.",
        "printer_configuration_changed": "Printer configuration changed. Refresh the printer catalog.",
        "preview_expired": "Preview expired. Retrieve data again before printing.",
        "invalid_print_artifact": "The selected print artifact is invalid.",
        "invalid_print_payload": "The prepared print payload is invalid.",
        "print_package_too_large": "Select fewer labels for this print request.",
        "preview_local_only": "This preview operation is available locally only.",
        "invalid_batches": "Batch identifiers are invalid.",
        "dataset_required": "Select a saved dataset.",
        "invalid_sap_request": "The SAP preview request is invalid.",
        "sap_operation_required": "Select a configured label RFC operation.",
        "sap_operation_not_found": "The selected RFC operation was not found.",
        "sap_label_contract_required": "The selected RFC does not match the label preview contract.",
        "layout_unavailable": "Layout storage is unavailable.",
        "management_conflict": "Management configuration changed. Reload it before retrying.",
        "management_unavailable": "Management configuration is unavailable.",
        "missing_binding": "Required label data is missing.",
        "null_binding": "Required label data is null.",
        "empty_binding": "Required label data is empty.",
        "invalid_binding": "Label binding is invalid.",
        "invalid_symbol": "The symbol value is invalid.",
        "symbol_capacity": "The symbol exceeds its capacity.",
        "unsupported_feature": "The template uses an unsupported binding profile.",
        "invalid_media": "Draft media does not match the template.",
        "resource_limit": "The label exceeds processing limits.",
        "printer_unavailable": "Choose a printer IP address and TCP port in the Print dialog.",
        "invalid_print_layout": "The current Studio canvas cannot be printed.",
        "print_preparation_failed": "The print payload could not be prepared.",
        "print_submission_uncertain": "Print submission failed or is uncertain. Check the printer before sending again; delivery is unconfirmed.",
        "invalid_dataset": "The sample dataset is invalid.",
        "dataset_too_large": "The sample dataset exceeds 2 MiB.",
        "dataset_not_found": "The requested sample dataset was not found.",
        "dataset_persistence_unavailable": "Sample dataset storage is unavailable.",
        "invalid_label_code": "label_code must not be blank.",
        "unknown_label_code": "No active layout is registered for this label_code.",
        "fixture_simulation_failed": "Fixture simulation could not be completed.",
        "invalid_editor_layout": "The current Studio canvas cannot be simulated.",
        "editor_preview_failed": "The Studio preview could not be created.",
        "invalid_layout": "The layout content is invalid.",
        "layout_not_found": "The requested layout was not found.",
        "layout_persistence_unavailable": "Layout persistence is unavailable.",
    }
    code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
    detail = {"code": code, "message": safe_messages[code]} if code in safe_messages else {
        "code": "processing_failed", "message": "Label processing failed.",
    }
    return JSONResponse(status_code=exc.status_code, content={
        "detail": detail, "request_id": current_request_id(),
    })


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> JSONResponse:
    return readiness_response(settings)


@app.post(f"{settings.api_prefix}/labels/process", response_model=LabelProcessAccepted)
def validate_label_process(request: LabelProcessRequest) -> LabelProcessAccepted:
    """Accept a fixture request; this endpoint does not process label output."""
    try:
        return accept_label_process_request(request, ACTIVE_LAYOUTS)
    except InvalidLabelCodeError:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_label_code",
                "message": "label_code must not be blank.",
            },
        ) from None
    except UnknownLabelCodeError:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "unknown_label_code",
                "message": "No active layout is registered for this label_code.",
            },
        ) from None
