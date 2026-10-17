"""Versioned payload/text/symbol specs, independent of SVG security admission."""
import base64
import re
from app.label_data import decode_json
from app.label_data.validation import KEY, FORBIDDEN, text
from .models import TemplateAdmissionError, TextLayout
import math

TOKEN = re.compile(r'\{\{\s*([A-Za-z0-9_-]+)\s*\}\}')

def reject(code='invalid_metadata'):
    raise TemplateAdmissionError(code)

def key(value):
    if not isinstance(value, str) or not KEY.fullmatch(value) or value in FORBIDDEN:
        reject()
    return value

def decode_spec(value):
    try:
        if not value or len(value) > 21848:
            reject()
        raw = base64.b64decode(value, validate=True)
        if base64.b64encode(raw).decode() != value:
            reject()
        spec = decode_json(raw, limit=16384)
        if type(spec) is not dict or type(spec.get('version')) not in (int, float) or spec['version'] != 1:
            reject()
        return spec
    except (ValueError, UnicodeError):
        reject()

def composition(value):
    try:
        text(value)
    except ValueError:
        reject()
    keys = []
    position = 0
    for match in TOKEN.finditer(value):
        if '{' in value[position:match.start()] or '}' in value[position:match.start()]:
            reject()
        candidate = key(match[1])
        if candidate not in keys:
            keys.append(candidate)
        position = match.end()
    if '{' in value[position:] or '}' in value[position:]:
        reject()
    return tuple(keys)

def payload_spec(value):
    spec = decode_spec(value)
    if set(spec) != {'version', 'template'} or type(spec['template']) is not str:
        reject()
    return spec['template'], composition(spec['template'])

def text_spec(value):
    spec = decode_spec(value)
    if set(spec) != {'version', 'font_size', 'line_height', 'text_align'}:
        reject()
    for name in ('font_size', 'line_height'):
        if type(spec[name]) not in (int, float) or not 0 < spec[name] <= 4096:
            reject()
    if spec['text_align'] not in ('left', 'center', 'right'):
        reject('unsupported_feature')
    return tuple((k, v) for k, v in spec.items() if k != 'version')

def layout_spec(value):
    spec = decode_spec(value)
    if set(spec) != {'version', 'profile', 'width', 'height', 'advance_width', 'advance_height', 'origin_x', 'origin_y', 'char_spacing'} or spec['profile'] != 'fabric7':
        reject()
    def number(v):
        if type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1_000_000:
            reject()
        return float(v)
    width, height = number(spec['width']), number(spec['height'])
    if width <= 0 or height <= 0:
        reject()
    vectors = []
    for name in ('advance_width', 'advance_height'):
        v = spec[name]
        if type(v) is not list or len(v) != 2:
            reject()
        vectors.append(tuple(number(entry) for entry in v))
    origins = [number(spec[name]) for name in ('origin_x', 'origin_y')]
    if any(not 0 <= v <= 1 for v in origins):
        reject()
    spacing = number(spec['char_spacing'])
    if not -1000 <= spacing <= 10000:
        reject()
    return TextLayout(width, height, *vectors, *origins, spacing)

def symbol_spec(value):
    spec = decode_spec(value)
    if set(spec) != {'version', 'type', 'options'} or type(spec['options']) is not dict:
        reject()
    kind = spec['type']
    options = spec['options']
    if kind == 'qrcode':
        if set(options) != {'ecc', 'margin', 'size', 'encoding', 'segmentation', 'qr_version', 'mask'}:
            reject()
        if options['ecc'] not in ('L', 'M', 'Q', 'H') or options['encoding'] != 'utf8' or options['segmentation'] not in ('auto', 'byte'):
            reject('unsupported_feature')
        for name, maximum in (('qr_version', 40), ('mask', 7)):
            v = options[name]
            if v != 'auto' and (type(v) not in (int, float) or not float(v).is_integer() or not (1 if name == 'qr_version' else 0) <= v <= maximum):
                reject()
        if options['margin'] != 1 or type(options['margin']) not in (int, float):
            reject('unsupported_feature')
        if type(options['size']) not in (int, float) or not 0 < options['size'] <= 4096:
            reject()
    elif kind in ('code128', 'code39', 'ean13'):
        if set(options) != {'module_width', 'bar_height', 'margin', 'display_value', 'font_size', 'checksum'}:
            reject()
        for name in ('module_width', 'bar_height', 'font_size'):
            if type(options[name]) not in (int, float) or not 0 < options[name] <= 4096:
                reject()
        if options['margin'] != 2 or type(options['margin']) not in (int, float) or options['display_value'] is not False or options['font_size'] != 12:
            reject('unsupported_feature')
        expected = 'verified' if kind == 'ean13' else False if kind == 'code39' else 'native'
        if options['checksum'] != expected or kind == 'code39' and type(options['checksum']) is not bool:
            reject()
    else:
        reject('unsupported_feature')
    return kind, tuple(options.items())
