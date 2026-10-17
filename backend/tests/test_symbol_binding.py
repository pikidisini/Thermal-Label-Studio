"""Independent JS module/pixel goldens, real Fabric geometry, decode and gates."""
import base64
import hashlib
import io
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageOps
import pytest
import zxingcpp
from app.template_binding import bind_template, BindingError, FontProfile, admit_template, TemplateAdmissionError
from app.template_binding.models import BindingSpec
from app.template_binding import barcode, qr, symbols
from app.template_binding.validation import transform, multiply
from app.svg_safety import SVG_NS

ROOT=Path(__file__).resolve().parents[2]
VECTORS=json.loads((ROOT/'tests/contracts/symbol_vectors.json').read_text(encoding='utf-8'))['cases']
GEOMETRY=json.loads((ROOT/'tests/contracts/templates/symbol_binding_fabric.json').read_text(encoding='utf-8'))['cases']
PROFILE=FontProfile(Path('C:/Windows/Fonts/arial.ttf'),'Arial')


def spec(case):
    return BindingSpec(0,case['type'],'KEY',None,('KEY',),tuple(case['options'].items()))


@pytest.mark.parametrize('case',VECTORS,ids=lambda c:f"{c['type']}-{c['value'][:12]}-{c['options']}")
def test_actual_studio_modules_decisions_and_rgba_pixels(case):
    result=symbols.plan(spec(case),case['value'])
    if case['type']=='qrcode':
        assert result.rows==tuple(case['modules'])
        assert (result.evidence.qr_version,result.evidence.mask)==(case['version'],case['mask'])
    else:assert result.rows==(case['bits'],)
    image=symbols.image(result)
    assert {'width':image.width,'height':image.height,'rgba_sha256':hashlib.sha256(image.tobytes()).hexdigest()}==case['pixels']
    assert symbols.data_url(result)==symbols.data_url(result)


def images(svg):
    result=[]
    def visit(node,matrix):
        if node.get('transform'):matrix=multiply(matrix,transform(node.get('transform')))
        if node.tag==f'{{{SVG_NS}}}image':
            x,y,w,h=[float(node.get(k,'0')) for k in ('x','y','width','height')]
            corners=[(matrix[0]*px+matrix[2]*py+matrix[4],matrix[1]*px+matrix[3]*py+matrix[5]) for px,py in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]
            href=node.get('href') or node.get('{http://www.w3.org/1999/xlink}href')
            image=Image.open(io.BytesIO(base64.b64decode(href.split(',')[1]))).convert('RGBA')
            result.append((node,corners,image))
        for child in node:visit(child,matrix)
    visit(ET.fromstring(svg),(1,0,0,1,0,0))
    return result


@pytest.mark.parametrize('case',GEOMETRY,ids=lambda c:c['type'])
def test_actual_fabric_replacement_preserves_bounds_transforms_pixels_and_static_shapes(case):
    result=bind_template(case['before'],case['data'])
    actual,expected=images(result.svg),images(case['expected'])
    assert len(actual)==len(expected)==1
    for a,b in zip(actual[0][1],expected[0][1]):assert a==pytest.approx(b,abs=.02)
    assert hashlib.sha256(actual[0][2].tobytes()).hexdigest()==case['pixels']['rgba_sha256']
    assert actual[0][2].size==expected[0][2].size
    assert actual[0][0].get('preserveAspectRatio')=='none'
    assert not admit_template(result.svg).objects
    assert len(result.symbols)==1
    assert result.symbols[0].payload_sha256==hashlib.sha256(case['data']['KEY'].encode()).hexdigest()
    before,after=ET.fromstring(case['before']),ET.fromstring(result.svg)
    assert [(e.tag,e.attrib) for e in before.iter() if e.tag.endswith('}rect')]==[(e.tag,e.attrib) for e in after.iter() if e.tag.endswith('}rect')]


@pytest.mark.parametrize('case',[c for c in VECTORS if c['type']!='qrcode' and c['options']['module_width']==2 or c['type']=='qrcode' and c['options']['ecc']=='M' and c['options']['segmentation']=='byte' and len(c['value'].encode())<100],ids=lambda c:c['type']+'-'+c['value'][:12])
def test_independent_decoder_recovers_exact_bytes_and_symbology(case):
    image=symbols.image(symbols.plan(spec(case),case['value'])).convert('RGB')
    # Diagnostic padding helps linear readers whose quiet-zone requirements
    # exceed Studio's frozen margin2. Pixels compared above are NOT modified.
    diagnostic=ImageOps.expand(image,border=30,fill='white')
    decoded=zxingcpp.read_barcodes(diagnostic)
    assert len(decoded)==1
    assert decoded[0].bytes==case['value'].encode('utf-8')
    expected={'code128':zxingcpp.BarcodeFormat.Code128,'code39':zxingcpp.BarcodeFormat.Code39,'ean13':zxingcpp.BarcodeFormat.EAN13,'qrcode':zxingcpp.BarcodeFormat.QRCode}[case['type']]
    assert decoded[0].format==expected


def simple(kind='code128',template='{{KEY}}',options=None):
    source=next(c for c in GEOMETRY if c['type']==kind)['before']
    def encode(value):return base64.b64encode(json.dumps(value).encode()).decode()
    source=re.sub(r'data-field="[^"]+"','',source)
    source=re.sub(r'data-payload-spec="[^"]+"',f'data-payload-spec="{encode({"version":1,"template":template})}"',source)
    if options is not None:
        source=re.sub(r'data-symbol-spec="[^"]+"',f'data-symbol-spec="{encode({"version":1,"type":kind,"options":options})}"',source)
    return source


@pytest.mark.parametrize('kind,data,code', [('code128',{'KEY':[]},'invalid_binding'),('code128',{'KEY':'é'},'invalid_symbol_payload'),('code128',{'KEY':'a'*513},'invalid_symbol_payload'),('code39',{'KEY':'lowercase'},'invalid_symbol_payload'),('ean13',{'KEY':'123'},'invalid_symbol_payload'),('ean13',{'KEY':'4006381333932'},'invalid_symbol_payload'),('qrcode',{'KEY':'😀'*513},'invalid_symbol_payload')])
def test_invalid_required_data_precedes_symbol_generation_render_or_transport(kind,data,code,monkeypatch):
    import app.template_binding.service as service
    import app.engine.raster as raster
    import socket
    def forbidden(*args,**kwargs):pytest.fail('Invalid data reached generator/render/transport')
    monkeypatch.setattr(service,'symbol_plan',forbidden)
    monkeypatch.setattr(raster,'render_svg_bitmap',forbidden)
    monkeypatch.setattr(socket,'create_connection',forbidden)
    with pytest.raises(BindingError) as failure:bind_template(simple(kind),data)
    assert failure.value.code==code


@pytest.mark.parametrize('kind', ['code128', 'code39', 'ean13', 'qrcode'])
@pytest.mark.parametrize('data', [{}, {'key':'case'}, {'KEY':None}, {'KEY':''}])
def test_unavailable_symbols_are_plain_centered_boxes_without_generator(kind, data, monkeypatch):
    import app.template_binding.service as service
    monkeypatch.setattr(service, 'symbol_plan', lambda *args: pytest.fail('Fallback was encoded as a symbol'))
    source = simple(kind, 'Lot {{KEY}} / literal')
    original_image = images(source)[0][0]
    snapshot = dict(data)
    bound = bind_template(source, data, font_profile=PROFILE)
    root = ET.fromstring(bound.svg)
    assert not list(root.iter(f'{{{SVG_NS}}}image'))
    text = next(root.iter(f'{{{SVG_NS}}}text'))
    rect = next(root.iter(f'{{{SVG_NS}}}rect'))
    x,y,w,h = [float(original_image.get(k,'0')) for k in ('x','y','width','height')]
    assert text.text == ' N/A '
    assert float(text.get('x')) == pytest.approx(x+w/2, abs=.0001)
    assert float(text.get('y')) == pytest.approx(y+h/2, abs=.0001)
    assert 'text-anchor:middle' in text.get('style') and 'dominant-baseline:central' in text.get('style')
    assert float(rect.get('width')) < w and float(rect.get('height')) < h
    assert bound.symbols == () and not admit_template(bound.svg).objects
    assert data == snapshot
    # Owner transforms and source order remain intact.
    assert root[0].get('transform') == ET.fromstring(source)[0].get('transform')


@pytest.mark.parametrize('kind,value',[('code128',0),('code128',False),('code39',0),('qrcode',0),('qrcode',False)])
def test_valid_zero_false_and_compositions_use_fresh_payload(kind,value):
    result=bind_template(simple(kind),{'KEY':value})
    wanted='false' if value is False else '0'
    assert result.symbols[0].payload_sha256==hashlib.sha256(wanted.encode()).hexdigest()
    a=bind_template(simple('qrcode','Lot {{KEY}} / {{KEY}}'),{'KEY':'é Δ'})
    b=bind_template(simple('qrcode','Lot {{KEY}} / {{KEY}}'),{'KEY':'different'})
    assert a.svg!=b.svg
    assert a.symbols[0].payload_sha256==hashlib.sha256('Lot é Δ / é Δ'.encode()).hexdigest()


def test_capacity_options_geometry_and_aggregate_reservation_fail_closed(monkeypatch):
    options=dict(next(c['options'] for c in VECTORS if c['type']=='qrcode'))
    options.update(qr_version=1,ecc='H',segmentation='byte')
    with pytest.raises(BindingError) as failure:bind_template(simple('qrcode',options=options),{'KEY':'x'*100})
    assert failure.value.code=='symbol_capacity'
    options.update(qr_version='auto',size=2000)
    one=ET.fromstring(simple('qrcode',options=options));owner=one.find(f'{{{SVG_NS}}}g')
    import copy
    one.append(copy.deepcopy(owner))
    import app.template_binding.service as service
    monkeypatch.setattr(service,'data_url',lambda *args:pytest.fail('Budget overflow reached PNG allocation'))
    with pytest.raises(BindingError) as failure:bind_template(ET.tostring(one,encoding='unicode'),{'KEY':'valid'})
    assert failure.value.code=='resource_limit'
    with pytest.raises(BindingError) as failure:bind_template(simple().replace('preserveAspectRatio="none"',''),{'KEY':'NEW'})
    assert failure.value.code=='unsupported_feature'


def test_static_images_and_mixed_text_symbols_are_atomic_and_sink_independent(monkeypatch):
    import app.engine.raster as raster
    import socket
    def forbidden(*args,**kwargs):pytest.fail('Binder invoked label renderer or transport')
    monkeypatch.setattr(raster,'render_svg_bitmap',forbidden);monkeypatch.setattr(socket,'create_connection',forbidden)
    source=ET.fromstring(simple('qrcode'))
    import copy
    sample=copy.deepcopy(next(e for e in source.iter() if e.tag.endswith('}image')))
    sample.set('id','static-image');source.append(sample)
    encoded=base64.b64encode(json.dumps({'version':1,'font_size':12,'line_height':1.16,'text_align':'left'}).encode()).decode()
    text=ET.SubElement(source,f'{{{SVG_NS}}}text',{'data-field':'KEY','data-text-spec':encoded,'font-size':'12','font-family':'Arial'})
    text.text='OLD'
    xml=ET.tostring(source,encoding='unicode')
    if PROFILE.path.is_file():
        result=bind_template(xml,{'KEY':'fresh 0 false'},font_profile=PROFILE)
        assert 'fresh 0 false' in result.svg
        static=next(e for e in ET.fromstring(result.svg).iter() if e.get('id')=='static-image')
        assert static.attrib==sample.attrib
        assert bind_template(xml,{'KEY':'fresh 0 false'},font_profile=PROFILE)==result
    # Invalid data still prevents all asset preparation.
    text.set('data-field','ABSENT')
    import app.template_binding.service as service
    monkeypatch.setattr(service,'symbol_plan',forbidden)
    with pytest.raises(BindingError) as failure:bind_template(ET.tostring(source,encoding='unicode'),{'KEY':'fresh','ABSENT':[]})
    assert failure.value.code=='invalid_binding'


@pytest.mark.parametrize('change',[{'margin':3},{'display_value':True},{'checksum':'wrong'},{'unknown':1}])
def test_unknown_or_unsupported_symbol_settings_reject_before_generation(change,monkeypatch):
    options=dict(next(c['options'] for c in VECTORS if c['type']=='code128'))
    options.update(change)
    import app.template_binding.service as service
    monkeypatch.setattr(service,'symbol_plan',lambda *a:pytest.fail('Invalid metadata reached generator'))
    with pytest.raises(TemplateAdmissionError):bind_template(simple(options=options),{'KEY':'valid'})


def test_fractional_linear_metrics_reject_without_substitution():
    options=dict(next(c['options'] for c in VECTORS if c['type']=='code128'))
    options['module_width']=1.5
    with pytest.raises(BindingError) as failure:bind_template(simple(options=options),{'KEY':'valid'})
    assert failure.value.code=='unsupported_feature'


def test_duplicate_references_generate_each_owner_from_exact_fresh_payload():
    source=ET.fromstring(simple('qrcode','{{KEY}} / {{KEY}}'))
    import copy
    source.append(copy.deepcopy(source.find(f'{{{SVG_NS}}}g')))
    result=bind_template(ET.tostring(source,encoding='unicode'),{'KEY':'value'})
    assert len(result.symbols)==2
    assert result.symbols[0].element_index!=result.symbols[1].element_index
    assert result.symbols[0].payload_sha256==result.symbols[1].payload_sha256==hashlib.sha256(b'value / value').hexdigest()
