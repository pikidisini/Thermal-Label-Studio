"""Canonical IPL raster pipeline shared by generated print and simulation paths.

This module intentionally models only the Direct Graphics subset emitted by
``encode_ipl``.  Decoding is an in-process simulation check, not a claim about
any printer firmware.
"""
from __future__ import annotations

import io
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

from PIL import Image

from .bit_packer import get_raw_bitmap_data
from .rasterizer import calculate_otsu_threshold, png_to_1bit_monochrome, svg_to_png
from .printer_encoders.ipl_encoder import (
    DIRECT_GRAPHICS_END_BITMAP, DIRECT_GRAPHICS_END_LINE, DIRECT_GRAPHICS_ENTER,
    DIRECT_GRAPHICS_RAW_BITMAP, ETB, ETX, RS, STX, encode_ipl,
)


@dataclass(frozen=True)
class IplRasterArtifact:
    payload: bytes
    raw_bitmap: bytes
    width_dots: int
    height_dots: int
    bytes_per_row: int


@dataclass(frozen=True)
class SimulationCapture:
    """A transport-shaped in-memory capture that cannot contact a device."""
    payload: bytes
    bytes_captured: int
    outcome: str = "captured"


def capture_simulation_payload(payload: bytes) -> SimulationCapture:
    if not payload:
        raise ValueError("Simulation transport refused an empty IPL payload.")
    return SimulationCapture(payload=bytes(payload), bytes_captured=len(payload))


def template_media_mm(svg: str, *, fallback_width_mm: float, fallback_height_mm: float) -> tuple[float, float]:
    """Read explicit SVG mm/in dimensions; fall back only when the template has none."""
    values: dict[str, float] = {}
    try:
        root = ET.fromstring(svg)
        for name in ("width", "height"):
            raw = root.attrib.get(name, "").strip().lower()
            if raw.endswith("mm") or raw.endswith("in"):
                number = float(raw[:-2].strip())
                values[name] = number * (25.4 if raw.endswith("in") else 1.0)
    except (ET.ParseError, ValueError):
        pass
    return values.get("width", fallback_width_mm), values.get("height", fallback_height_mm)


def rasterize_svg_to_final_mono(svg: str, *, output_png_path: str, dpi: float,
                                 width_mm: float, height_mm: float, super_sample_factor: int = 2,
                                 downsampling_filter: str = "NEAREST", width_px: int | None = None,
                                 height_px: int | None = None, threshold: int | None = None) -> tuple[Image.Image, int, int]:
    """Shared SVG → DPI-derived raster → Otsu 1-bit policy. No post-render scale."""
    width = width_px if width_px is not None else int(round((width_mm / 25.4) * dpi))
    height = height_px if height_px is not None else int(round((height_mm / 25.4) * dpi))
    if width <= 0 or height <= 0:
        raise ValueError("Template media dimensions must produce positive DPI raster dimensions.")
    if width > 8192 or height > 8192 or width * height > 16_000_000:
        raise ValueError("Final bitmap exceeds the software dot limit; scaling is disabled.")
    # IPL is byte packed. Padding expands only the white raster canvas, never
    # rescales the SVG design.
    aligned_width = (width + 7) // 8 * 8
    svg_to_png(svg_source=svg, output_png_path=output_png_path, width_px=width, height_px=height, dpi=dpi, super_sample_factor=super_sample_factor, downsampling_filter=downsampling_filter)
    if aligned_width != width:
        with Image.open(output_png_path) as original:
            canvas = Image.new("RGBA", (aligned_width, height), (255, 255, 255, 255))
            canvas.paste(original.convert("RGBA"), (0, 0))
            canvas.save(output_png_path, format="PNG")
    return png_to_1bit_monochrome(output_png_path, threshold=calculate_otsu_threshold(output_png_path) if threshold is None else threshold), aligned_width, height


def encode_ipl_raster(image: Image.Image, *, max_width_dots: int | None = None,
                      max_height_dots: int | None = None) -> IplRasterArtifact:
    """Encode a final 1-bit bitmap with explicit bounds and no rescaling."""
    width, height = image.size
    if width > 8192 or height > 8192 or width * height > 16_000_000:
        raise ValueError("Final bitmap exceeds the software dot limit; scaling is disabled.")
    if max_width_dots is not None and width > max_width_dots:
        raise ValueError(f"Final bitmap width {width} dots exceeds target limit {max_width_dots} dots; scaling is disabled.")
    if max_height_dots is not None and height > max_height_dots:
        raise ValueError(f"Final bitmap height {height} dots exceeds target limit {max_height_dots} dots; scaling is disabled.")
    raw, width, height, bytes_per_row = get_raw_bitmap_data(image)
    if width % 8:
        raise ValueError("Final IPL bitmap width must be byte-aligned; scaling is disabled.")
    return IplRasterArtifact(encode_ipl(raw, width_px=width, height_px=height), raw, width, height, bytes_per_row)


def decode_ipl_direct_graphics(payload: bytes, *, width_dots: int, height_dots: int) -> Image.Image:
    """Decode the exact stateless IPL subset emitted by this application's encoder.

    Exact height is supplied by trusted artifact metadata because seven-dot IPL
    column groups contain padding bits and do not encode the original height.
    """
    if width_dots <= 0 or height_dots <= 0 or width_dots % 8 or width_dots > 8192 or height_dots > 8192 or width_dots * height_dots > 16_000_000:
        raise ValueError("Trusted IPL dimensions must be positive and byte-aligned.")
    if len(payload) > 32 * 1024 * 1024:
        raise ValueError("Malformed IPL payload: payload exceeds simulation limit.")
    prefix = DIRECT_GRAPHICS_ENTER
    if not payload.startswith(prefix) or len(payload) < len(prefix) + 4:
        raise ValueError("Malformed IPL payload: missing Direct Graphics header.")
    index = len(prefix)
    if payload[index] != 0x21 or payload[index + 1] & 0x80 == 0 or payload[index + 2] & 0x40 == 0 or payload[index + 3] & 0x80 == 0:
        raise ValueError("Malformed IPL payload: invalid Direct Graphics origin.")
    if payload[index + 1] != 0x80 or payload[index + 2] != 0x40 or payload[index + 3] != 0x80:
        raise ValueError("Unsupported IPL payload: only zero-origin Direct Graphics is simulated.")
    index += 4
    groups = (height_dots + 6) // 7
    raw = bytearray((width_dots // 8) * height_dots)
    for column in range(width_dots):
        if index >= len(payload) or payload[index:index + 1] != DIRECT_GRAPHICS_RAW_BITMAP:
            raise ValueError("Malformed IPL payload: missing bitmap column marker.")
        index += 1
        if index + groups >= len(payload):
            raise ValueError("Malformed IPL payload: truncated bitmap column.")
        column_bytes = payload[index:index + groups]
        index += groups
        if payload[index:index + 1] != DIRECT_GRAPHICS_END_LINE:
            raise ValueError("Malformed IPL payload: missing bitmap column terminator.")
        index += 1
        for group, marked in enumerate(column_bytes):
            if marked & 0x80 == 0:
                raise ValueError("Malformed IPL payload: bitmap data marker is absent.")
            for bit in range(7):
                output_row = group * 7 + bit
                if output_row >= height_dots:
                    if marked & (1 << bit):
                        raise ValueError("Malformed IPL payload: nonzero padding bit.")
                    continue
                if marked & (1 << bit):
                    source_row = height_dots - 1 - output_row
                    raw[source_row * (width_dots // 8) + column // 8] |= 1 << (7 - column % 8)
    suffix = DIRECT_GRAPHICS_END_BITMAP + STX + RS
    if payload[index:index + len(suffix)] != suffix:
        raise ValueError("Malformed IPL payload: missing bitmap end or quantity framing.")
    index += len(suffix)
    quantity_end = payload.find(ETX, index)
    if quantity_end < index or not payload[index:quantity_end].isdigit() or payload[index:quantity_end] != b"1":
        raise ValueError("Malformed IPL payload: invalid print quantity.")
    index = quantity_end + 1
    if payload[index:] != STX + ETB + ETX:
        raise ValueError("Malformed IPL payload: invalid job terminator.")
    image = Image.new("1", (width_dots, height_dots), 255)
    for y in range(height_dots):
        for x in range(width_dots):
            if raw[y * (width_dots // 8) + x // 8] & (1 << (7 - x % 8)):
                image.putpixel((x, y), 0)
    return image


def decoded_ipl_png(payload: bytes, *, width_dots: int, height_dots: int) -> bytes:
    """Return a review PNG decoded from the supplied IPL payload, never source PNG."""
    image = decode_ipl_direct_graphics(payload, width_dots=width_dots, height_dots=height_dots)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def stage_trace(artifact: IplRasterArtifact, *, target: dict[str, Any], transport: str) -> list[dict[str, Any]]:
    """Public, non-secret stage evidence for simulation or physical handoff."""
    return [
        {"stage": "raster", "status": "completed", "width_dots": artifact.width_dots, "height_dots": artifact.height_dots},
        {"stage": "encode", "status": "completed", "language": "IPL", "payload_bytes": len(artifact.payload)},
    ]
