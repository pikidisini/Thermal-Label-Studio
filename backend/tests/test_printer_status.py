"""IPL status tests use fake sockets exclusively; no physical device traffic."""
import socket
import pytest
from app.config import PrinterTarget
from app.label_print import http, printer_status as status
from tests.test_label_print import client

@pytest.fixture
def network(monkeypatch):
    operations = []
    class Connection:
        chunks = [b'\x11']
        failure = None
        def __enter__(self): return self
        def __exit__(self, *args): operations.append('closed')
        def settimeout(self, value): assert 0 < value <= 3; operations.append(('timeout', value))
        def connect(self, address):
            operations.append(('connect', address))
            if self.failure == 'connect': raise OSError()
        def sendall(self, payload):
            operations.append(('send', payload))
            if self.failure == 'send': raise OSError()
        def recv(self, limit):
            assert limit <= 16
            if self.failure == 'read': raise TimeoutError()
            return self.chunks.pop(0) if self.chunks else b''
    connection = Connection()
    def factory(family, kind):
        assert kind == socket.SOCK_STREAM
        operations.append(('family', family))
        return connection
    monkeypatch.setattr(status.socket, 'socket', factory)
    return connection, operations


@pytest.mark.parametrize('response,state,reason', [(b'\x11','RESPONDING','ready_or_printing'), (b'\x19','ATTENTION','media_out'), (b'\x1f','ATTENTION','label_path_open_or_ribbon_fault'), (b'\x13','ATTENTION','paused_offline_or_buffer_full'), (b'\x0f','ATTENTION','printhead_hot'), (b'READY','UNAVAILABLE','unrecognized_response'), (b'','UNAVAILABLE','unrecognized_response'), (b'\x02\x19\x03\r\n','ATTENTION','media_out')])
def test_query_never_prints_or_invents_ready(network, response, state, reason):
    connection, operations = network
    connection.chunks = [response]
    result = status.query_ipl_status(PrinterTarget('192.0.2.44', 9100))
    assert (result['state'], result['reason']) == (state, reason)
    assert result['confirmed'] is False and result['checked_at']
    assert [item for item in operations if isinstance(item, tuple) and item[0] == 'send'] == [('send', b'\x05')]
    assert operations[-1] == 'closed'


def test_fragmented_ipv6_status(network):
    connection, operations = network
    connection.chunks = [b'\x02', b'\x19', b'\x03']
    assert status.query_ipl_status(PrinterTarget('2001:db8::1'))['reason'] == 'media_out'
    assert ('connect', ('2001:db8::1', 9100, 0, 0)) in operations


@pytest.mark.parametrize('failure,state', [('connect','UNREACHABLE'), ('send','UNAVAILABLE'), ('read','UNAVAILABLE')])
def test_failures_do_not_claim_device_is_offline(network, failure, state):
    connection, _ = network
    connection.failure = failure
    assert status.query_ipl_status(PrinterTarget('192.0.2.44'))['state'] == state


@pytest.fixture
def registered(client, monkeypatch):
    calls = []
    targets = [{'target_id':'LAN','host':'192.0.2.44','port':9100,'enabled':True}]
    monkeypatch.setattr(http, 'read_snapshot', lambda store: {'policy_origin': 'management', 'document': {'policy': {'targets': targets}}})
    def probe(target):
        calls.append(target)
        return {'state':'ATTENTION','reason':'media_out','checked_at':'2026-10-16T03:00:00+00:00','method':'IPL_ENQ','confirmed':False}
    client.app.dependency_overrides[http.printer_status_probe] = lambda: probe
    return {'target_id':'LAN','expected_host':'192.0.2.44','expected_port':9100}, calls, targets


def test_status_is_explicit_and_no_store(client, registered):
    body, calls, _ = registered
    assert client.get('/api/v1/label-print/printers').status_code == 200
    assert calls == []
    result = client.post('/api/v1/label-print/printer-status', json=body)
    assert result.status_code == 200
    assert result.headers['cache-control'] == 'no-store'
    assert result.json()['reason'] == 'media_out'
    assert len(calls) == 1 and calls[0].host == '192.0.2.44'


@pytest.mark.parametrize('changes,code', [({'target_id':'OTHER'},409), ({'expected_host':'192.0.2.99'},409), ({'expected_port':9101},409), ({'host':'192.0.2.99'},422)])
def test_admission_prevents_arbitrary_or_stale_targets(client, registered, changes, code):
    body, calls, _ = registered
    assert client.post('/api/v1/label-print/printer-status', json={**body, **changes}).status_code == code
    assert calls == []


def test_disabled_origin_and_busy_checks_do_not_probe(client, registered):
    body, calls, targets = registered
    assert client.post('/api/v1/label-print/printer-status', json=body, headers={'Origin':'https://untrusted.invalid'}).status_code == 403
    targets[0]['enabled'] = False
    assert client.post('/api/v1/label-print/printer-status', json=body).status_code == 409
    targets[0]['enabled'] = True
    assert http._server_print_lock.acquire(blocking=False)
    try:
        assert client.post('/api/v1/label-print/printer-status', json=body).status_code == 429
    finally: http._server_print_lock.release()
    assert calls == []
