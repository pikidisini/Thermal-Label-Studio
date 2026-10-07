"""Editor-canvas simulation HTTP boundary for the Phase 7 local studio."""

import base64
import re
import subprocess
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from PIL import Image

from app.config import get_settings
from app.observability import current_request_id, record_event, request_context
from app.svg_safety import MAX_SVG_BYTES, validate_safe_svg


router = APIRouter()
MAX_BITMAP_PIXELS = 4_000_000


class EditorPreviewRequest(BaseModel):
    """A bounded, already-composed SVG emitted by the local Studio canvas."""

    model_config = ConfigDict(extra="forbid", strict=True)

    svg: str = Field(min_length=1, max_length=MAX_SVG_BYTES)
    width_mm: float = Field(ge=10, le=500)
    height_mm: float = Field(ge=10, le=500)
    dpi: float = Field(ge=72, le=600)


class EditorPreviewResponse(BaseModel):
    request_id: str
    media_type: Literal["image/png"] = "image/png"
    width_px: int = Field(ge=1, le=4096)
    height_px: int = Field(ge=1, le=4096)
    dpi: float
    png_base64: str = Field(min_length=1)


def _preview_dimensions(request: EditorPreviewRequest) -> tuple[int, int]:
    width = round(request.width_mm * request.dpi / 25.4)
    height = round(request.height_mm * request.dpi / 25.4)
    if min(width, height) < 1 or max(width, height) > 4096 or width * height > MAX_BITMAP_PIXELS:
        raise ValueError("unsupported_media")
    return width, height


def _renderable_editor_svg(svg: str, font_family: str) -> str:
    """Use the container-owned font for browser-authored text during preview."""
    # The submitted SVG has already passed the server safety check. This is a
    # rendering-only normalization: the stored Studio SVG remains unchanged.
    attribute_pattern = r"font-family\s*=\s*(['\"]).*?\1"
    style_pattern = r"(font-family\s*:\s*)[^;}]+"
    normalized = re.sub(attribute_pattern, f'font-family="{font_family}"', svg, flags=re.IGNORECASE)
    return re.sub(style_pattern, lambda match: f"{match.group(1)}{font_family}", normalized, flags=re.IGNORECASE)


def _render_editor_svg(svg: str, width: int, height: int, dpi: float) -> bytes:
    settings = get_settings()
    if not settings.renderer_path.is_file() or not settings.fixture_font_path.is_file():
        raise RuntimeError("renderer_unavailable")
    try:
        result = subprocess.run(
            [str(settings.renderer_path), "-", "-c", "--width", str(width), "--height", str(height),
             "--dpi", str(round(dpi)), "--background", "white", "--skip-system-fonts",
             "--use-font-file", str(settings.fixture_font_path), "--font-family", settings.fixture_font_family],
            input=svg.encode("utf-8"), capture_output=True, timeout=15, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("renderer_unavailable") from exc
    if result.returncode != 0:
        raise RuntimeError("render_failed")
    try:
        with Image.open(BytesIO(result.stdout)) as image:
            image.load()
            if image.format != "PNG":
                raise RuntimeError("render_failed")
            if image.size != (width, height):
                # resvg rounds a physical SVG viewport down by one pixel in some
                # cases (for example 80 mm at 203.2 DPI). Preserve the rendered
                # geometry and add only the missing white edge pixel; reject any
                # material size mismatch rather than stretching the label.
                delta_width = width - image.width
                delta_height = height - image.height
                if abs(delta_width) > 1 or abs(delta_height) > 1:
                    raise RuntimeError("render_failed")
                normalized = Image.new("RGBA", (width, height), "white")
                normalized.paste(image, (0, 0))
                image = normalized
            output = BytesIO()
            image.convert("L").point(lambda value: 255 if value >= 128 else 0, "1").save(
                output, format="PNG", dpi=(dpi, dpi)
            )
            return output.getvalue()
    except (OSError, ValueError) as exc:
        raise RuntimeError("render_failed") from exc


@router.post("/simulation/editor-preview", response_model=EditorPreviewResponse)
def simulate_editor_preview(request: EditorPreviewRequest) -> EditorPreviewResponse:
    """Render the current local canvas to the same server-owned bitmap used by preview."""
    with request_context() as request_id:
        try:
            width, height = _preview_dimensions(request)
            svg = validate_safe_svg(request.svg)
            bitmap = _render_editor_svg(_renderable_editor_svg(svg, get_settings().fixture_font_family), width, height, request.dpi)
        except ValueError as exc:
            record_event("FAILED", error_code="invalid_request")
            raise HTTPException(status_code=422, detail={"code": "invalid_editor_layout"}) from None
        except RuntimeError:
            record_event("FAILED", error_code="raster_failed")
            raise HTTPException(status_code=500, detail={"code": "editor_preview_failed"}) from None
        record_event("CAPTURED")
        return EditorPreviewResponse(
            request_id=request_id,
            width_px=width,
            height_px=height,
            dpi=request.dpi,
            png_base64=base64.b64encode(bitmap).decode("ascii"),
        )
