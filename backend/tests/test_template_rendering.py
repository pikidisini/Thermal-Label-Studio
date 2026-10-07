import builtins
from dataclasses import replace
from io import BytesIO
import json
from pathlib import Path
import socket
import subprocess
from xml.etree import ElementTree as ET

from PIL import Image
import pytest

from app.engine.raster import RasterError, render_label_item
from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutDefinition, LayoutRegistry, UnknownLabelCodeError
from app.labels.templates import SVG_NS, TemplateError, bind_template

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def layout():
    metadata = json.loads((FIXTURES / "templates" / "roll_80x200.json").read_text())
    metadata["required_facts"] = tuple(metadata["required_facts"])
    return LayoutDefinition(**metadata, svg=(FIXTURES / "templates" / "roll_80x200.svg").read_text())


@pytest.fixture
def payload_request():
    return LabelProcessRequest.model_validate_json(
        (FIXTURES / "payloads" / "roll_80x200.json").read_text()
    )


def test_resolve_fixture_metadata_and_template(layout):
    registry = LayoutRegistry({layout.label_code: layout})
    assert registry.resolve("roll_80x200") is layout
    assert (layout.version, layout.width_mm, layout.height_mm, layout.dpi) == ("fixture-v1", 80, 200, 203.2)
    assert layout.required_facts == ("batch", "material")
    assert ET.fromstring(layout.svg).tag == f"{{{SVG_NS}}}svg"
    with pytest.raises(UnknownLabelCodeError):
        registry.resolve("missing")


def test_binding_changes_only_declared_text_and_escapes_xml(layout, payload_request):
    facts = dict(payload_request.items[0].facts, batch='<tag>&"test"', ignored="unused")
    bound = bind_template(layout, facts)
    root = ET.fromstring(bound)
    assert [node.text for node in root.findall(f"{{{SVG_NS}}}text")] == [
        "BATCH", '<tag>&"test"', "MATERIAL", "MATERIAL-001"
    ]
    assert "&lt;tag&gt;&amp;" in bound
    assert "data-fact" not in bound and "unused" not in bound
    assert "data-fact" in layout.svg
    assert facts["batch"] == '<tag>&"test"'


@pytest.mark.parametrize("value", [None, "", " ", 42, True, [], {}, "x" * 65, "line\nbreak", "\u00e9"])
def test_invalid_required_fact_fails_before_renderer(monkeypatch, layout, payload_request, value):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid facts reached the renderer")
    monkeypatch.setattr(subprocess, "run", forbidden)
    facts = dict(payload_request.items[0].facts, batch=value)
    with pytest.raises(TemplateError):
        render_label_item(layout.label_code, facts, LayoutRegistry({layout.label_code: layout}))


def test_missing_required_fact_and_template_fail_closed(monkeypatch, layout, payload_request):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Invalid layout reached renderer"))
    registry = LayoutRegistry({layout.label_code: layout})
    with pytest.raises(TemplateError):
        render_label_item(layout.label_code, {"batch": "ok"}, registry)
    with pytest.raises(TemplateError):
        render_label_item(layout.label_code, payload_request.items[0].facts,
                          LayoutRegistry({layout.label_code: replace(layout, svg=None)}))


@pytest.mark.parametrize("svg", [
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x" /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text style="fill:url(file:///x)" /></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///x">]><svg />',
    '<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text x="NaN" /></svg>',
    '<svg>',
])
def test_unsupported_templates_cannot_load_resources(monkeypatch, layout, payload_request, svg):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Unsafe template reached renderer"))
    with pytest.raises(TemplateError):
        render_label_item(layout.label_code, payload_request.items[0].facts,
                          LayoutRegistry({layout.label_code: replace(layout, svg=svg)}))


def test_binding_and_geometry_must_match_metadata(layout, payload_request):
    for invalid in (
        replace(layout, required_facts=("unknown",)),
        replace(layout, width_mm=81), replace(layout, dpi=float("nan")),
        replace(layout, width_mm=99999), replace(layout, required_facts=("batch", "batch")),
    ):
        with pytest.raises(TemplateError):
            bind_template(invalid, payload_request.items[0].facts)


def test_real_bitmap_is_deterministic_and_has_no_output_effects(monkeypatch, layout, payload_request, real_renderer_settings):
    # Only the explicitly selected technical renderer may run. Fixture files
    # were read before these guards; bitmap processing uses memory streams.
    calls = []
    actual_run = subprocess.run
    def renderer_only(command, **kwargs):
        assert Path(command[0]) == real_renderer_settings.renderer_path
        assert command[1:3] == ["-", "-c"]
        assert "--skip-system-fonts" in command
        assert kwargs["timeout"] == 15
        assert kwargs["input"].startswith(b"<svg")
        calls.append(command)
        return actual_run(command, **kwargs)
    def forbidden(*args, **kwargs):
        pytest.fail("Rendering attempted filesystem output or network access")
    monkeypatch.setattr(subprocess, "run", renderer_only)
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    registry = LayoutRegistry({layout.label_code: layout})
    first = render_label_item(payload_request.label_code, payload_request.items[0].facts, registry)
    second = render_label_item(payload_request.label_code, payload_request.items[0].facts, registry)
    assert len(calls) == 2
    assert first == second
    assert (first.label_code, first.layout_version, first.width_px, first.height_px, first.dpi) == (
        "roll_80x200", "fixture-v1", 640, 1600, 203.2
    )
    with Image.open(BytesIO(first.bitmap_png)) as bitmap:
        bitmap.load()
        assert bitmap.format == "PNG" and bitmap.mode == "1" and bitmap.size == (640, 1600)
        assert bitmap.info["dpi"] == pytest.approx((203.2, 203.2), abs=0.02)
        assert bitmap.getpixel((40, 35)) == 0
        assert bitmap.getpixel((0, 0)) == 255
        # Text contains real raster marks outside the static border.
        assert bitmap.crop((32, 110, 550, 150)).getextrema() == (0, 255)
        assert bitmap.crop((32, 225, 550, 265)).getextrema() == (0, 255)
    changed = render_label_item(payload_request.label_code, dict(payload_request.items[0].facts, batch="CHANGED"), registry)
    assert changed.bitmap_png != first.bitmap_png


@pytest.mark.parametrize("failure", [
    subprocess.CompletedProcess([], 1, b"", b"private failure"),
    subprocess.CompletedProcess([], 0, b"invalid PNG", b""),
    subprocess.TimeoutExpired("resvg", 15), OSError("private path"),
])
def test_renderer_failures_produce_no_bitmap(monkeypatch, layout, payload_request, failure):
    def fail(*args, **kwargs):
        if isinstance(failure, Exception):
            raise failure
        return failure
    monkeypatch.setattr(subprocess, "run", fail)
    with pytest.raises(RasterError) as raised:
        render_label_item(payload_request.label_code, payload_request.items[0].facts, LayoutRegistry({layout.label_code: layout}))
    assert "private" not in str(raised.value)


def test_wrong_renderer_dimensions_fail_closed(monkeypatch, layout, payload_request):
    stream = BytesIO()
    Image.new("RGB", (1, 1), "white").save(stream, "PNG")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess([], 0, stream.getvalue(), b""))
    with pytest.raises(RasterError):
        render_label_item(payload_request.label_code, payload_request.items[0].facts, LayoutRegistry({layout.label_code: layout}))
