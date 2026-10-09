"""Safe create/list/open API for uploaded Studio sample data."""
from app.label_data import decode_json, MAX_BYTES, validate_payload
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .service import DatasetPersistenceError, DatasetNotFoundError
from .validation import validate_upload

router = APIRouter()

def error(status, code):
    return HTTPException(status_code=status, detail={"code": code})

def service(request):
    result = getattr(request.app.state, "studio_dataset_service", None)
    if result is None: raise error(503, "dataset_persistence_unavailable")
    return result

def call(request, method, *args):
    try: return getattr(service(request), method)(*args)
    except DatasetNotFoundError: raise error(404, "dataset_not_found") from None
    except DatasetPersistenceError: raise error(503, "dataset_persistence_unavailable") from None

@router.get("/studio-sample-datasets")
def list_datasets(request: Request):
    return call(request, "list")

@router.get("/studio-sample-datasets/{identifier}")
def get_dataset(identifier: UUID, request: Request):
    return call(request, "get", identifier)

@router.post("/studio-sample-datasets", status_code=201)
async def create_dataset(request: Request):
    # Bound streaming before JSON decoding, including requests without Content-Length.
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BYTES + 4096: raise error(413, "dataset_too_large")
        body.extend(chunk)
    try:
        value = decode_json(bytes(body), limit=MAX_BYTES + 4096)
        validate_upload(value)
        payload = validate_payload(value["payload"])
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise error(422, "invalid_dataset") from None
    return await run_in_threadpool(call, request, "create", value["name"].strip(), value["original_filename"].strip(), payload)
