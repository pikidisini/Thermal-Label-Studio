"""Shared SVG binding preparation. No label raster, codec, storage or transport."""
from dataclasses import dataclass
import hashlib
import math
import re
import base64
import io
from xml.etree import ElementTree as ET
from PIL import Image

from app.config import get_settings
from app.svg_safety import validate_safe_svg
from .composition import BindingError, scalar, unavailable, validate_data, validate_resolved_text, resolve_composition
from .placeholder import replace_symbol_image
from .models import TemplateManifest
from .text import FontProfile, TextMetrics, bind_text
from .validation import admit_template, META
from .symbols import SymbolEvidence, plan as symbol_plan, data_url
from . import barcode, qr


@dataclass(frozen=True)
class BoundMedia:
    width_mm: float
    height_mm: float
    width_px: int
    height_px: int
    dpi: float


@dataclass(frozen=True)
class BoundTemplate:
    svg: str
    manifest: TemplateManifest
    media: BoundMedia
    svg_sha256: str
    symbols: tuple[SymbolEvidence, ...] = ()


def bind_text_template(svg: str, data: dict, *, dpi: float = 203, font_profile: FontProfile | None = None) -> BoundTemplate:
    """T04 text-only entry point; shares the complete binder implementation."""
    return bind_template(svg,data,dpi=dpi,font_profile=font_profile,text_only=True)


@dataclass(frozen=True)
class _BindingDocument:
    root: ET.Element
    nodes: list[ET.Element]
    parents: dict[ET.Element, ET.Element]


def resolve_value(spec, data):
    value = resolve_composition(spec.template, data, text_output=spec.kind=='text') if spec.template is not None else scalar(data, spec.field)
    if spec.kind=='text':validate_resolved_text(value)
    elif spec.kind=='qrcode':qr.validate_payload(value)
    else:barcode.validate_payload(spec.kind,value)
    return value


def resolved_values(manifest, data, text_only):
    values = []
    placeholders = set()
    for spec in manifest.objects:
        if text_only and spec.kind != 'text':
            raise BindingError('unsupported_feature')
        if spec.kind != 'text' and (any(unavailable(data, key) for key in spec.required_keys)
                                    or spec.template == ''):
            placeholders.add(spec.element_index)
            values.append(None)
            continue
        value = resolve_value(spec, data)
        values.append(value)
    return values, placeholders


def symbol_plans(manifest, values, nodes, placeholders):
    plans={}
    dynamic_images=set()
    for spec,value in zip(manifest.objects,values):
        if spec.kind=='text':continue
        child=nodes[spec.element_index][0]
        # Old omitted/default meet behavior cannot be silently reinterpreted
        # as the new explicit full-image stretching contract.
        if child.get('preserveAspectRatio')!='none' or child.get('clip-path') or 'clip-path' in child.get('style','') or float(child.get('width','0'))<=0 or float(child.get('height','0'))<=0:
            raise BindingError('unsupported_feature')
        dynamic_images.add(child)
        if spec.element_index in placeholders:continue
        plans[spec.element_index]=symbol_plan(spec,value)
    return plans, dynamic_images


def check_image_budget(nodes, plans, dynamic_images):
    pixels=sum(p.evidence.width_px*p.evidence.height_px for p in plans.values())
    for node in nodes:
        if node.tag.endswith('}image') and node not in dynamic_images:
            href=node.get('href') or node.get('{http://www.w3.org/1999/xlink}href')
            with Image.open(io.BytesIO(base64.b64decode(href.split(',',1)[1]))) as image:
                pixels+=image.width*image.height
    if pixels>4_000_000:
        raise BindingError('resource_limit')


def bind_object(document, spec, value, placeholders, plans, metrics):
    root, nodes, parents = document.root, document.nodes, document.parents
    node = nodes[spec.element_index]
    if spec.kind=='text':
        bind_text(node, spec, value, fabric=root.get('data-editor-coordinate-profile') == 'fabric7', parents=parents, metrics=metrics)
    elif spec.element_index in placeholders:
        replace_symbol_image(node, node[0], metrics)
    else:
        url=data_url(plans[spec.element_index])
        child=node[0]
        for attr in ('href','{http://www.w3.org/1999/xlink}href'):
            if attr in child.attrib:child.set(attr,url)
    for name in META - {'data-editor-group', 'data-editor-coordinate-profile', 'data-binding-version'}:
        node.attrib.pop(name, None)


def apply_bindings(document, manifest, values, placeholders, plans, font_profile):
    if not manifest.objects:
        return
    if font_profile is None:
        settings = get_settings()
        font_profile = FontProfile(settings.fixture_font_path, settings.fixture_font_family)
    metrics = TextMetrics(font_profile)
    for spec, value in zip(manifest.objects, values):
        bind_object(document, spec, value, placeholders, plans, metrics)


def check_node_budget(nodes, manifest, values, placeholders):
    # Reserve a conservative node budget before font work or tspan creation.
    spans = sum(len(value) if spec.layout and spec.layout.char_spacing else len(re.split(r'\r?\n', value)) for spec, value in zip(manifest.objects, values) if spec.kind=='text')
    if len(nodes) + spans + 2 * len(placeholders) > 10000:
        raise BindingError('resource_limit')


def bind_template(svg: str, data: dict, *, dpi: float = 203, font_profile: FontProfile | None = None, text_only: bool = False) -> BoundTemplate:
    manifest = admit_template(svg)
    validate_data(data)
    if type(dpi) not in (int, float) or not math.isfinite(dpi) or not 72 <= dpi <= 600:
        raise BindingError('invalid_media')
    width, height = round(manifest.width_mm*dpi/25.4), round(manifest.height_mm*dpi/25.4)
    if max(width, height) > 4096 or width*height > 4_000_000:
        raise BindingError('resource_limit')
    values, placeholders = resolved_values(manifest, data, text_only)
    root = ET.fromstring(validate_safe_svg(svg))
    nodes = list(root.iter())
    check_node_budget(nodes, manifest, values, placeholders)
    parents = {child: parent for parent in nodes for child in parent}
    plans, dynamic_images = symbol_plans(manifest, values, nodes, placeholders)
    check_image_budget(nodes, plans, dynamic_images)
    apply_bindings(_BindingDocument(root, nodes, parents), manifest, values, placeholders, plans, font_profile)
    output = ET.tostring(root, encoding='unicode')
    if len(output.encode('utf-8')) > 512 * 1024:
        raise BindingError('resource_limit')
    output = validate_safe_svg(output)
    # The final semantic check is static admission: generated output has no
    # unresolved binding metadata and cannot silently retain required samples.
    final = admit_template(output)
    if final.objects:
        raise BindingError('invalid_binding')
    return BoundTemplate(output, manifest, BoundMedia(manifest.width_mm, manifest.height_mm, width, height, dpi), hashlib.sha256(output.encode()).hexdigest(),tuple(p.evidence for p in plans.values()))
