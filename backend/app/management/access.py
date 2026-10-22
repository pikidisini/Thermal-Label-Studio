"""Shared authenticated access guard and writable-store requirement."""
from .errors import ManagementError
from .store import configured_store

def local_access(request):
    # Session and permission checks run centrally before router/body processing.
    from app.auth.service import AuthError
    if not getattr(request.state, 'auth_user', None):
        raise AuthError('unauthenticated', 401)




def require_store(request):
    local_access(request)
    store = configured_store(request)
    if store is None:
        raise ManagementError()
    return store
