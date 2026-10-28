"""Explicit semantic allowlist after independent safe-SVG admission."""
import base64
import hashlib
import io
import math
import re
import warnings
from xml.etree import ElementTree as ET
from PIL import Image
from app.svg_safety import validate_safe_svg, SVG_NS, XLINK_NS
from .metadata import key, payload_spec, text_spec, symbol_spec, layout_spec, reject
from .models import BindingSpec, TemplateManifest, TemplateAdmissionError


_GEOMETRY_SEPARATORS = ' ,\t\r\n'

COMMON = {'id', 'style', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'clip-path', 'paint-order', 'vector-effect', 'visibility'}
TEXT = {'x', 'y', 'dx', 'dy', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-anchor', 'text-align', 'text-decoration', 'text-decoration-thickness', 'white-space', 'letter-spacing', 'dominant-baseline'}
ALLOWED = {
    'svg': {'width', 'height', 'viewBox', 'version'},
    'desc': set(), 'defs': set(), 'g': set(),
    'rect': {'x', 'y', 'width', 'height', 'rx', 'ry'},
    'line': {'x1', 'y1', 'x2', 'y2'}, 'circle': {'cx', 'cy', 'r'},
    'ellipse': {'cx', 'cy', 'rx', 'ry'}, 'polygon': {'points'}, 'polyline': {'points'},
    'path': {'d'}, 'text': TEXT, 'tspan': TEXT,
    'image': {'x', 'y', 'width', 'height', 'href', 'preserveAspectRatio'},
    'clipPath': {'clipPathUnits'},
    'linearGradient': {'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod'},
    'radialGradient': {'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod'},
    'stop': {'offset', 'stop-color', 'stop-opacity'},
}
META = {'data-text-layout', 'data-editor-coordinate-profile', 'data-binding-version', 'data-field', 'data-placeholder', 'data-is-dynamic', 'data-payload-spec', 'data-text-spec', 'data-symbol-spec', 'data-barcode', 'data-qr', 'data-barcode-type', 'data-barcode-value', 'data-is-barcode', 'data-editor-group'}
NUMBER = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?'
NUMERIC = {'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'dx', 'dy', 'width', 'height', 'rx', 'ry', 'r', 'fx', 'fy', 'fr', 'font-size', 'letter-spacing', 'stroke-width', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'offset'}

def numbers(value, percentage=False):
    cleaned = value.strip()
    if percentage and cleaned.endswith('%'):
        cleaned = cleaned[:-1]
    parts = re.split(r'[\s,]+', cleaned)
    if not parts or any(not re.fullmatch(NUMBER, v) or not math.isfinite(float(v)) or abs(float(v)) > 1_000_000 for v in parts):
        reject('invalid_geometry')
    return tuple(map(float, parts))

def multiply(a, b):
    result = (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])
    if any(not math.isfinite(v) or abs(v) > 1_000_000 for v in result):
        reject('invalid_geometry')
    return result

_IDENTITY_MATRIX = (1, 0, 0, 1, 0, 0)
_TRANSFORM_ARITY = {'matrix': {6}, 'translate': {1, 2}, 'scale': {1, 2}, 'rotate': {1, 3}, 'skewX': {1}, 'skewY': {1}}
_PATH_ARITY = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}
_REFERENCE = r'url\(#([A-Za-z][A-Za-z0-9_.:-]*)\)'
_DYNAMIC_FIELDS = ('data-field', 'data-placeholder', 'data-barcode', 'data-qr')
_DYNAMIC_DESCENDANT_FIELDS = (*_DYNAMIC_FIELDS, 'data-payload-spec', 'data-symbol-spec')
_STATIC_MARKERS = ('data-is-dynamic', 'data-is-barcode', 'data-barcode-type', 'data-barcode-value', 'data-text-spec', 'data-text-layout')


def _transform_matrix(name, values):
    if name == 'matrix':
        return values
    if name == 'translate':
        return (1, 0, 0, 1, values[0], values[1] if len(values) == 2 else 0)
    if name == 'scale':
        return (values[0], 0, 0, values[-1], 0, 0)
    if name == 'rotate':
        angle = math.radians(values[0])
        matrix = (math.cos(angle), math.sin(angle), -math.sin(angle), math.cos(angle), 0, 0)
        if len(values) == 3:
            return multiply(multiply((1, 0, 0, 1, values[1], values[2]), matrix), (1, 0, 0, 1, -values[1], -values[2]))
        return matrix
    tangent = math.tan(math.radians(values[0]))
    return (1, tangent if name == 'skewY' else 0, tangent if name == 'skewX' else 0, 1, 0, 0)


def transform(value):
    position = 0
    result = _IDENTITY_MATRIX
    for match in re.finditer(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)', value):
        if value[position:match.start()].strip(_GEOMETRY_SEPARATORS):
            reject('invalid_geometry')
        values = numbers(match[2])
        if len(values) not in _TRANSFORM_ARITY[match[1]]:
            reject('invalid_geometry')
        position = match.end()
        result = multiply(result, _transform_matrix(match[1], values))
    if not position or value[position:].strip(_GEOMETRY_SEPARATORS):
        reject('invalid_geometry')
    return result


def _arc_parameters(tokens, start, end):
    for offset in range(start, end, 7):
        if (float(tokens[offset]) < 0 or float(tokens[offset + 1]) < 0
                or tokens[offset + 3] not in ('0', '1') or tokens[offset + 4] not in ('0', '1')):
            reject('invalid_geometry')


def _path_segments(command, tokens, start, end):
    length = end - start
    size = _PATH_ARITY[command.upper()]
    if size == 0:
        if length:
            reject('invalid_geometry')
        return 1
    if not length or length % size:
        reject('invalid_geometry')
    if command.upper() == 'A':
        _arc_parameters(tokens, start, end)
    return length // size


def path_count(value):
    pattern = r'[MmLlHhVvCcSsQqTtAaZz]|' + NUMBER
    tokens = re.findall(pattern, value)
    remainder = re.sub(pattern, '', value)
    if remainder.strip(_GEOMETRY_SEPARATORS) or not tokens or tokens[0] not in ('M', 'm'):
        reject('invalid_geometry')
    index = count = 0
    while index < len(tokens):
        command = tokens[index]
        if command.upper() not in _PATH_ARITY:
            reject('invalid_geometry')
        index += 1
        start = index
        while index < len(tokens) and re.fullmatch(NUMBER, tokens[index]):
            numbers(tokens[index])
            index += 1
        count += _path_segments(command, tokens, start, index)
    return count


def _style_property(prop, entry):
    if prop in NUMERIC:
        parsed = numbers(entry)
        if len(parsed) != 1 or prop in ('stroke-width', 'font-size') and parsed[0] < 0:
            reject('invalid_geometry')
    if prop == 'transform':
        transform(entry)
    if prop == 'white-space' and entry != 'pre':
        reject('unsupported_feature')


def _style_references(value):
    refs = []
    for declaration in value.split(';'):
        if not declaration.strip():
            continue
        parts = declaration.split(':', 1)
        if len(parts) != 2 or parts[0].strip() not in COMMON | TEXT | {'stop-color', 'stop-opacity'}:
            reject('unsupported_feature')
        prop, entry = map(str.strip, parts)
        _style_property(prop, entry)
        refs.extend((prop, reference) for reference in re.findall(_REFERENCE, entry))
    return refs


def _geometry_attribute(name, attribute, value):
    if attribute in NUMERIC:
        parsed = numbers(value, name in ('stop', 'linearGradient', 'radialGradient'))
        if len(parsed) != 1 or attribute in ('width', 'height', 'rx', 'ry', 'r', 'fr', 'stroke-width', 'font-size') and parsed[0] < 0:
            reject('invalid_geometry')
    if attribute in ('transform', 'gradientTransform'):
        transform(value)
    if attribute == 'points' and (len(numbers(value)) % 2 or len(numbers(value)) < 4):
        reject('invalid_geometry')


def _metadata_attribute(node, root, attribute):
    if attribute == 'data-editor-coordinate-profile' and node is not root:
        reject('unsupported_metadata')
    if attribute not in META or attribute == 'data-binding-version' and node is not root:
        reject('unsupported_metadata')


def _field_metadata(node):
    values = [node.get(name) for name in _DYNAMIC_FIELDS if node.get(name) is not None]
    if len(set(values)) > 1:
        reject('conflicting_metadata')
    field = key(values[0]) if values else None
    template = None
    keys = (field,) if field else ()
    if node.get('data-payload-spec') is not None:
        template, keys = payload_spec(node.get('data-payload-spec'))
        if field and (keys != (field,) or not re.fullmatch(r'\{\{\s*' + re.escape(field) + r'\s*\}\}', template)):
            reject('conflicting_metadata')
    return field, template, keys


def _binding_markers(node, dynamic):
    for marker in ('data-is-dynamic', 'data-editor-group', 'data-is-barcode'):
        if node.get(marker) not in (None, 'true'):
            reject('invalid_metadata')
    if not dynamic and any(node.get(name) is not None for name in _STATIC_MARKERS):
        reject('incomplete_metadata')


def _symbol_binding(node, name, symbol):
    if name != 'g' or node.get('data-text-spec') or node.get('data-text-layout') is not None:
        reject('conflicting_metadata')
    if len(node) != 1 or node[0].tag != f'{{{SVG_NS}}}image' or len(node[0]):
        reject('unsupported_feature')
    kind, options = symbol_spec(symbol)
    if (node.get('data-barcode-type') != kind or node.get('data-qr') and kind != 'qrcode'
            or node.get('data-barcode') and kind == 'qrcode'):
        reject('conflicting_metadata')
    return kind, options, None


def _text_metrics(node, options):
    declarations = [tuple(map(str.strip, part.split(':', 1))) for part in node.get('style', '').split(';') if part.strip()]
    metrics = [value for prop, value in declarations if prop == 'font-size']
    if node.get('font-size') is not None:
        metrics.append(node.get('font-size'))
    if not metrics or any(numbers(metric) != (dict(options)['font_size'],) for metric in metrics):
        reject('conflicting_metadata')
    if len(node) > 100 or any(child.tag != f'{{{SVG_NS}}}tspan' for child in node):
        reject('unsupported_feature')
    for span in node:
        if (any(span.get(prop) is not None for prop in ('font-size', 'font-family', 'font-weight', 'font-style'))
                or re.search(r'(?:^|;)\s*font-(?:size|family|weight|style)\s*:', span.get('style', ''))):
            reject('unsupported_feature')


def _text_binding(node, name, root):
    if name != 'text' or node.get('data-is-barcode') or node.get('data-barcode-type') or node.get('data-barcode-value'):
        reject('incomplete_metadata')
    options = text_spec(node.get('data-text-spec'))
    layout = None
    if node.get('data-text-layout') is not None:
        if root.get('data-editor-coordinate-profile') != 'fabric7':
            reject('conflicting_metadata')
        layout = layout_spec(node.get('data-text-layout'))
    _text_metrics(node, options)
    return 'text', options, layout


def _image_pixels(data, previous):
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            pixels = previous + width * height
            if image.format not in ('PNG', 'JPEG', 'WEBP') or max(width, height) > 4096 or pixels > 4_000_000:
                reject('resource_limit')
            image.load()
    return pixels


class _TemplateAdmission:
    """One admission's bounded state; helpers never perform storage or transport IO."""

    def __init__(self, source, root):
        self.source, self.root = source, root
        self.nodes = list(root.iter())
        if len(self.nodes) > 10000:
            reject('resource_limit')
        self.parents = {child: node for node in self.nodes for child in node}
        self.ids, self.references = {}, {}
        self.bindings, self.required = [], []
        self.path_commands = self.image_bytes = self.image_pixels = 0
        self.dynamic_owners = set()
        self.version = root.get('data-binding-version')
        if root.get('data-editor-coordinate-profile') not in (None, 'fabric7'):
            reject('unsupported_metadata')
        self.world_matrices = {}
        if self.version is not None and self.version != '1':
            reject('unsupported_metadata_version')
        self.complete = set()

    def _ancestors(self, node):
        depth = 1
        ancestor = self.parents.get(node)
        while ancestor is not None:
            depth += 1
            if ancestor in self.dynamic_owners and any(name in node.attrib for name in _DYNAMIC_DESCENDANT_FIELDS):
                reject('conflicting_metadata')
            ancestor = self.parents.get(ancestor)
        if depth > 32:
            reject('resource_limit')

    def _identity(self, node):
        identity = node.get('id')
        if not identity:
            return
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.:-]{0,127}', identity) or identity in self.ids:
            reject('invalid_reference')
        self.ids[identity] = node

    def _attribute(self, node, name, attribute, value):
        local = attribute.removeprefix(f'{{{XLINK_NS}}}') if attribute == f'{{{XLINK_NS}}}href' else attribute
        if attribute == '{http://www.w3.org/XML/1998/namespace}space' and value == 'preserve':
            return []
        if local.startswith('data-'):
            _metadata_attribute(node, self.root, local)
            return []
        if local not in COMMON | ALLOWED[name]:
            reject('unsupported_feature')
        if local in NUMERIC and node is self.root and local in ('width', 'height'):
            # Root media is checked in millimeters after the reference graph.
            return []
        _geometry_attribute(name, local, value)
        if local == 'd':
            self.path_commands += path_count(value)
        if local == 'style':
            return _style_references(value)
        return [(local, reference) for reference in re.findall(_REFERENCE, value)]

    def _world_matrix(self, node):
        style_transform = None
        for declaration in node.get('style', '').split(';'):
            if declaration.strip() and declaration.split(':', 1)[0].strip() == 'transform':
                style_transform = declaration.split(':', 1)[1].strip()
        if style_transform and node.get('transform'):
            reject('invalid_geometry')
        selected = style_transform or node.get('transform')
        local = transform(selected) if selected else _IDENTITY_MATRIX
        self.world_matrices[node] = multiply(self.world_matrices.get(self.parents.get(node), _IDENTITY_MATRIX), local)

    def _image(self, node):
        href, linked = node.get('href'), node.get(f'{{{XLINK_NS}}}href')
        if href is not None and linked is not None and href != linked:
            reject('conflicting_metadata')
        href = href or linked
        if not href or not href.startswith('data:image/'):
            reject('unsupported_feature')
        try:
            data = base64.b64decode(href.split(',', 1)[1], validate=True)
            self.image_bytes += len(data)
            if self.image_bytes > 1024 * 1024:
                reject('resource_limit')
            self.image_pixels = _image_pixels(data, self.image_pixels)
        except TemplateAdmissionError:
            raise
        except Exception:
            reject('invalid_image')

    def _binding(self, index, node, name):
        field, template, keys = _field_metadata(node)
        symbol = node.get('data-symbol-spec')
        dynamic = field is not None or template is not None or symbol is not None
        _binding_markers(node, dynamic)
        if not dynamic:
            return
        if self.version != '1':
            reject('unsupported_metadata_version')
        if field is None and template is None:
            reject('incomplete_metadata')
        if symbol:
            kind, options, layout = _symbol_binding(node, name, symbol)
        else:
            kind, options, layout = _text_binding(node, name, self.root)
        self.dynamic_owners.add(node)
        self.bindings.append(BindingSpec(index, kind, field, template, keys, options, layout))
        for required_key in keys:
            if required_key not in self.required:
                self.required.append(required_key)

    def _node(self, index, node):
        name = node.tag.removeprefix(f'{{{SVG_NS}}}')
        if name not in ALLOWED or node.tag != f'{{{SVG_NS}}}{name}' or name == 'svg' and node is not self.root:
            reject('unsupported_feature')
        self._ancestors(node)
        self._identity(node)
        refs = []
        for attribute, value in node.attrib.items():
            refs.extend(self._attribute(node, name, attribute, value))
        self.references[node] = refs
        self._world_matrix(node)
        if name == 'image':
            self._image(node)
        self._binding(index, node, name)

    def _references(self):
        expected_tags = {'clip-path': {'clipPath'}, 'fill': {'linearGradient', 'radialGradient'}, 'stroke': {'linearGradient', 'radialGradient'}}
        for refs in self.references.values():
            for property_name, identity in refs:
                if identity not in self.ids:
                    reject('invalid_reference')
                expected = expected_tags.get(property_name)
                if expected is None or self.ids[identity].tag.removeprefix(f'{{{SVG_NS}}}') not in expected:
                    reject('invalid_reference')

    def _visit(self, node, active):
        if node in active:
            reject('invalid_reference')
        if len(active) > 32:
            reject('resource_limit')
        if node in self.complete:
            return
        for child in node:
            self._visit(child, active | {node})
        for _, identity in self.references[node]:
            self._visit(self.ids[identity], active | {node})
        self.complete.add(node)

    def _media(self):
        try:
            media = []
            for name in ('width', 'height'):
                value = self.root.get(name, '')
                if not value.endswith('mm'):
                    reject('invalid_media')
                parsed = numbers(value[:-2])
                if len(parsed) != 1 or not 10 <= parsed[0] <= 500:
                    reject('invalid_media')
                media.append(parsed[0])
            view = numbers(self.root.get('viewBox', ''))
            if view != (0, 0, media[0] * 4, media[1] * 4):
                reject('invalid_media')
        except ValueError:
            reject('invalid_media')
        return media, view

    def validate(self):
        for index, node in enumerate(self.nodes):
            self._node(index, node)
        if len(self.bindings) > 200 or self.path_commands > 100000:
            reject('resource_limit')
        self._references()
        for node in self.nodes:
            self._visit(node, set())
        media, view = self._media()
        return TemplateManifest(1, hashlib.sha256(self.source.encode()).hexdigest(), *media, view,
                                tuple(self.required), tuple(self.bindings), len(self.nodes))


def admit_template(svg: str) -> TemplateManifest:
    try:
        normalized = validate_safe_svg(svg)
    except ValueError:
        raise TemplateAdmissionError('unsafe_svg') from None
    return _TemplateAdmission(svg, ET.fromstring(normalized)).validate()
