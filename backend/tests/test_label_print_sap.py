import json
from types import SimpleNamespace
import pytest
from app.main import app
from app.engine import pipeline
from app.label_print.fixtures import TEMPLATE
from app.sap_rfc import runtime as rfc_runtime
from tests.test_management import runtime
from tests.test_sap_rfc_live import setup_live, SECRET
from tests.test_label_print import synthetic_raster

def configure(runtime, monkeypatch):
    client, database, store = runtime
    setup_live(client, store, monkeypatch)
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', synthetic_raster)
    class Layouts:
        def get_layout(self, code):
            assert code == 'STORED'
            return SimpleNamespace(svg=TEMPLATE, width_mm=80, height_mm=60, dpi=203.2, version=2)
    monkeypatch.setattr(app.state, 'layout_service', Layouts(), raising=False)
    return client, database, store

def body(store, batches=None):
    return dict(source='sap', operation_id='ROLL', revision=store.read().policy.revision,
                batch_parameter='IV_ROLL', encoder='IPL', batches=batches or ['0010245801'])

def result(batch):
    return {'result': {'EV_STATUS': 'S', 'EV_MESSAGE': 'ok', 'EV_JSON': json.dumps({'label_code': 'STORED', 'data': {'BATCH': batch, 'MATERIAL': 'SAP MOCK'}})}}

def test_sap_to_real_binder_codec_and_saved_layout(runtime, monkeypatch):
    client, database, store = configure(runtime, monkeypatch)
    calls=[]
    def call(connection, operation, parameters, password):
        assert password == SECRET
        calls.append(parameters)
        if parameters['IV_ROLL'] == 'BAD': return {'result': {'EV_STATUS': 'E', 'EV_MESSAGE': 'not found'}}
        return result(parameters['IV_ROLL'])
    monkeypatch.setattr(rfc_runtime, 'call', call)
    response = client.post('/api/v1/label-print/preview', json=body(store, ['0010245801','BAD','0010245802']))
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    items=response.json()['items']
    assert [item['status'] for item in items] == ['PREVIEWED','FAILED','PREVIEWED']
    assert items[1]['error_code'] == 'sap_status_failed'
    assert items[0]['template_version'] == '2'
    assert items[0]['label_code'] == 'STORED'
    assert items[0]['png_base64'].startswith('iVBOR')
    assert len(calls) == 3
    assert SECRET not in response.text
    assert 'EV_JSON' not in response.text

def test_no_calls_on_conflict_or_incompatible_contract(runtime, monkeypatch):
    client, database, store=configure(runtime,monkeypatch)
    monkeypatch.setattr(rfc_runtime,'call',lambda *a:pytest.fail('Rejected input called SAP'))
    request=body(store);request['revision']='STALE'
    assert client.post('/api/v1/label-print/preview',json=request).status_code==409
    request=body(store);request['batch_parameter']='WRONG'
    assert client.post('/api/v1/label-print/preview',json=request).status_code==422


@pytest.mark.parametrize('data,expected', [({'BATCH':'0010245801'}, 'N/A'),
    ({'BATCH':'0010245801', 'MATERIAL':None}, ' - '),
    ({'BATCH':'0010245801', 'MATERIAL':''}, ' - ')])
def test_sap_unavailable_fields_reach_preview_with_display_fallback(runtime, monkeypatch, data, expected):
    client, database, store = configure(runtime, monkeypatch)
    def call(*args):
        return {'result': {'EV_STATUS':'S', 'EV_MESSAGE':'ok',
            'EV_JSON':json.dumps({'label_code':'STORED', 'data':data})}}
    monkeypatch.setattr(rfc_runtime, 'call', call)
    rendered = []
    def raster(svg, *media):
        rendered.append(svg)
        return synthetic_raster(svg, *media)
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', raster)
    response = client.post('/api/v1/label-print/preview', json=body(store))
    assert response.status_code == 200
    item = response.json()['items'][0]
    assert item['status'] == 'PREVIEWED'
    assert item['print_artifact']
    assert expected in rendered[0]
    assert all(step['status'] == 'PASSED' for step in item['steps'])

def test_timeout_stops_remaining_batch_calls_without_retry(runtime,monkeypatch):
    client,database,store=configure(runtime,monkeypatch)
    calls=[]
    def call(*args): calls.append(True);raise rfc_runtime.RfcError('sap_timeout')
    monkeypatch.setattr(rfc_runtime,'call',call)
    items=client.post('/api/v1/label-print/preview',json=body(store,['0010245801','0010245802'])).json()['items']
    assert len(calls) == 1
    assert all((item['error_code'] == 'sap_timeout' and item['png_base64'] is None for item in items))

def test_revision_change_discards_entire_preview(runtime,monkeypatch):
    client,database,store=configure(runtime,monkeypatch)
    def call(*args): database.document['policy']['revision']='CHANGED';return result('0010245801')
    monkeypatch.setattr(rfc_runtime,'call',call)
    items=client.post('/api/v1/label-print/preview',json=body(store)).json()['items']
    assert items[0]['error_code'] == 'management_conflict'
    assert items[0]['png_base64'] is None


def steps(item):
    return {step['stage']: step['status'] for step in item['steps']}


def test_missing_layout_retains_sap_success_and_code(runtime, monkeypatch):
    from app.layouts.service import LayoutNotFoundError
    client, database, store = configure(runtime, monkeypatch)
    monkeypatch.setattr(rfc_runtime, 'call', lambda *args: result('0010245801'))
    def missing(code):
        assert code == 'STORED'
        raise LayoutNotFoundError()
    monkeypatch.setattr(app.state.layout_service, 'get_layout', missing)
    response = client.post('/api/v1/label-print/preview', json=body(store))
    item = response.json()['items'][0]
    assert item['label_code'] == 'STORED'
    assert item['error_code'] == 'layout_not_found'
    assert item['failed_stage'] == 'RESOLVE_LAYOUT'
    assert item['png_base64'] is None
    assert list(steps(item).values()) == ['PASSED', 'PASSED', 'FAILED'] + ['NOT_RUN'] * 5
    assert SECRET not in response.text
    assert 'EV_JSON' not in response.text


@pytest.mark.parametrize('failure,failed_stage', [('status', 'VALIDATE_DATA'), ('timeout', 'FETCH_DATA')])
def test_rfc_failure_does_not_invent_completed_stages(runtime, monkeypatch, failure, failed_stage):
    client, database, store = configure(runtime, monkeypatch)
    calls = []
    def call(*args):
        calls.append(True)
        if failure == 'timeout': raise rfc_runtime.RfcError('sap_timeout')
        return {'result': {'EV_STATUS': 'E', 'EV_MESSAGE': 'PRIVATE BUSINESS DATA'}}
    monkeypatch.setattr(rfc_runtime, 'call', call)
    response = client.post('/api/v1/label-print/preview', json=body(store, ['0010245801', '0010245802']))
    first, second = response.json()['items']
    assert first['failed_stage'] == failed_stage
    assert steps(first)[failed_stage] == 'FAILED'
    assert steps(first)['FETCH_DATA'] == ('PASSED' if failure == 'status' else 'FAILED')
    assert steps(first)['RESOLVE_LAYOUT'] == 'NOT_RUN'
    if failure == 'timeout':
        assert len(calls) == 1
        assert second['not_attempted']
        assert set(steps(second).values()) == {'NOT_RUN'}
        assert second['failed_stage'] is None
    assert 'PRIVATE BUSINESS DATA' not in response.text


def test_conflict_retains_prior_stage_evidence_but_rejects_preview(runtime, monkeypatch):
    client, database, store = configure(runtime, monkeypatch)
    calls = []
    def call(*args):
        calls.append(True)
        if len(calls) == 2: database.document['policy']['revision'] = 'CHANGED'
        return result('0010245801')
    monkeypatch.setattr(rfc_runtime, 'call', call)
    items = client.post('/api/v1/label-print/preview', json=body(store, ['0010245801', '0010245802', '0010245803'])).json()['items']
    assert len(calls) == 2
    assert all(item['status'] == 'FAILED' and item['png_base64'] is None for item in items)
    assert items[0]['failed_stage'] == 'ACCEPT_PREVIEW'
    assert list(steps(items[0]).values()) == ['PASSED'] * 7 + ['FAILED']
    assert items[0]['label_code'] == 'STORED'
    assert items[0]['payload_sha256']
    assert items[1]['failed_stage'] == 'VALIDATE_DATA'
    assert items[2]['not_attempted']
    assert set(steps(items[2]).values()) == {'NOT_RUN'}
