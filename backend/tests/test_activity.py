"""Operational-history acceptance with fakes; no database, SAP or printer effects."""
from concurrent.futures import ThreadPoolExecutor
import json
from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import FastAPI, Request
from .auth_test_support import TestClient
from starlette.responses import JSONResponse
from app.activity.context import (current_activity, intake_identity, intake_outcome,
                                  stage, studio_identity, studio_outcome)
from app.activity.middleware import ActivityMiddleware
from app.activity.store import ActivityStore, ActivityUnavailable
from app.observability import CorrelationMiddleware, record_event
from app.management.activity.http import router
from app.management.errors import ManagementError, management_exception
from app.main import app as actual_app


class FakeStore:
    def __init__(self):
        self.events = []

    def append(self, event):
        self.events.append(event)

    def read(self):
        return list(reversed(self.events))[:200]


def application(store=None):
    app = FastAPI()
    if store is not None:
        app.state.activity_store = store
    app.add_middleware(ActivityMiddleware)
    app.add_middleware(CorrelationMiddleware)
    app.add_exception_handler(ManagementError, management_exception)
    app.include_router(router, prefix='/api/v1/management')
    return app


def test_studio_success_stage_timing_and_sensitive_values_are_excluded():
    store = FakeStore()
    app = application(store)

    @app.post('/api/v1/simulation/editor-preview')
    def preview(request: Request):
        studio_identity(SimpleNamespace(purpose='preview', copies=1))
        record_event('BINDING_TEMPLATE')
        stage('RASTERIZING')
        stage('private-business')
        stage('BOUND', error_code='private-business')
        studio_outcome(SimpleNamespace(template_sha256='a'*64, width_px=80, height_px=100, dpi=203))
        return {'png_base64': 'private-output' * 100000}

    client = TestClient(app, client=('127.0.0.1', 12345))
    response = client.post('/api/v1/simulation/editor-preview', json={'data': {'BATCH': 'private-business'}},
                           headers={'Authorization': 'Bearer private-token', 'X-Request-ID': 'spoofed'})
    event = store.events[0]
    assert event['trace_id'] == response.headers['x-request-id']
    assert event['status'] == 'SIMULATED' and event['operation'] == 'preview'
    assert [e['event'] for e in event['events']] == ['REQUEST_RECEIVED', 'BINDING_TEMPLATE', 'RASTERIZING', 'BOUND', 'REQUEST_COMPLETED']
    times = [e['elapsed_ms'] for e in event['events']]
    assert times == sorted(times) and event['duration_ms'] >= times[-1]
    packed = json.dumps(event)
    assert all(secret not in packed for secret in ('private-business', 'private-token', 'private-output', 'spoofed', 'png_base64', 'Authorization'))
    assert client.get('/api/v1/management/activity').json()['entries'] == [event]
    assert current_activity.get() is None


@pytest.mark.parametrize('code,status,expected', [('unauthenticated',401,'FAILED'),
    ('invalid_request',422,'FAILED'), ('print_submission_uncertain',502,'UNCERTAIN'),
    ('response_unavailable',503,'UNCERTAIN')])
def test_rejected_and_uncertain_requests_are_logged_with_safe_codes(code, status, expected):
    store = FakeStore()
    app = application(store)

    @app.post('/api/v1/label-intake')
    def reject():
        return JSONResponse(status_code=status, content={'detail': {'code': code, 'message': 'private-error-text'}})

    response = TestClient(app).post('/api/v1/label-intake', json={'sender': {'system': 'spoofed'}, 'data': 'private'})
    assert response.status_code == status
    event = store.events[0]
    assert event['status'] == expected and event['error_code'] == code
    assert 'source' not in event
    assert 'spoofed' not in json.dumps(event) and 'private-error-text' not in json.dumps(event)


def test_intake_replay_projection_excludes_images_data_and_item_business_identity():
    store = FakeStore()
    app = application(store)

    @app.post('/api/v1/label-intake')
    def replay():
        identity = SimpleNamespace(source=SimpleNamespace(identity='SAP_TEST'), policy=SimpleNamespace(revision='P1'))
        intake_identity(SimpleNamespace(request_id='REQ1', mode='simulation'), identity)
        evidence = SimpleNamespace(model_dump=lambda: {'version': 2, 'svg_sha256': 'b'*64})
        item = SimpleNamespace(item_index=0, label_code='ROLL', copies=1, status='SIMULATED', template=evidence,
            error=None, item_id='private-roll', simulation=SimpleNamespace(payload_bytes=42, payload_sha256='c'*64, png_base64='private-png'))
        intake_outcome(SimpleNamespace(status='COMPLETED', replayed=True, original_trace_id=str(uuid4()),
            mode='simulation', summary=SimpleNamespace(model_dump=lambda: {'total':1,'simulated':1}), results=[item]))
        return {'status': 'COMPLETED'}

    TestClient(app).post('/api/v1/label-intake')
    event = store.events[0]
    assert event['replayed'] is True and event['source'] == 'SAP_TEST'
    assert event['items'][0]['template']['version'] == 2
    assert event['items'][0]['payload_bytes'] == 42
    assert 'private-roll' not in json.dumps(event) and 'private-png' not in json.dumps(event)


def test_logging_failure_does_not_change_successful_print_or_retry(caplog):
    store = FakeStore()
    def fail(event):
        raise RuntimeError('private-dsn')
    store.append = fail
    app = application(store)
    sends = []

    @app.post('/api/v1/printing/editor')
    def print_once():
        sends.append(1)
        studio_identity(SimpleNamespace(copies=2))
        studio_outcome(SimpleNamespace(template_sha256='a'*64, width_px=80, height_px=100, dpi=203,
            copies=2, payload_bytes=42, target=SimpleNamespace(host='192.0.2.1',port=9100)))
        return {'status':'SUBMITTED','confirmed':False}

    response = TestClient(app).post('/api/v1/printing/editor')
    assert response.status_code == 200 and response.json()['confirmed'] is False
    assert sends == [1]
    assert 'activity_write_failed' in caplog.text and 'private-dsn' not in caplog.text


def test_disabled_storage_and_management_access_guards(monkeypatch):
    monkeypatch.setenv('TLS_ACTIVITY_ENABLED','false')
    app = application()
    assert TestClient(app, client=('127.0.0.1',1)).get('/api/v1/management/activity').json() == {'enabled':False,'entries':[]}
    assert TestClient(app, client=('192.0.2.1',1)).get('/api/v1/management/activity').status_code == 403
    response = TestClient(app, client=('127.0.0.1',1)).get('/api/v1/management/activity', headers={'Origin':'https://external.test'})
    assert response.status_code == 403
    monkeypatch.setenv('TLS_ACTIVITY_ENABLED','invalid')
    assert TestClient(app, client=('127.0.0.1',1)).get('/api/v1/management/activity').json()['detail']['code'] == 'activity_unavailable'


def test_concurrent_requests_keep_independent_events_and_metadata():
    store = FakeStore()
    app = application(store)

    @app.post('/api/v1/simulation/editor-preview')
    async def preview():
        import asyncio
        stage('BINDING_TEMPLATE')
        await asyncio.sleep(0.01)
        stage('RASTERIZING')
        studio_outcome(SimpleNamespace(template_sha256='a'*64,width_px=80,height_px=100,dpi=203))
        return {'ok':True}

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: TestClient(app).post('/api/v1/simulation/editor-preview'), range(2)))
    assert len(store.events) == 2
    assert len({event['trace_id'] for event in store.events}) == 2
    assert {event['trace_id'] for event in store.events} == {response.headers['x-request-id'] for response in responses}
    assert all(len(event['events']) == 4 for event in store.events)


def test_real_editor_admission_is_captured_before_endpoint(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(actual_app.state, 'activity_store', store, raising=False)
    response = TestClient(actual_app).post('/api/v1/simulation/editor-preview', content='{', headers={'Content-Type':'application/json'})
    assert response.status_code == 400
    assert store.events[0]['error_code'] == 'malformed_json'


@pytest.mark.parametrize('purpose', ['preview', 'simulation', 'print'])
def test_actual_studio_routes_record_render_stages_and_safe_outcomes(monkeypatch, purpose):
    from io import BytesIO
    from PIL import Image
    from app.engine import pipeline
    from app.printing import http
    store, sends = FakeStore(), []
    monkeypatch.setattr(actual_app.state, 'activity_store', store, raising=False)
    def bitmap(svg, width, height, dpi):
        stream = BytesIO()
        Image.new('1', (width, height), 255).save(stream, format='PNG', dpi=(dpi,dpi))
        return stream.getvalue()
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', bitmap)
    monkeypatch.setitem(actual_app.dependency_overrides, http.print_transport_factory,
        lambda: lambda target: SimpleNamespace(submit=lambda payload: sends.append(payload)))
    body = dict(draft=dict(svg='<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="12mm" viewBox="0 0 80 48"><rect width="4" height="4"/></svg>',
        width_mm=20.,height_mm=12.,dpi=203.2,binding_version=1),data={},encoder='IPL',copies=1)
    if purpose == 'print':
        body['target'] = dict(host='192.0.2.44',port=9100)
        path = '/api/v1/printing/editor'
    else:
        body['purpose'] = purpose
        path = '/api/v1/simulation/editor-preview'
    response = TestClient(actual_app).post(path,json=body)
    assert response.status_code == 200
    event = store.events[0]
    assert event['operation'] == purpose
    assert event['status'] == ('SUBMITTED' if purpose == 'print' else 'SIMULATED')
    assert {'BOUND','RASTERIZING','RASTERIZED','PREPARED'} <= {stage['event'] for stage in event['events']}
    assert len(sends) == (1 if purpose == 'print' else 0)
    if purpose == 'print':
        assert event['confirmed'] is False and event['target']['host'] == '192.0.2.44'
    assert 'png_base64' not in json.dumps(event) and 'svg"' not in json.dumps(event)


def test_store_bound_and_database_failure_are_sanitized(monkeypatch):
    store = ActivityStore('unused')
    def fail():
        raise RuntimeError('private-dsn')
    monkeypatch.setattr(store, '_connect', fail)
    for operation in (lambda: store.read(), lambda: store.append({'safe':'metadata'}),
                      lambda: store.append({'too_large':'x'*262145})):
        with pytest.raises(ActivityUnavailable) as raised:
            operation()
        assert 'private-dsn' not in str(raised.value)
