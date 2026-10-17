import base64
import hashlib
from types import SimpleNamespace

from app.engine import pipeline
from app.engine.bitmap import RenderedLabel
from app.engine.output import PreparedOutput
from app.label_print import http
from app.label_print.artifacts import PreviewArtifacts
from app.label_print.fixtures import TEMPLATE
from app.protocols.ipl.decoder import decode_png
from tests.test_label_print import client, synthetic_raster


def test_package_reuses_preview_bitmap_without_sap_layout_or_raster(client, monkeypatch):
    cache = PreviewArtifacts()
    monkeypatch.setattr(http, 'artifacts', cache)
    monkeypatch.setattr(http, 'read_snapshot', lambda store: {'document': {'policy': {'targets': [{'target_id': 'PLANT', 'enabled': True, 'host': '192.0.2.44', 'port': 9100}]}}})
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', synthetic_raster)
    class Datasets:
        def get(self, identity):
            return {'updated_at': '2026-10-15T00:00:00Z', 'payload': {'items': [{'item_id': '0010245801', 'label_code': 'STORED', 'data': {'BATCH': '0010245801', 'MATERIAL': 'TEST'}}]}}
    monkeypatch.setattr(http, 'validate_payload', lambda value: None)
    client.app.state.studio_dataset_service = Datasets()
    client.app.state.layout_service = SimpleNamespace(get_layout=lambda code: SimpleNamespace(svg=TEMPLATE, width_mm=80, height_mm=60, dpi=203.2, version=1))
    item = client.post('/api/v1/label-print/preview', json={'source': 'dataset', 'dataset_id': '00000000-0000-0000-0000-000000000001', 'encoder': 'IPL', 'batches': ['0010245801']}).json()['items'][0]
    assert item['print_artifact'] and item['status'] == 'PREVIEWED'
    def forbidden(*args, **kwargs): raise AssertionError('Package re-fetched/rasterized data')
    monkeypatch.setattr(http, 'execute_operation', forbidden)
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', forbidden)
    client.app.state.layout_service.get_layout = forbidden
    for copies in (1, 7):
        response = client.post('/api/v1/label-print/print-package', json={'artifacts': [item['print_artifact']], 'copies': copies, 'target_id': 'PLANT'})
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        payload_item = response.json()['items'][0]
        payload = base64.b64decode(payload_item['payload_base64'])
        assert hashlib.sha256(payload).hexdigest() == payload_item['sha256']
        assert f'<STX><RS>{copies}<ETX>'.encode() in payload
        assert decode_png(payload, 640, 480, 203.2) == base64.b64decode(item['png_base64'])
        if copies == 1: assert payload_item['sha256'] == item['payload_sha256']
    cache.entries.clear()
    assert client.post('/api/v1/label-print/print-package', json={'artifacts': [item['print_artifact']], 'copies': 1, 'target_id': 'PLANT'}).status_code == 410


def test_print_package_admission(client, monkeypatch):
    monkeypatch.setattr(http, 'read_snapshot', lambda store: {'document': {'policy': {'targets': []}}})
    body = {'artifacts': ['a' * 43], 'copies': 1, 'target_id': 'PLANT'}
    assert client.post('/api/v1/label-print/print-package', json=body).status_code == 409
    assert client.post('/api/v1/label-print/print-package', json={**body, 'copies': 0}).status_code == 422
    assert client.post('/api/v1/label-print/print-package', json=body, headers={'Origin': 'https://untrusted.invalid'}).status_code == 403
    assert client.post('/api/v1/label-print/print-package', json={**body, 'target': '192.0.2.1'}).status_code == 422


def test_artifact_budget_and_expiration(monkeypatch):
    import pytest
    from app.label_print import artifacts as module
    clock = [100]
    monkeypatch.setattr(module, 'monotonic', lambda: clock[0])
    cache = PreviewArtifacts(budget=6, ttl=10)
    output = PreparedOutput(RenderedLabel('test', '1', 1, 1, 203.2, b'PNG'), b'IPL', 'IPL')
    first = cache.put(output)
    second = cache.put(output)
    with pytest.raises(KeyError): cache.get_many([first], 1)
    assert cache.get_many([second], 1)[0].payload == b'IPL'
    clock[0] += 11
    with pytest.raises(KeyError): cache.get_many([second], 1)
    assert PreviewArtifacts(budget=1).put(output) is None
