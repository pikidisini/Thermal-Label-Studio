"""Resolve/bind or admit composed SVG, raster once, and encode once."""
import math
from app.config import get_settings
from app.engine.bitmap import RenderedLabel
from app.engine.output import PreparedOutput
from app.engine.raster import render_label_item, render_svg_bitmap, normalize_editor_fonts
from app.protocols.registry import codec_for
from app.protocols.ipl.errors import validate_copies
from app.svg_safety import validate_safe_svg

def prepare_bitmap(bitmap: RenderedLabel, language: str = "IPL", *, copies: int = 1) -> PreparedOutput:
    encoder, _ = codec_for(language)
    validate_copies(copies)
    if type(bitmap) is not RenderedLabel:
        raise ValueError("Invalid processed bitmap.")
    payload = encoder(bitmap.bitmap_png, bitmap.width_px, bitmap.height_px, bitmap.dpi, copies=copies)
    return PreparedOutput(bitmap, payload, language, copies)

def prepare_label_item(label_code, facts, registry, *, language="IPL", on_stage=None, copies=1):
    codec_for(language)
    validate_copies(copies)
    bitmap = render_label_item(label_code, facts, registry, on_stage=on_stage)
    return prepare_bitmap(bitmap, language, copies=copies)

def prepare_editor_output(svg: str, width_mm: float, height_mm: float, dpi: float, *, language="IPL", copies=1):
    codec_for(language)
    validate_copies(copies)
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in (width_mm, height_mm, dpi)):
        raise ValueError("Invalid layout media.")
    if not (10 <= width_mm <= 500 and 10 <= height_mm <= 500 and 72 <= dpi <= 600):
        raise ValueError("Invalid layout media.")
    width, height = round(width_mm * dpi / 25.4), round(height_mm * dpi / 25.4)
    if min(width, height) < 1 or max(width, height) > 4096 or width * height > 4_000_000:
        raise ValueError("Unsupported layout media.")
    svg = validate_safe_svg(svg)
    svg = normalize_editor_fonts(svg, get_settings().fixture_font_family)
    png = render_svg_bitmap(svg, width, height, dpi)
    return prepare_bitmap(RenderedLabel("editor", "current", width, height, dpi, png), language, copies=copies)
