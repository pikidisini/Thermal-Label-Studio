import ast
import builtins
from dataclasses import replace
from io import BytesIO
import json
from pathlib import Path
import socket
import subprocess

from PIL import Image
import pytest

from app.engine.raster import RasterError, render_label_item
from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutDefinition, LayoutRegistry
from app.simulation import service
from app.engine import pipeline
from app.simulation.service import SimulationRequestError, simulate_label_request


FIXTURES = Path(__file__).parent / "fixtures"
SUCCESS_STAGES = ["RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING", "CAPTURED"]


@pytest.fixture
def fixture_input():
    metadata = json.loads((FIXTURES / "templates" / "roll_80x200.json").read_text())
    metadata["required_facts"] = tuple(metadata["required_facts"])
    layout = LayoutDefinition(**metadata, svg=(FIXTURES / "templates" / "roll_80x200.svg").read_text())
    request = LabelProcessRequest.model_validate_json(
        (FIXTURES / "payloads" / "roll_80x200.json").read_text()
    )
    return layout, request


def observe_renderer(monkeypatch):
    rendered = []
    calls = []

    def spy(label_code, facts, registry, **kwargs):
        calls.append((label_code, facts))
        bitmap = render_label_item(label_code, facts, registry, **kwargs)
        rendered.append(bitmap)
        return bitmap

    monkeypatch.setattr(pipeline, "render_label_item", spy)
    return calls, rendered


def test_valid_fixture_captures_exact_renderer_bitmap_once_without_output_io(monkeypatch, fixture_input, real_renderer_settings):
    layout, request = fixture_input
    original = request.model_dump()
    calls, rendered = observe_renderer(monkeypatch)
    launches = []
    actual_run = subprocess.run

    def technical_renderer_only(command, **kwargs):
        assert Path(command[0]) == real_renderer_settings.renderer_path
        assert command[1:3] == ["-", "-c"]
        assert "--skip-system-fonts" in command
        assert kwargs["timeout"] == 15
        launches.append(command)
        return actual_run(command, **kwargs)

    def forbidden(*args, **kwargs):
        pytest.fail("Simulation attempted output IO or printer communication")

    monkeypatch.setattr(subprocess, "run", technical_renderer_only)
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)

    result, = simulate_label_request(request, LayoutRegistry({layout.label_code: layout}))
    assert len(calls) == len(rendered) == len(launches) == 1
    assert result.bitmap is not rendered[0]
    assert result.payload is not None
    with Image.open(BytesIO(result.bitmap.bitmap_png)) as decoded, Image.open(BytesIO(rendered[0].bitmap_png)) as original_image:
        assert decoded.tobytes() == original_image.tobytes()
    assert result.item_index == 0 and result.item_id == request.items[0].item_id
    assert result.status == "CAPTURED" and result.error is None
    assert [entry.status for entry in result.trace] == SUCCESS_STAGES
    assert request.model_dump() == original
    with Image.open(BytesIO(result.bitmap.bitmap_png)) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "1" and image.size == (640, 1600)
        assert image.info["dpi"] == pytest.approx((203.2, 203.2), abs=0.02)


def test_ordered_items_keep_independent_trace_and_failure_context(monkeypatch, fixture_input, real_renderer_settings):
    layout, request = fixture_input
    facts = request.items[0].facts
    request = LabelProcessRequest(label_code=layout.label_code, mode="simulation", items=[
        {"item_id": "SECOND", "facts": facts},
        {"item_id": "BAD", "facts": {"batch": "private-sensitive-value"}},
        {"item_id": "FIRST", "facts": dict(facts, batch="NEXT")},
    ])
    calls, rendered = observe_renderer(monkeypatch)
    results = simulate_label_request(request, LayoutRegistry({layout.label_code: layout}))
    assert len(calls) == 3 and len(rendered) == 2
    assert [(r.item_index, r.item_id, r.status) for r in results] == [
        (0, "SECOND", "CAPTURED"), (1, "BAD", "FAILED"), (2, "FIRST", "CAPTURED")
    ]
    assert [entry.status for entry in results[0].trace] == SUCCESS_STAGES
    assert [entry.status for entry in results[1].trace] == [
        "RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "FAILED"
    ]
    assert [entry.status for entry in results[2].trace] == SUCCESS_STAGES
    assert results[0].payload and results[2].payload
    assert results[0].bitmap is not rendered[0] and results[2].bitmap is not rendered[1]
    assert results[1].bitmap is None
    assert results[1].error.code == "invalid_template_or_facts"
    assert "private" not in repr(results[1])


@pytest.mark.parametrize("value", [None, "", " ", 1, True, [], {}, "x" * 65, "line\nbreak"])
def test_invalid_facts_fail_closed_without_raster_process(monkeypatch, fixture_input, value):
    layout, request = fixture_input
    request.items[0].facts["batch"] = value
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Invalid facts reached raster process"))
    calls, rendered = observe_renderer(monkeypatch)
    result, = simulate_label_request(request, LayoutRegistry({layout.label_code: layout}))
    assert len(calls) == 1 and not rendered
    assert result.status == "FAILED" and result.bitmap is None
    assert result.error.code == "invalid_template_or_facts"
    assert result.trace[-2].status == "BINDING_TEMPLATE"


@pytest.mark.parametrize("missing", ["code", "svg", "media"])
def test_missing_layout_or_metadata_stops_at_actual_stage(monkeypatch, fixture_input, missing):
    layout, request = fixture_input
    registry = LayoutRegistry({} if missing == "code" else {
        layout.label_code: replace(layout, **({"svg": None} if missing == "svg" else {"dpi": None}))
    })
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Invalid layout reached raster process"))
    result, = simulate_label_request(request, registry)
    assert result.bitmap is None and result.status == "FAILED"
    if missing == "code":
        assert result.error.code == "unknown_label_code"
        assert [entry.status for entry in result.trace] == ["RECEIVED", "RESOLVING_LAYOUT", "FAILED"]
    else:
        assert result.error.code == "invalid_template_or_facts"
        assert result.trace[-2].status == "BINDING_TEMPLATE"


@pytest.mark.parametrize("failure, code", [(RasterError("private stderr"), "raster_failed"),
                                          (RuntimeError("private path"), "processing_failed")])
def test_renderer_failure_has_bounded_error_and_no_capture(monkeypatch, fixture_input, failure, code):
    layout, request = fixture_input
    calls = []

    def fail(*args, on_stage, **kwargs):
        calls.append(args)
        for stage in SUCCESS_STAGES[1:-1]:
            on_stage(stage)
        raise failure

    monkeypatch.setattr(pipeline, "render_label_item", fail)
    result, = simulate_label_request(request, LayoutRegistry({layout.label_code: layout}))
    assert len(calls) == 1
    assert result.status == "FAILED" and result.bitmap is None
    assert result.error.code == code and "private" not in repr(result)
    assert [entry.status for entry in result.trace] == SUCCESS_STAGES[:-1] + ["FAILED"]


@pytest.mark.parametrize("change", ["print", "empty", "blank", "too_many", "malformed"])
def test_invalid_simulation_request_cannot_enter_renderer(monkeypatch, fixture_input, change):
    layout, request = fixture_input
    values = request.model_dump()
    if change == "print":
        values["mode"] = "print"
    elif change == "empty":
        values["items"] = []
    elif change == "blank":
        values["label_code"] = " "
    elif change == "too_many":
        values["items"] *= 101
    else:
        values["items"] = [{"item_id": "a", "facts": []}]
    request = LabelProcessRequest.model_construct(**values)
    monkeypatch.setattr(pipeline, "render_label_item", lambda *a, **k: pytest.fail("Invalid request reached renderer"))
    with pytest.raises(SimulationRequestError) as raised:
        simulate_label_request(request, LayoutRegistry({layout.label_code: layout}))
    assert raised.value.code == "invalid_simulation_request"


def test_simulation_imports_no_transport_or_external_adapter():
    source = Path(service.__file__).read_text()
    allowed = {"dataclasses", "typing", "pydantic", "app.engine.raster", "app.labels.models",
               "app.labels.resolver", "app.labels.templates", "app.observability", "app.engine.pipeline", "app.engine.output", "app.engine.bitmap", "app.protocols.registry"}
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            assert all(alias.name in allowed for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.module in allowed
        elif isinstance(node, ast.Call):
            assert not (isinstance(node.func, ast.Name) and node.func.id in {"__import__", "eval", "exec"})
            assert not (isinstance(node.func, ast.Attribute) and node.func.attr == "import_module")


def test_unsupported_action_encoder_cannot_enter_renderer(monkeypatch, fixture_input):
    layout, request = fixture_input
    monkeypatch.setattr(pipeline, "render_label_item", lambda *a, **k: pytest.fail("Unsupported encoder reached raster"))
    with pytest.raises(SimulationRequestError) as raised:
        simulate_label_request(request, LayoutRegistry({layout.label_code: layout}), encoder="ZPL")
    assert raised.value.code == "invalid_simulation_request"
