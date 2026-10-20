"""Authenticated encryption and atomic source creation with synthetic storage only."""
import base64
import json
import pytest
from app.label_intake.policy import authenticate
from tests.test_management import runtime
from tests.test_management_keys import encryption_config, key_command, assert_private


def create(client, store, revision=None, **changes):
    source = {'identity': 'NEW_SENDER', 'enabled': True, 'modes': ['simulation']}
    source.update(changes)
    return client.put('/api/v1/management/sources', json={
        'revision': revision or store.read().policy.revision, 'create_key': True, 'source': source})


def test_enabled_source_and_key_created_together_and_persistently_recoverable(runtime, encryption_config):
    client, database, store = runtime
    response = create(client, store)
    assert response.status_code == 200, response.text
    raw = response.json()['key']
    assert response.headers['cache-control'] == 'no-store'
    source = store.read().policy.sources[-1]
    assert source.enabled and source.access_key.ciphertext.startswith('v1.')
    assert response.json()['document']['policy']['sources'][-1]['access_key']['reveal_available']
    assert authenticate(store.read().policy, 'Bearer ' + raw, {}).source.identity == 'NEW_SENDER'
    for _ in range(2):
        assert key_command(client, store, 'reveal', 'NEW_SENDER').json()['key'] == raw
    assert len(database.events) == 1 and database.events[0]['action'] == 'source.create_with_key'
    assert_private(client, store, database, raw)
    assert create(client, store).status_code == 422


@pytest.mark.parametrize('failure', ['audit', 'commit', 'committed_ack_lost'])
def test_atomic_source_commit_failure_does_not_disclose_or_retry(runtime, encryption_config, monkeypatch, failure):
    client, database, store = runtime
    raw = 'synthetic_atomic_source_key_000000000000001'
    monkeypatch.setattr('app.management.integrations.http.secrets.token_urlsafe', lambda _: raw)
    database.fail = failure
    response = create(client, store, revision='P1')
    assert response.status_code == 503 and raw not in response.text
    database.fail = None
    if failure == 'committed_ack_lost':
        assert len(database.events) == 1
        assert key_command(client, store, 'reveal', 'NEW_SENDER').json()['key'] == raw
    else:
        assert len(store.read().policy.sources) == 1 and database.events == []
    assert raw not in json.dumps(database.document) + json.dumps(database.events)


def test_print_validation_rolls_back_source_and_key(runtime, encryption_config):
    client, database, store = runtime
    assert create(client, store, modes=['print'], print_target_id='MISSING').status_code == 422
    assert store.read().policy.revision == 'P1' and len(store.read().policy.sources) == 1
    assert database.events == []
    assert create(client, store, modes=['print'], allowed_print_target_ids=['P_DEMO']).status_code == 200


@pytest.mark.parametrize('configured', ['', 'bad', base64.urlsafe_b64encode(b'x' * 16).decode('ascii')])
def test_missing_master_fails_closed_without_mutating_state(runtime, monkeypatch, configured):
    client, database, store = runtime
    monkeypatch.setenv('TLS_MANAGEMENT_KEY_ENCRYPTION', configured)
    response = create(client, store)
    assert response.status_code == 503 and response.json()['detail']['code'] == 'key_encryption_unavailable'
    assert store.read().policy.revision == 'P1' and len(store.read().policy.sources) == 1
    assert database.events == []


@pytest.mark.parametrize('damage', ['wrong_master', 'ciphertext', 'identity', 'key_id', 'digest'])
def test_reveal_rejects_tampering_and_wrong_master(runtime, encryption_config, monkeypatch, damage):
    client, database, store = runtime
    raw = key_command(client, store, 'rotate').json()['key']
    source = database.document['policy']['sources'][0]
    identity = source['identity']
    if damage == 'wrong_master':
        monkeypatch.setenv('TLS_MANAGEMENT_KEY_ENCRYPTION', base64.urlsafe_b64encode(b'Z' * 32).decode('ascii'))
    elif damage == 'identity':
        identity = source['identity'] = 'DIFFERENT'
    elif damage == 'key_id': source['access_key']['key_id'] = 'K_DIFFERENT'
    elif damage == 'digest': source['access_key']['sha256'] = 'a' * 64
    else: source['access_key']['ciphertext'] = 'v1.invalid'
    response = key_command(client, store, 'reveal', identity)
    assert response.status_code == 503 and raw not in response.text
    assert response.json()['detail']['code'] == 'key_decryption_failed'
    assert len(database.events) == 1


def test_hash_only_legacy_record_requires_explicit_replace_and_guards_reveal(runtime, encryption_config):
    client, database, store = runtime
    raw = key_command(client, store, 'rotate').json()['key']
    database.document['policy']['sources'][0]['access_key'].pop('ciphertext')
    snapshot = client.get('/api/v1/management/snapshot').json()
    assert snapshot['document']['policy']['sources'][0]['access_key']['reveal_available'] is False
    assert key_command(client, store, 'reveal').status_code == 422
    assert authenticate(store.read().policy, 'Bearer ' + raw).source.identity == 'SAP_DEMO'
    assert key_command(client, store, 'reveal', revision='P1').status_code == 409
    assert key_command(client, store, 'reveal', 'UNKNOWN').status_code == 404
    assert client.post('/api/v1/management/sources/SAP_DEMO/key', json={
        'revision': store.read().policy.revision, 'action': 'reveal'}, headers={'Origin': 'https://external.invalid'}).status_code == 403
    replacement = key_command(client, store, 'rotate').json()['key']
    assert replacement != raw and key_command(client, store, 'reveal').json()['key'] == replacement
