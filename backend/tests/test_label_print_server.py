"""Server LAN delivery with fake transports only; no sockets or operational storage."""
from uuid import uuid4
import pytest

pytestmark = pytest.mark.usefixtures("print_safety")
from app.engine.bitmap import RenderedLabel
from app.engine.output import PreparedOutput
from app.label_print import http
from app.label_print.artifacts import PreviewArtifacts
from app.printing.http import print_transport_factory
from app.printing.service import PrintBeforeSendError
from tests.test_label_print import client

PAYLOAD = b'<STX><ESC>C<ETX>\r\n<STX><RS>1<ETX>\r\n<STX><ETB><ETX>\r\n'

@pytest.fixture
def setup(client, monkeypatch):
    cache = PreviewArtifacts()
    monkeypatch.setattr(http, 'artifacts', cache)
    targets = [{'target_id': 'LAN', 'enabled': True, 'host': '192.0.2.44', 'port': 9100}]
    monkeypatch.setattr(http, 'read_snapshot', lambda store: {'document': {'policy': {'targets': targets}}})
    def forbidden(*args, **kwargs): raise AssertionError('Unexpected SAP or rendering')
    monkeypatch.setattr(http, 'execute_operation', forbidden)
    monkeypatch.setattr(http, 'prepare_draft_output', forbidden)
    output = PreparedOutput(RenderedLabel('test', '1', 1, 1, 203.2, b'PNG'), PAYLOAD, 'IPL')
    ids = [cache.put(output, 'synthetic-admin') for _ in range(3)]
    calls = []
    class Transport:
        def __init__(self, target): assert target.host == '192.0.2.44'; assert target.port == 9100
        def submit(self, payload): calls.append(payload)
    client.app.dependency_overrides[print_transport_factory] = lambda: Transport
    body = {'job_id': str(uuid4()), 'artifacts': ids, 'copies': 1, 'target_id': 'LAN', 'expected_host': '192.0.2.44', 'expected_port': 9100}
    return body, calls, targets, cache


def test_server_sends_wire_bytes_once_in_selection_order(client, setup):
    body, calls, _, _ = setup
    result = client.post('/api/v1/label-print/print', json=body)
    assert result.status_code == 200, result.text
    assert result.headers['cache-control'] == 'no-store'
    assert result.json() == {'job_id': body['job_id'], 'confirmed': False, 'status': 'SUBMITTED', 'items': [{'index': i, 'status': 'SUBMITTED'} for i in range(3)]}
    assert calls == [b'\x02\x1bC\x03\r\n\x02\x1e1\x03\r\n\x02\x17\x03\r\n'] * 3


@pytest.mark.parametrize('failure,status', [(PrintBeforeSendError(), 'FAILED_BEFORE_SEND'), (OSError(), 'UNCERTAIN')])
def test_stop_after_first_failure_without_retry(client, setup, failure, status):
    body, calls, _, _ = setup
    class Transport:
        def __init__(self, target): pass
        def submit(self, payload):
            calls.append(payload)
            if len(calls) == 2: raise failure
    client.app.dependency_overrides[print_transport_factory] = lambda: Transport
    result = client.post('/api/v1/label-print/print', json=body).json()
    assert result['status'] == 'STOPPED'
    assert [item['status'] for item in result['items']] == ['SUBMITTED', status, 'NOT_ATTEMPTED']
    assert len(calls) == 2


@pytest.mark.parametrize('change,expected', [({'expected_host': '192.0.2.99'}, 409), ({'expected_port': 9101}, 409), ({'target_id': 'OTHER'}, 409), ({'copies': 0}, 422), ({'artifacts': ['x' * 43]}, 410), ({'host': '192.0.2.99'}, 422)])
def test_admission_before_any_send(client, setup, change, expected):
    body, calls, _, _ = setup
    assert client.post('/api/v1/label-print/print', json={**body, **change}).status_code == expected
    assert calls == []


def test_disabled_and_cross_origin_targets_never_send(client, setup):
    body, calls, targets, _ = setup
    assert client.post('/api/v1/label-print/print', json=body, headers={'Origin': 'https://untrusted.invalid'}).status_code == 403
    targets[0]['enabled'] = False
    assert client.post('/api/v1/label-print/print', json=body).status_code == 409
    assert calls == []


def test_invalid_later_payload_prevents_all_delivery(client, setup):
    body, calls, _, cache = setup
    identity = cache.put(PreparedOutput(RenderedLabel('test', '1', 1, 1, 203.2, b'PNG'), b'invalid', 'IPL'), 'synthetic-admin')
    body['artifacts'][-1] = identity
    assert client.post('/api/v1/label-print/print', json=body).status_code == 422
    assert calls == []


def test_busy_print_never_sends(client, setup, print_safety):
    body, calls, _, _ = setup
    from app.intake_queue.printers import printer_operation
    from app.config import PrinterTarget
    from contextvars import Context
    # Different execution contexts share the physical owner through storage.
    with printer_operation(PrinterTarget('192.0.2.44',9100),store=print_safety.store()):
        response = Context().run(lambda:client.post('/api/v1/label-print/print',json=body))
    assert response.json()['items'][0]['status']=='FAILED_BEFORE_SEND'
    assert calls == []



def test_replay_after_artifact_expiry_never_revalidates_or_resends(client,setup,monkeypatch):
    body,calls,_,cache=setup
    first=client.post('/api/v1/label-print/print',json=body)
    assert first.status_code==200
    cache.entries.clear()
    monkeypatch.setattr(http,'read_snapshot',lambda *args:pytest.fail('Replay resolved current target'))
    second=client.post('/api/v1/label-print/print',json=body)
    assert second.json()==first.json()
    assert len(calls)==3
    conflict=client.post('/api/v1/label-print/print',json={**body,'copies':2})
    assert conflict.status_code==409
    assert len(calls)==3


def test_status_is_account_owned_and_hold_release_requires_admin(client,setup):
    from app.printing.http import router
    client.app.include_router(router,prefix='/api/v1')
    body,calls,_,_=setup
    assert client.post('/api/v1/label-print/print',json=body).status_code==200
    assert client.get('/api/v1/printing/jobs/'+body['job_id']).json()['status']=='SUBMITTED'
    auth=client.app.state.auth_service
    with auth.transaction() as repo:
        user=repo.get('users','synthetic-admin')
        user={**user,'id':'other-operator','username':'other','username_key':'other','role':'Operator'}
        repo.put('users',user['id'],user)
        token,csrf,_=auth._new_session(repo,user)
    client.cookies.set('tls_session',token)
    client.headers['X-CSRF-Token']=csrf
    assert client.get('/api/v1/printing/jobs/'+body['job_id']).status_code==404
    assert client.post('/api/v1/printing/holds/'+body['job_id']+'/release-hold',json={'note':'Checked'}).status_code==403
    assert len(calls)==3



def test_unavailable_safety_storage_never_resolves_or_sends(client,setup,monkeypatch):
    from app.printing import durable
    body,calls,_,_=setup
    def unavailable(): raise durable.PrintSafetyError()
    monkeypatch.setattr(durable,'runtime_store',unavailable)
    monkeypatch.setattr(http,'read_snapshot',lambda *args:pytest.fail('Unavailable safety storage resolved output'))
    assert client.post('/api/v1/label-print/print',json=body).status_code==503
    assert calls==[]
