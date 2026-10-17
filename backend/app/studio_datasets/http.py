"""Safe create/list/open API for uploaded Studio sample data."""
from app.label_data import decode_json, MAX_BYTES, validate_payload
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .service import DatasetPersistenceError, DatasetNotFoundError, DatasetConflictError
from app.management.access import local_access
from app.management.errors import ManagementError
from datetime import datetime
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
    except DatasetConflictError: raise error(409, "dataset_conflict") from None
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

@router.put('/studio-sample-datasets/{identifier}')
async def update_dataset(identifier: UUID, request: Request):
    try: local_access(request)
    except ManagementError: raise error(403, 'dataset_local_only') from None
    if request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
        raise error(415, 'unsupported_media_type')
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BYTES + 4096: raise error(413, 'dataset_too_large')
        body.extend(chunk)
    try:
        value = decode_json(bytes(body), limit=MAX_BYTES + 4096)
        stamp = value.pop('expected_updated_at')
        if not isinstance(stamp, str): raise ValueError()
        expected = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if expected.tzinfo is None: raise ValueError()
        validate_upload(value)
        payload = validate_payload(value['payload'])
    except (ValueError, TypeError, KeyError, AttributeError, UnicodeError, RecursionError):
        raise error(422, 'invalid_dataset') from None
    return await run_in_threadpool(call, request, 'update', identifier, value['name'].strip(), value['original_filename'].strip(), payload, expected)
