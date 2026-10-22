from fastapi import APIRouter, Request
from ..access import local_access
from ..store import configured_store
from .service import read_snapshot
router = APIRouter()

@router.get('/snapshot')
def snapshot(request: Request):
    local_access(request)
    result = read_snapshot(configured_store(request))
    if request.state.auth_user['role'] == 'Designer':
        # Studio identity changes need a revision, never source/key/SAP configuration.
        return {'writable': result['writable'], 'policy_origin': result['policy_origin'],
                'document': {'policy': {'revision': result['document']['policy']['revision']}}}
    return result
