"""Small stdin/stdout adaptation of the retained resvg technical raster step."""

from io import BytesIO
import subprocess
import re
from typing import Callable, Literal

from PIL import Image

from app.config import get_settings
from app.engine.bitmap import RenderedLabel
from app.labels.resolver import LayoutSource
from app.labels.templates import bind_template, validate_layout


class RasterError(RuntimeError):
    """The local raster dependency failed; no output is accepted."""


RenderStage = Literal["RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING"]


def render_label_item(
    label_code: str, facts: dict, registry: LayoutSource,
    *, on_stage: Callable[[RenderStage], None] | None = None,
) -> RenderedLabel:
    """Resolve, bind, and return a monochrome PNG in memory for one fixture item.

    The only process is the explicitly selected local renderer. No files are
    written, no transport is selected, and request mode is irrelevant here.
    """
    if on_stage is not None:
        on_stage("RESOLVING_LAYOUT")
    layout = registry.resolve(label_code)
    if on_stage is not None:
        on_stage("BINDING_TEMPLATE")
    svg = bind_template(layout, facts)
    width, height = validate_layout(layout)
    if on_stage is not None:
        on_stage("RASTERIZING")
    settings = get_settings()
    svg = svg.replace('font-family="Arial"', f'font-family="{settings.fixture_font_family}"')
    bitmap = render_svg_bitmap(svg, width, height, layout.dpi, allow_edge_rounding=False)
    return RenderedLabel(layout.label_code, layout.version, width, height, layout.dpi, bitmap)


def normalize_editor_fonts(svg: str, font_family: str) -> str:
    """Use the container-owned font for browser-authored text during preview."""
    # The submitted SVG has already passed the server safety check. This is a
    # rendering-only normalization: the stored Studio SVG remains unchanged.
    attribute_pattern = r"font-family\s*=\s*(['\"]).*?\1"
    style_pattern = r"(font-family\s*:\s*)[^;}]+"
    normalized = re.sub(attribute_pattern, f'font-family="{font_family}"', svg, flags=re.IGNORECASE)
    return re.sub(style_pattern, lambda match: f"{match.group(1)}{font_family}", normalized, flags=re.IGNORECASE)


def render_svg_bitmap(svg: str, width: int, height: int, dpi: float, *, allow_edge_rounding: bool = True) -> bytes:
    settings = get_settings()
    if not settings.renderer_path.is_file() or not settings.fixture_font_path.is_file():
        raise RasterError("renderer_unavailable")
    try:
        result = subprocess.run(
            [str(settings.renderer_path), "-", "-c", "--width", str(width), "--height", str(height),
             "--dpi", str(round(dpi)), "--background", "white", "--skip-system-fonts",
             "--use-font-file", str(settings.fixture_font_path), "--font-family", settings.fixture_font_family],
            input=svg.encode("utf-8"), capture_output=True, timeout=15, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RasterError("renderer_unavailable") from exc
    if result.returncode != 0:
        raise RasterError("render_failed")
    try:
        with Image.open(BytesIO(result.stdout)) as image:
            image.load()
            if image.format != "PNG":
                raise RasterError("render_failed")
            if image.size != (width, height):
                # resvg rounds a physical SVG viewport down by one pixel in some
                # cases (for example 80 mm at 203.2 DPI). Preserve the rendered
                # geometry and add only the missing white edge pixel; reject any
                # material size mismatch rather than stretching the label.
                delta_width = width - image.width
                delta_height = height - image.height
                if not allow_edge_rounding or abs(delta_width) > 1 or abs(delta_height) > 1:
                    raise RasterError("render_failed")
                normalized = Image.new("RGBA", (width, height), "white")
                normalized.paste(image, (0, 0))
                image = normalized
            output = BytesIO()
            image.convert("L").point(lambda value: 255 if value >= 128 else 0, "1").save(
                output, format="PNG", dpi=(dpi, dpi)
            )
            return output.getvalue()
    except (OSError, ValueError) as exc:
        raise RasterError("render_failed") from exc
