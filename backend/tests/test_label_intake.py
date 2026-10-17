"""Universal intake admission, fake storage pinning and real Studio/IPL parity."""
import base64
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
from threading import Event
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.label_intake import http, service
from app.label_intake.results import IntakeRequest
from app.label_intake.policy import Admission, Policy, Source
from app.layouts.models import StoredLayout
from app.layouts.service import LayoutArtifactError, LayoutNotFoundError, LayoutPersistenceError
from app.engine.bitmap import RenderedLabel
from app.engine.editor_request import EditorOutputRequest
from app.engine.pipeline import prepare_bitmap, prepare_draft_output
from app.engine.raster import RasterError
from app.protocols.ipl.errors import IplError
from app.simulation.service import simulate_prepared_output
from app.template_binding.composition import BindingError
from tests.intake_ledger_fake import LedgerDatabase

ROOT = Path(__file__).resolve().parents[2]
STATIC = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 160 120"><rect x="3" y="7" width="90" height="30" fill="black"/></svg>'
TRACE = '11111111-1111-4111-8111-111111111111'


def stored(code='A', svg=STATIC, version=1, width=40, height=30, dpi=203):
    return StoredLayout(label_code=code, title='Synthetic', version=version, width_mm=width,
        height_mm=height, dpi=dpi, svg_sha256=hashlib.sha256(svg.encode()).hexdigest(),
        svg=svg, object_key=f'fake/{code}/{version}', created_at=datetime.now(timezone.utc))


class Layouts:
    def __init__(self, values=None):
        self.values = values or {'A': stored(), 'B': stored('B', version=7)}
        self.calls = []
    def get_layout(self, code):
        self.calls.append(code)
        value = self.values.get(code)
        if value is None:
            raise LayoutNotFoundError()
        if isinstance(value, Exception):
            raise value
        return value


def envelope(codes=('A', 'B'), copies=1):
    return dict(sender={'system': 'EXTERNAL_DEMO'}, request_id='REQ-001', mode='simulation',
        items=[dict(item_id=f'I{i}', label_code=code, copies=copies, data={}) for i, code in enumerate(codes)])


def process(body=None, layouts=None):
    return service.simulate_request(IntakeRequest.model_validate(body or envelope()), layouts or Layouts(), TRACE)


@pytest.fixture
def admitted(monkeypatch):
    source = Source(identity='EXTERNAL_DEMO', credential_env='TLS_INTAKE_TOKEN_DEMO',
                    enabled=True, modes=('simulation',), label_codes=('A', 'B', 'UNKNOWN'))
    policy = Policy(revision='test', sources=(source,), targets=(), audit=())
    app.dependency_overrides[http.authorized_sender] = lambda: Admission(policy, source, b'x' * 32)
    layouts = Layouts()
    app.dependency_overrides[http.stored_layouts] = lambda: layouts
    ledger = LedgerDatabase().ledger()
    app.dependency_overrides[http.durable_ledger] = lambda: ledger
    yield layouts
    app.dependency_overrides.pop(http.authorized_sender, None)
    app.dependency_overrides.pop(http.stored_layouts, None)
    app.dependency_overrides.pop(http.durable_ledger, None)


@pytest.fixture
def prepared(monkeypatch):
    stream = BytesIO()
    Image.new('1', (320, 240), 1).save(stream, format='PNG', dpi=(203, 203))
    calls = []
    def prepare(request):
        calls.append(request)
        return None, prepare_bitmap(RenderedLabel('editor', 'current', 320, 240, 203, stream.getvalue()), copies=request.copies)
    monkeypatch.setattr(service, 'prepare_draft_output', prepare)
    return calls


def test_two_codes_order_pins_complete_wire(admitted, prepared):
    response = TestClient(app).post('/api/v1/label-intake', json=envelope(copies=999))
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'COMPLETED' and data['replayed'] is False
    assert data['request_id'] == 'REQ-001'
    assert data['trace_id'] == data['original_trace_id'] == response.headers['x-request-id']
    assert data['trace_id'] != data['request_id']
    assert data['summary'] == dict(total=2, simulated=2, submitted=0, failed=0, uncertain=0, skipped=0)
    assert [item['template']['version'] for item in data['results']] == [1, 7]
    assert [item['item_index'] for item in data['results']] == [0, 1]
    assert all(item['copies'] == 999 and item['error'] is None for item in data['results'])
    assert all(item['simulation']['payload_bytes'] > 0 for item in data['results'])
    assert admitted.calls == ['A', 'B'] and len(prepared) == 2


def test_default_admission_denies_asserted_sender_before_storage(monkeypatch):
    monkeypatch.setattr(service, 'prepare_draft_output', lambda *a: pytest.fail('Unauthorized render'))
    app.dependency_overrides[http.stored_layouts] = lambda: pytest.fail('Unauthorized storage')
    try:
        response = TestClient(app).post('/api/v1/label-intake', json=envelope())
        assert response.status_code == 401 and response.json()['detail']['code'] == 'unauthenticated'
        assert response.json()['detail']['stage'] == 'ADMISSION'
        assert response.json()['request_id'] == 'REQ-001'
    finally:
        app.dependency_overrides.pop(http.stored_layouts, None)


def test_print_sender_and_missing_service_fail_closed(admitted, prepared):
    client = TestClient(app)
    body = envelope(); body['mode'] = 'print'
    assert client.post('/api/v1/label-intake', json=body).json()['detail']['code'] == 'mode_not_allowed'
    body = envelope(); body['sender']['system'] = 'OTHER'
    assert client.post('/api/v1/label-intake', json=body).json()['detail']['code'] == 'sender_not_allowed'
    app.dependency_overrides[http.stored_layouts] = lambda: None
    assert client.post('/api/v1/label-intake', json=envelope()).json()['detail']['code'] == 'intake_unavailable'
    assert admitted.calls == [] and prepared == []


@pytest.mark.parametrize('body,status,code', [
    (b'{', 400, 'malformed_json'), (b'\xef\xbb\xbf{}', 400, 'malformed_json'),
    (b'{"items":[],"items":[]}', 400, 'duplicate_member'),
    (b'{"data":{"K":1,"K":2}}', 400, 'duplicate_member'),
    (b'{"x":NaN}', 400, 'malformed_json'), (b'\xff', 400, 'malformed_json'),
    (b' ' * (2 * 1024 * 1024 + 1), 413, 'request_too_large'),
    (b'{}', 422, 'invalid_request')], ids=['syntax','bom','duplicate','nested-duplicate','nan','utf8','size','shape'])
def test_raw_admission(body, status, code, admitted, prepared):
    response = TestClient(app).post('/api/v1/label-intake', content=body, headers={'Content-Type': 'application/json'})
    assert response.status_code == status and response.json()['detail']['code'] == code
    assert response.json()['request_id'] is None and admitted.calls == [] and prepared == []


@pytest.mark.parametrize('media', ['text/plain', 'application/json; charset=latin1'])
def test_content_type(media, admitted, prepared):
    assert TestClient(app).post('/api/v1/label-intake', content=b'{}', headers={'Content-Type':media}).status_code == 415
    assert prepared == []


@pytest.mark.parametrize('copies', [True, '1', 0, 1000, 1.5])
def test_bad_copies_before_storage(copies, admitted, prepared):
    response = TestClient(app).post('/api/v1/label-intake', json=envelope(copies=copies))
    assert response.status_code == 422 and response.json()['detail']['code'] == 'invalid_copies'
    assert admitted.calls == []


def test_schema_distinct_and_canonical_envelope_rejection(admitted, prepared):
    schema = app.openapi()
    reference = schema['paths']['/api/v1/label-intake']['post']['requestBody']['content']['application/json']['schema']['$ref']
    assert reference.endswith('/IntakeRequest')
    assert set(schema['components']['schemas']['IntakeRequest']['required']) == {'sender','request_id','mode','items'}
    body = envelope(); body['items'][0]['facts'] = {}
    assert TestClient(app).post('/api/v1/label-intake', json=body).status_code == 422
    body = envelope(); body['mode'] = 'invalid'
    assert TestClient(app).post('/api/v1/label-intake', json=body).json()['detail']['code'] == 'invalid_mode'


@pytest.mark.parametrize('value,code', [(None,'unknown_label_code'), (LayoutArtifactError('private'), 'invalid_template'),
    (LayoutPersistenceError('private secret/path'), 'layout_unavailable'),
    (stored().model_copy(update={'svg_sha256': '0'*64}), 'invalid_template'),
    (stored().model_copy(update={'width_mm':41}), 'invalid_media'),
    (stored(svg=STATIC.replace('viewBox="0 0 160 120"','viewBox="1 0 160 120"')), 'invalid_template')])
def test_resolution_partial_no_fallback(value, code, prepared):
    layouts = Layouts({'A': value, 'B': stored('B')})
    data = process(layouts=layouts).wire()
    assert data['status'] == 'PARTIAL'
    failed = data['results'][0]
    assert failed['status'] == 'FAILED' and failed['error']['code'] == code
    assert failed['error']['stage'] == 'RESOLUTION' and 'simulation' not in failed
    assert data['summary']['failed'] == 1 and data['summary']['simulated'] == 1
    assert 'private' not in json.dumps(data) and len(prepared) == 1


def test_all_pinned_once_before_processing_and_nested_input_snapshot(monkeypatch, prepared):
    layouts = Layouts()
    original = service.prepare_draft_output
    body = envelope(('A', 'B', 'A'))
    model = IntakeRequest.model_validate(body)
    def mutate(request):
        assert layouts.calls == ['A', 'B']
        layouts.values['A'] = stored('A', version=42)
        model.items[2].data['MUTATED'] = 'caller change'
        return original(request)
    monkeypatch.setattr(service, 'prepare_draft_output', mutate)
    result = service.simulate_request(model, layouts, TRACE)
    assert [item.template.version for item in result.results] == [1, 7, 1]
    assert all('MUTATED' not in call.data for call in prepared)


@pytest.mark.parametrize('exc,code,stage', [(BindingError('missing_binding'),'missing_binding','BINDING'),
    (BindingError('null_binding'),'null_binding','BINDING'),(BindingError('empty_binding'),'empty_binding','BINDING'),
    (BindingError('invalid_symbol'),'invalid_symbol','BINDING'), (RasterError('secret'),'raster_failed','PREPARATION'),
    (IplError('secret'),'codec_failed','PREPARATION'),(RuntimeError('secret'),'processing_failed','PREPARATION')])
def test_preparation_failure_continues(exc, code, stage, monkeypatch, prepared):
    original = service.prepare_draft_output
    def fail_first(request):
        if not hasattr(fail_first, 'called'):
            fail_first.called = True
            raise exc
        return original(request)
    monkeypatch.setattr(service, 'prepare_draft_output', fail_first)
    result = process()
    assert result.results[0].error.code == code and result.results[0].error.stage == stage
    assert result.results[1].status == 'SIMULATED' and result.status == 'PARTIAL'


def test_copies_aggregate_before_any_prepare(prepared):
    data = process(envelope(('A',)*12, copies=999)).wire()
    assert len(prepared) == 10
    assert [item['status'] for item in data['results']][-2:] == ['FAILED', 'SKIPPED']
    assert data['results'][10]['error']['code'] == 'resource_limit'


def test_pixel_and_memory_reservation_before_prepare(monkeypatch, prepared):
    monkeypatch.setattr(service, 'MAX_PIXELS', 70_000)
    data = process().wire()
    assert prepared == []
    assert [item['status'] for item in data['results']] == ['FAILED','SKIPPED']
    monkeypatch.setattr(service, 'MAX_WORKING', service.BASE_RESERVATION)
    layouts = Layouts(); data = process(layouts=layouts).wire()
    assert layouts.calls == [] and prepared == []


@pytest.mark.parametrize('budget', ['MAX_PNG','MAX_IPL','MAX_RESPONSE'])
def test_actual_retention_budget_no_truncation(monkeypatch, prepared, budget):
    monkeypatch.setattr(service, budget, 1)
    data = process().wire()
    assert [item['status'] for item in data['results']] == ['FAILED','SKIPPED']
    assert all('simulation' not in item for item in data['results']) and len(prepared) == 1


def test_late_prepare_is_discarded_and_remaining_skipped(monkeypatch, prepared):
    now = [0]
    monkeypatch.setattr(service, 'monotonic', lambda: now[0])
    original = service.prepare_draft_output
    def delayed(request):
        value = original(request); now[0] = 61; return value
    monkeypatch.setattr(service, 'prepare_draft_output', delayed)
    data = process().wire()
    assert data['results'][0]['error']['code'] == 'preparation_timeout'
    assert data['results'][1]['status'] == 'SKIPPED'
    assert len(prepared) == 1 and all('simulation' not in item for item in data['results'])


def test_single_inflight_no_queue_and_slot_released(admitted, prepared, monkeypatch):
    entered, release = Event(), Event()
    original = service.prepare_draft_output
    def wait(request):
        entered.set(); assert release.wait(5); return original(request)
    monkeypatch.setattr(service, 'prepare_draft_output', wait)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(lambda: TestClient(app).post('/api/v1/label-intake', json=envelope()))
        assert entered.wait(5)
        try:
            busy = TestClient(app).post('/api/v1/label-intake', json=envelope())
            assert busy.status_code == 429 and busy.json()['detail']['code'] == 'intake_busy'
        finally:
            release.set()
        assert future.result(timeout=5).status_code == 200
    assert TestClient(app).post('/api/v1/label-intake', json=envelope()).status_code == 200


def test_blocked_resolution_exposes_cooperative_deadline_limit(monkeypatch, prepared):
    """Evidence of the remaining T07 hard-deadline gate, not an acceptance PASS."""
    entered, release = Event(), Event()
    layouts = Layouts()
    original = layouts.get_layout
    def blocked(code):
        entered.set(); assert release.wait(5); return original(code)
    layouts.get_layout = blocked
    monkeypatch.setattr(service, 'DEADLINE_SECONDS', 0.05)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(lambda: process(layouts=layouts))
        assert entered.wait(5)
        try:
            with pytest.raises(FutureTimeout):
                future.result(timeout=0.2)
        finally:
            release.set()
        result = future.result(timeout=5)
    assert result.results[0].error.code == 'preparation_timeout'
    assert result.results[1].status == 'SKIPPED' and prepared == []


def pixels(png):
    with Image.open(BytesIO(png)) as image:
        return image.size, image.convert('1').tobytes()


@pytest.mark.parametrize('kind', ['static','text','symbol'])
@pytest.mark.parametrize('copies', [1, 999])
def test_native_stored_intake_matches_studio_and_decoded_ipl(kind, copies, monkeypatch, admitted):
    renderer = ROOT/'engine/bin/resvg.exe'
    if not renderer.is_file() or not Path('C:/Windows/Fonts/arial.ttf').is_file():
        pytest.skip('Native resvg/Arial unavailable; local native parity NOT RUN.')
    monkeypatch.setenv('TLS_RENDERER_PATH', str(renderer))
    svg, values, width, height = STATIC, {}, 40, 30
    if kind != 'static':
        name = 'text_binding_fabric.json' if kind == 'text' else 'symbol_binding_fabric.json'
        case = json.loads((ROOT/'tests/contracts/templates'/name).read_text(encoding='utf-8'))['cases'][0]
        svg, values, width, height = case['before'], case['data'], 80, 60
    admitted.values = {'A': stored(svg=svg, width=width, height=height)}
    body = envelope(('A',), copies); body['items'][0]['data'] = values
    response = TestClient(app).post('/api/v1/label-intake', json=body)
    result = response.json()['results'][0]
    assert result['status'] == 'SIMULATED', result
    output = EditorOutputRequest(draft=dict(svg=svg,width_mm=width,height_mm=height,dpi=203,binding_version=1),
        data=values, encoder='IPL', copies=copies)
    _, prepared = prepare_draft_output(output)
    simulated = simulate_prepared_output(prepared)
    png = base64.b64decode(result['simulation']['png_base64'])
    assert pixels(png) == pixels(simulated.bitmap_png) == pixels(prepared.bitmap.bitmap_png)
    assert result['simulation']['payload_sha256'] == hashlib.sha256(prepared.payload).hexdigest()
    assert b'<RS>' + str(copies).encode() in prepared.payload
    studio = TestClient(app).post('/api/v1/simulation/editor-preview', json=output.model_dump())
    assert studio.status_code == 200 and pixels(base64.b64decode(studio.json()['png_base64'])) == pixels(png)


def test_no_fixture_or_dataset_dependency_and_simulation_has_no_transport():
    import ast
    directory = ROOT/'backend/app/label_intake'
    for path in directory.glob('*.py'):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        imported = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]
        assert not any(name and name.startswith(('app.studio_datasets','app.labels')) for name in imported)
        if path.name not in ('http.py','print_service.py'):
            assert not any(name and name.startswith('app.printing') for name in imported)
