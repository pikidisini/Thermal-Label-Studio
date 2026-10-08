"""Safe create/list/open API for uploaded Studio sample data."""
import json
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .service import DatasetPersistenceError, DatasetNotFoundError
from .validation import MAX_BYTES, validate_payload

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
        value = json.loads(body)
        if not isinstance(value, dict) or set(value) != {"name", "original_filename", "payload"}: raise ValueError()
        for key, limit in (("name", 160), ("original_filename", 255)):
            if not isinstance(value[key], str) or not 1 <= len(value[key].strip()) <= limit or "\x00" in value[key]: raise ValueError()
            value[key].encode("utf-8")
        payload = validate_payload(value["payload"])
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise error(422, "invalid_dataset") from None
    return await run_in_threadpool(call, request, "create", value["name"].strip(), value["original_filename"].strip(), payload)
