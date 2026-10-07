"""Small stdin/stdout adaptation of the retained resvg technical raster step."""

from io import BytesIO
import subprocess
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
    executable = settings.renderer_path
    font = settings.fixture_font_path
    # Fixture deployment deliberately selects one installed font. Cross-font
    # pixel equivalence is not claimed; no arbitrary family/input is accepted.
    svg = svg.replace('font-family="Arial"', f'font-family="{settings.fixture_font_family}"')
    if not executable.is_file() or not font.is_file():
        raise RasterError("Required local renderer or fixture font is unavailable.")
    try:
        result = subprocess.run(
            [str(executable), "-", "-c", "--width", str(width), "--height", str(height),
             # This CLI accepts integer DPI. The restricted SVG uses only pixel
             # units; exact media DPI is used for dimensions and final metadata.
             "--dpi", str(round(layout.dpi)), "--background", "white", "--skip-system-fonts",
             "--use-font-file", str(font), "--font-family", settings.fixture_font_family],
            input=svg.encode("utf-8"), capture_output=True, timeout=15, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RasterError("Local raster rendering failed.") from exc
    if result.returncode != 0:
        raise RasterError("Local raster rendering failed.")
    try:
        with Image.open(BytesIO(result.stdout)) as image:
            image.load()
            if image.format != "PNG" or image.size != (width, height):
                raise RasterError("Renderer output dimensions or format are invalid.")
            bitmap = image.convert("L").point(lambda value: 255 if value >= 128 else 0, "1")
            output = BytesIO()
            bitmap.save(output, format="PNG", dpi=(layout.dpi, layout.dpi))
    except (OSError, ValueError) as exc:
        raise RasterError("Renderer output is invalid.") from exc
    return RenderedLabel(layout.label_code, layout.version, width, height, layout.dpi, output.getvalue())
