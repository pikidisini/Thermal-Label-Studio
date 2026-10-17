from fastapi import APIRouter, Request
from ..access import local_access
from app.activity.store import configured_activity_store, ActivityUnavailable
from ..errors import ManagementError

router = APIRouter()


@router.get('/activity')
def activity(request: Request):
    local_access(request)
    try:
        store = configured_activity_store(request.app)
        return {'enabled': store is not None, 'entries': [] if store is None else store.read()}
    except ActivityUnavailable:
        raise ManagementError('activity_unavailable', 503) from None
