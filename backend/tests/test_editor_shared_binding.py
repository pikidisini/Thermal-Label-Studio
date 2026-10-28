"""Current draft -> real binder -> resvg -> IPL -> decoded/fake print sinks."""
import base64
import hashlib
import io
import json
from pathlib import Path
from PIL import Image
import pytest
from .auth_test_support import TestClient
from .conftest import test_font_path
from app.main import app
from app.engine import pipeline
from app.engine.editor_request import EditorOutputRequest
from app.printing import http
from app.config import PrinterTarget
from app.simulation.service import simulate_prepared_output
from app.template_binding.service import bind_template
from app.template_binding.models import TemplateAdmissionError
from app.template_binding.composition import BindingError

ROOT = Path(__file__).resolve().parents[2]
TEXT = json.loads((ROOT/'tests/contracts/templates/text_binding_fabric.json').read_text(encoding='utf-8'))['cases']
SYMBOLS = json.loads((ROOT/'tests/contracts/templates/symbol_binding_fabric.json').read_text(encoding='utf-8'))['cases']
STATIC = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 160 120"><g transform="rotate(37 40 40)"><rect width="30" height="60" fill="#123456"/><circle cx="60" cy="20" r="12"/></g></svg>'


def test_native_renderer_fixture_path_is_absolute_without_runtime_override(monkeypatch):
    """The sanitized source gate must not feed a relative path into Settings."""
    from .conftest import test_renderer_path

    monkeypatch.delenv('TLS_RENDERER_PATH', raising=False)
    monkeypatch.delenv('CI_RENDERER_PATH', raising=False)
    assert test_renderer_path().is_absolute()

def request(svg=STATIC, data=None, copies=1, width=40, height=30):
    return dict(draft=dict(svg=svg,width_mm=width,height_mm=height,dpi=203,binding_version=1),
                data={} if data is None else data,encoder='IPL',copies=copies)

def pixels(png):
    with Image.open(io.BytesIO(png)) as image:
        return image.size, image.convert('1').tobytes()

@pytest.fixture
def native_renderer(monkeypatch):
    from .conftest import test_renderer_path
    renderer = test_renderer_path()
    font = test_font_path()
    if not renderer.is_file() or not font.is_file():
        pytest.skip('Installed renderer/test font unavailable; native raster parity NOT RUN.')
    monkeypatch.setenv('TLS_RENDERER_PATH', str(renderer))
    monkeypatch.setenv('TLS_FIXTURE_FONT_PATH', str(font))

@pytest.fixture(autouse=True)
def fake_transport(monkeypatch):
    sent=[]
    class Recorder:
        def submit(self,payload): sent.append(payload)
    app.dependency_overrides[http.configured_target]=lambda: PrinterTarget('192.0.2.44')
    app.dependency_overrides[http.print_transport_factory]=lambda: lambda target: Recorder()
    yield sent
    app.dependency_overrides.clear()

# Each text geometry/style variant and all four symbol types, nested and rotated.
PARITY_CASES = [None] + [TEXT[i] for i in (0,1,2,3,4,5,6,7,14,21,28,35,42,49,56,63,70,77,83)] + [SYMBOLS[i] for i in (0,5,6,11,12,17,18,23)]

@pytest.mark.parametrize('case', PARITY_CASES)
@pytest.mark.parametrize('copies',[1,999])
def test_real_shared_raster_payload_and_sinks(case,copies,native_renderer,fake_transport):
    body=request(copies=copies) if case is None else request(case['before'],case['data'],copies,80,60)
    admitted=EditorOutputRequest(**body)
    bound,prepared=pipeline.prepare_draft_output(admitted)
    # A future stored consumer uses precisely the same pure binder and engine.
    stored=bind_template(body['draft']['svg'],body['data'],dpi=203)
    stored_output=pipeline.prepare_editor_output(stored.svg,stored.media.width_mm,stored.media.height_mm,203,copies=copies)
    assert bound.svg == stored.svg
    assert pixels(prepared.bitmap.bitmap_png) == pixels(stored_output.bitmap.bitmap_png)
    assert prepared.payload==stored_output.payload
    assert pixels(prepared.bitmap.bitmap_png)==pixels(simulate_prepared_output(prepared).bitmap_png)
    client=TestClient(app)
    preview=client.post('/api/v1/simulation/editor-preview',json=body)
    printed=client.post('/api/v1/printing/editor',json=body)
    assert preview.status_code==printed.status_code==200
    assert pixels(base64.b64decode(preview.json()['png_base64']))==pixels(prepared.bitmap.bitmap_png)
    assert fake_transport==[prepared.payload]
    assert b'<RS>'+str(copies).encode() in fake_transport[0]
    for response in [preview,printed]:
        assert response.json()['template_sha256']==hashlib.sha256(body['draft']['svg'].encode()).hexdigest()
        assert response.json()['binding_version']==1

@pytest.mark.parametrize('route',['simulation/editor-preview','printing/editor'])
@pytest.mark.parametrize('data,code',[({'KEY':{}},'invalid_request')])
def test_required_data_rejects_before_raster_or_transport(route,data,code,monkeypatch,fake_transport):
    monkeypatch.setattr(pipeline,'render_svg_bitmap',lambda *a,**k:pytest.fail('Invalid data rendered'))
    body=request(TEXT[0]['before'],{**data,'ZERO':0,'FLAG':False},width=80,height=60)
    response=TestClient(app).post('/api/v1/'+route,json=body)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == code
    assert fake_transport == []
    assert 'SAMPLE OLD' not in response.text


@pytest.mark.parametrize('kind', ['text', 'code128', 'qrcode'])
@pytest.mark.parametrize('data', [{}, {'KEY':None}, {'KEY':''}])
def test_fallbacks_use_same_native_preview_and_print_bitmap(kind, data, native_renderer, fake_transport):
    source = TEXT[0]['before'] if kind == 'text' else next(c['before'] for c in SYMBOLS if c['type'] == kind)
    body = request(source, {**data, 'ZERO':0, 'FLAG':False}, width=80, height=60)
    bound, prepared = pipeline.prepare_draft_output(EditorOutputRequest(**body))
    client = TestClient(app)
    preview = client.post('/api/v1/simulation/editor-preview', json=body)
    printed = client.post('/api/v1/printing/editor', json=body)
    assert preview.status_code == printed.status_code == 200
    assert pixels(base64.b64decode(preview.json()['png_base64'])) == pixels(prepared.bitmap.bitmap_png)
    assert fake_transport == [prepared.payload]
    assert ('N/A' if not data or kind != 'text' else ' - ') in bound.svg

@pytest.mark.parametrize('route',['simulation/editor-preview','printing/editor'])
@pytest.mark.parametrize('change',[{'width_mm':41},{'height_mm':31},{'binding_version':2},{'binding_version':True},{'dpi':True}])
def test_media_version_no_bypass(route,change,monkeypatch,fake_transport):
    monkeypatch.setattr(pipeline,'render_svg_bitmap',lambda *a,**k:pytest.fail('Mismatch rendered'))
    body=request();body['draft'].update(change)
    assert TestClient(app).post('/api/v1/'+route,json=body).status_code==422
    assert fake_transport==[]

@pytest.mark.parametrize('route',['simulation/editor-preview','printing/editor'])
@pytest.mark.parametrize('body,status,code',[(b'{"data":{},"data":{}}',400,'duplicate_member'),(b'{',400,'malformed_json'),(b' '*2097153,413,'request_too_large')],ids=['duplicate','malformed','overflow'])
def test_raw_body_admission(route,body,status,code,fake_transport):
    response=TestClient(app).post('/api/v1/'+route,content=body,headers={'content-type':'application/json'})
    assert response.status_code == status
    assert response.json()['detail']['code'] == code
    assert fake_transport==[]

def test_old_composed_request_and_simulation_target_rejected(fake_transport):
    client=TestClient(app)
    for body in [dict(svg=STATIC,width_mm=40,height_mm=30,dpi=203),{**request(),'target':{'host':'192.0.2.44','port':9100}}]:
        assert client.post('/api/v1/simulation/editor-preview',json=body).status_code==422
    assert fake_transport==[]
