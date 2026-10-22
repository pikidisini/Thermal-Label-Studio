"""Server LAN delivery with fake transports only; no sockets or operational storage."""
from uuid import uuid4
import pytest
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
        def __init__(self, target): assert target.host == '192.0.2.44' and target.port == 9100
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


def test_busy_print_never_sends(client, setup):
    body, calls, _, _ = setup
    assert http._server_print_lock.acquire(blocking=False)
    try:
        assert client.post('/api/v1/label-print/print', json=body).status_code == 429
    finally:
        http._server_print_lock.release()
    assert calls == []
