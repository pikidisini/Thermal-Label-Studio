"""Shared validation for server-rendered Studio SVG documents."""

import re
from xml.etree import ElementTree as ET


SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("xlink", XLINK_NS)
MAX_SVG_BYTES = 512 * 1024
DATA_IMAGE = re.compile(r"^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
FORBIDDEN_ELEMENTS = {"script", "foreignObject", "animate", "animateMotion", "animateTransform", "set"}
CSS_RESOURCE_ATTRIBUTES = {
    "style", "fill", "stroke", "clip-path", "filter", "mask", "cursor",
    "marker", "marker-start", "marker-mid", "marker-end", "color",
    "stop-color", "flood-color", "lighting-color",
}


def validate_safe_svg(svg: str) -> str:
    """Return canonical XML or reject executable and external SVG features."""
    if not isinstance(svg, str) or len(svg.encode("utf-8")) > MAX_SVG_BYTES or "<!" in svg:
        raise ValueError("invalid_svg")
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise ValueError("invalid_svg") from exc
    if root.tag != f"{{{SVG_NS}}}svg":
        raise ValueError("invalid_svg")
    stack = [(root, 1)]
    node_count = 0
    while stack:
        element, depth = stack.pop()
        node_count += 1
        if depth > 32 or node_count > 10000:
            raise ValueError("invalid_svg")
        stack.extend((child, depth + 1) for child in element)
    for element in root.iter():
        name = element.tag.rsplit("}", 1)[-1]
        if name in FORBIDDEN_ELEMENTS or name == "use":
            raise ValueError("unsafe_svg")
        for attribute, value in element.attrib.items():
            attribute_name = attribute.rsplit("}", 1)[-1].lower()
            normalized = value.strip()
            # This bounded CSS subset has no escape/comment syntax. Reject it
            # before looking for URL tokens, which CSS escapes could conceal.
            # Apply only to CSS-bearing attributes, never authored text/specs.
            if attribute_name in CSS_RESOURCE_ATTRIBUTES and (
                "\\" in value or "/*" in value or "*/" in value
                or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value)
            ):
                raise ValueError("unsafe_svg")
            if attribute_name.startswith("on") or "javascript:" in normalized.lower():
                raise ValueError("unsafe_svg")
            if attribute_name in {"href", "src"}:
                if normalized.startswith("#"):
                    continue
                if not DATA_IMAGE.fullmatch(normalized):
                    raise ValueError("unsafe_svg")
            if attribute_name == "style" and "@import" in normalized.lower():
                raise ValueError("unsafe_svg")
            if "url(" in normalized.lower():
                local_reference = r"url\(#[A-Za-z][A-Za-z0-9_.:-]*\)"
                if attribute_name == "style":
                    remainder = re.sub(local_reference, "", normalized)
                    if "url(" in remainder.lower():
                        raise ValueError("unsafe_svg")
                elif not re.fullmatch(local_reference, normalized):
                    raise ValueError("unsafe_svg")
    return ET.tostring(root, encoding="unicode")
