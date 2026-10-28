"""Template admission with real Fabric7 shared fixtures, no renderer/storage."""
import base64
import json
from pathlib import Path
from dataclasses import FrozenInstanceError
import pytest
from app.template_binding import admit_template, TemplateAdmissionError
from app.svg_safety import validate_safe_svg

FIXTURE = (Path(__file__).resolve().parents[2]/'tests/contracts/templates/fabric_v1.svg').read_text()
STATIC = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 160 120"><rect x="0" y="0" width="10" height="10" fill="black"/></svg>'
def encoded(spec):
    return base64.b64encode(json.dumps(spec).encode()).decode()

def test_actual_fabric_manifest_order_keys_options_and_immutability():
    result = admit_template(FIXTURE)
    assert result.required_keys == ('ZZCHARG', 'ZZWIDTH')
    assert [obj.kind for obj in result.objects] == ['text', 'qrcode', 'text']
    assert dict(result.objects[1].options)['segmentation'] == 'auto'
    assert result.objects[2].template == 'Width {{ZZWIDTH}}'
    assert (result.width_mm, result.height_mm, result.view_box) == (40,30,(0,0,160,120))
    with pytest.raises(FrozenInstanceError): result.required_keys = ()
    assert admit_template(STATIC).objects == ()

@pytest.mark.parametrize('bad',[
    FIXTURE.replace('data-binding-version="1"','data-binding-version="2"'),
    FIXTURE.replace('data-field="ZZCHARG"','data-field="BAD"'),
    FIXTURE.replace('data-field="ZZCHARG"','data-field="constructor"'),
    FIXTURE.replace('data-placeholder="ZZCHARG"','data-placeholder="ZZCHARG\n"'),
    FIXTURE.replace('data-text-spec="','data-unknown="'),
    FIXTURE.replace('width="40mm"','width="41mm"'),
    STATIC.replace('x="0"','x="0 1"'),
    STATIC.replace('width="10"','width="-10"'),
    STATIC.replace('<rect','<rect transform="matrix(1 NaN 0 1 0 0)"'),
    STATIC.replace('<rect','<rect style="transform: matrix(1 inf 0 1 0 0)"'),
    STATIC.replace('<rect','<path d="M 0 0 L 1"/><rect'),
    STATIC.replace('<rect','<path d="M 0 0 A 1 1 0 2 0 0 0"/><rect'),
    STATIC.replace('<rect','<rect fill="url(#missing)"').replace(' fill="black"',''),
    STATIC.replace('<rect','<filter/><rect'),
])
def test_semantic_rejects(bad):
    with pytest.raises(TemplateAdmissionError): admit_template(bad)

def test_metadata_base64_duplicates_and_unknown_keys():
    import re
    for spec in ['???', base64.b64encode(b'{"version":1,"version":1,"template":"x"}').decode(), encoded({'version':2,'template':'x'}), encoded({'version':1,'template':'{{constructor}}'}),encoded({'version':1,'template':'x','extra':True})]:
        bad = re.sub(r'data-payload-spec="[^"]+"',f'data-payload-spec="{spec}"',FIXTURE,count=1)
        with pytest.raises(TemplateAdmissionError): admit_template(bad)

def test_safety_and_semantics_are_separate_and_references_are_bounded():
    unsafe = STATIC.replace('<rect','<script/><rect')
    with pytest.raises(ValueError): validate_safe_svg(unsafe)
    safe_but_unsupported = STATIC.replace('<rect','<filter/><rect')
    validate_safe_svg(safe_but_unsupported)
    with pytest.raises(TemplateAdmissionError): admit_template(safe_but_unsupported)
    for definitions in ['<clipPath id="A"><rect clip-path="url(#A)" width="1" height="1"/></clipPath>', '<linearGradient id="A" fill="url(#B)"/><linearGradient id="B" fill="url(#A)"/>']:
        prepared_replace = STATIC.replace('<rect', '<defs>' + definitions + '</defs><rect', 1)
        with pytest.raises(TemplateAdmissionError):
            admit_template(prepared_replace)
    valid = STATIC.replace('<rect','<defs><linearGradient id="A"><stop offset="0%" stop-color="black"/></linearGradient></defs><rect',1).replace('fill="black"','fill="url(#A)"')
    assert admit_template(valid).required_keys == ()

def test_resource_limits_and_invalid_images_before_render():
    for bad in [STATIC.replace('<rect','<g>'*33+'<rect').replace('</svg>','</g>'*33+'</svg>'),STATIC.replace('<rect','<rect/>'*10001+'<rect'),STATIC+' '*524288,FIXTURE.replace('iVBORw0KGgoAAAANSUhEUgAAABQ','AAAAAA0KGgoAAAANSUhEUgAAABQ')]:
        with pytest.raises(TemplateAdmissionError): admit_template(bad)

def test_style_local_references_and_compounded_geometry_limits():
    valid = STATIC.replace('<rect','<defs><linearGradient id="G"><stop offset="0%" stop-color="black"/></linearGradient><clipPath id="C"><rect width="2" height="2"/></clipPath></defs><rect',1).replace('fill="black"','style="fill:url(#G);clip-path:url(#C)"')
    assert admit_template(valid).objects == ()
    for bad in [valid.replace('url(#G)', 'url(https://example.invalid/a)'), valid.replace('url(#G)', 'url(&quot;#G&quot;)'), valid.replace('url(#G)', 'url(#C)'), STATIC.replace('<rect', '<g transform="scale(10000)"><g transform="scale(10000)"><rect').replace('</svg>', '</g></g></svg>'), STATIC.replace('<rect','<g>'*2000+'<rect').replace('</svg>','</g>'*2000+'</svg>')]:
        with pytest.raises(TemplateAdmissionError): admit_template(bad)

def test_all_symbol_kinds_options_and_text_metric_conflicts():
    import re
    for kind,checksum in [('code128','native'),('code39',False),('ean13','verified')]:
        spec={'version':1,'type':kind,'options':{'module_width':2,'bar_height':40,'margin':2,'display_value':False,'font_size':12,'checksum':checksum}}
        svg=re.sub(r'data-symbol-spec="[^"]+"',f'data-symbol-spec="{encoded(spec)}"',FIXTURE).replace('data-barcode-type="qrcode"',f'data-barcode-type="{kind}"').replace('data-qr="ZZCHARG"','data-barcode="ZZCHARG"')
        assert admit_template(svg).objects[1].kind == kind
        spec['options']['checksum']='invalid'
        bad=re.sub(r'data-symbol-spec="[^"]+"',f'data-symbol-spec="{encoded(spec)}"',svg)
        with pytest.raises(TemplateAdmissionError): admit_template(bad)
    prepared_replace_2 = FIXTURE.replace('font-size="12"', 'font-size="20"')
    with pytest.raises(TemplateAdmissionError):
        admit_template(prepared_replace_2)

def test_symbol_owner_is_exactly_one_image():
    bad=FIXTURE.replace('<image style=', '<rect width="2" height="2"/><image style=',1)
    with pytest.raises(TemplateAdmissionError): admit_template(bad)

def test_conflicting_image_sources_reject():
    bad=FIXTURE.replace('xlink:href=', 'href="data:image/png;base64,AAAA" xlink:href=',1)
    with pytest.raises(TemplateAdmissionError): admit_template(bad)

@pytest.mark.parametrize('attribute,value', [('style',r'fill:u\72l(https://example.invalid/a)'),('fill',r'u\72l(https://example.invalid/a)'),('stroke','u/**/rl(https://example.invalid/a)'),('clip-path','url(#C)/*hidden*/'),('style','fill:u&#x7f;rl(https://example.invalid/a)')])
def test_semantic_admission_rejects_obfuscated_css_before_resource_use(attribute,value):
    svg=STATIC.replace('fill="black"', f'{attribute}="{value}"')
    with pytest.raises(TemplateAdmissionError) as error: admit_template(svg)
    assert error.value.code == 'unsafe_svg'
