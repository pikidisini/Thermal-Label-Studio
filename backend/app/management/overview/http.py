from fastapi import APIRouter, Request
from ..access import local_access
from ..store import configured_store
from .service import read_snapshot
router = APIRouter()

@router.get('/snapshot')
def snapshot(request: Request):
    local_access(request)
    return read_snapshot(configured_store(request))
