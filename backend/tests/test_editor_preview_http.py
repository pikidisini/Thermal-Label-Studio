import base64
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from fastapi import HTTPException
import pytest

from app.simulation import editor_http


VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="black"/></svg>'
PNG = b"\x89PNG\r\n\x1a\nfixture"


def test_editor_preview_renders_a_server_bitmap(monkeypatch):
    calls = []

    def render(svg, width, height, dpi):
        calls.append((svg, width, height, dpi))
        return PNG

    monkeypatch.setattr(editor_http, "_render_editor_svg", render)
    response = editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
        svg=VALID_SVG, width_mm=80, height_mm=200, dpi=203.2,
    ))
    assert (response.width_px, response.height_px, response.dpi) == (640, 1600, 203.2)
    assert base64.b64decode(response.png_base64) == PNG
    assert len(calls) == 1


@pytest.mark.parametrize("svg", [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/image.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://example.test/a)"/></svg>',
])
def test_editor_preview_rejects_active_or_external_svg(monkeypatch, svg):
    monkeypatch.setattr(editor_http, "_render_editor_svg", lambda *args: pytest.fail("must not render"))
    with pytest.raises(HTTPException) as raised:
        editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
            svg=svg, width_mm=80, height_mm=200, dpi=203.2,
        ))
    assert raised.value.status_code == 422
    assert raised.value.detail == {"code": "invalid_editor_layout"}


def test_editor_preview_rejects_unbounded_media_before_renderer(monkeypatch):
    monkeypatch.setattr(editor_http, "_render_editor_svg", lambda *args: pytest.fail("must not render"))
    with pytest.raises(HTTPException) as raised:
        editor_http.simulate_editor_preview(editor_http.EditorPreviewRequest(
            svg=VALID_SVG, width_mm=500, height_mm=500, dpi=600,
        ))
    assert raised.value.status_code == 422


def test_editor_preview_normalizes_browser_font_families():
    source = '<svg><text font-family="Times New Roman" style="font-family: Arial;fill:#000">Label</text></svg>'
    normalized = editor_http._renderable_editor_svg(source, "Liberation Sans")
    assert "Times New Roman" not in normalized
    assert "Arial" not in normalized
    assert normalized.count("Liberation Sans") == 2


def test_editor_preview_pads_one_pixel_renderer_rounding(monkeypatch):
    source = BytesIO()
    Image.new("RGBA", (639, 320), "white").save(source, format="PNG")
    # The renderer is mocked; dependency presence can be mocked as well.
    renderer = Path(__file__).resolve().parent / "fixture-resvg"
    font = renderer.with_name("fixture-font.ttf")
    original_is_file = Path.is_file
    monkeypatch.setattr(Path, "is_file", lambda path: path in {renderer, font} or original_is_file(path))
    monkeypatch.setattr(editor_http, "get_settings", lambda: SimpleNamespace(
        renderer_path=Path(renderer), fixture_font_path=Path(font), fixture_font_family="Liberation Sans"
    ))
    monkeypatch.setattr(editor_http.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=source.getvalue()))

    result = editor_http._render_editor_svg(VALID_SVG, 640, 320, 203.2)
    with Image.open(BytesIO(result)) as image:
        assert image.size == (640, 320)
        assert image.getpixel((639, 0)) == 255
