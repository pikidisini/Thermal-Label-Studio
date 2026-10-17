"""Shared development access guard and writable-store requirement."""
import ipaddress
from urllib.parse import urlsplit
from .errors import ManagementError
from .store import configured_store

def local_access(request):
    try:
        if request.client is None or not ipaddress.ip_address(request.client.host).is_loopback:
            raise ValueError()
        origin = request.headers.get('origin')
        if origin:
            parsed = urlsplit(origin)
            if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError()
            if parsed.hostname != 'localhost' and not ipaddress.ip_address(parsed.hostname).is_loopback:
                raise ValueError()
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise ValueError()
    except (ValueError, TypeError):
        raise ManagementError('management_local_only', 403) from None



def require_store(request):
    local_access(request)
    store = configured_store(request)
    if store is None:
        raise ManagementError()
    return store
