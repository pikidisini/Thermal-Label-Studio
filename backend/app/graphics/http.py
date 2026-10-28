"""Loopback-only Graphics API, bounded JSON transport and immutable uploads."""
from uuid import UUID
import base64
from typing import Annotated
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from app.label_data import decode_json
from app.management.access import local_access
from app.management.errors import ManagementError
from .service import GraphicsUnavailable, GraphicNotFound
from .validation import MAX_BODY_BYTES

router = APIRouter()


def error(status, code):
    return HTTPException(status_code=status, detail={'code': code})


def access(request):
    try: local_access(request)
    except ManagementError: raise error(403, 'graphics_local_only') from None


def call(request, method, *args):
    service = getattr(request.app.state, 'graphics_service', None)
    if service is None: raise error(503, 'graphics_unavailable')
    try: return getattr(service, method)(*args)
    except GraphicNotFound: raise error(404, 'graphic_not_found') from None
    except GraphicsUnavailable: raise error(503, 'graphics_unavailable') from None
    except (ValueError, TypeError): raise error(422, 'invalid_graphic') from None


@router.get('/graphics')
def list_graphics(request: Request, offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
                  q: Annotated[str, Query(max_length=160)] = ''):
    access(request)
    return call(request, 'list', offset, q)


@router.get('/graphics/{identifier}')
def get_graphic(identifier: UUID, request: Request):
    access(request)
    return call(request, 'get', identifier)


@router.post('/graphics', status_code=201)
async def upload_graphic(request: Request):
    access(request)
    if request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
        raise error(415, 'unsupported_media_type')
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BODY_BYTES: raise error(413, 'graphic_too_large')
        body.extend(chunk)
    try:
        value = decode_json(bytes(body), limit=MAX_BODY_BYTES)
    except (ValueError, TypeError, RecursionError):
        raise error(422, 'invalid_graphic') from None
    return await run_in_threadpool(call, request, 'create', value)


@router.get('/graphics/{identifier}/content')
def graphic_content(identifier: UUID, request: Request):
    access(request)
    graphic = call(request, 'get', identifier)
    return Response(base64.b64decode(graphic['data_uri'].split(',', 1)[1]),
                    media_type=graphic['content_type'],
                    headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600'})
