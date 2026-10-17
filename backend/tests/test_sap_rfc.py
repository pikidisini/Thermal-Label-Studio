"""Declarative RFC configuration; synthetic fixtures, no SAP/network/real storage."""
import base64
import json
import pytest
from pydantic import ValidationError
from app.sap_rfc.models import Operation, Parameter
from app.sap_rfc.contract import ContractError, prepare, map_response
from tests.test_management import runtime

CONNECTION = dict(connection_id='DEV', name='SAP Development', host='sap.example.test', system_number='00', client='100', username='RFC_USER', language='EN', enabled=False)
OPERATION = dict(operation_id='ROLL', name='Roll data', connection_id='DEV', function_name='Z_GET_LABEL_DATA', enabled=False,
    parameters=[dict(name='IV_ROLL', label='Roll number', kind='string', required=True, source='operator')],
    result_path='ET_DATA', result_kind='table', mappings=[dict(source='ROLL', target='Roll Number', required=True), dict(source='ZERO', target='zero', required=False)])


def save(client, store, path, body):
    return client.put('/api/v1/management/' + path, json={'revision': store.read().policy.revision, **body})


def setup_config(client, store):
    assert save(client, store, 'sap-connections', {'connection': CONNECTION}).status_code == 200
    assert save(client, store, 'sap-operations', {'operation': OPERATION}).status_code == 200


def test_connection_password_encryption_redaction_retention_and_audit(runtime, monkeypatch):
    client, database, store = runtime
    master = b'K' * 32
    monkeypatch.setenv('TLS_MANAGEMENT_KEY_ENCRYPTION', base64.urlsafe_b64encode(master).decode())
    secret = 'synthetic-unicode-password-123'
    response = save(client, store, 'sap-connections', {'connection': CONNECTION, 'password': secret})
    assert response.status_code == 200
    assert response.json()['sap_rfc']['connections'][0]['password_configured']
    encrypted = store.read().sap_rfc.connections[0].password_ciphertext
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    payload = base64.urlsafe_b64decode(encrypted[3:])
    assert AESGCM(master).decrypt(payload[:12], payload[12:], b'thermal-label-studio/sap-password/v1/DEV').decode() == secret
    assert save(client, store, 'sap-connections', {'connection': {**CONNECTION, 'name': 'Renamed'}}).status_code == 200
    assert store.read().sap_rfc.connections[0].password_ciphertext == encrypted
    public = client.get('/api/v1/management/snapshot').text + client.get('/api/v1/management/audit').text
    assert secret not in public and encrypted not in public and 'password_ciphertext' not in public
    assert secret not in json.dumps(database.document) + json.dumps(database.events)
    forged = save(client, store, 'sap-connections', {'connection': {**CONNECTION, 'password_ciphertext': encrypted}})
    assert forged.status_code == 422


def test_configuration_crud_references_revision_sample_and_closed_execution(runtime):
    client, database, store = runtime
    setup_config(client, store)
    revision = store.read().policy.revision
    result = client.post('/api/v1/management/sap-operations/ROLL/sample', json={'revision': revision, 'values': {'IV_ROLL': '001'}, 'response': {'ET_DATA': [{'ROLL': '001', 'ZERO': 0}]}})
    assert result.status_code == 200
    assert result.json()['rows'] == [{'Roll Number': '001', 'zero': 0}]
    assert result.json()['parameters'] == {'IV_ROLL': '001'}
    assert result.json()['evidence'] == 'synthetic' and result.json()['sap_contacted'] is False
    assert result.headers['cache-control'] == 'no-store'
    assert len(database.events) == 2 and store.read().policy.revision == revision
    assert client.get('/api/v1/management/sap-operations').json()['runtime_available'] is False
    assert client.post('/api/v1/management/sap-operations/ROLL/execute', json={'revision': revision}).status_code == 503
    assert client.request('DELETE', '/api/v1/management/sap-connections/DEV', json={'revision': revision}).status_code == 422
    assert save(client, store, 'sap-operations', {'operation': {**OPERATION, 'connection_id': 'UNKNOWN'}}).status_code == 422
    assert client.post('/api/v1/management/sap-operations/ROLL/sample', json={'revision': 'P1', 'values': {}, 'response': {}}).status_code == 409
    assert client.request('DELETE', '/api/v1/management/sap-operations/ROLL', json={'revision': revision}).status_code == 200
    assert client.request('DELETE', '/api/v1/management/sap-connections/DEV', json={'revision': store.read().policy.revision}).status_code == 200
    assert store.read().sap_rfc.connections == [] and store.read().sap_rfc.operations == []


@pytest.mark.parametrize('failure', ['audit', 'commit'])
def test_configuration_save_rollback(runtime, failure):
    client, database, store = runtime
    before = json.dumps(database.document)
    database.fail = failure
    response = client.put('/api/v1/management/sap-connections', json={'revision': 'P1', 'connection': CONNECTION})
    assert response.status_code == 503 and json.dumps(database.document) == before and database.events == []


@pytest.mark.parametrize('kind,value,expected', [('integer', '0', 0), ('decimal', '0.10', '0.10'), ('boolean', False, ''), ('date', '2024-02-29', '20240229'), ('string_list', '001\n002', ['001', '002'])])
def test_parameter_types(kind, value, expected):
    op = Operation(**{**OPERATION, 'parameters': [dict(name='IV_INPUT', label='Input', kind=kind)]})
    assert prepare(op, {'IV_INPUT': value}) == {'IV_INPUT': expected}


@pytest.mark.parametrize('kind,value', [('integer', True), ('integer', '1.5'), ('decimal', 'NaN'), ('date', '2025-02-29'), ('string_list', [''])])
def test_invalid_input_types_fail_closed(kind, value):
    op = Operation(**{**OPERATION, 'parameters': [dict(name='IV_INPUT', label='Input', kind=kind)]})
    with pytest.raises(ContractError): prepare(op, {'IV_INPUT': value})


@pytest.mark.parametrize('response', [{}, {'ET_DATA': []}, {'ET_DATA': [{'ROLL': None}]}, {'ET_DATA': [{'ROLL': ''}]}, {'ET_DATA': [{'ROLL': {}}]}, {'ET_DATA': [{'ROLL': float('nan')}]}])
def test_missing_null_empty_and_invalid_responses_fail_closed(response):
    with pytest.raises(ContractError): map_response(Operation(**OPERATION), response)


def test_duplicate_fields_unknown_inputs_and_non_executable_paths():
    with pytest.raises(ValidationError): Operation(**{**OPERATION, 'parameters': OPERATION['parameters'] * 2})
    with pytest.raises(ValidationError): Operation(**{**OPERATION, 'result_path': 'rows[0].eval()'})
    op = Operation(**{**OPERATION, 'parameters': [dict(name='IV_FIXED', label='Fixed', source='constant', constant='abc')]})
    assert prepare(op, {}) == {'IV_FIXED': 'abc'}
    with pytest.raises(ContractError): prepare(op, {'IV_FIXED': 'override'})
    assert map_response(Operation(**OPERATION), {'ET_DATA': [{'ROLL': False}]}) == [{'Roll Number': False}]


def label_json_operation(**changes):
    return Operation(**{**OPERATION, 'function_name': 'Z_TLS_GET_LABEL_DATA',
        'response_mode': 'label_json', 'mappings': [], 'parameters': [dict(name='IV_CHARG', label='Batch', kind='string')], **changes})


def test_verified_rfc_shape_uses_label_code_and_all_data_without_mapping():
    from app.sap_rfc.contract import process_response
    operation = label_json_operation()
    data = {'batch_number': '0000317326', 'ZZNOMORROLL': 'DEMO-001', 'roll_number': 'DEMO-001',
            'ZZLENGTH': '8,000', 'decimal_text': '15.0', 'zero': 0, 'false': False, 'empty': '', 'null': None, 'spaces': '   80'}
    response = {'EV_STATUS': 'S', 'EV_MESSAGE': 'data_read', 'EV_JSON': json.dumps({'label_code': 'DEMO_LABEL', 'data': data})}
    result = process_response(operation, response)
    assert result['items'] == [{'label_code': 'DEMO_LABEL', 'data': data}]
    assert result['rows'] == [data]
    assert prepare(operation, {'IV_CHARG': '0000317326'}) == {'IV_CHARG': '0000317326'}


@pytest.mark.parametrize('response', [
    {'EV_STATUS': 'E', 'EV_MESSAGE': 'batch_not_found', 'EV_JSON': ''},
    {'EV_STATUS': 'W', 'EV_MESSAGE': 'warning', 'EV_JSON': '{}'},
    {'EV_STATUS': True, 'EV_MESSAGE': '', 'EV_JSON': '{}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': {'label_code': 'A', 'data': {}}},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{not JSON}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"label_code":"A","label_code":"B","data":{}}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"label_code":"A","data":{"duplicate":"a","duplicate":"b"}}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"data":{}}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"label_code":"../bad","data":{}}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"label_code":"A","data":{"nested":{"x":1}}}'},
    {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': '{"label_code":"A","data":{"__proto__":"bad"}}'},
])
def test_label_json_failures_never_become_successful_label_data(response):
    from app.sap_rfc.contract import process_response
    with pytest.raises(ContractError): process_response(label_json_operation(), response)


def test_response_parameters_are_configurable_and_direct_mode_preserves_fields():
    from app.sap_rfc.contract import process_response
    operation = label_json_operation(json_path='PAYLOAD', status_path='STATUS', message_path='MESSAGE', success_value='OK')
    response = {'STATUS': 'OK', 'MESSAGE': '', 'PAYLOAD': '{"label_code":"A","data":{"FIELD":"001"}}'}
    assert process_response(operation, response)['items'][0]['data'] == {'FIELD': '001'}
    direct = Operation(**{**OPERATION, 'response_mode': 'direct', 'mappings': []})
    assert map_response(direct, {'ET_DATA': [{'ROLL': '001', 'OTHER': False}]}) == [{'ROLL': '001', 'OTHER': False}]
    with pytest.raises(ValidationError): Operation(**{**OPERATION, 'response_mode': 'mapping', 'mappings': []})


def test_label_json_sample_endpoint_returns_routing_code_and_never_audits_sample_data(runtime):
    client, database, store = runtime
    setup_config(client, store)
    operation = label_json_operation().model_dump(mode='json')
    assert save(client, store, 'sap-operations', {'operation': operation}).status_code == 200
    events = len(database.events)
    revision = store.read().policy.revision
    response = client.post('/api/v1/management/sap-operations/ROLL/sample', json={
        'revision': revision, 'values': {'IV_CHARG': '0000317326'},
        'response': {'EV_STATUS': 'S', 'EV_MESSAGE': 'data_read', 'EV_JSON': '{"label_code":"DEMO_LABEL","data":{"ZZNOMORROLL":"DEMO-001"}}'}})
    assert response.status_code == 200
    assert response.json()['items'] == [{'label_code': 'DEMO_LABEL', 'data': {'ZZNOMORROLL': 'DEMO-001'}}]
    assert response.json()['sap_contacted'] is False and response.json()['evidence'] == 'synthetic'
    assert len(database.events) == events and store.read().policy.revision == revision
    assert 'DEMO-001' not in json.dumps(database.document) + json.dumps(database.events)


@pytest.mark.parametrize('values,response,code', [
    ({}, {'EV_STATUS': 'S', 'EV_MESSAGE': 'data_read', 'EV_JSON': '{"label_code":"A","data":{}}'}, 'sap_input_required'),
    ({'IV_CHARG': ''}, {}, 'sap_input_required'),
    ({'IV_CHARG': 123}, {}, 'sap_input_invalid'),
    ({'IV_CHARG': '0000000001'}, {'EV_STATUS': 'E', 'EV_MESSAGE': 'batch_not_found', 'EV_JSON': ''}, 'sap_status_failed'),
    ({'IV_CHARG': '0000000001'}, {'EV_STATUS': 'S', 'EV_MESSAGE': '', 'EV_JSON': 'not-json'}, 'sap_response_invalid'),
])
def test_sample_errors_distinguish_missing_input_types_status_and_response(runtime, values, response, code):
    client, database, store = runtime
    setup_config(client, store)
    assert save(client, store, 'sap-operations', {'operation': label_json_operation().model_dump(mode='json')}).status_code == 200
    events = len(database.events)
    result = client.post('/api/v1/management/sap-operations/ROLL/sample', json={'revision': store.read().policy.revision, 'values': values, 'response': response})
    assert result.status_code == 422 and result.json()['detail']['code'] == code
    assert len(database.events) == events
