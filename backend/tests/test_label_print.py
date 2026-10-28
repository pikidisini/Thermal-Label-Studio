"""Fixture-only operator preview: real binding and IPL codec, isolated HTTP."""
import base64
import hashlib
from io import BytesIO

import pytest
from fastapi import FastAPI
from .auth_test_support import TestClient
from PIL import Image
from app.label_print import http
from app.label_print.fixtures import TEMPLATE
from app.engine import pipeline
from app.engine.editor_request import EditorBodyMiddleware
from app.protocols import registry

@pytest.fixture
def client():
    app = FastAPI()
    app.add_middleware(EditorBodyMiddleware)
    app.include_router(http.router, prefix='/api/v1')
    return TestClient(app, client=('127.0.0.1', 12345))

def body(batches=None):
    return dict(source='fixture', encoder='IPL', batches=batches or ['0010245801'])

def synthetic_raster(svg, width, height, dpi):
    assert '0010245801' in svg or '0010245802' in svg
    assert 'data-field=' not in svg
    image = Image.new('1', (width, height), 255)
    image.putpixel((15, 20), 0)
    output = BytesIO(); image.save(output, format='PNG', dpi=(dpi, dpi)); return output.getvalue()

def test_exact_payload_decoded_and_item_failures_preserve_order(client, monkeypatch):
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', synthetic_raster)
    original = registry.decode_png
    decoded = []
    def decode(payload, *media):
        decoded.append(payload)
        return original(payload, *media)
    monkeypatch.setattr(registry, 'decode_png', decode)
    result = client.post('/api/v1/label-print/preview', json=body(['0010245801', 'UNKNOWN', '0010245802', '0010245801']))
    assert result.status_code == 200, result.text
    items = result.json()['items']
    assert [item['status'] for item in items] == ['PREVIEWED', 'FAILED', 'PREVIEWED', 'PREVIEWED'], items
    assert items[1]['error_code'] == 'batch_not_found'
    assert items[1]['png_base64'] is None
    assert items[0]['template_version'] == 'fixture-ipl-v1'
    assert len(decoded) == 3
    assert items[0]['payload_sha256'] == hashlib.sha256(decoded[0]).hexdigest()
    with Image.open(BytesIO(base64.b64decode(items[0]['png_base64']))) as image:
        assert image.size == (640, 480)
        assert image.getpixel((15, 20)) == 0

@pytest.mark.parametrize('changes', [dict(encoder='ZPL'), dict(source='sap'), dict(batches=[]),
    dict(batches=['0010245801']*101), dict(batches=[123]), dict(batches=[' bad']),
    dict(batches=['a'*65]), dict(target='192.0.2.1')])
def test_reject_unsupported_or_unbounded_input(client, changes):
    assert client.post('/api/v1/label-print/preview', json={**body(), **changes}).status_code == 422

def test_local_only_and_malformed_body(client):
    assert client.post('/api/v1/label-print/preview', json=body(), headers={'Origin': 'https://external.example'}).status_code == 403
    assert client.post('/api/v1/label-print/preview', content='{"source":"fixture","source":"fixture"}', headers={'Content-Type': 'application/json'}).status_code == 400
    assert client.post('/api/v1/label-print/preview', content='x'*2_100_000, headers={'Content-Type': 'application/json'}).status_code == 413

def test_render_failure_stays_failed_no_sample_fallback(client, monkeypatch):
    def fail(*args): raise http.RasterError('renderer_unavailable')
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', fail)
    item = client.post('/api/v1/label-print/preview', json=body()).json()['items'][0]
    assert item['status'] == 'FAILED'
    assert item['png_base64'] is None
    assert item['error_code'] == 'renderer_unavailable'

def test_busy_request_is_rejected_without_processing(client):
    assert http._preview_lock.acquire(blocking=False)
    try:
        assert client.post('/api/v1/label-print/preview', json=body()).status_code == 429
    finally:
        http._preview_lock.release()


@pytest.mark.parametrize('failed_stage', ['BIND_TEMPLATE', 'RASTERIZE', 'ENCODE_IPL', 'DECODE_IPL'])
def test_pipeline_diagnostics_stop_at_actual_failure(client, monkeypatch, failed_stage):
    monkeypatch.setattr(pipeline, 'render_svg_bitmap', synthetic_raster)
    def fail(*args, **kwargs): raise ValueError('PRIVATE INTERNAL DETAIL')
    if failed_stage == 'BIND_TEMPLATE': monkeypatch.setattr(pipeline, 'bind_template', fail)
    if failed_stage == 'RASTERIZE': monkeypatch.setattr(pipeline, 'render_svg_bitmap', fail)
    if failed_stage == 'ENCODE_IPL': monkeypatch.setattr(registry, 'encode_png', fail)
    if failed_stage == 'DECODE_IPL': monkeypatch.setattr(registry, 'decode_png', fail)
    response = client.post('/api/v1/label-print/preview', json=body())
    item = response.json()['items'][0]
    assert item['failed_stage'] == failed_stage
    assert item['png_base64'] is None
    statuses = [step['status'] for step in item['steps']]
    position = [step['stage'] for step in item['steps']].index(failed_stage)
    assert statuses == ['PASSED'] * position + ['FAILED'] + ['NOT_RUN'] * (7 - position)
    assert item['label_code']
    assert item['template_version']
    if failed_stage == 'DECODE_IPL': assert item['payload_sha256']
    assert 'PRIVATE INTERNAL DETAIL' not in response.text

def test_native_fixture_pipeline(client, real_renderer_settings):
    if not real_renderer_settings.renderer_path.is_file() or not real_renderer_settings.fixture_font_path.is_file():
        pytest.skip('Native renderer/font unavailable.')
    result = client.post('/api/v1/label-print/preview', json=body())
    assert result.status_code == 200
    item = result.json()['items'][0]
    assert item['status'] == 'PREVIEWED', item
    assert len(base64.b64decode(item['png_base64'])) > 100
