"""Application RFC execution with fake driver/worker only; real SAP is separate."""
import base64
import json
import subprocess
from types import SimpleNamespace
import pytest
from app.sap_rfc import runtime as rfc_runtime, worker
from app.sap_rfc.models import Connection, Operation
from tests.test_management import runtime
from tests.test_sap_rfc import CONNECTION, OPERATION, save

SECRET = 'synthetic-SAP-password'


def setup_live(client, store, monkeypatch):
    monkeypatch.setenv('TLS_MANAGEMENT_KEY_ENCRYPTION', base64.urlsafe_b64encode(b'K' * 32).decode())
    assert save(client, store, 'sap-connections', {'connection': {**CONNECTION, 'enabled': True}, 'password': SECRET}).status_code == 200
    assert save(client, store, 'sap-operations', {'operation': {**OPERATION, 'enabled': True, 'response_mode': 'label_json', 'mappings': []}}).status_code == 200
    monkeypatch.setattr(rfc_runtime, 'available', lambda: True)


def fake_response():
    return {'result': {'EV_STATUS': 'S', 'EV_MESSAGE': 'data_read', 'EV_JSON': '{"label_code":"SYNTHETIC","data":{"batch_number":"0000000001"}}'}, 'system_id': 'MOCK'}


def test_live_uses_saved_credentials_and_returns_actual_evidence_without_config_write(runtime, monkeypatch):
    client, database, store = runtime
    setup_live(client, store, monkeypatch)
    calls = []
    def call(connection, operation, parameters, password):
        assert connection.host == CONNECTION['host']
        assert password == SECRET
        calls.append(parameters)
        return fake_response()
    monkeypatch.setattr(rfc_runtime, 'call', call)
    events = len(database.events)
    result = client.post('/api/v1/management/sap-operations/ROLL/execute', json={'revision': store.read().policy.revision, 'values': {'IV_ROLL': '0000000001'}})
    assert result.status_code == 200
    assert result.json()['evidence'] == 'sap'
    assert result.json()['sap_contacted'] is True
    assert result.json()['items'][0]['label_code'] == 'SYNTHETIC'
    assert result.headers['cache-control'] == 'no-store'
    assert calls == [{'IV_ROLL': '0000000001'}]
    assert len(database.events) == events
    assert SECRET not in result.text


@pytest.mark.parametrize('code,status', [('sap_logon_failed', 422), ('sap_communication_failed', 503), ('sap_timeout', 503), ('sap_execution_not_allowed', 403)])
def test_live_failure_is_bounded_without_retry(runtime, monkeypatch, code, status):
    client, database, store = runtime
    setup_live(client, store, monkeypatch)
    calls = []
    def call(*args):
        calls.append(True)
        raise rfc_runtime.RfcError(code)
    monkeypatch.setattr(rfc_runtime, 'call', call)
    result = client.post('/api/v1/management/sap-operations/ROLL/execute', json={'revision': store.read().policy.revision, 'values': {'IV_ROLL': '001'}})
    assert result.status_code == status
    assert result.json()['detail']['code'] == code
    assert len(calls) == 1
    assert SECRET not in result.text


def test_configuration_change_during_call_discards_response(runtime, monkeypatch):
    client, database, store = runtime
    setup_live(client, store, monkeypatch)
    def call(*args):
        database.document['policy']['revision'] = 'CHANGED'
        return fake_response()
    monkeypatch.setattr(rfc_runtime, 'call', call)
    result = client.post('/api/v1/management/sap-operations/ROLL/execute', json={'revision': store.read().policy.revision, 'values': {'IV_ROLL': '001'}})
    assert result.status_code == 409
    assert 'SYNTHETIC' not in result.text


@pytest.fixture
def configured_worker(monkeypatch):
    monkeypatch.setenv('TLS_SAP_RFC_ENABLED', 'true')
    monkeypatch.setenv('TLS_SAP_RFC_PYTHON', 'synthetic-python')
    monkeypatch.setenv('TLS_SAP_RFC_TARGETS', CONNECTION['host'] + '/' + CONNECTION['client'])
    monkeypatch.setenv('TLS_SAP_RFC_FUNCTIONS', OPERATION['function_name'])
    monkeypatch.setattr(rfc_runtime.Path, 'is_file', lambda self: True)
    return Connection(**CONNECTION), Operation(**OPERATION)


def test_worker_allowlist_prevents_process_creation(configured_worker, monkeypatch):
    connection, operation = configured_worker
    monkeypatch.setenv('TLS_SAP_RFC_TARGETS', 'other.example/100')
    monkeypatch.setattr(subprocess, 'run', lambda *a, **k: pytest.fail('Unapproved target executed'))
    with pytest.raises(rfc_runtime.RfcError, match='sap_execution_not_allowed'):
        rfc_runtime.call(connection, operation, {}, SECRET)


def test_worker_uses_stdin_secrets_and_timeout_without_retry(configured_worker, monkeypatch):
    connection, operation = configured_worker
    monkeypatch.setenv('TLS_DATABASE_URL', 'private-DB-secret')
    calls = []
    def run(args, **kwargs):
        assert SECRET not in str(args)
        assert SECRET not in str(kwargs['env'])
        assert 'TLS_DATABASE_URL' not in kwargs['env']
        assert json.loads(kwargs['input'])['connection']['passwd'] == SECRET
        calls.append(True)
        raise subprocess.TimeoutExpired(args, 30)
    monkeypatch.setattr(subprocess, 'run', run)
    with pytest.raises(rfc_runtime.RfcError, match='sap_timeout'):
        rfc_runtime.call(connection, operation, {}, SECRET)
    assert calls == [True]


def test_native_worker_calls_once_closes_and_never_commits(monkeypatch):
    import sys
    calls = []
    class FakeConnection:
        def __init__(self, **kwargs): pass
        def get_connection_attributes(self): return {'client': '100', 'sysId': 'MOCK'}
        def call(self, name, **parameters): calls.append((name, parameters)); return {'EV_STATUS': 'S'}
        def close(self): calls.append('closed')
    class Error(Exception): pass
    monkeypatch.setitem(sys.modules, 'pyrfc', SimpleNamespace(Connection=FakeConnection, LogonError=Error, CommunicationError=Error, ABAPApplicationError=Error, ABAPRuntimeError=Error))
    result = worker.invoke({'connection': {'client': '100'}, 'function': 'Z_READ_ONLY', 'parameters': {'IV_CHARG': '0000000001'}})
    assert result['result']['EV_STATUS'] == 'S'
    assert calls == [('Z_READ_ONLY', {'IV_CHARG': '0000000001'}), 'closed']


@pytest.mark.parametrize('change', ['disabled', 'missing_password', 'missing_input'])
def test_invalid_execution_never_reaches_worker(runtime, monkeypatch, change):
    client, database, store = runtime
    setup_live(client, store, monkeypatch)
    if change == 'disabled':
        database.document['sap_rfc']['connections'][0]['enabled'] = False
    if change == 'missing_password':
        database.document['sap_rfc']['connections'][0]['password_ciphertext'] = None
    monkeypatch.setattr(rfc_runtime, 'call', lambda *a: pytest.fail('Invalid request executed'))
    result = client.post('/api/v1/management/sap-operations/ROLL/execute', json={
        'revision': store.read().policy.revision,
        'values': {} if change == 'missing_input' else {'IV_ROLL': '001'}})
    assert result.status_code == 422
