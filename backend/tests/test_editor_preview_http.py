import base64
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from fastapi import HTTPException
import pytest

from app.simulation import editor_http
from app.engine import pipeline, raster
from app.protocols import registry
from app.protocols.ipl.errors import IplError


VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="black"/></svg>'
PNG = b"\x89PNG\r\n\x1a\nfixture"


def test_editor_preview_renders_a_server_bitmap(monkeypatch):
    calls = []

    def render(svg, width, height, dpi):
        calls.append((svg, width, height, dpi))
        stream = BytesIO()
        image = Image.new("1", (width, height), 255)
        image.putpixel((2, 801), 0)
        image.save(stream, format="PNG", dpi=(dpi, dpi))
        return stream.getvalue()

    monkeypatch.setattr(pipeline, "render_svg_bitmap", render)
    response = editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
        svg=VALID_SVG, width_mm=80, height_mm=200, dpi=203.2,
    ))
    assert (response.width_px, response.height_px, response.dpi) == (640, 1600, 203.2)
    with Image.open(BytesIO(base64.b64decode(response.png_base64))) as image:
        assert image.size == (640,1600) and image.mode == "1"
        assert image.getpixel((2,801)) == 0
        assert image.getpixel((801 % 640,2)) == 255
    assert len(calls) == 1


@pytest.mark.parametrize("svg", [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/image.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://example.test/a)"/></svg>',
])
def test_editor_preview_rejects_active_or_external_svg(monkeypatch, svg):
    monkeypatch.setattr(pipeline, "render_svg_bitmap", lambda *args: pytest.fail("must not render"))
    with pytest.raises(HTTPException) as raised:
        editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
            svg=svg, width_mm=80, height_mm=200, dpi=203.2,
        ))
    assert raised.value.status_code == 422
    assert raised.value.detail == {"code": "invalid_editor_layout"}


def test_editor_preview_rejects_unbounded_media_before_renderer(monkeypatch):
    monkeypatch.setattr(pipeline, "render_svg_bitmap", lambda *args: pytest.fail("must not render"))
    with pytest.raises(HTTPException) as raised:
        editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
            svg=VALID_SVG, width_mm=500, height_mm=500, dpi=600,
        ))
    assert raised.value.status_code == 422


def test_editor_preview_normalizes_browser_font_families():
    source = '<svg><text font-family="Times New Roman" style="font-family: Arial;fill:#000">Label</text></svg>'
    normalized = raster.normalize_editor_fonts(source, "Liberation Sans")
    assert "Times New Roman" not in normalized
    assert "Arial" not in normalized
    assert normalized.count("Liberation Sans") == 2


def test_editor_response_comes_from_exact_encoded_payload(monkeypatch):
    stream = BytesIO()
    Image.new("1", (80, 80), 255).save(stream, format="PNG", dpi=(203.2, 203.2))
    monkeypatch.setattr(pipeline, "render_svg_bitmap", lambda *args: stream.getvalue())
    payload = b"exact encoded payload"
    monkeypatch.setattr(registry, "encode_png", lambda *args, **kwargs: payload)
    seen = []

    def decode(value, width, height, dpi):
        seen.append(value)
        return b"decoder result"

    monkeypatch.setattr(registry, "decode_png", decode)
    request = editor_http.EditorPreviewRequest(svg=VALID_SVG, width_mm=10, height_mm=10, dpi=203.2)
    response = editor_http.simulate_editor_preview(request)
    assert seen == [payload] and seen[0] is payload
    assert base64.b64decode(response.png_base64) == b"decoder result"

    def fail(*args):
        raise IplError("private input")

    monkeypatch.setattr(registry, "decode_png", fail)
    with pytest.raises(HTTPException) as raised:
        editor_http.simulate_editor_preview(request)
    assert raised.value.status_code == 500
    assert raised.value.detail == {"code": "editor_preview_failed"}


def test_editor_preview_pads_one_pixel_renderer_rounding(monkeypatch):
    source = BytesIO()
    Image.new("RGBA", (639, 320), "white").save(source, format="PNG")
    # The renderer is mocked; dependency presence can be mocked as well.
    renderer = Path(__file__).resolve().parent / "fixture-resvg"
    font = renderer.with_name("fixture-font.ttf")
    original_is_file = Path.is_file
    monkeypatch.setattr(Path, "is_file", lambda path: path in {renderer, font} or original_is_file(path))
    monkeypatch.setattr(raster, "get_settings", lambda: SimpleNamespace(
        renderer_path=Path(renderer), fixture_font_path=Path(font), fixture_font_family="Liberation Sans"
    ))
    monkeypatch.setattr(raster.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=source.getvalue()))

    result = raster.render_svg_bitmap(VALID_SVG, 640, 320, 203.2)
    with Image.open(BytesIO(result)) as image:
        assert image.size == (640, 320)
        assert image.getpixel((639, 0)) == 255
