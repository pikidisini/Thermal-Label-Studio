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

def transform(value):
    position = 0
    result = (1, 0, 0, 1, 0, 0)
    for match in re.finditer(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)', value):
        if value[position:match.start()].strip(' ,\t\r\n'):
            reject('invalid_geometry')
        values = numbers(match[2])
        count = len(values)
        if count not in {'matrix': {6}, 'translate': {1, 2}, 'scale': {1, 2}, 'rotate': {1, 3}, 'skewX': {1}, 'skewY': {1}}[match[1]]:
            reject('invalid_geometry')
        position = match.end()
        name = match[1]
        if name == 'matrix':
            matrix = values
        elif name == 'translate':
            matrix = (1, 0, 0, 1, values[0], values[1] if count == 2 else 0)
        elif name == 'scale':
            matrix = (values[0], 0, 0, values[-1], 0, 0)
        elif name == 'rotate':
            angle = math.radians(values[0])
            matrix = (math.cos(angle), math.sin(angle), -math.sin(angle), math.cos(angle), 0, 0)
            if count == 3:
                matrix = multiply(multiply((1,0,0,1,values[1],values[2]), matrix), (1,0,0,1,-values[1],-values[2]))
        else:
            tangent = math.tan(math.radians(values[0]))
            matrix = (1, tangent if name == 'skewY' else 0, tangent if name == 'skewX' else 0, 1, 0, 0)
        result = multiply(result, matrix)
    if not position or value[position:].strip(' ,\t\r\n'):
        reject('invalid_geometry')
    return result

def path_count(value):
    tokens = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|' + NUMBER, value)
    remainder = re.sub(r'[MmLlHhVvCcSsQqTtAaZz]|' + NUMBER, '', value)
    if remainder.strip(' ,\t\r\n') or not tokens or tokens[0] not in ('M', 'm'):
        reject('invalid_geometry')
    index = count = 0
    arity = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}
    while index < len(tokens):
        command = tokens[index]
        if command.upper() not in arity:
            reject('invalid_geometry')
        index += 1
        start = index
        while index < len(tokens) and re.fullmatch(NUMBER, tokens[index]):
            numbers(tokens[index])
            index += 1
        length = index - start
        size = arity[command.upper()]
        if size == 0:
            if length:
                reject('invalid_geometry')
            count += 1
        else:
            if not length or length % size:
                reject('invalid_geometry')
            count += length // size
            if command.upper() == 'A':
                for offset in range(start, index, 7):
                    if float(tokens[offset]) < 0 or float(tokens[offset + 1]) < 0 or tokens[offset + 3] not in ('0', '1') or tokens[offset + 4] not in ('0', '1'):
                        reject('invalid_geometry')
    return count

def admit_template(svg: str) -> TemplateManifest:
    try:
        normalized = validate_safe_svg(svg)
    except (ValueError, UnicodeError):
        raise TemplateAdmissionError('unsafe_svg') from None
    root = ET.fromstring(normalized)
    nodes = list(root.iter())
    if len(nodes) > 10000:
        reject('resource_limit')
    parents = {child: node for node in nodes for child in node}
    ids = {}
    references = {}
    bindings = []
    required = []
    path_commands = image_bytes = image_pixels = 0
    dynamic_owners = set()
    version = root.get('data-binding-version')
    if root.get('data-editor-coordinate-profile') not in (None, 'fabric7'):
        reject('unsupported_metadata')
    world_matrices = {}
    if version is not None and version != '1':
        reject('unsupported_metadata_version')
    for index, node in enumerate(nodes):
        name = node.tag.removeprefix(f'{{{SVG_NS}}}')
        if name not in ALLOWED or node.tag != f'{{{SVG_NS}}}{name}' or name == 'svg' and node is not root:
            reject('unsupported_feature')
        depth = 1
        ancestor = parents.get(node)
        while ancestor is not None:
            depth += 1
            if ancestor in dynamic_owners:
                if any(k in node.attrib for k in ('data-field', 'data-placeholder', 'data-barcode', 'data-qr', 'data-payload-spec', 'data-symbol-spec')):
                    reject('conflicting_metadata')
            ancestor = parents.get(ancestor)
        if depth > 32:
            reject('resource_limit')
        if node.get('id'):
            identity = node.get('id')
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.:-]{0,127}', identity) or identity in ids:
                reject('invalid_reference')
            ids[identity] = node
        refs = []
        for attribute, value in node.attrib.items():
            local = attribute.removeprefix(f'{{{XLINK_NS}}}') if attribute == f'{{{XLINK_NS}}}href' else attribute
            if attribute == '{http://www.w3.org/XML/1998/namespace}space' and value == 'preserve':
                continue
            if local.startswith('data-'):
                if local == 'data-editor-coordinate-profile' and node is not root:
                    reject('unsupported_metadata')
                if local not in META or local == 'data-binding-version' and node is not root:
                    reject('unsupported_metadata')
                continue
            if local not in COMMON | ALLOWED[name]:
                reject('unsupported_feature')
            if local in NUMERIC:
                if node is root and local in ('width', 'height'):
                    continue
                parsed = numbers(value, name in ('stop', 'linearGradient', 'radialGradient'))
                if len(parsed) != 1 or local in ('width', 'height', 'rx', 'ry', 'r', 'fr', 'stroke-width', 'font-size') and parsed[0] < 0:
                    reject('invalid_geometry')
            if local in ('transform', 'gradientTransform'):
                transform(value)
            if local == 'points':
                if len(numbers(value)) % 2 or len(numbers(value)) < 4:
                    reject('invalid_geometry')
            if local == 'd':
                path_commands += path_count(value)
            if local == 'style':
                for declaration in value.split(';'):
                    if not declaration.strip():
                        continue
                    parts = declaration.split(':', 1)
                    if len(parts) != 2 or parts[0].strip() not in COMMON | TEXT | {'stop-color', 'stop-opacity'}:
                        reject('unsupported_feature')
                    prop, entry = map(str.strip, parts)
                    if prop in NUMERIC:
                        parsed = numbers(entry)
                        if len(parsed) != 1 or prop in ('stroke-width', 'font-size') and parsed[0] < 0:
                            reject('invalid_geometry')
                    if prop == 'transform':
                        transform(entry)
                    if prop == 'white-space' and entry != 'pre':
                        reject('unsupported_feature')
                    refs.extend((prop, reference) for reference in re.findall(r'url\(#([A-Za-z][A-Za-z0-9_.:-]*)\)', entry))
            else:
                refs.extend((local, reference) for reference in re.findall(r'url\(#([A-Za-z][A-Za-z0-9_.:-]*)\)', value))
        references[node] = refs
        style_transform = None
        for declaration in node.get('style', '').split(';'):
            if declaration.strip() and declaration.split(':', 1)[0].strip() == 'transform':
                style_transform = declaration.split(':', 1)[1].strip()
        if style_transform and node.get('transform'):
            reject('invalid_geometry')
        local_matrix = transform(style_transform or node.get('transform')) if style_transform or node.get('transform') else (1,0,0,1,0,0)
        world_matrices[node] = multiply(world_matrices.get(parents.get(node), (1,0,0,1,0,0)), local_matrix)
        if name == 'image':
            if node.get('href') is not None and node.get(f'{{{XLINK_NS}}}href') is not None and node.get('href') != node.get(f'{{{XLINK_NS}}}href'):
                reject('conflicting_metadata')
            href = node.get('href') or node.get(f'{{{XLINK_NS}}}href')
            if not href or not href.startswith('data:image/'):
                reject('unsupported_feature')
            try:
                data = base64.b64decode(href.split(',', 1)[1], validate=True)
                image_bytes += len(data)
                if image_bytes > 1024 * 1024:
                    reject('resource_limit')
                with warnings.catch_warnings():
                    warnings.simplefilter('error', Image.DecompressionBombWarning)
                    with Image.open(io.BytesIO(data)) as image:
                        w, h = image.size
                        image_pixels += w * h
                        if image.format not in ('PNG', 'JPEG', 'WEBP') or max(w, h) > 4096 or image_pixels > 4_000_000:
                            reject('resource_limit')
                        image.load()
            except TemplateAdmissionError:
                raise
            except Exception:
                reject('invalid_image')
        field_values = [node.get(k) for k in ('data-field', 'data-placeholder', 'data-barcode', 'data-qr') if node.get(k) is not None]
        if len(set(field_values)) > 1:
            reject('conflicting_metadata')
        field = key(field_values[0]) if field_values else None
        template = None
        keys = (field,) if field else ()
        if node.get('data-payload-spec') is not None:
            template, keys = payload_spec(node.get('data-payload-spec'))
            if field and (keys != (field,) or not re.fullmatch(r'\{\{\s*' + re.escape(field) + r'\s*\}\}', template)):
                reject('conflicting_metadata')
        symbol = node.get('data-symbol-spec')
        dynamic = field is not None or template is not None or symbol is not None
        if node.get('data-is-dynamic') not in (None, 'true') or node.get('data-editor-group') not in (None, 'true') or node.get('data-is-barcode') not in (None, 'true'):
            reject('invalid_metadata')
        if not dynamic and any(node.get(k) is not None for k in ('data-is-dynamic', 'data-is-barcode', 'data-barcode-type', 'data-barcode-value', 'data-text-spec', 'data-text-layout')):
            reject('incomplete_metadata')
        if dynamic:
            layout = None
            if version != '1':
                reject('unsupported_metadata_version')
            if field is None and template is None:
                reject('incomplete_metadata')
            if symbol:
                if name != 'g' or node.get('data-text-spec') or node.get('data-text-layout') is not None:
                    reject('conflicting_metadata')
                if len(node) != 1 or node[0].tag != f'{{{SVG_NS}}}image' or len(node[0]):
                    reject('unsupported_feature')
                kind, options = symbol_spec(symbol)
                if node.get('data-barcode-type') != kind or node.get('data-qr') and kind != 'qrcode' or node.get('data-barcode') and kind == 'qrcode':
                    reject('conflicting_metadata')
            else:
                if name != 'text' or node.get('data-is-barcode') or node.get('data-barcode-type') or node.get('data-barcode-value'):
                    reject('incomplete_metadata')
                kind = 'text'
                options = text_spec(node.get('data-text-spec'))
                if node.get('data-text-layout') is not None:
                    if root.get('data-editor-coordinate-profile') != 'fabric7':
                        reject('conflicting_metadata')
                    layout = layout_spec(node.get('data-text-layout'))
                declarations = [tuple(map(str.strip, part.split(':', 1))) for part in node.get('style', '').split(';') if part.strip()]
                metrics = [value for prop, value in declarations if prop == 'font-size']
                if node.get('font-size') is not None:
                    metrics.append(node.get('font-size'))
                if not metrics or any(numbers(metric) != (dict(options)['font_size'],) for metric in metrics):
                    reject('conflicting_metadata')
                if len(list(node)) > 100 or any(child.tag != f'{{{SVG_NS}}}tspan' for child in node):
                    reject('unsupported_feature')
                for span in node:
                    if any(span.get(prop) is not None for prop in ('font-size', 'font-family', 'font-weight', 'font-style')) or re.search(r'(?:^|;)\s*font-(?:size|family|weight|style)\s*:', span.get('style', '')):
                        reject('unsupported_feature')
            dynamic_owners.add(node)
            bindings.append(BindingSpec(index, kind, field, template, keys, options, layout))
            for required_key in keys:
                if required_key not in required:
                    required.append(required_key)
    if len(bindings) > 200 or path_commands > 100000:
        reject('resource_limit')
    for node, refs in references.items():
        for property_name, ref in refs:
            if ref not in ids:
                reject('invalid_reference')
            expected = {'clip-path': {'clipPath'}, 'fill': {'linearGradient', 'radialGradient'}, 'stroke': {'linearGradient', 'radialGradient'}}.get(property_name)
            if expected is None or ids[ref].tag.removeprefix(f'{{{SVG_NS}}}') not in expected:
                reject('invalid_reference')
    complete = set()
    def visit(node, active):
        if node in active:
            reject('invalid_reference')
        if len(active) > 32:
            reject('resource_limit')
        if node in complete:
            return
        for child in node:
            visit(child, active | {node})
        for _, ref in references[node]:
            visit(ids[ref], active | {node})
        complete.add(node)
    for node in nodes:
        visit(node, set())
    try:
        media = []
        for name in ('width', 'height'):
            value = root.get(name, '')
            if not value.endswith('mm'):
                reject('invalid_media')
            parsed = numbers(value[:-2])
            if len(parsed) != 1 or not 10 <= parsed[0] <= 500:
                reject('invalid_media')
            media.append(parsed[0])
        view = numbers(root.get('viewBox', ''))
        if view != (0, 0, media[0] * 4, media[1] * 4):
            reject('invalid_media')
    except ValueError:
        reject('invalid_media')
    return TemplateManifest(1, hashlib.sha256(svg.encode()).hexdigest(), *media, view, tuple(required), tuple(bindings), len(nodes))
