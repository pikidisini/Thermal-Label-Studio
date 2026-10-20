"""Managed keys use transactional fixtures only; no SAP, device or real database."""
import hashlib
import base64
import json
import re
import pytest
from app.label_intake.policy import authenticate, preflight_print, revalidate_claim, PolicyDenied
from app.label_intake.results import IntakeAdmissionError, TemplateEvidence
from tests.test_management import runtime, TOKEN
from tests.test_label_intake import envelope, Layouts, prepared
from tests.intake_ledger_fake import LedgerDatabase
from app.main import app
from app.label_intake import http


@pytest.fixture(autouse=True)
def encryption_config(monkeypatch):
    monkeypatch.setenv('TLS_MANAGEMENT_KEY_ENCRYPTION', base64.urlsafe_b64encode(b'K' * 32).decode('ascii'))


def key_command(client, store, action, identity='SAP_DEMO', revision=None):
    return client.post(f'/api/v1/management/sources/{identity}/key',
                       json={'revision': revision or store.read().policy.revision, 'action': action})


def denied(policy, secret, environment=None):
    with pytest.raises(IntakeAdmissionError) as error:
        authenticate(policy, 'Bearer ' + secret, environment)
    assert error.value.status == 401


def assert_private(client, store, database, *secrets):
    public = client.get('/api/v1/management/snapshot').text + client.get('/api/v1/management/audit').text
    stored = json.dumps(database.document) + json.dumps(database.events)
    for secret in secrets:
        assert secret not in public and secret not in stored
        assert hashlib.sha256(secret.encode('ascii')).hexdigest() not in public
    assert 'sha256' not in json.dumps(database.events)
    assert 'ciphertext' not in public and 'ciphertext' not in json.dumps(database.events)
    key = store.read().policy.sources[0].access_key
    if key and key.sha256:
        assert key.sha256 not in repr(store.read())


def test_create_rotate_reveal_and_revoke(runtime, monkeypatch):
    client, database, store = runtime
    monkeypatch.delenv('TLS_INTAKE_TOKEN_DEMO')
    assert client.get('/api/v1/management/snapshot').json()['document']['policy']['sources'][0]['key_status'] == 'missing'
    created = key_command(client, store, 'create')
    assert created.status_code == 200, created.text
    first = created.json()['key']
    assert re.fullmatch(r'[A-Za-z0-9_-]{43}', first)
    assert created.headers['cache-control'] == 'no-store'
    source = store.read().policy.sources[0]
    assert source.access_key.sha256 == hashlib.sha256(first.encode('ascii')).hexdigest()
    assert source.access_key.state == 'active' and source.credential_env is None
    assert authenticate(store.read().policy, 'Bearer ' + first, {}).source.identity == 'SAP_DEMO'
    assert 'sha256' not in created.text
    revision = store.read().policy.revision
    revealed = key_command(client, store, 'reveal')
    assert revealed.status_code == 200 and revealed.json()['key'] == first
    assert revealed.headers['cache-control'] == 'no-store'
    assert store.read().policy.revision == revision and len(database.events) == 1
    assert source.access_key.ciphertext not in repr(store.read())
    assert key_command(client, store, 'create').status_code == 422
    assert key_command(client, store, 'rotate', revision='P1').status_code == 409
    second_response = key_command(client, store, 'rotate')
    second = second_response.json()['key']
    assert second != first
    denied(store.read().policy, first)
    admission = authenticate(store.read().policy, 'Bearer ' + second, {})
    pin = preflight_print(admission, 'ANY_TEMPLATE', TemplateEvidence(version=1, svg_sha256='a' * 64), 1, 'P_DEMO')
    revoked = key_command(client, store, 'revoke')
    assert revoked.status_code == 200 and revoked.json()['key'] is None
    assert store.read().policy.sources[0].access_key.sha256 is None
    assert store.read().policy.sources[0].access_key.ciphertext is None
    assert key_command(client, store, 'reveal').status_code == 422
    denied(store.read().policy, second, {'TLS_INTAKE_TOKEN_DEMO': second})
    with pytest.raises(PolicyDenied):
        revalidate_claim(pin, admission, store.read().policy, {'TLS_INTAKE_TOKEN_DEMO': second})
    assert [item['action'] for item in database.events] == ['source.key.create', 'source.key.rotate', 'source.key.revoke']
    assert_private(client, store, database, first, second)
    third = key_command(client, store, 'create').json()['key']
    assert authenticate(store.read().policy, 'Bearer ' + third, {}).source.identity == 'SAP_DEMO'
    denied(store.read().policy, first)
    denied(store.read().policy, second)


def test_migration_preserves_sender_key_and_cannot_restore_revoked_env(runtime, monkeypatch):
    client, database, store = runtime
    assert client.get('/api/v1/management/snapshot').json()['document']['policy']['sources'][0]['key_status'] == 'legacy'
    original = authenticate(store.read().policy, 'Bearer ' + TOKEN)
    pin = preflight_print(original, 'A', TemplateEvidence(version=1, svg_sha256='a' * 64), 1, 'P_DEMO')
    migrated = key_command(client, store, 'migrate')
    assert migrated.status_code == 200 and migrated.json()['key'] is None
    assert key_command(client, store, 'reveal').json()['key'] == TOKEN
    assert key_command(client, store, 'migrate').status_code == 422
    monkeypatch.delenv('TLS_INTAKE_TOKEN_DEMO')
    assert authenticate(store.read().policy, 'Bearer ' + TOKEN).source.identity == 'SAP_DEMO'
    # Migration changes revision; an already-prepared send cannot silently continue.
    with pytest.raises(PolicyDenied): revalidate_claim(pin, original, store.read().policy)
    assert_private(client, store, database, TOKEN)
    assert key_command(client, store, 'revoke').status_code == 200
    denied(store.read().policy, TOKEN, {'TLS_INTAKE_TOKEN_DEMO': TOKEN})


def test_disable_unconfigured_source_and_create_draft_without_environment(runtime, monkeypatch):
    client, database, store = runtime
    monkeypatch.delenv('TLS_INTAKE_TOKEN_DEMO')
    source = {'identity': 'SAP_DEMO', 'enabled': False, 'modes': ['print'], 'print_target_id': None}
    saved = client.put('/api/v1/management/sources', json={'revision': 'P1', 'source': source})
    assert saved.status_code == 200, saved.text
    source['enabled'] = True
    assert client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': source}).status_code == 422
    source = {'identity': 'NEW_SENDER', 'enabled': False, 'modes': ['simulation']}
    saved = client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': source})
    assert saved.status_code == 200
    created = key_command(client, store, 'create', 'NEW_SENDER')
    assert created.status_code == 200
    source['enabled'] = True
    saved = client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': source})
    assert saved.status_code == 200 and 'sha256' not in saved.text
    # The missing legacy credential on disabled SAP_DEMO does not break NEW_SENDER.
    assert authenticate(store.read().policy, 'Bearer ' + created.json()['key'], {}).source.identity == 'NEW_SENDER'


@pytest.mark.parametrize('failure', ['audit', 'commit', 'committed_ack_lost'])
def test_key_commit_failure_never_discloses_secret_or_retries(runtime, monkeypatch, failure):
    client, database, store = runtime
    synthetic = 'synthetic_generated_key_never_returned_0001'
    monkeypatch.setattr('app.management.integrations.http.secrets.token_urlsafe', lambda _: synthetic)
    database.fail = failure
    response = key_command(client, store, 'rotate', revision='P1')
    assert response.status_code == 503 and synthetic not in response.text
    database.fail = None
    if failure == 'committed_ack_lost':
        assert len(database.events) == 1
        assert authenticate(store.read().policy, 'Bearer ' + synthetic).source.identity == 'SAP_DEMO'
    else:
        assert database.events == [] and store.read().policy.revision == 'P1'
        denied(store.read().policy, synthetic)
    assert_private(client, store, database, synthetic)


def test_key_endpoint_guard_and_no_client_digest_injection(runtime):
    client, database, store = runtime
    command = {'revision': 'P1', 'action': 'rotate'}
    endpoint = '/api/v1/management/sources/SAP_DEMO/key'
    assert client.post(endpoint, json=command, headers={'Origin': 'https://external.invalid'}).status_code == 403
    assert client.post(endpoint, json=command | {'key': TOKEN}).status_code == 422
    assert client.post(endpoint, content='{"revision":"P1","action":"rotate","action":"revoke"}', headers={'Content-Type': 'application/json'}).status_code == 400
    assert key_command(client, store, 'create', 'MISSING').status_code == 404
    source = store.read().policy.sources[0].model_dump(mode='json')
    source['access_key'] = {'sha256': 'a' * 64}
    response = client.put('/api/v1/management/sources', json={'revision': 'P1', 'source': source})
    assert response.status_code == 422 and database.events == []


def test_all_document_mutations_redact_installed_hash(runtime):
    client, database, store = runtime
    response = key_command(client, store, 'rotate')
    secret = response.json()['key']
    target = store.read().policy.targets[0].model_dump(mode='json')
    response = client.put('/api/v1/management/printers', json={'revision': store.read().policy.revision, 'target': target})
    assert response.status_code == 200 and 'sha256' not in response.text
    source = {'identity': 'SAP_DEMO', 'enabled': True, 'modes': ['simulation']}
    response = client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': source})
    assert response.status_code == 200 and 'sha256' not in response.text
    assert authenticate(store.read().policy, 'Bearer ' + secret).source.identity == 'SAP_DEMO'
    assert_private(client, store, database, secret)


def test_managed_key_http_admission_replay_rotation_and_revocation(runtime, prepared):
    client, _, store = runtime
    first = key_command(client, store, 'rotate').json()['key']
    body = envelope(('A',))
    body['sender']['system'] = 'SAP_DEMO'
    body['target_id'] = 'P_DEMO'
    app.dependency_overrides[http.stored_layouts] = lambda: Layouts()
    ledger = LedgerDatabase().ledger()
    app.dependency_overrides[http.durable_ledger] = lambda: ledger
    try:
        headers = {'Authorization': 'Bearer ' + first}
        response = client.post('/api/v1/label-intake', json=body, headers=headers)
        assert response.status_code == 200 and response.json()['results'][0]['status'] == 'SIMULATED'
        repeated = client.post('/api/v1/label-intake', json=body, headers=headers)
        assert repeated.status_code == 200 and repeated.json()['replayed'] is True
        second = key_command(client, store, 'rotate').json()['key']
        assert client.post('/api/v1/label-intake', json=body, headers=headers).status_code == 401
        headers = {'Authorization': 'Bearer ' + second}
        repeated = client.post('/api/v1/label-intake', json=body, headers=headers)
        assert repeated.status_code == 200 and repeated.json()['replayed'] is True
        assert len(prepared) == 1  # Rotation preserves durable identity; no rerender.
        assert key_command(client, store, 'revoke').status_code == 200
        app.dependency_overrides[http.stored_layouts] = lambda: pytest.fail('Unauthorized layout access')
        app.dependency_overrides[http.durable_ledger] = lambda: pytest.fail('Unauthorized replay access')
        assert client.post('/api/v1/label-intake', json=body, headers=headers).status_code == 401
    finally:
        app.dependency_overrides.pop(http.stored_layouts, None)
        app.dependency_overrides.pop(http.durable_ledger, None)


def test_delete_source_removes_keys_and_blocks_identity_reuse(runtime):
    client, database, store = runtime
    created = key_command(client, store, 'migrate')
    assert created.status_code == 200
    secret = TOKEN
    policy = store.read().policy
    pin = preflight_print(authenticate(policy, 'Bearer ' + secret), 'A', TemplateEvidence(version=1, svg_sha256='a' * 64), 1, 'P_DEMO')
    stale = client.request('DELETE', '/api/v1/management/sources/SAP_DEMO', json={'revision': 'P1'})
    assert stale.status_code == 409
    removed = client.request('DELETE', '/api/v1/management/sources/SAP_DEMO', json={'revision': policy.revision})
    assert removed.status_code == 200 and removed.json()['policy']['sources'] == []
    source = store.read().policy.sources[0]
    assert source.deleted and not source.enabled
    assert source.access_key is None and source.credential_env is None
    denied(store.read().policy, secret, {'TLS_INTAKE_TOKEN_DEMO': secret})
    with pytest.raises(PolicyDenied):
        revalidate_claim(pin, authenticate(policy, 'Bearer ' + secret), store.read().policy)
    assert key_command(client, store, 'create').status_code == 404
    assert key_command(client, store, 'reveal').status_code == 404
    response = client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': {
        'identity': 'SAP_DEMO', 'enabled': False, 'modes': ['simulation']}})
    assert response.status_code == 422
    assert database.events[-1]['action'] == 'source.delete'
    assert database.events[-1]['after']['deleted'] is True
    assert 'ciphertext' not in json.dumps(database.events)
    assert secret not in json.dumps(database.events)


@pytest.mark.parametrize('failure', ['audit', 'commit'])
def test_source_deletion_rolls_back_and_unknown_source_does_not_audit(runtime, failure):
    client, database, store = runtime
    before = json.dumps(database.document)
    missing = client.request('DELETE', '/api/v1/management/sources/UNKNOWN', json={'revision': 'P1'})
    assert missing.status_code == 404 and database.events == []
    database.fail = failure
    response = client.request('DELETE', '/api/v1/management/sources/SAP_DEMO', json={'revision': 'P1'})
    assert response.status_code == 503
    assert json.dumps(database.document) == before and database.events == []
