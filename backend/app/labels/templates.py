"""Controlled, text-only fixture binding with no storage or output effects."""

import math
import re
from typing import Any, Mapping
from xml.etree import ElementTree as ET

from .resolver import LayoutDefinition

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


class TemplateError(ValueError):
    """A layout, template, or required fact cannot be processed safely."""


def validate_layout(layout: LayoutDefinition) -> tuple[int, int]:
    """Bound fixture media to a small bitmap before starting a renderer."""
    values = (layout.width_mm, layout.height_mm, layout.dpi)
    if not layout.svg or any(
        type(value) not in (int, float) or not math.isfinite(value) or value <= 0
        for value in values
    ):
        raise TemplateError("Layout template and positive media settings are required.")
    if not 10 <= layout.dpi <= 4000:
        raise TemplateError("Layout DPI is unsupported.")
    size = tuple(round(value * layout.dpi / 25.4) for value in values[:2])
    if min(size) < 1 or max(size) > 4096 or size[0] * size[1] > 4_000_000:
        raise TemplateError("Layout bitmap dimensions are unsupported.")
    if not layout.required_facts or len(set(layout.required_facts)) != len(layout.required_facts):
        raise TemplateError("Layout required facts must be unique and nonempty.")
    return size


def parse_template(svg: str) -> ET.Element:
    """Accept the small SVG subset needed by this fixture; reject resource links.

    No images, CSS, scripts, external resources, transformations, or arbitrary
    SVG extensions are accepted. This is deliberately not a general SVG policy.
    """
    if len(svg) > 16_384 or "<!" in svg:
        raise TemplateError("Unsupported template declaration or size.")
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise TemplateError("Template XML is invalid.") from exc
    if root.tag != f"{{{SVG_NS}}}svg":
        raise TemplateError("Template root must be SVG.")
    allowed = {
        "svg": {"width", "height", "viewBox"},
        "rect": {"x", "y", "width", "height", "fill"},
        "text": {"x", "y", "font-size", "font-family", "fill", "data-fact"},
    }
    for element in root.iter():
        name = element.tag.removeprefix(f"{{{SVG_NS}}}")
        if name not in allowed or element.tag != f"{{{SVG_NS}}}{name}":
            raise TemplateError("Unsupported template element.")
        if set(element.attrib) - allowed[name]:
            raise TemplateError("Unsupported template attribute.")
        if element is not root and (name == "svg" or len(element)):
            raise TemplateError("Unsupported template nesting.")
        for key, value in element.attrib.items():
            if key in {"x", "y", "width", "height", "font-size"}:
                if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
                    raise TemplateError("Template geometry must be numeric.")
            elif key == "fill" and value not in {"black", "white"}:
                raise TemplateError("Template fill is unsupported.")
            elif key == "font-family" and value != "Arial":
                raise TemplateError("Template font is unsupported.")
            elif key == "data-fact" and not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", value):
                raise TemplateError("Template binding is invalid.")
    return root


def validate_template(layout: LayoutDefinition) -> ET.Element:
    """Validate media and declared bindings without needing business facts."""
    width, height = validate_layout(layout)
    root = parse_template(layout.svg)
    if root.attrib != {"width": str(width), "height": str(height), "viewBox": f"0 0 {width} {height}"}:
        raise TemplateError("Template geometry does not match layout media.")
    bindings = [element for element in root.iter() if "data-fact" in element.attrib]
    if set(element.attrib["data-fact"] for element in bindings) != set(layout.required_facts):
        raise TemplateError("Template bindings do not match required facts.")
    return root


def bind_template(layout: LayoutDefinition, facts: Mapping[str, Any]) -> str:
    """Bind only declared required strings into direct SVG text nodes."""
    root = validate_template(layout)
    bindings = [element for element in root.iter() if "data-fact" in element.attrib]
    for key in layout.required_facts:
        value = facts.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 64:
            raise TemplateError("Required facts must be nonblank strings of at most 64 characters.")
        if any(ord(char) < 32 or ord(char) > 126 for char in value):
            raise TemplateError("Fixture facts must contain printable ASCII text.")
    for element in bindings:
        element.text = facts[element.attrib.pop("data-fact")]
    return ET.tostring(root, encoding="unicode")
