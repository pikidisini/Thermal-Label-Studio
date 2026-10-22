"""Authentication acceptance with transactional fakes, never live storage/SAP/printers."""
from contextlib import contextmanager
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import RLock

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.auth.service import AuthService, AuthError, digest
from app.auth.http import router, COOKIE
from app.auth.middleware import AuthenticationMiddleware, permitted

PASSWORD = 'synthetic password for tests'


from .auth_test_support import MemoryStore


@pytest.fixture
def auth():
    now = [100000.0]
    service = AuthService(MemoryStore(), clock=lambda: now[0])
    service.test_time = now
    return service


def account(auth, role='Admin', username='admin'):
    user = auth.create_user(username, username, role, PASSWORD)
    token, _, _ = auth.initial_session()
    token, _, _, _ = auth.login(token, username, PASSWORD, '127.0.0.1')
    token, _, _, user = auth.change_password(token, user['id'], PASSWORD, PASSWORD + ' changed')
    return token, user


def test_password_policy_username_and_bootstrap(auth):
    auth.create_user('Admin', 'Administrator', 'Admin', PASSWORD, bootstrap=True)
    for username, bootstrap, code in [('admin', False, 'username_exists'), ('another', True, 'bootstrap_unavailable')]:
        with pytest.raises(AuthError) as exc:
            auth.create_user(username, 'Name', 'Admin', PASSWORD, bootstrap=bootstrap)
        assert exc.value.code == code
    for password in ['short', 'x' * 6, 'x' * 129]:
        with pytest.raises(AuthError):
            auth.create_user('bad', 'Bad', 'Operator', password)
    auth.create_user('seven', 'Seven', 'Operator', 'x' * 7)
    auth.create_user('unicode', 'Unicode', 'Designer', ' kata sandi Unicode 日本語 ')
    assert all('password_hash' not in u for u in auth.list_users())


@pytest.mark.parametrize('model_name', ['PasswordChange', 'UserCreate', 'PasswordReset'])
def test_password_api_models_accept_seven_and_reject_six(model_name):
    from app.auth import http
    from pydantic import ValidationError
    model = getattr(http, model_name)
    extra = {'current_password': PASSWORD} if model_name == 'PasswordChange' else (
        {'username': 'boundary', 'display_name': 'Boundary', 'role': 'Operator'} if model_name == 'UserCreate' else {})
    assert model(password='x' * 7, **extra).password.get_secret_value() == 'x' * 7
    with pytest.raises(ValidationError):
        model(password='x' * 6, **extra)


def test_rotation_expiration_and_revoke(auth):
    token, user = account(auth)
    assert digest(token) in auth.store.repo.data['sessions']
    assert token not in repr(auth.store.repo.data)
    auth.test_time[0] += 1799
    auth.session(token)
    auth.test_time[0] += 1801
    with pytest.raises(AuthError) as exc:
        auth.session(token)
    assert exc.value.status == 401
    token, user = account(auth, 'Operator', 'operator')
    auth.update_user(user['id'], {'role': 'Designer'})
    with pytest.raises(AuthError):
        auth.session(token)


def test_absolute_deadline_cannot_be_extended(auth):
    token, _ = account(auth)
    for _ in range(24):
        auth.test_time[0] += 1700
        auth.session(token)
    auth.test_time[0] += 2400
    with pytest.raises(AuthError):
        auth.session(token)


def test_login_throttle_commits_and_expires(auth):
    auth.create_user('admin', 'Admin', 'Admin', PASSWORD)
    token, _, _ = auth.initial_session()
    for _ in range(5):
        with pytest.raises(AuthError) as exc:
            auth.login(token, 'admin', 'incorrect', '127.0.0.1')
        assert exc.value.code == 'invalid_credentials'
    with pytest.raises(AuthError) as exc:
        auth.login(token, 'admin', PASSWORD, '127.0.0.1')
    assert exc.value.status == 429
    assert len(auth.store.repo.events) == 6
    auth.test_time[0] += 901
    token, _, _ = auth.initial_session()
    assert auth.login(token, 'admin', PASSWORD, '127.0.0.1')[3]['username'] == 'admin'


def test_concurrent_last_admin_protection(auth):
    _, first = account(auth)
    _, second = account(auth, username='second')
    def disable(user):
        try:
            auth.update_user(user['id'], {'active': False})
            return 'disabled'
        except AuthError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(disable, [first, second])) == ['disabled', 'last_admin']
    assert sum(u['active'] for u in auth.list_users()) == 1


def test_reset_and_logout_revoke_sessions(auth):
    token, user = account(auth, 'Operator', 'operator')
    auth.update_user(user['id'], {'password': 'another temporary password'})
    with pytest.raises(AuthError):
        auth.session(token)
    assert auth.list_users()[0]['must_change_password']
    token, _, _ = auth.initial_session()
    token, _, _, _ = auth.login(token, 'operator', 'another temporary password', 'ip')
    auth.logout(token, user['id'])
    with pytest.raises(AuthError):
        auth.session(token)


@pytest.fixture
def web(auth, monkeypatch):
    monkeypatch.setenv('TLS_AUTH_ORIGINS', 'https://studio.example.test')
    monkeypatch.delenv('TLS_AUTH_LOCAL_HTTP', raising=False)
    app = FastAPI()
    app.state.auth_service = auth
    app.state.effects = []
    app.add_middleware(AuthenticationMiddleware)
    app.include_router(router, prefix='/api/v1')
    @app.exception_handler(AuthError)
    async def error(request, exc):
        return JSONResponse({'detail': {'code': exc.code}}, status_code=exc.status)
    @app.post('/api/v1/printing/editor')
    def effect(request: Request):
        app.state.effects.append('print')
        return {'ok': True}
    @app.get('/api/v1/unclassified')
    def unclassified():
        app.state.effects.append('unclassified')
    @app.post('/api/v1/label-intake')
    def intake(request: Request):
        # Test the separate bearer boundary, not a cookie-to-bearer conversion.
        return JSONResponse({}, status_code=200 if request.headers.get('authorization') == 'Bearer synthetic' else 401)
    client = TestClient(app, base_url='https://studio.example.test')
    client.headers['Origin'] = 'https://studio.example.test'
    return client, app


def sign_in(client, auth, role='Admin', temporary=False):
    user = auth.create_user(role.lower(), role, role, PASSWORD)
    if not temporary:
        auth.store.repo.data['users'][user['id']]['must_change_password'] = False
    initial = client.get('/api/v1/auth/session')
    client.headers['X-CSRF-Token'] = initial.json()['csrf_token']
    old_cookie = client.cookies.get(COOKIE)
    result = client.post('/api/v1/auth/login', json={'username': role.lower(), 'password': PASSWORD})
    assert result.status_code == 200, result.text
    assert old_cookie != client.cookies.get(COOKIE)
    client.headers['X-CSRF-Token'] = result.json()['csrf_token']
    return user


def test_http_csrf_cookie_and_no_effects_before_admission(web, auth):
    client, app = web
    assert client.post('/api/v1/printing/editor', json={}).status_code == 401
    sign_in(client, auth)
    cookie = client.get('/api/v1/auth/session').headers['set-cookie']
    assert all(flag in cookie for flag in ['HttpOnly', 'Secure', 'SameSite=lax'])
    csrf = client.headers.pop('X-CSRF-Token')
    assert client.post('/api/v1/printing/editor', json={}).status_code == 403
    client.headers['X-CSRF-Token'] = csrf
    assert client.post('/api/v1/printing/editor', json={}, headers={'Origin': 'https://evil.test'}).status_code == 403
    assert client.get('/api/v1/unclassified').status_code == 403
    assert app.state.effects == []
    assert client.post('/api/v1/printing/editor', json={}).status_code == 200


@pytest.mark.parametrize('role', ['Admin', 'Designer', 'Operator'])
def test_http_role_matrix_and_sender_separation(web, auth, role):
    client, app = web
    sign_in(client, auth, role)
    assert client.get('/api/v1/management/users').status_code == (200 if role == 'Admin' else 403)
    assert client.post('/api/v1/printing/editor', json={}).status_code == (403 if role == 'Operator' else 200)
    assert client.post('/api/v1/label-intake', json={}).status_code == 401
    assert client.post('/api/v1/label-intake', json={}, headers={'Authorization': 'Bearer synthetic'}).status_code == 200
    assert permitted('/label-print/print', 'POST', role)
    assert permitted('/label-print/operations', 'GET', role)


def test_password_change_gate_and_session_replacement(web, auth):
    client, _ = web
    sign_in(client, auth, temporary=True)
    assert client.get('/api/v1/management/users').status_code == 403
    reused = client.post('/api/v1/auth/change-password', json={'current_password': PASSWORD, 'password': PASSWORD})
    assert reused.status_code == 422 and reused.json()['detail']['code'] == 'password_reuse'
    assert client.get('/api/v1/auth/session').json()['user']['must_change_password'] is True
    old_cookie = client.cookies.get(COOKIE)
    changed = client.post('/api/v1/auth/change-password', json={'current_password': PASSWORD, 'password': PASSWORD + ' new'})
    assert changed.status_code == 200
    assert old_cookie != client.cookies.get(COOKIE)
    assert changed.json()['user']['must_change_password'] is False
    assert old_cookie not in repr(auth.store.repo.events)


def test_repository_failure_is_503(web, auth):
    client, _ = web
    def broken():
        raise RuntimeError('private DSN must not escape')
    auth.store.transaction = broken
    result = client.get('/api/v1/auth/session')
    assert result.status_code == 503
    assert 'private' not in result.text


def test_artifact_ownership():
    from types import SimpleNamespace
    from app.label_print.artifacts import PreviewArtifacts
    cache = PreviewArtifacts()
    output = SimpleNamespace(payload=b'IPL', bitmap=SimpleNamespace(bitmap_png=b'PNG'))
    key = cache.put(output, 'alice')
    with pytest.raises(KeyError):
        cache.get_many([key], 1, 'bob')
    assert cache.entries[key][3] == 'alice'


def test_every_mounted_interactive_api_declares_a_policy():
    import re
    from app.main import app
    schema = app.openapi()
    for path, operations in schema['paths'].items():
        if not path.startswith('/api/v1/') or path == '/api/v1/label-intake':
            continue
        concrete = re.sub(r'\{[^}]+\}', 'synthetic', path.removeprefix('/api/v1'))
        for method in operations:
            assert permitted(concrete, method.upper(), 'Admin'), (method, path)


def test_read_only_requests_do_not_extend_idle_expiry(web, auth):
    client, _ = web
    sign_in(client, auth)
    original = client.get('/api/v1/auth/session').json()['idle_expires_at']
    auth.test_time[0] += 1799
    assert client.get('/api/v1/auth/session').json()['idle_expires_at'] == original
    auth.test_time[0] += 2
    assert client.get('/api/v1/auth/session').json()['user'] is None


def test_activity_and_display_only_update_keep_session_valid(web, auth):
    client, _ = web
    user = sign_in(client, auth)
    auth.test_time[0] += 1700
    response = client.post('/api/v1/auth/activity')
    assert response.status_code == 200
    auth.test_time[0] += 1700
    auth.update_user(user['id'], {'display_name': 'New Name', 'role': 'Admin', 'active': True})
    assert client.get('/api/v1/auth/session').json()['user']['display_name'] == 'New Name'


def test_body_limit_and_admin_reset_never_echo_credentials(web, auth):
    client, _ = web
    sign_in(client, auth)
    assert client.post('/api/v1/management/users', content=b'x' * 16385).status_code == 413
    response = client.post('/api/v1/management/users', json={
        'username': 'new-operator', 'display_name': 'New', 'role': 'Operator', 'password': PASSWORD,
    })
    assert response.status_code == 201
    assert 'password_hash' not in response.text and PASSWORD not in response.text
    assert PASSWORD not in str(auth.store.repo.events)
