"""Standalone agent acceptance with fake transports; no physical devices."""
import base64
from contextlib import closing
import hashlib
from http.client import HTTPConnection
from http.server import HTTPServer
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from threading import Thread
from uuid import uuid4

import pytest
from local_agent.agent import Agent, AgentError, configuration, handler_for, wire_payload
from local_agent.transport import BeforeSendError

TOKEN = 'synthetic-test-token-not-a-secret-0001'
CONFIG = {'allowed_origins': ['http://127.0.0.1:5173'], 'printers': [
    {'target_id': 'PLANT', 'language': 'IPL', 'connection': 'Ethernet', 'host': '192.0.2.44', 'port': 9100},
    {'target_id': 'USB', 'language': 'IPL', 'connection': 'USB', 'queue': 'Synthetic RAW queue'}]}


def item():
    payload = b'<STX><ESC>C<ETX>\r\n<STX><RS>2<ETX>\r\n<STX><ETB><ETX>\r\n'
    return {'payload_base64': base64.b64encode(payload).decode(), 'sha256': hashlib.sha256(payload).hexdigest()}


def job(count=1, target='PLANT'):
    return {'job_id': str(uuid4()), 'target_id': target, 'language': 'IPL', 'items': [item() for _ in range(count)]}


@pytest.fixture
def database():
    with TemporaryDirectory(prefix='agent-tests-', dir=Path('.tmp')) as directory:
        yield Path(directory) / 'jobs.sqlite3'


def test_wire_conversion_and_hash_rejection():
    assert wire_payload(item()) == b'\x02\x1bC\x03\r\n\x02\x1e2\x03\r\n\x02\x17\x03\r\n'
    value = item(); value['sha256'] = 'a' * 64
    with pytest.raises(AgentError): wire_payload(value)


def test_catalog_and_duplicate_jobs_never_probe_or_resend(database):
    calls = []
    agent = Agent(CONFIG, database, transport=lambda *args: calls.append(args))
    assert agent.catalog()['status'] == 'READY' and not calls
    request = job(2)
    result = agent.job(request)
    assert result['status'] == 'SUBMITTED' and not result['confirmed'] and len(calls) == 2
    assert calls[0][1].startswith(b'\x02\x1bC')
    restarted = Agent(CONFIG, database, transport=lambda *args: pytest.fail('Duplicate submission'))
    with pytest.raises(AgentError) as exc: restarted.job(request)
    assert exc.value.code == 'job_already_exists'
    assert restarted.get_job(request['job_id']) == result


@pytest.mark.parametrize('before', [True, False])
def test_partial_failure_stops_remaining_labels(database, before):
    calls = []
    def transport(*args):
        calls.append(args)
        if len(calls) == 2:
            if before: raise BeforeSendError()
            raise OSError('PRIVATE DEVICE DETAIL')
    agent = Agent(CONFIG, database, transport=transport)
    result = agent.job(job(3, 'USB'))
    assert len(calls) == 2 and calls[0][0]['queue'] == 'Synthetic RAW queue'
    assert [i['status'] for i in result['items']] == ['SUBMITTED', 'FAILED_BEFORE_SEND' if before else 'UNCERTAIN', 'NOT_ATTEMPTED']
    assert result['status'] == 'STOPPED' and 'PRIVATE' not in json.dumps(result)


def test_all_payloads_validated_before_any_send_and_unknown_target_rejected(database):
    agent = Agent(CONFIG, database, transport=lambda *args: pytest.fail('Rejected job printed'))
    request = job(2); request['items'][1]['sha256'] = 'a' * 64
    with pytest.raises(AgentError): agent.job(request)
    with pytest.raises(AgentError): agent.job(job(target='UNREGISTERED'))


def test_running_job_is_uncertain_after_restart(database):
    agent = Agent(CONFIG, database, transport=lambda *args: None)
    request = job()
    with closing(sqlite3.connect(database)) as db, db:
        db.execute('INSERT INTO jobs VALUES (?, ?)', (request['job_id'], json.dumps({'job_id': request['job_id'], 'status': 'RUNNING', 'confirmed': False, 'items': []})))
    restarted = Agent(CONFIG, database)
    assert restarted.get_job(request['job_id'])['status'] == 'UNCERTAIN'
    with pytest.raises(AgentError): restarted.job(request)


def test_http_auth_origin_preflight_and_delivery(database):
    calls = []
    agent = Agent(CONFIG, database, transport=lambda *args: calls.append(args))
    server = HTTPServer(('127.0.0.1', 0), handler_for(agent, TOKEN))
    thread = Thread(target=server.serve_forever, daemon=True); thread.start()
    def request(method, path, body=None, token=TOKEN, origin='http://127.0.0.1:5173'):
        connection = HTTPConnection('127.0.0.1', server.server_port, timeout=3)
        connection.request(method, path, body=json.dumps(body) if body else None, headers={'Authorization': 'Bearer ' + token, 'Origin': origin, 'Content-Type': 'application/json'})
        response = connection.getresponse(); status = response.status
        raw = response.read(); connection.close(); return status, raw
    try:
        assert request('OPTIONS', '/v1/jobs')[0] == 204
        assert request('GET', '/v1/status', token='WRONG')[0] == 403
        assert request('GET', '/v1/status', origin='http://untrusted.invalid')[0] == 403
        assert request('GET', '/v1/status')[0] == 200 and not calls
        value = job()
        assert request('POST', '/v1/jobs', value)[0] == 200 and len(calls) == 1
        assert request('POST', '/v1/jobs', value)[0] == 409 and len(calls) == 1
        assert request('GET', '/v1/jobs/' + value['job_id'])[0] == 200
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=3)


@pytest.mark.parametrize('changes', [{'allowed_origins': ['*']}, {'printers': [{'target_id': 'X', 'language': 'ZPL'}]}])
def test_reject_unsupported_configuration(changes):
    with pytest.raises(ValueError): configuration({**CONFIG, **changes})
