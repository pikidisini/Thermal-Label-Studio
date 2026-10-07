"""HTTP composition: acceptance foundation plus explicit fixture simulation."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .observability import CorrelationMiddleware, current_request_id
from .config import get_settings
from .labels.models import LabelProcessAccepted, LabelProcessRequest
from .labels.resolver import ACTIVE_LAYOUTS, UnknownLabelCodeError
from .labels.service import InvalidLabelCodeError, accept_label_process_request
from .simulation.http import router as simulation_router
from .simulation.editor_http import router as editor_simulation_router
from .runtime import configure_fixture_serving, readiness_response
from .layouts.http import router as layouts_router
from .layouts.service import LayoutPersistenceError, LayoutService

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.persistence is not None:
        layout_service = LayoutService(settings.persistence)
        try:
            layout_service.initialize()
        except LayoutPersistenceError as exc:
            raise RuntimeError("Layout persistence startup failed.") from exc
        app.state.layout_service = layout_service
    yield


app = FastAPI(title=settings.application_name, lifespan=lifespan)
app.add_middleware(CorrelationMiddleware)
app.include_router(simulation_router, prefix=settings.api_prefix)
app.include_router(editor_simulation_router, prefix=settings.api_prefix)
app.include_router(layouts_router, prefix=settings.api_prefix)
configure_fixture_serving(app, settings)


def request_validation_detail(errors: list[dict[str, object]]) -> dict[str, str]:
    """Convert framework validation data into the bounded public error shape."""
    location = errors[0].get("loc", ()) if errors else ()
    field = location[-1] if location else "request"
    error_type = errors[0].get("type", "") if errors else ""

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
    return JSONResponse(status_code=422, content={"detail": request_validation_detail(exc.errors()), "request_id": current_request_id()})


@app.exception_handler(HTTPException)
async def correlated_http_error(_request: Request, exc: HTTPException) -> JSONResponse:
    safe_messages = {
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
