"""Shared validation for server-rendered Studio SVG documents."""

import re
from xml.etree import ElementTree as ET


SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("xlink", XLINK_NS)
MAX_SVG_BYTES = 512 * 1024
DATA_IMAGE = re.compile(r"^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
FORBIDDEN_ELEMENTS = {"script", "foreignObject", "animate", "animateMotion", "animateTransform", "set"}


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
    for element in root.iter():
        name = element.tag.rsplit("}", 1)[-1]
        if name in FORBIDDEN_ELEMENTS or name == "use":
            raise ValueError("unsafe_svg")
        for attribute, value in element.attrib.items():
            attribute_name = attribute.rsplit("}", 1)[-1].lower()
            normalized = value.strip()
            if attribute_name.startswith("on") or "javascript:" in normalized.lower():
                raise ValueError("unsafe_svg")
            if attribute_name in {"href", "src"}:
                if normalized.startswith("#"):
                    continue
                if not DATA_IMAGE.fullmatch(normalized):
                    raise ValueError("unsafe_svg")
            if attribute_name == "style" and ("url(" in normalized.lower() or "@import" in normalized.lower()):
                raise ValueError("unsafe_svg")
            if "url(" in normalized.lower() and not re.fullmatch(r"url\(#[A-Za-z][A-Za-z0-9_.:-]*\)", normalized):
                raise ValueError("unsafe_svg")
    return ET.tostring(root, encoding="unicode")
