"""Label Print history through actual HTTP handlers with fake DB/device/SAP."""
import json
from types import SimpleNamespace
from uuid import uuid4
import pytest
from .auth_test_support import TestClient
from app.main import app
from app.label_print import http
from app.label_print.artifacts import PreviewArtifacts
from app.engine.bitmap import RenderedLabel
from app.engine.output import PreparedOutput
from app.engine import pipeline
from app.activity.context import current_activity
from tests.test_activity import FakeStore
from tests.test_label_print import synthetic_raster

@pytest.fixture
def logged(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(app.state, 'activity_store', store, raising=False)
    monkeypatch.setattr(http, 'read_snapshot', lambda store: {'document': {'policy': {'targets':[{'target_id':'LAN','host':'192.0.2.44','port':9100,'enabled':True}]}}})
    with TestClient(app, client=('127.0.0.1',1234)) as client:
        yield client, store


def test_busy_preview_is_logged_with_http_code_trace_and_no_business_data(logged):
    client, store = logged
    assert http._preview_lock.acquire(False)
    try:
        response = client.post('/api/v1/label-print/preview', json={'source':'fixture','encoder':'IPL','batches':['PRIVATE-BATCH']},headers={'Authorization':'Bearer PRIVATE-TOKEN'})
    finally: http._preview_lock.release()
    assert response.status_code == 429
    event = store.events[-1]
    assert event['error_code'] == 'preview_busy'
    assert event['status_code'] == 429
    assert event['trace_id'] == response.headers['x-request-id']
    assert event['origin'] == 'label_print'
    assert event['mode'] == 'preview'
    assert event['duration_ms'] >= 0
    assert 'PRIVATE' not in json.dumps(event)
    assert current_activity.get() is None


def test_preview_partial_outcome_and_indexed_stages(logged, monkeypatch):
    client, store = logged
    monkeypatch.setattr(pipeline,'render_svg_bitmap',synthetic_raster)
    response = client.post('/api/v1/label-print/preview',json={'source':'fixture','encoder':'IPL','batches':['0010245801','PRIVATE-BATCH']})
    assert response.status_code == 200
    event = store.events[-1]
    assert event['status'] == 'PARTIAL'
    assert event['summary'] == {'total':2,'ready':1,'failed':1,'not_attempted':0}
    assert event['items'][1]['error_code'] == 'batch_not_found'
    assert any(step['event']=='RESOLVE_LAYOUT' and step['item_index']==0 for step in event['events'])
    packed = json.dumps(event)
    for private in ('0010245801','PRIVATE-BATCH','png_base64','print_artifact','payload_base64'): assert private not in packed


@pytest.mark.parametrize('failure,expected', [(False,'SUBMITTED'),(True,'UNCERTAIN')])
def test_delivery_outcomes_preserve_uncertainty_and_never_log_payloads(logged, monkeypatch, failure, expected):
    client, store = logged
    cache = PreviewArtifacts()
    monkeypatch.setattr(http,'artifacts',cache)
    payload = b'<STX><ESC>C<ETX>\r\n<STX><RS>1<ETX>\r\n<STX><ETB><ETX>\r\n'
    artifact = cache.put(PreparedOutput(RenderedLabel('test','1',1,1,203.2,b'PNG'),payload,'IPL'), 'synthetic-admin')
    sends=[]
    def submit(data):
        sends.append(data)
        if failure: raise OSError('PRIVATE-NETWORK-DETAIL')
    monkeypatch.setitem(app.dependency_overrides,http.print_transport_factory,lambda: lambda target: SimpleNamespace(submit=submit))
    response = client.post('/api/v1/label-print/print',json={'job_id':str(uuid4()),'target_id':'LAN','expected_host':'192.0.2.44','expected_port':9100,'copies':1,'artifacts':[artifact]})
    assert response.status_code == 200
    assert len(sends) == 1
    event = store.events[-1]
    assert event['status'] == expected
    assert event['confirmed'] is False
    assert event['items'][0]['status']==expected
    assert artifact not in json.dumps(event)
    assert 'PRIVATE' not in json.dumps(event)


def test_status_outcome_records_only_fixed_state_not_device_text(logged,monkeypatch):
    client,store=logged
    monkeypatch.setitem(app.dependency_overrides,http.printer_status_probe,lambda: lambda target: {'state':'ATTENTION','reason':'media_out','raw':'PRIVATE-DEVICE','checked_at':'2026-10-16T00:00:00Z','method':'IPL_ENQ','confirmed':False})
    response=client.post('/api/v1/label-print/printer-status',json={'target_id':'LAN','expected_host':'192.0.2.44','expected_port':9100})
    assert response.status_code==200
    event=store.events[-1]
    assert event['status'] == 'CHECKED'
    assert event['printer_state'] == 'ATTENTION'
    assert event['printer_reason']=='media_out'
    assert [step['event'] for step in event['events']]==['REQUEST_RECEIVED','CHECKING_STATUS','STATUS_CHECKED','REQUEST_COMPLETED']
    assert 'PRIVATE' not in json.dumps(event)


@pytest.mark.parametrize('route', ['preview','print','printer-status'])
def test_malformed_requests_are_logged_before_handlers(logged,route):
    client,store=logged
    response=client.post('/api/v1/label-print/'+route,content='{',headers={'Content-Type':'application/json'})
    assert response.status_code==400
    assert store.events[-1]['error_code']=='malformed_json'


def test_log_write_failure_preserves_rejected_request(logged,monkeypatch):
    client,store=logged
    def broken(event): raise RuntimeError('PRIVATE-DSN')
    store.append=broken
    assert http._preview_lock.acquire(False)
    try:
        response=client.post('/api/v1/label-print/preview',json={'source':'fixture','encoder':'IPL','batches':['PRIVATE']})
    finally: http._preview_lock.release()
    assert response.status_code==429
