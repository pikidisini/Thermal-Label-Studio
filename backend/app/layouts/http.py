"""HTTP endpoints for the concrete persisted-layout feature."""

from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.observability import current_request_id

from .models import LayoutSummary, SaveLayoutRequest, StoredLayout
from .service import LayoutNotFoundError, LayoutPersistenceError, LayoutService


router = APIRouter()


def service(request: Request) -> LayoutService:
    layout_service = getattr(request.app.state, "layout_service", None)
    if layout_service is None:
        raise HTTPException(status_code=503, detail={"code": "layout_persistence_unavailable"})
    return layout_service


@router.get("/layouts", response_model=list[LayoutSummary])
def list_layouts(request: Request) -> list[LayoutSummary]:
    try:
        return service(request).list_layouts()
    except LayoutPersistenceError:
        raise HTTPException(status_code=503, detail={"code": "layout_persistence_unavailable"}) from None


@router.post("/layouts", response_model=LayoutSummary, status_code=201)
def save_layout(payload: SaveLayoutRequest, request: Request) -> LayoutSummary:
    try:
        return service(request).save_layout(payload)
    except LayoutPersistenceError as exc:
        code = "invalid_layout" if str(exc) == "Layout content is invalid." else "layout_persistence_unavailable"
        status = 422 if code == "invalid_layout" else 503
        raise HTTPException(status_code=status, detail={"code": code}) from None


@router.get("/layouts/{label_code}", response_model=StoredLayout)
def get_layout(label_code: str, request: Request) -> StoredLayout:
    try:
        return service(request).get_layout(label_code)
    except LayoutNotFoundError:
        raise HTTPException(status_code=404, detail={"code": "layout_not_found"}) from None
    except LayoutPersistenceError:
        raise HTTPException(status_code=503, detail={"code": "layout_persistence_unavailable"}) from None
