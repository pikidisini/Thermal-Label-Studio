from fastapi import APIRouter, Request
from ..access import local_access
from ..store import configured_store
from .service import read_audit
router = APIRouter()

@router.get('/audit')
def audit(request: Request):
    local_access(request)
    return read_audit(configured_store(request))
