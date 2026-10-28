"""Management source tests: transactional fake database and synthetic policy only."""
from copy import deepcopy
import json
from types import SimpleNamespace
from uuid import uuid4
import pytest
import httpx
from app.management.access import require_store
from app.layouts.service import LayoutService
from .auth_test_support import TestClient
from app.main import app
from app.management.models import Document
from app.management.templates.models import DecisionCommand, ReviewCommand
from app.management.errors import ManagementError
from app.management.store import ManagementStore
from app.management.templates.service import decide_review, submit_review
from app.label_intake.http import configured_policy
from app.label_intake.policy import Policy, Source, Target, authenticate, preflight_print, PolicyDenied
from app.label_intake.results import IntakeAdmissionError, TemplateEvidence

TOKEN = 'synthetic_management_token_000000000001'


def seed():
    return Document(policy=Policy(revision='P1', sources=(Source(identity='SAP_DEMO',
        credential_env='TLS_INTAKE_TOKEN_DEMO', enabled=True, modes=('simulation', 'print'), label_codes=('A',), print_target_id=None, allowed_print_target_ids=('P_DEMO',), print_max_copies=10),),
        targets=(Target(target_id='P_DEMO', host='192.0.2.44', port=9100, enabled=True),), audit=()))


class Database:
    """Only the SQL exercised by the concrete service, with commit/rollback effects."""
    def __init__(self):
        self.document = json.loads(seed().model_dump_json())
        self.events = []
        self.fail = None
        self.layouts = {'A': dict(title='Synthetic roll', version=1, checksum='a' * 64, deleted=False)}
        self.version_codes = ['A']

    def connect(self, *args, **kwargs):
        database = self
        class Connection:
            def __enter__(self):
                self.document = deepcopy(database.document)
                self.events = deepcopy(database.events)
                self.layouts = deepcopy(database.layouts)
                self.version_codes = deepcopy(database.version_codes)
                return self
            def __exit__(self, kind, *_):
                if kind is None:
                    if database.fail == 'commit':
                        raise RuntimeError('private connection details')
                    database.document, database.events = self.document, self.events
                    database.layouts, database.version_codes = self.layouts, self.version_codes
                    if database.fail == 'committed_ack_lost':
                        raise RuntimeError('commit acknowledgement lost')
            def cursor(self):
                connection = self
                class Cursor:
                    def __enter__(self): return self
                    def __exit__(self, *_): pass
                    def execute(self, query, params=None):
                        if 'management_state' in query or 'management_audit' in query:
                            assert 'app_management.management_' in query
                            assert 'label_studio.management_' not in query
                        if query.startswith('SELECT pg_advisory'):
                            self.rows = []
                        elif 'SELECT l.active_version' in query:
                            item = connection.layouts.get(params[0])
                            self.rows = [(item['version'], item['checksum'], item['title'])] if item and not item['deleted'] else []
                        elif query.startswith('SELECT label_code'):
                            self.rows = [(params[0],)] if params[0] in connection.layouts else []
                        elif query.startswith('DELETE FROM label_studio.layouts'):
                            item = connection.layouts.get(params[0])
                            if item and item['deleted'] and params[0] not in connection.version_codes:
                                del connection.layouts[params[0]]
                        elif query.startswith('INSERT INTO label_studio.layouts'):
                            connection.layouts[params[0]] = dict(connection.layouts[params[2]], title=params[1])
                        elif query.startswith('UPDATE label_studio.layout_versions'):
                            connection.version_codes = [params[0] if code == params[1] else code for code in connection.version_codes]
                        elif query.startswith('UPDATE label_studio.layouts'):
                            if 'deleted_at' in query: connection.layouts[params[0]]['deleted'] = True
                            else: connection.layouts[params[1]]['title'] = params[0]
                        elif query.startswith('SELECT document'):
                            self.rows = [(connection.document,)]
                        elif query.startswith('SELECT event'):
                            self.rows = [(e,) for e in reversed(connection.events[-200:])]
                        elif query.startswith('UPDATE'):
                            connection.document = json.loads(params[0])
                        elif query.startswith('INSERT'):
                            if database.fail == 'audit': raise RuntimeError('audit unavailable')
                            connection.events.append(json.loads(params[0]))
                        else:
                            raise AssertionError(query)
                    def fetchone(self): return self.rows[0] if self.rows else None
                    def fetchall(self): return self.rows
                return Cursor()
        return Connection()


@pytest.fixture
def runtime(monkeypatch):
    monkeypatch.setenv('TLS_INTAKE_TOKEN_DEMO', TOKEN)
    monkeypatch.setenv('TLS_MANAGEMENT_ENABLED', 'false')
    database = Database()
    store = ManagementStore.__new__(ManagementStore)
    store.database, store.database_url = database, 'synthetic-only'
    monkeypatch.setattr(app.state, 'management_store', store, raising=False)
    layouts = LayoutService.__new__(LayoutService)
    layouts.settings = SimpleNamespace(database_url='synthetic-only')
    # Object transfer is covered separately with verified in-memory SVG objects.
    layouts._relocate_template_objects = lambda *args: []
    layouts.get_layout = lambda _: SimpleNamespace(version=1, svg_sha256='a' * 64)
    monkeypatch.setattr(app.state, 'layout_service', layouts, raising=False)
    return TestClient(app, client=('127.0.0.1', 12345)), database, store


def submit(client, revision='P1', **changes):
    """Historical document rules remain testable without exposing retired review routes."""
    try:
        store = require_store(SimpleNamespace(app=app, state=SimpleNamespace(auth_user={'id': 'synthetic-admin', 'role': 'Admin'}), client=SimpleNamespace(host='127.0.0.1'), headers={}))
        command = ReviewCommand(revision=revision, note='Review exact version', label_code='A', version=1, svg_sha256='a' * 64, **changes) if not changes else ReviewCommand(**(dict(revision=revision, note='Review exact version', label_code='A', version=1, svg_sha256='a' * 64) | changes))
        if command.version != 1: raise ManagementError('layout_changed', 409)
        result = store.change(command.revision, 'review.submit', command.label_code, command.note, lambda document: submit_review(document, command))
        return httpx.Response(201, json=result.model_dump(mode='json'))
    except ManagementError as exc:
        return httpx.Response(exc.status, json={'detail': {'code': exc.code}})


def decision(client, document, action='approve', **changes):
    command = DecisionCommand(**(dict(revision=document['policy']['revision'], action=action, sender='SAP_DEMO', target_id='P_DEMO', max_copies=10, note='Reviewed with synthetic evidence') | changes))
    review_id = document['reviews'][0]['review_id']
    try:
        result = app.state.management_store.change(command.revision, 'review.' + command.action, review_id, command.note, lambda state: decide_review(state, review_id, command))
        return httpx.Response(200, json=result.model_dump(mode='json'))
    except ManagementError as exc:
        return httpx.Response(exc.status, json={'detail': {'code': exc.code}})

def test_historical_review_evidence_is_preserved_but_routing_controls_print(runtime):
    client, database, store = runtime
    response = submit(client)
    assert response.status_code == 201
    approved = decision(client, response.json())
    assert approved.status_code == 200
    request = SimpleNamespace(app=app)
    policy = configured_policy(request)
    admission = authenticate(policy, 'Bearer ' + TOKEN, {'TLS_INTAKE_TOKEN_DEMO': TOKEN})
    assert preflight_print(admission, 'A', TemplateEvidence(version=1, svg_sha256='a' * 64), 10, 'P_DEMO').target_id == 'P_DEMO'
    revoked = decision(client, approved.json(), 'revoke')
    assert revoked.status_code == 200
    assert preflight_print(authenticate(store.read().policy, 'Bearer ' + TOKEN, {'TLS_INTAKE_TOKEN_DEMO': TOKEN}), 'A', TemplateEvidence(version=1, svg_sha256='a' * 64), 1, 'P_DEMO').target_id == 'P_DEMO'
    audit = client.get('/api/v1/management/audit').json()
    assert len(audit) == 3
    assert audit[0]['action'] == 'review.revoke'
    assert all(event['actor'] == 'DEVELOPMENT_UNAUTHENTICATED' for event in audit)
    assert TOKEN not in json.dumps(audit)
    assert len(database.events) == 3


def test_stale_revision_duplicate_pending_and_exact_template_pin(runtime):
    client, database, _ = runtime
    assert submit(client, version=2).status_code == 409
    assert database.events == []
    document = submit(client).json()
    assert submit(client).status_code == 409
    assert submit(client, document['policy']['revision']).status_code == 409
    assert len(database.events) == 1


@pytest.mark.parametrize('failure', ['audit', 'commit'])
def test_audit_and_state_roll_back_together(runtime, failure):
    client, database, _ = runtime
    database.fail = failure
    response = submit(client)
    assert response.status_code == 503
    assert database.document == json.loads(seed().model_dump_json())
    assert database.events == []
    assert 'private' not in response.text


def test_lost_commit_ack_preserves_state_and_retry_is_stale(runtime):
    client, database, _ = runtime
    database.fail = 'committed_ack_lost'
    assert submit(client).status_code == 503
    assert len(database.events) == 1
    assert database.document['reviews'][0]['status'] == 'Pending review'
    database.fail = None
    assert submit(client).status_code == 409
    assert len(database.events) == 1


@pytest.mark.parametrize('command', [
    {'host': 'printer.local'}, {'host': '0.0.0.0'}, {'port': 0}, {'port': True}, {'host': '224.0.0.1'},
])
def test_invalid_printer_never_changes_registry(runtime, command):
    client, database, _ = runtime
    response = client.put('/api/v1/management/printers', json={'revision': 'P1', 'note': 'Test validation',
        'target': dict(target_id='P_NEW', host='192.0.2.45', port=9100, enabled=False) | command})
    assert response.status_code == 422
    assert database.events == []


def test_printer_save_and_source_permissions_are_persistent_and_audited(runtime):
    client, database, store = runtime
    target = dict(target_id='P_NEW', host='192.0.2.45', port=9200, enabled=False)
    response = client.put('/api/v1/management/printers', json=dict(revision='P1', note='Add destination', target=target))
    assert response.status_code == 200
    assert store.read().policy.targets[-1].target_id == 'P_NEW'
    source = seed().policy.sources[0].model_dump(mode='json') | {'enabled': False}
    response = client.put('/api/v1/management/sources', json=dict(revision=response.json()['policy']['revision'], note='Disable sender', source=source))
    assert response.status_code == 200
    assert not store.read().policy.sources[0].enabled
    assert len(database.events) == 2
    assert database.events[-1]['before']['enabled'] is True
    assert database.events[-1]['after']['enabled'] is False
    assert 'policy' not in database.events[-1]['after']


def test_management_saves_without_reason_and_still_records_before_after(runtime):
    client, database, store = runtime
    target = dict(target_id='P_NEW', host='192.0.2.45', port=9100, enabled=False)
    response = client.put('/api/v1/management/printers', json=dict(revision='P1', target=target))
    assert response.status_code == 200, response.text
    source = seed().policy.sources[0].model_dump(mode='json')
    source.pop('label_codes')
    source.pop('simulation_all_label_codes')
    response = client.put('/api/v1/management/sources', json=dict(revision=store.read().policy.revision, source=source))
    assert response.status_code == 200, response.text
    command = template_command(action='update', title='New name')
    command.pop('note')
    command['revision'] = store.read().policy.revision
    response = client.post('/api/v1/management/templates/A', json=command)
    assert response.status_code == 200, response.text
    assert len(database.events) == 3
    assert all(event['note'] == '' for event in database.events)
    assert database.events[-1]['before']['title'] == 'Synthetic roll'
    assert database.events[-1]['after']['title'] == 'New name'


def test_unprovisioned_credential_and_secret_in_body_rejected(runtime):
    client, database, _ = runtime
    source = seed().policy.sources[0].model_dump(mode='json') | {'credential_env': 'TLS_INTAKE_TOKEN_MISSING'}
    assert client.put('/api/v1/management/sources', json=dict(revision='P1', note='Change source', source=source)).status_code == 422
    source['token'] = TOKEN
    response = client.put('/api/v1/management/sources', json=dict(revision='P1', note='Change source', source=source))
    assert response.status_code == 422
    assert TOKEN not in response.text
    assert database.events == []


@pytest.mark.parametrize('route', ['P_DEMO', 'UNKNOWN'])
def test_print_source_requires_existing_destination_and_can_correct_validation(runtime, route):
    client, database, store = runtime
    source = seed().policy.sources[0].model_dump(mode='json') | {'print_target_id': route}
    response = client.put('/api/v1/management/sources', json=dict(revision='P1', note='Route source', source=source))
    assert response.status_code == 422
    assert database.events == []
    assert store.read().policy.revision == 'P1'
    source['print_target_id'] = None
    source['allowed_print_target_ids'] = ['P_DEMO']
    source['print_max_copies'] = 3
    source['simulation_all_label_codes'] = True
    source['label_codes'] = []
    response = client.put('/api/v1/management/sources', json=dict(revision='P1', note='Correct route', source=source))
    assert response.status_code == 200
    saved = store.read().policy.sources[0]
    assert saved.print_target_id is None
    assert saved.allowed_print_target_ids == ('P_DEMO',)
    assert saved.print_max_copies == 3
    assert saved.simulation_all_label_codes is True
    assert saved.label_codes == ()
    assert len(database.events) == 1


def test_no_managed_store_does_not_fall_back_to_runtime_memory(runtime, monkeypatch):
    client, _, _ = runtime
    monkeypatch.delattr(app.state, 'management_store')
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', seed().policy.model_dump_json())
    response = client.get('/api/v1/management/snapshot')
    assert response.status_code == 200
    assert response.json()['writable'] is False
    assert response.json()['policy_origin'] == 'environment'
    assert submit(client).status_code == 503


def test_managed_policy_read_failure_denies_intake(runtime, monkeypatch):
    _, _, store = runtime
    monkeypatch.setattr(store, 'read', lambda: (_ for _ in ()).throw(ManagementError()))
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', seed().policy.model_dump_json())
    prepared_SimpleNamespace = SimpleNamespace(app=app)
    with pytest.raises(IntakeAdmissionError) as error:
        configured_policy(prepared_SimpleNamespace)
    assert error.value.code == 'policy_unavailable'


@pytest.mark.parametrize('origin', ['https://attacker.example', 'null', 'http://127.0.0.1/path'])
def test_cross_origin_management_denied(runtime, origin):
    client, database, _ = runtime
    assert client.get('/api/v1/management/snapshot', headers={'Origin': origin}).status_code == 403
    assert database.events == []


def test_non_loopback_denied(runtime):
    client = TestClient(app, client=('192.0.2.20', 12345))
    assert client.get('/api/v1/management/snapshot').status_code == 403


def test_designer_template_identity_updates_return_revision_without_admin_configuration(runtime, monkeypatch):
    client, _, _ = runtime
    repo = app.state._feature_test_auth.store.repo
    principal = repo.get('users', 'synthetic-admin')
    monkeypatch.setitem(repo.data['users'], 'synthetic-admin', {**principal, 'role': 'Designer'})
    snapshot = client.get('/api/v1/management/snapshot')
    assert snapshot.status_code == 200
    assert set(snapshot.json()['document']['policy']) == {'revision'}
    assert client.get('/api/v1/management/audit').status_code == 403
    updated = client.post('/api/v1/management/templates/A', json=template_command())
    assert updated.status_code == 200, updated.text
    assert set(updated.json()) == {'policy'}
    assert set(updated.json()['policy']) == {'revision'}


def test_duplicate_json_and_body_limit(runtime):
    client, database, _ = runtime
    assert client.put('/api/v1/management/printers', content='{"revision":"P1","revision":"P2"}', headers={'Content-Type': 'application/json'}).status_code == 400
    assert client.put('/api/v1/management/printers', content=' ' * (256 * 1024 + 1), headers={'Content-Type': 'application/json'}).status_code == 413
    assert database.events == []


def test_rejection_requires_no_print_grant(runtime):
    client, _, _ = runtime
    document = submit(client).json()
    rejected = decision(client, document, 'reject', sender='UNASSIGNED', target_id='UNASSIGNED')
    assert rejected.status_code == 200
    assert rejected.json()['reviews'][0]['status'] == 'Rejected'
    assert rejected.json()['policy']['audit'] == []


def template_command(**changes):
    return dict(revision='P1', label_code='A', version=1, svg_sha256='a' * 64,
                action='update', title='Readable production roll', new_code='ROLL_PRODUCTION',
                previous_title='Synthetic roll', note='Update template identity') | changes


def test_template_rename_updates_all_versions_references_and_atomic_audit(runtime):
    client, database, _ = runtime
    response = client.post('/api/v1/management/templates/A', json=template_command())
    assert response.status_code == 200, response.text
    assert 'A' not in database.layouts
    assert database.layouts['ROLL_PRODUCTION']['title'] == 'Readable production roll'
    assert database.version_codes == ['ROLL_PRODUCTION']
    assert response.json()['policy']['sources'][0]['label_codes'] == ['ROLL_PRODUCTION']
    assert database.events[0]['before']['label_code'] == 'A'
    assert database.events[0]['after']['label_code'] == 'ROLL_PRODUCTION'
    assert client.post('/api/v1/management/reviews', json={}).status_code == 403


@pytest.mark.parametrize('failure', ['audit', 'commit', 'committed_ack_lost'])
def test_uncertain_or_failed_identity_commit_never_cleans_source_objects(runtime, failure):
    client, database, _ = runtime
    layouts = app.state.layout_service
    layouts._relocate_template_objects = lambda *args: [dict(source='old', target='new')]
    cleaned = []
    layouts.cleanup_relocated_objects = lambda moves: cleaned.extend(moves)
    database.fail = failure
    assert client.post('/api/v1/management/templates/A', json=template_command()).status_code == 503
    assert cleaned == []


def test_cleanup_failure_does_not_report_committed_rename_as_failed(runtime):
    client, database, _ = runtime
    layouts = app.state.layout_service
    layouts._relocate_template_objects = lambda *args: [dict(source='old', target='new')]

    def fail_cleanup(moves):
        assert database.layouts.get('ROLL_PRODUCTION')
        raise RuntimeError('synthetic deletion failure')

    layouts.cleanup_relocated_objects = fail_cleanup
    assert client.post('/api/v1/management/templates/A', json=template_command()).status_code == 200
    assert database.events[0]['after']['object_moves'] == [dict(source='old', target='new')]


@pytest.mark.parametrize('changes', [dict(version=2), dict(svg_sha256='b' * 64), dict(new_code='TAKEN'), dict(previous_title='Stale name')])
def test_template_stale_or_duplicate_code_never_changes_storage(runtime, changes):
    client, database, _ = runtime
    database.layouts['TAKEN'] = dict(database.layouts['A'])
    before = deepcopy(database.layouts)
    response = client.post('/api/v1/management/templates/A', json=template_command(**changes))
    assert response.status_code == 409, response.text
    assert database.layouts == before
    assert database.events == []


@pytest.mark.parametrize('failure', ['audit', 'commit'])
def test_template_audit_failure_rolls_back_layout_and_source_changes(runtime, failure):
    client, database, _ = runtime
    before = deepcopy(database.layouts)
    database.fail = failure
    assert client.post('/api/v1/management/templates/A', json=template_command()).status_code == 503
    assert database.layouts == before
    assert database.version_codes == ['A']
    assert database.document == json.loads(seed().model_dump_json())
    assert database.events == []


def test_delete_retains_versions_and_removes_source_reference(runtime):
    client, database, _ = runtime
    response = client.post('/api/v1/management/templates/A', json=template_command(action='delete', new_code='A'))
    assert response.status_code == 200, response.text
    assert database.layouts['A']['deleted']
    assert database.version_codes == ['A']
    assert response.json()['policy']['sources'][0]['label_codes'] == []
    assert database.events[0]['after']['deleted'] is True


@pytest.mark.parametrize('changes', [dict(title=' '), dict(new_code='bad code'), dict(action='approve'), dict(version=True)])
def test_template_invalid_command_has_no_storage_effect(runtime, changes):
    client, database, _ = runtime
    assert client.post('/api/v1/management/templates/A', json=template_command(**changes)).status_code == 422
    assert not database.layouts['A']['deleted']
    assert database.events == []


@pytest.mark.parametrize('enabled', [True, False])
def test_printer_deletion_rejects_assigned_sources(runtime, enabled):
    client, database, store = runtime
    database.document['policy']['sources'][0]['enabled'] = enabled
    before = deepcopy(database.document)
    result = client.request('DELETE', '/api/v1/management/printers/P_DEMO', json={'revision': 'P1'})
    assert result.status_code == 422
    assert result.json()['detail']['code'] == 'printer_in_use'
    assert database.document == before
    assert database.events == []


def unassign_printer(client, store):
    result = client.put('/api/v1/management/sources', json={'revision': store.read().policy.revision, 'source': {
        'identity': 'SAP_DEMO', 'enabled': True, 'modes': ['simulation'], 'print_target_id': None}})
    assert result.status_code == 200


def test_unassigned_printer_delete_updates_snapshot_and_retains_audit(runtime):
    client, database, store = runtime
    unassign_printer(client, store)
    revision = store.read().policy.revision
    stale = client.request('DELETE', '/api/v1/management/printers/P_DEMO', json={'revision': 'P1'})
    assert stale.status_code == 409
    assert len(database.events) == 1
    result = client.request('DELETE', '/api/v1/management/printers/P_DEMO', json={'revision': revision})
    assert result.status_code == 200
    assert result.json()['policy']['targets'] == []
    assert len(store.read().policy.sources) == 1
    event = database.events[-1]
    assert event['action'] == 'printer.delete'
    assert event['before']['target_id'] == 'P_DEMO'
    assert event['after'] is None
    missing = client.request('DELETE', '/api/v1/management/printers/P_DEMO', json={'revision': store.read().policy.revision})
    assert missing.status_code == 404
    assert len(database.events) == 2


@pytest.mark.parametrize('failure', ['audit', 'commit'])
def test_printer_deletion_rolls_back_if_persistence_fails(runtime, failure):
    client, database, store = runtime
    unassign_printer(client, store)
    before, events = deepcopy(database.document), deepcopy(database.events)
    revision = store.read().policy.revision
    database.fail = failure
    result = client.request('DELETE', '/api/v1/management/printers/P_DEMO', json={'revision': revision})
    assert result.status_code == 503
    assert database.document == before
    assert database.events == events
