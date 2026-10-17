"""Opt-in startup uses actual ledger orchestration with a fake SQL driver only."""
import base64
import builtins
import importlib
import json
import sys
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.label_intake.runtime import create_runtime_ledger
from app.label_intake.ledger import LedgerUnavailable
from tests.intake_ledger_fake import LedgerDatabase
from tests.test_label_intake import envelope, Layouts, prepared
from tests.test_intake_policy import TOKEN, ENV, policy
from tests.test_intake_ledger import pins


def environment():
    return {
        'TLS_INTAKE_LEDGER_JSON': json.dumps(dict(database_env='TLS_INTAKE_DATABASE_URL',
            active_key='k1', keys={'k1': 'TLS_INTAKE_HMAC_K1'})),
        'TLS_INTAKE_DATABASE_URL': 'postgresql://synthetic:private@127.0.0.1:1/synthetic',
        'TLS_INTAKE_HMAC_K1': base64.urlsafe_b64encode(b'A' * 32).decode().rstrip('='),
    }


@pytest.fixture
def clean_environment(monkeypatch):
    import os
    for key in tuple(os.environ):
        if key.startswith('TLS_'):
            monkeypatch.delenv(key)


def test_no_config_no_driver_and_no_generated_key(monkeypatch):
    actual = builtins.__import__
    def guarded(name, *args, **kwargs):
        assert name != 'psycopg'
        return actual(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', guarded)
    assert create_runtime_ledger({}) is None
    assert create_runtime_ledger({'TLS_INTAKE_LEDGER_JSON': ''}) is None
    ledger = create_runtime_ledger(environment())
    assert ledger.keys.versions() == {'k1'}
    assert 'private' not in repr(ledger) and 'AAAA' not in repr(ledger.keys)


@pytest.mark.parametrize('problem', ['json', 'duplicate', 'oversize', 'extra', 'missing_dsn',
    'dsn_scheme', 'dsn_port', 'missing_key', 'short_key', 'padded_key', 'noncanonical_key',
    'active_missing', 'foreign_reference', 'empty_reference', 'duplicate_reference', 'invalid_version', 'too_many_keys'])
def test_malformed_configuration_static_error_no_driver(monkeypatch, problem):
    env = environment(); config = json.loads(env['TLS_INTAKE_LEDGER_JSON'])
    if problem == 'json': env['TLS_INTAKE_LEDGER_JSON'] = '{'
    elif problem == 'duplicate': env['TLS_INTAKE_LEDGER_JSON'] = '{"active_key":"private","active_key":"k1"}'
    elif problem == 'oversize': env['TLS_INTAKE_LEDGER_JSON'] = ' ' * 16385
    elif problem == 'missing_dsn': env.pop('TLS_INTAKE_DATABASE_URL')
    elif problem == 'dsn_scheme': env['TLS_INTAKE_DATABASE_URL'] = 'https://private/secret'
    elif problem == 'dsn_port': env['TLS_INTAKE_DATABASE_URL'] = 'postgresql://localhost:private/db'
    elif problem == 'missing_key': env.pop('TLS_INTAKE_HMAC_K1')
    elif problem == 'short_key': env['TLS_INTAKE_HMAC_K1'] = 'private'
    elif problem == 'padded_key': env['TLS_INTAKE_HMAC_K1'] += '='
    elif problem == 'noncanonical_key': env['TLS_INTAKE_HMAC_K1'] = env['TLS_INTAKE_HMAC_K1'][:-1] + 'F'
    elif problem == 'extra': config['private'] = 'private'
    elif problem == 'active_missing': config['active_key'] = 'k2'
    elif problem == 'foreign_reference': config['keys']['k1'] = 'AWS_SECRET_ACCESS_KEY'
    elif problem == 'empty_reference': config['keys']['k1'] = 'TLS_INTAKE_HMAC_'
    elif problem == 'duplicate_reference': config['keys']['k2'] = 'TLS_INTAKE_HMAC_K1'
    elif problem == 'invalid_version': config['keys']['bad version'] = config['keys'].pop('k1')
    else: config['keys'] = {f'k{i}':f'TLS_INTAKE_HMAC_K{i}' for i in range(33)}
    if problem in ('extra', 'active_missing', 'foreign_reference', 'empty_reference', 'duplicate_reference', 'invalid_version', 'too_many_keys'):
        env['TLS_INTAKE_LEDGER_JSON'] = json.dumps(config)
    monkeypatch.setitem(sys.modules, 'psycopg', SimpleNamespace(connect=lambda *a, **k: pytest.fail('driver')))
    with pytest.raises(ValueError) as exc:
        create_runtime_ledger(env)
    assert str(exc.value) == 'Invalid intake ledger configuration.'
    assert exc.value.__suppress_context__


def test_key_rotation_retains_old_identity_and_dedicated_connection(monkeypatch):
    database = LedgerDatabase(); calls = []
    def connect(dsn, **kwargs):
        calls.append((dsn, kwargs)); return database.connect()
    monkeypatch.setitem(sys.modules, 'psycopg', SimpleNamespace(connect=connect))
    env = environment(); first = create_runtime_ledger(env)
    from app.label_intake.results import IntakeRequest
    request = IntakeRequest.model_validate(envelope(('A',)))
    first.admit('EXTERNAL_DEMO', request, '11111111-1111-4111-8111-111111111111', pins(request))
    config = json.loads(env['TLS_INTAKE_LEDGER_JSON']); config['active_key'] = 'k2'; config['keys']['k2'] = 'TLS_INTAKE_HMAC_K2'
    env['TLS_INTAKE_HMAC_K2'] = base64.urlsafe_b64encode(b'B'*32).decode().rstrip('=')
    env['TLS_INTAKE_LEDGER_JSON'] = json.dumps(config)
    rotated = create_runtime_ledger(env)
    from app.label_intake.results import IntakeAdmissionError
    with pytest.raises(IntakeAdmissionError) as exc:
        rotated.lookup('EXTERNAL_DEMO', request, '11111111-1111-4111-8111-111111111112')
    assert exc.value.code == 'request_in_progress'
    del config['keys']['k1']; env['TLS_INTAKE_LEDGER_JSON'] = json.dumps(config)
    with pytest.raises(LedgerUnavailable):
        create_runtime_ledger(env).lookup('EXTERNAL_DEMO', request, '11111111-1111-4111-8111-111111111112')
    assert len(calls) == database.closed == 3
    assert all(dsn == env['TLS_INTAKE_DATABASE_URL'] and opts == dict(autocommit=False,
        connect_timeout=3, options='-c statement_timeout=10000 -c lock_timeout=3000') for dsn,opts in calls)


def test_lifespan_actual_http_ledger_and_replay_without_dependency_override(clean_environment, monkeypatch, prepared):
    main = importlib.import_module('app.main'); database = LedgerDatabase(); calls = []
    def connect(*args, **kwargs): calls.append(True); return database.connect()
    monkeypatch.setitem(sys.modules, 'psycopg', SimpleNamespace(connect=connect))
    monkeypatch.setattr(main, 'settings', SimpleNamespace(persistence=None))
    for key,value in environment().items(): monkeypatch.setenv(key,value)
    monkeypatch.setenv(ENV, TOKEN); monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', policy().model_dump_json())
    monkeypatch.setattr(main.app.state, 'layout_service', Layouts(), raising=False)
    monkeypatch.delattr(main.app.state, 'intake_policy_previous', raising=False)
    assert not main.app.dependency_overrides
    assert not hasattr(main.app.state, 'intake_ledger')
    with TestClient(main.app) as client:
        assert hasattr(main.app.state, 'intake_ledger') and calls == []
        headers = {'Authorization': 'Bearer '+TOKEN}
        first = client.post('/api/v1/label-intake',json=envelope(('A',)),headers=headers)
        assert first.status_code == 200 and first.json()['status'] == 'COMPLETED', first.text
        repeated = client.post('/api/v1/label-intake',json=envelope(('A',)),headers=headers)
        assert repeated.status_code == 200 and repeated.json()['replayed']
        assert repeated.json()['results'] == first.json()['results'] and len(prepared) == 1
        assert database.closed == len(calls)
    assert not hasattr(main.app.state, 'intake_ledger')
    monkeypatch.delattr(main.app.state, 'intake_policy_previous', raising=False)


def test_invalid_ledger_fails_before_layout_initialization(clean_environment, monkeypatch):
    main = importlib.import_module('app.main')
    monkeypatch.setenv('TLS_INTAKE_LEDGER_JSON', '{')
    monkeypatch.setattr(main, 'settings', SimpleNamespace(persistence=object()))
    monkeypatch.setattr(main, 'LayoutService', lambda *a: pytest.fail('layout initialization'))
    with pytest.raises(ValueError, match='Invalid intake ledger configuration'):
        with TestClient(main.app): pass


def test_configured_startup_preserves_injected_ledger(clean_environment, monkeypatch):
    main = importlib.import_module('app.main'); injected = object()
    for key, value in environment().items(): monkeypatch.setenv(key, value)
    monkeypatch.setattr(main.app.state, 'intake_ledger', injected, raising=False)
    monkeypatch.setattr(main, 'settings', SimpleNamespace(persistence=object()))
    monkeypatch.setattr(main, 'LayoutService', lambda *a: pytest.fail('layout initialization'))
    with pytest.raises(RuntimeError, match='Intake ledger is already configured'):
        with TestClient(main.app): pass
    assert main.app.state.intake_ledger is injected


@pytest.mark.parametrize('failure', ['connect', 'missing_schema'])
def test_runtime_failure_is_closed_redacted_and_never_initializes_schema(monkeypatch, failure):
    from app.label_intake.results import IntakeRequest
    calls = []; lifecycle = []
    class Cursor:
        def execute(self, sql, *args):
            calls.append(sql)
            raise RuntimeError('private missing schema')
        def close(self): lifecycle.append('cursor_close')
    class Connection:
        autocommit = False
        def cursor(self): return Cursor()
        def rollback(self): lifecycle.append('rollback')
        def commit(self): pytest.fail('commit after failure')
        def close(self): lifecycle.append('close')
    def connect(*args, **kwargs):
        if failure == 'connect': raise RuntimeError('private connection detail')
        return Connection()
    monkeypatch.setitem(sys.modules, 'psycopg', SimpleNamespace(connect=connect))
    ledger = create_runtime_ledger(environment())
    with pytest.raises(LedgerUnavailable) as raised:
        ledger.lookup('EXTERNAL_DEMO', IntakeRequest.model_validate(envelope(('A',))),
                      '11111111-1111-4111-8111-111111111111')
    assert raised.value.status == 503 and raised.value.code == 'ledger_unavailable'
    assert 'private' not in str(raised.value) and raised.value.__suppress_context__
    if failure == 'missing_schema':
        assert calls == ['SELECT key_version,key_check FROM label_intake.key_versions']
        assert lifecycle == ['rollback', 'cursor_close', 'close']
    else:
        assert calls == lifecycle == []
