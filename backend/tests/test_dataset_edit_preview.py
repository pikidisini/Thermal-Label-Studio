from datetime import datetime
from types import SimpleNamespace
from uuid import UUID
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.studio_datasets.http import router as datasets_router
from app.label_print.http import router as preview_router
from app.studio_datasets.service import DatasetConflictError
from app.layouts.service import LayoutNotFoundError
from app.label_print.fixtures import TEMPLATE
from app.engine import pipeline
from tests.test_studio_datasets import managed, PAYLOAD
from tests.test_label_print import synthetic_raster

def test_update_conflict_preserves_scalar_types(managed):
    service = managed
    created = service.create('Sample', 'sample.json', PAYLOAD)
    app = FastAPI(); app.include_router(datasets_router); app.state.studio_dataset_service = service
    client = TestClient(app, client=('127.0.0.1', 1234))
    value = dict(name='Edited', original_filename='sample.json', payload=PAYLOAD, expected_updated_at=created['updated_at'].isoformat())
    url = f"/studio-sample-datasets/{created['id']}"
    result = client.put(url, json=value)
    assert result.status_code == 200, result.text
    assert client.put(url, json=value).status_code == 409
    stored = client.get(url).json()
    assert stored['name'] == 'Edited'
    assert stored['payload']['items'][0]['data'] == {'ZZWIDTH': 0, 'flag': False, 'empty': None}
    assert client.put(url, json=value, headers={'Origin': 'https://other.example'}).status_code == 403

def test_dataset_preview_uses_saved_layout_and_one_pinned_version(monkeypatch):
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', synthetic_raster)
    calls = []
    class Layouts:
        def get_layout(self, code):
            calls.append(code)
            if code != 'SAVED_ROLL': raise LayoutNotFoundError()
            return SimpleNamespace(svg=TEMPLATE, width_mm=80, height_mm=60, dpi=203.2, version=7)
    payload = dict(sender={'system': 'TEST'}, request_id='dataset', mode='simulation', items=[
        dict(item_id='0010245801', label_code='SAVED_ROLL', copies=1, data={'BATCH': '0010245801', 'MATERIAL': 'LOCAL DATA'}),
        dict(item_id='0010245802', label_code='MISSING', copies=1, data={}),
    ])
    app = FastAPI(); app.include_router(preview_router)
    app.state.layout_service = Layouts()
    app.state.studio_dataset_service = SimpleNamespace(get=lambda identifier: {'payload': payload, 'updated_at': datetime.now().astimezone()})
    client = TestClient(app, client=('127.0.0.1', 1234))
    result = client.post('/label-print/preview', json=dict(source='dataset', dataset_id='00000000-0000-0000-0000-000000000001', encoder='IPL', batches=['0010245801', '0010245801', 'UNKNOWN', '0010245802']))
    assert result.status_code == 200, result.text
    data = result.json(); assert data['source'] == 'dataset' and data['dataset_updated_at']
    assert [item['status'] for item in data['items']] == ['PREVIEWED', 'PREVIEWED', 'FAILED', 'FAILED']
    assert data['items'][0]['label_code'] == 'SAVED_ROLL' and data['items'][0]['template_version'] == '7'
    assert data['items'][3]['error_code'] == 'layout_not_found'
    assert calls == ['SAVED_ROLL', 'MISSING']
