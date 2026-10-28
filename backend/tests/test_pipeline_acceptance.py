"""T11: actual HTTP owners, native renderer and fake-only persistence/transport."""
import base64
import hashlib
import pytest
from .auth_test_support import TestClient
from app.main import app
from app.config import PrinterTarget
from app.engine.editor_request import EditorOutputRequest
from app.engine.pipeline import prepare_draft_output
from app.printing import http as printing_http
from app.label_intake import http as intake_http
from app.simulation.service import simulate_prepared_output
from tests.test_editor_shared_binding import PARITY_CASES, native_renderer, pixels, request
from tests.test_intake_print import setup as intake_setup
from tests.test_label_intake import envelope, stored
from tests.test_intake_policy import TOKEN, source, policy, event


def changed_data(case):
    data = dict(case['data'])
    data['KEY'] = {
        'code128': 'NEW1234567890', 'code39': 'NEW-123',
        'ean13': '4006381333931', 'qrcode': 'Updated lot 日本 😀 / 42',
    }.get(case.get('type'), 'UPDATED A&B <label>\nnext')
    assert data != case['data']
    return data


CASES = [(case, False) for case in PARITY_CASES] + [
    (PARITY_CASES[index], True) for index in (1, 2, 20, 22, 24, 26)
]


@pytest.mark.parametrize('case,changed', CASES, ids=[
    f'{index:02d}-{"changed" if changed else "original"}'
    for index, (_, changed) in enumerate(CASES)
])
@pytest.mark.parametrize('copies', [1, 999])
def test_studio_intake_actual_sinks_exact_parity(case, changed, copies, native_renderer,
                                                intake_setup, monkeypatch):
    database, _, layouts, _, _ = intake_setup
    body = request(copies=copies) if case is None else request(
        case['before'], changed_data(case) if changed else case['data'], copies, 80, 60)
    layout = stored(svg=body['draft']['svg'], width=body['draft']['width_mm'],
                    height=body['draft']['height_mm'])
    layouts.values = {'A': layout}
    approved = policy(sources=(source(label_codes=('A',)),),
                      audit=(event(svg_sha256=layout.svg_sha256, version=layout.version),))
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', approved.model_dump_json())
    bound, prepared = prepare_draft_output(EditorOutputRequest(**body))
    if changed:
        original = request(case['before'], case['data'], copies, 80, 60)
        previous_bound, previous = prepare_draft_output(EditorOutputRequest(**original))
        # Some portable Linux font/rendering combinations place this specific
        # rotated text outside the visible bitmap even though the bound SVG
        # and encoded payload changed.  The payload assertion below remains
        # the authoritative sink distinction for that case.
        assert previous_bound.svg != bound.svg or previous.payload != prepared.payload
    assert pixels(prepared.bitmap.bitmap_png) == pixels(simulate_prepared_output(prepared).bitmap_png)
    calls = []

    class Sink:
        def submit(self, payload):
            calls.append(payload)

    def intake_factory(target):
        # Simulation is terminal; the new print item must be durably claimed.
        assert database.rows('SELECT state FROM items ORDER BY ledger_id, item_index').count(('SEND_CLAIMED',)) == 1
        return Sink()

    app.dependency_overrides[intake_http.intake_transport_factory] = lambda: intake_factory
    app.dependency_overrides[printing_http.configured_target] = lambda: PrinterTarget('192.0.2.44')
    app.dependency_overrides[printing_http.print_transport_factory] = lambda: lambda target: Sink()
    client = TestClient(app)
    try:
        preview = client.post('/api/v1/simulation/editor-preview', json=body)
        assert preview.status_code == 200, preview.text
        assert pixels(base64.b64decode(preview.json()['png_base64'])) == pixels(prepared.bitmap.bitmap_png)
        manual = client.post('/api/v1/printing/editor', json=body)
        assert manual.status_code == 200, manual.text
        assert calls == [prepared.payload]
        value = envelope(('A',), copies)
        value['items'][0]['data'] = body['data']
        headers = {'Authorization': 'Bearer ' + TOKEN}
        simulation = client.post('/api/v1/label-intake', json=value, headers=headers)
        assert simulation.status_code == 200, simulation.text
        result = simulation.json()
        assert result['status'] == 'COMPLETED'
        assert calls == [prepared.payload]
        evidence = result['results'][0]['simulation']
        assert pixels(base64.b64decode(evidence['png_base64'])) == pixels(prepared.bitmap.bitmap_png)
        assert evidence['payload_sha256'] == hashlib.sha256(prepared.payload).hexdigest()
        assert evidence['payload_bytes'] == len(prepared.payload)
        assert result['results'][0]['template'] == dict(version=layout.version, svg_sha256=layout.svg_sha256)
        value.update(mode='print', request_id='REQ-PRINT')
        printed = client.post('/api/v1/label-intake', json=value, headers=headers)
        assert printed.status_code == 200, printed.text
        result = printed.json()
        assert result['status'] == 'COMPLETED'
        assert result['summary']['submitted'] == 1
        assert result['results'][0]['confirmed'] is False
        assert calls == [prepared.payload, prepared.payload]
        assert b'<RS>' + str(copies).encode() in calls[-1]
        replay = client.post('/api/v1/label-intake', json=value, headers=headers)
        assert replay.status_code == 200
        assert replay.json()['replayed']
        assert replay.json()['results'] == result['results']
        assert calls == [prepared.payload, prepared.payload]
    finally:
        app.dependency_overrides.pop(printing_http.configured_target, None)
        app.dependency_overrides.pop(printing_http.print_transport_factory, None)
