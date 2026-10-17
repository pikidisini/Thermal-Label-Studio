"""Text preparation compared to independently captured Fabric output."""
import base64
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from app.template_binding import bind_text_template, BindingError, FontProfile, admit_template
from app.label_data.numbers import number_text
from app.template_binding.validation import transform, multiply
from app.svg_safety import SVG_NS

ROOT = Path(__file__).resolve().parents[2]
CAPTURE = json.loads((ROOT/'tests/contracts/templates/text_binding_fabric.json').read_text(encoding='utf-8'))
FONT = Path('C:/Windows/Fonts/arial.ttf')
PROFILE = FontProfile(FONT, 'Arial')
font_matches = FONT.is_file() and hashlib.sha256(FONT.read_bytes()).hexdigest() == CAPTURE['font']['sha256']
font_matches = font_matches and all(FONT.with_name(name).is_file() and hashlib.sha256(FONT.with_name(name).read_bytes()).hexdigest() == digest for name,digest in CAPTURE['font']['variants'].items())


def world_spans(svg):
    result = []
    def visit(node, matrix):
        matrix = multiply(matrix, transform(node.get('transform'))) if node.get('transform') else matrix
        if node.tag == f'{{{SVG_NS}}}tspan':
            x, y = float(node.get('x', '0')), float(node.get('y', '0'))
            result.append((node.text or '', matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]))
        for child in node:
            visit(child, matrix)
    visit(ET.fromstring(svg), (1,0,0,1,0,0))
    return result


@pytest.mark.skipif(not font_matches, reason='Fixed Arial font profile unavailable; real geometry parity NOT RUN on this host.')
@pytest.mark.parametrize('case', CAPTURE['cases'], ids=lambda c:c['name'])
def test_fabric_replacement_geometry_and_content(case):
    result = bind_text_template(case['before'], case['data'], font_profile=PROFILE)
    actual, expected = world_spans(result.svg), world_spans(case['expected'])
    assert [row[0] for row in actual] == [row[0] for row in expected]
    for got, wanted in zip(actual, expected):
        assert got[1:] == pytest.approx(wanted[1:], abs=.004)
    assert (result.media.width_mm, result.media.height_mm, result.media.width_px, result.media.height_px, result.media.dpi) == (80,60,639,480,203)
    assert result.manifest.svg_sha256 == hashlib.sha256(case['before'].encode()).hexdigest()
    assert result.svg_sha256 == hashlib.sha256(result.svg.encode()).hexdigest()
    assert admit_template(result.svg).objects == ()
    assert 'SAMPLE OLD' not in result.svg
    before, after = ET.fromstring(case['before']), ET.fromstring(result.svg)
    assert before.get('viewBox') == after.get('viewBox')
    # Static painted shapes and their relative ordering are unchanged.
    assert [(e.tag,e.attrib) for e in before.iter() if e.tag.endswith('}rect')] == [(e.tag,e.attrib) for e in after.iter() if e.tag.endswith('}rect')]


def encode(value):
    return base64.b64encode(json.dumps(value).encode()).decode()


def ordinary(template=None):
    payload = f'data-payload-spec="{encode({"version":1,"template":template})}"' if template is not None else 'data-field="KEY"'
    return f'<svg xmlns="{SVG_NS}" data-binding-version="1" width="40mm" height="30mm" viewBox="0 0 160 120"><text x="12" y="20" font-family="Arial" font-size="12" fill="red" {payload} data-text-spec="{encode({"version":1,"font_size":12,"line_height":1.16,"text_align":"left"})}">OLD</text></svg>'


@pytest.mark.skipif(not font_matches, reason='Fixed font unavailable')
def test_scalar_strings_unicode_spaces_escaping_and_distinct_snapshots():
    for case in json.loads((ROOT/'tests/contracts/text_scalar_cases.json').read_text(encoding='utf-8')):
        bound = bind_text_template(ordinary(), {'KEY':case['value']}, font_profile=PROFILE)
        root = ET.fromstring(bound.svg)
        assert ''.join(root.find(f'{{{SVG_NS}}}text').itertext()) == case['expected']
        assert world_spans(bound.svg)[0][1:] == (12,20)
    a = bind_text_template(ordinary('Lot {{KEY}} / {{ZERO}} {{FLAG}}'), {'KEY':'é Δ','ZERO':0,'FLAG':False}, font_profile=PROFILE)
    b = bind_text_template(ordinary('Lot {{KEY}} / {{ZERO}} {{FLAG}}'), {'KEY':'<&>','ZERO':1.25,'FLAG':True}, font_profile=PROFILE)
    assert a.svg != b.svg
    assert 'Lot é Δ / 0 false' in a.svg
    assert 'Lot &lt;&amp;&gt; / 1.25 true' in b.svg


@pytest.mark.parametrize('data,code', [({'KEY':[]},'invalid_binding'),({'KEY':float('nan')},'invalid_binding'),({'KEY':'x'*4097},'invalid_binding'),({'KEY':'\x01'},'invalid_binding'),({'KEY':'\n'*100},'resource_limit')])
def test_required_failures_before_font_renderer_or_transport(data, code, monkeypatch):
    from app.template_binding.text import TextMetrics
    def forbidden(*args, **kwargs):
        pytest.fail('Invalid binding reached preparation dependency')
    monkeypatch.setattr(TextMetrics, 'font', forbidden)
    import app.engine.raster as raster
    monkeypatch.setattr(raster, 'render_svg_bitmap', forbidden)
    import socket
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    with pytest.raises(BindingError) as failure:
        bind_text_template(ordinary(), data)
    assert failure.value.code == code
    assert failure.value.stage == 'BINDING'
    assert str(failure.value) == 'Template binding failed.'


@pytest.mark.parametrize('data,expected', [({}, 'N/A'), ({'key':'wrong case'}, 'N/A'),
    ({'KEY':None}, ' - '), ({'KEY':''}, ' - '), ({'KEY':'  '}, '  '),
    ({'KEY':0}, '0'), ({'KEY':False}, 'false')])
def test_unavailable_text_uses_display_fallback_without_mutating_facts(data, expected):
    snapshot = dict(data)
    result = bind_text_template(ordinary(), data, font_profile=PROFILE)
    node = ET.fromstring(result.svg).find(f'{{{SVG_NS}}}text')
    assert ''.join(node.itertext()) == expected
    assert data == snapshot and not admit_template(result.svg).objects


def test_composition_fallbacks_are_per_exact_token_and_preserve_spaces():
    from app.template_binding.composition import resolve_composition
    assert resolve_composition('Lot {{KEY}} / {{EMPTY}} / {{NULL}} / {{MISSING}} / {{ZERO}} / {{FLAG}}',
        {'KEY':'001', 'EMPTY':'', 'NULL':None, 'ZERO':0, 'FLAG':False}) == 'Lot 001 /  -  /  -  / N/A / 0 / false'


def test_static_without_facts_font_or_renderer_and_media_bounds():
    static=f'<svg xmlns="{SVG_NS}" width="40mm" height="30mm" viewBox="0 0 160 120"><rect width="5" height="5"/></svg>'
    result=bind_text_template(static,{},font_profile=FontProfile(Path('missing-font'), 'No font'))
    assert result.manifest.required_keys == ()
    for dpi in (True,0,71,601,float('inf')):
        with pytest.raises(BindingError):bind_text_template(static,{},dpi=dpi)


def test_mixed_symbol_rejects_before_any_stale_sample_can_be_returned():
    mixed=(ROOT/'tests/contracts/templates/fabric_v1.svg').read_text()
    with pytest.raises(BindingError) as failure:
        bind_text_template(mixed,{'ZZCHARG':'NEW','ZZWIDTH':0})
    assert failure.value.code == 'unsupported_feature'


@pytest.mark.parametrize('case',json.loads((ROOT/'tests/contracts/text_scalar_cases.json').read_text(encoding='utf-8')))
def test_numeric_golden_matches_actual_javascript(case):
    if type(case['value']) in (int,float):
        assert number_text(case['value']) == case['expected']


@pytest.mark.skipif(not font_matches, reason='Fixed font unavailable')
@pytest.mark.parametrize('value', ['ไทย', '😀', 'a\u0338', 'one\rtwo'])
def test_unproven_shaping_and_line_profiles_reject(value):
    with pytest.raises(BindingError) as failure:
        bind_text_template(ordinary(), {'KEY':value}, font_profile=PROFILE)
    assert failure.value.code == 'unsupported_feature'


def test_composition_rejects_invalid_scalar_without_interpolation():
    from app.template_binding.composition import resolve_composition
    with pytest.raises(BindingError):
        resolve_composition('{{KEY}}', {'KEY':{'nested':'not scalar'}})


def test_binding_is_deterministic_and_never_calls_output_sinks(monkeypatch):
    if not font_matches:
        pytest.skip('Fixed font unavailable')
    import app.engine.raster as raster
    import socket
    def forbidden(*args, **kwargs):
        pytest.fail('Text preparation invoked an output sink')
    monkeypatch.setattr(raster, 'render_svg_bitmap', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    a=bind_text_template(ordinary(), {'KEY':'fresh data'}, font_profile=PROFILE)
    b=bind_text_template(ordinary(), {'KEY':'fresh data'}, font_profile=PROFILE)
    assert a == b


@pytest.mark.skipif(not font_matches, reason='Fixed font unavailable')
def test_generated_output_limit_before_safety_renderer(monkeypatch):
    import app.template_binding.service as service
    def oversized(node, *args, **kwargs):
        node.text = 'x' * (512*1024)
    monkeypatch.setattr(service, 'bind_text', oversized)
    with pytest.raises(BindingError) as failure:
        bind_text_template(ordinary(), {'KEY':'fresh data'}, font_profile=PROFILE)
    assert failure.value.code == 'resource_limit'


def test_conflicting_inherited_anchor_rejects_before_font(monkeypatch):
    from app.template_binding.text import TextMetrics
    def forbidden(*args, **kwargs):
        pytest.fail('Conflicting anchor reached font metrics')
    monkeypatch.setattr(TextMetrics, 'font', forbidden)
    svg=ordinary().replace('<text ', '<g style="text-anchor: end"><text ').replace('</text>', '</text></g>')
    with pytest.raises(BindingError) as failure:
        bind_text_template(svg, {'KEY':'new data'}, font_profile=PROFILE)
    assert failure.value.code == 'unsupported_feature'
