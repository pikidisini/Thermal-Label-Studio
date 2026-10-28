"""Explicit browser session endpoints and admin-only account commands."""
import os
from urllib.parse import urlsplit
import ipaddress

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from .service import AuthError, AuthService, public_user
from .store import AuthStore

router = APIRouter()
COOKIE = 'tls_session'
TRUSTED_LAN_NETWORKS = (
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('fc00::/7'),
)


def service(request):
    supplied = getattr(request.app.state, 'auth_service', None)
    if supplied is not None:
        return supplied
    dsn = os.environ.get('TLS_DATABASE_URL')
    if not dsn:
        raise AuthError()
    return AuthService(AuthStore(dsn))


def validate_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment):
        raise AuthError()
    if parsed.scheme == 'http':
        try:
            address = ipaddress.ip_address(parsed.hostname)
            local = address.is_loopback
            trusted_lan = not local and any(address in network for network in TRUSTED_LAN_NETWORKS)
        except ValueError:
            local = parsed.hostname == 'localhost'
            trusted_lan = False
        local_enabled = os.environ.get('TLS_AUTH_LOCAL_HTTP') == 'true'
        lan_enabled = os.environ.get('TLS_AUTH_TRUSTED_LAN_HTTP') == 'true'
        if not ((local and local_enabled) or (trusted_lan and lan_enabled)):
            raise AuthError()


def allowed_origins():
    values = os.environ.get('TLS_AUTH_ORIGINS', '').split(',')
    origins = set()
    for value in values:
        if not value:
            continue
        validate_origin(value)
        origins.add(value)
    if not origins:
        raise AuthError()
    return origins


def transport_access(request):
    origins = allowed_origins()
    if str(request.base_url).rstrip('/') not in origins:
        raise AuthError('host_rejected', 403)
    local_http = os.environ.get('TLS_AUTH_LOCAL_HTTP') == 'true'
    lan_http = os.environ.get('TLS_AUTH_TRUSTED_LAN_HTTP') == 'true'
    if request.url.scheme != 'https':
        try:
            peer_local = request.client and ipaddress.ip_address(request.client.host).is_loopback
        except ValueError:
            peer_local = False
        if not (lan_http or (local_http and peer_local)):
            raise AuthError('https_required', 403)
    origin = request.headers.get('origin')
    if origin is not None and origin not in origins:
        raise AuthError('origin_rejected', 403)
    if request.method not in {'GET', 'HEAD'} and origin not in origins:
        raise AuthError('origin_rejected', 403)
    if request.headers.get('sec-fetch-site') == 'cross-site':
        raise AuthError('origin_rejected', 403)


def session_response(request, token, csrf, session, user):
    response = JSONResponse({'user': public_user(user) if user and 'password_hash' in user else user,
                             'csrf_token': csrf, 'expires_at': session['expires'],
                             'idle_expires_at': session['last_seen'] + 1800},
                            headers={'Cache-Control': 'no-store'})
    response.set_cookie(COOKIE, token, httponly=True, secure=request.url.scheme == 'https',
                        samesite='lax', path='/')
    return response


@router.get('/auth/session')
def get_session(request: Request):
    auth = service(request)
    token = request.cookies.get(COOKIE, '')
    try:
        session, user = auth.session(token, touch=False)
        csrf = session['csrf_token']
    except AuthError as exc:
        if exc.status != 401:
            raise
        token, csrf, session = auth.initial_session()
        user = None
    return session_response(request, token, csrf, session, user)


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Login(Command):
    username: str = Field(max_length=64)
    password: SecretStr = Field(max_length=128)


@router.post('/auth/login')
def login(body: Login, request: Request):
    token, csrf, session, user = service(request).login(request.cookies[COOKIE], body.username,
                        body.password.get_secret_value(), request.client.host if request.client else 'unknown')
    return session_response(request, token, csrf, session, user)


@router.post('/auth/logout')
def logout(request: Request):
    service(request).logout(request.cookies[COOKIE], request.state.auth_user['id'])
    response = JSONResponse({'logged_out': True}, headers={'Cache-Control': 'no-store'})
    response.delete_cookie(COOKIE, path='/', secure=request.url.scheme == 'https', httponly=True, samesite='lax')
    return response


@router.post('/auth/activity')
def activity(request: Request):
    session, _ = service(request).session(request.cookies[COOKIE], touch=True)
    return JSONResponse({'active': True, 'idle_expires_at': session['last_seen'] + 1800}, headers={'Cache-Control': 'no-store'})


class PasswordChange(Command):
    current_password: SecretStr = Field(max_length=128)
    password: SecretStr = Field(min_length=7, max_length=128)


@router.post('/auth/change-password')
def change_password(body: PasswordChange, request: Request):
    token, csrf, session, user = service(request).change_password(request.cookies[COOKIE],
        request.state.auth_user['id'], body.current_password.get_secret_value(), body.password.get_secret_value())
    return session_response(request, token, csrf, session, user)


class UserCreate(Command):
    username: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    role: str
    password: SecretStr = Field(min_length=7, max_length=128)


class UserUpdate(Command):
    display_name: str = Field(min_length=1, max_length=128)
    role: str
    active: bool


class PasswordReset(Command):
    password: SecretStr = Field(min_length=7, max_length=128)


@router.get('/management/users')
def list_users(request: Request):
    return service(request).list_users()


@router.post('/management/users', status_code=201)
def create_user(body: UserCreate, request: Request):
    return service(request).create_user(body.username, body.display_name, body.role,
                                       body.password.get_secret_value(), request.state.auth_user['id'])


@router.patch('/management/users/{identity}')
def update_user(identity: str, body: UserUpdate, request: Request):
    return service(request).update_user(identity, body.model_dump(), request.state.auth_user['id'])


@router.post('/management/users/{identity}/reset-password')
def reset_password(identity: str, body: PasswordReset, request: Request):
    return service(request).update_user(identity, {'password': body.password.get_secret_value()}, request.state.auth_user['id'])
