import ast
import builtins
from dataclasses import FrozenInstanceError, replace
from io import BytesIO
from pathlib import Path
import socket
import subprocess

from PIL import Image
import pytest

from app.engine.bitmap import RenderedLabel
from app.printing import service
from app.printing.service import PrintInputError, PrintSubmissionError, submit_prepared_output
from app.engine import pipeline
from app.engine.output import PreparedOutput
from app.protocols import registry
from app.simulation.service import simulate_prepared_output


def bitmap_for(rows, *, mode="1", dpi=203.2, transparency=False):
    image = Image.new(mode, (len(rows[0]), len(rows)), 255)
    for y, row in enumerate(rows):
        for x, value in enumerate(row):
            image.putpixel((x, y), 0 if value == "#" else 255)
    stream = BytesIO()
    options = {} if dpi is None else {"dpi": (dpi, dpi)}
    if transparency:
        options["transparency"] = 0
    image.save(stream, format="PNG", **options)
    return RenderedLabel("roll", "fixture-v1", image.width, image.height, 203.2, stream.getvalue())


class FakeTransport:
    def __init__(self, failure=None, acknowledgement=None):
        self.calls = []
        self.failure = failure
        self.acknowledgement = acknowledgement

    def submit(self, payload):
        self.calls.append(payload)
        if self.failure:
            raise self.failure
        return self.acknowledgement


def test_prepared_output_shared_by_both_sinks_without_render_or_encode(monkeypatch):
    bitmap = bitmap_for(["#..", ".#.", "..#"])
    counts = []
    real_encoder = registry.encode_png
    def encode(*args, **kwargs):
        counts.append(args)
        return real_encoder(*args, **kwargs)
    monkeypatch.setattr(registry, "encode_png", encode)
    prepared = pipeline.prepare_bitmap(bitmap)
    assert len(counts) == 1
    monkeypatch.setattr(registry, "encode_png", lambda *a: pytest.fail("Second encoding"))
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Second rendering"))
    monkeypatch.setattr(socket, "create_connection", lambda *a: pytest.fail("Network"))
    capture = simulate_prepared_output(prepared)
    fake = FakeTransport()
    result = submit_prepared_output(prepared, fake)
    assert result.output is prepared
    assert fake.calls[0] is prepared.payload
    assert result.status == "SUBMITTED" and result.confirmed is False
    with Image.open(BytesIO(capture.bitmap_png)) as actual, Image.open(BytesIO(bitmap.bitmap_png)) as expected:
        assert actual.tobytes() == expected.tobytes()
    with pytest.raises(FrozenInstanceError):
        prepared.payload = b"changed"

@pytest.mark.parametrize("failure,ack", [(TimeoutError("private host"), None), (RuntimeError("private credential"), None), (None, True), (None, {"confirmed": True})])
def test_failed_or_uncertain_submission_never_retries(failure, ack):
    prepared = pipeline.prepare_bitmap(bitmap_for(["#.. "]))
    fake = FakeTransport(failure, ack)
    with pytest.raises(PrintSubmissionError) as raised:
        submit_prepared_output(prepared, fake)
    assert len(fake.calls) == 1
    assert "private" not in str(raised.value)

@pytest.mark.parametrize("output", [None, b"raw", PreparedOutput(None, b"", "IPL"), PreparedOutput(None, b"payload", "ZPL")])
def test_invalid_preparation_never_submits(output):
    fake = FakeTransport()
    with pytest.raises(PrintInputError):
        submit_prepared_output(output, fake)
    assert fake.calls == []

def test_language_selected_before_any_raster(monkeypatch):
    monkeypatch.setattr(pipeline, "render_svg_bitmap", lambda *a: pytest.fail("Raster"))
    with pytest.raises(ValueError):
        pipeline.prepare_editor_output("<svg/>", 20, 12, 203.2, language="ZPL")

def test_editor_preparation_renders_and_encodes_once_then_prints_same_payload(monkeypatch):
    bitmap = bitmap_for(["#" * 160] * 96)
    calls = []
    encoded = []
    real_encoder = registry.encode_png
    def encode(*args, **kwargs):
        encoded.append(args)
        return real_encoder(*args, **kwargs)
    monkeypatch.setattr(registry, "encode_png", encode)
    def raster(svg, width, height, dpi):
        calls.append((width, height, dpi))
        return bitmap.bitmap_png
    monkeypatch.setattr(pipeline, "render_svg_bitmap", raster)
    prepared = pipeline.prepare_editor_output('<svg xmlns="http://www.w3.org/2000/svg"/>', 20, 12, 203.2)
    fake = FakeTransport()
    submit_prepared_output(prepared, fake)
    assert calls == [(160, 96, 203.2)]
    assert len(encoded) == 1
    assert fake.calls[0] is prepared.payload

def test_print_sink_imports_no_encoder_renderer_or_simulation():
    imports = [node.module for node in ast.walk(ast.parse(Path(service.__file__).read_text())) if isinstance(node, ast.ImportFrom)]
    assert not any(name.startswith(("app.protocols", "app.simulation", "app.engine.raster", "app.engine.pipeline")) for name in imports)
