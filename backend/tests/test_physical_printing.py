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
from app.printing.service import (
    PrinterProfile, PrinterProfiles, PrintInputError, PrintSubmissionError,
    encode_ipl_bitmap, submit_processed_bitmap,
)


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


def catalog_for(bitmap):
    return PrinterProfiles({bitmap.label_code: PrinterProfile(
        "fixture_ipl", bitmap.width_px, bitmap.height_px, bitmap.dpi)})


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


def decoded_dots(payload, width, height):
    # Independent bounded-subset parser: framing, marker bits, padding, orientation.
    assert payload[:7] == b"\x1bg0\x21\x80\x40\x80"
    position = 7
    rows = [[False] * width for _ in range(height)]
    for column in range(width):
        assert payload[position] == 0x27
        position += 1
        for start in range(0, height, 7):
            byte = payload[position]
            position += 1
            assert byte & 0x80
            for bit in range(7):
                if start + bit < height:
                    rows[height - 1 - start - bit][column] = bool(byte & (1 << bit))
                else:
                    assert not byte & (1 << bit)
        assert payload[position] == 0x22
        position += 1
    assert payload[position:] == b"\x28\x02\x1e1\x03\x02\x17\x03"
    return rows


def test_known_asymmetric_png_has_exact_deterministic_ipl_bytes():
    bitmap = bitmap_for(["#..", ".#.", "..#"])
    profile = catalog_for(bitmap).resolve("roll")
    expected = b"\x1bg0\x21\x80\x40\x80\x27\x84\x22\x27\x82\x22\x27\x81\x22\x28\x02\x1e1\x03\x02\x17\x03"
    assert encode_ipl_bitmap(bitmap, profile) == expected
    assert encode_ipl_bitmap(bitmap, profile) == expected
    assert decoded_dots(expected, 3, 3) == [[True, False, False], [False, True, False], [False, False, True]]


@pytest.mark.parametrize("width,height", [(1, 1), (8, 7), (9, 8), (17, 15), (640, 1600)])
def test_pixels_round_trip_without_padding_dots_or_rescaling(width, height):
    rows = ["".join("#" if (x * 3 + y * 7) % 11 == 0 else "." for x in range(width)) for y in range(height)]
    bitmap = bitmap_for(rows)
    payload = encode_ipl_bitmap(bitmap, catalog_for(bitmap).resolve("roll"))
    assert len(payload) == 15 + width * (2 + (height + 6) // 7)
    assert decoded_dots(payload, width, height) == [[value == "#" for value in row] for row in rows]


@pytest.mark.parametrize("changes", [
    {"profile_id": ""}, {"profile_id": "../device"}, {"profile_id": "x" * 129},
    {"protocol": "ZPL"}, {"protocol": None}, {"width_px": True}, {"width_px": 1.0},
    {"width_px": 0}, {"width_px": 4097}, {"height_px": False}, {"height_px": 0},
    {"height_px": 4097}, {"width_px": 4096, "height_px": 4096}, {"dpi": True},
    {"dpi": float("nan")}, {"dpi": float("inf")}, {"dpi": 203}, {"dpi": 1200},
])
def test_invalid_server_profiles_fail_closed(changes):
    with pytest.raises(PrintInputError):
        PrinterProfiles({"roll": replace(PrinterProfile("fixture", 3, 3, 203.2), **changes)})


@pytest.mark.parametrize("catalog", [None, [], {}, {"../host": PrinterProfile("fixture", 3, 3, 203.2)},
                                      {"roll": {}}, {"roll": "127.0.0.1"}])
def test_invalid_catalog(catalog):
    with pytest.raises(PrintInputError):
        PrinterProfiles(catalog)


def test_catalog_is_copied_and_unknown_codes_never_submit():
    bitmap = bitmap_for(["#.."])
    source = {"roll": PrinterProfile("fixture", 3, 1, 203.2)}
    profiles = PrinterProfiles(source)
    source.clear()
    fake = FakeTransport()
    assert submit_processed_bitmap(bitmap, profiles, fake).profile_id == "fixture"
    for code in ["unknown", "../host", "127.0.0.1", "", None]:
        with pytest.raises(PrintInputError):
            submit_processed_bitmap(replace(bitmap, label_code=code), profiles, fake)
    assert len(fake.calls) == 1


@pytest.mark.parametrize("changes", [
    {"bitmap_png": b""}, {"bitmap_png": b"not png"}, {"bitmap_png": b"x" * 1_048_577},
    {"bitmap_png": bytearray(b"png")}, {"width_px": True}, {"width_px": 3.0},
    {"width_px": 4}, {"height_px": 2}, {"dpi": True}, {"dpi": 300},
    {"dpi": float("nan")}, {"layout_version": "../other"}, {"label_code": "../other"},
])
def test_invalid_bitmap_metadata_never_reaches_transport(changes):
    bitmap = bitmap_for(["#.."])
    fake = FakeTransport()
    with pytest.raises(PrintInputError):
        submit_processed_bitmap(replace(bitmap, **changes), catalog_for(bitmap), fake)
    assert fake.calls == []


@pytest.mark.parametrize("options", [{"mode": "L"}, {"mode": "RGB"}, {"dpi": None},
                                      {"dpi": 300}, {"transparency": True}])
def test_invalid_png_content_is_rejected(options):
    bitmap = bitmap_for(["#.."], **options)
    fake = FakeTransport()
    with pytest.raises(PrintInputError):
        submit_processed_bitmap(bitmap, catalog_for(bitmap), fake)
    assert fake.calls == []


def test_png_dimension_mismatch_and_truncation_rejected():
    bitmap = bitmap_for(["#.."])
    other = bitmap_for(["#..."])
    for png in (other.bitmap_png, bitmap.bitmap_png[:40]):
        with pytest.raises(PrintInputError):
            encode_ipl_bitmap(replace(bitmap, bitmap_png=png), catalog_for(bitmap).resolve("roll"))


def forbid_effects(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Printing attempted filesystem/network/process effects")
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)


def test_exact_bytes_once_and_submitted_unconfirmed_semantics_without_effects(monkeypatch):
    bitmap = bitmap_for(["#..", ".#.", "..#"])
    profiles = catalog_for(bitmap)
    fake = FakeTransport()
    forbid_effects(monkeypatch)
    result = submit_processed_bitmap(bitmap, profiles, fake)
    assert len(fake.calls) == 1 and fake.calls[0] is result.payload
    assert result.payload == encode_ipl_bitmap(bitmap, profiles.resolve("roll"))
    assert result.bitmap is bitmap and result.bitmap.bitmap_png is bitmap.bitmap_png
    assert result.status == "SUBMITTED" and result.confirmed is False
    with pytest.raises(FrozenInstanceError):
        result.confirmed = True


@pytest.mark.parametrize("failure,ack", [(TimeoutError("private host"), None),
                                        (RuntimeError("private credential"), None),
                                        (None, True), (None, {"confirmed": True})])
def test_uncertain_or_invalid_submission_has_no_retry_or_confirmation(monkeypatch, failure, ack):
    bitmap = bitmap_for(["#.."])
    fake = FakeTransport(failure, ack)
    forbid_effects(monkeypatch)
    with pytest.raises(PrintSubmissionError) as raised:
        submit_processed_bitmap(bitmap, catalog_for(bitmap), fake)
    assert len(fake.calls) == 1
    assert str(raised.value) == "Submission failed or is uncertain; delivery is unconfirmed."
    assert "private" not in str(raised.value)


def test_single_pipeline_simulation_capture_feeds_encoder_without_second_render(monkeypatch):
    from app.labels.models import LabelProcessRequest
    from app.labels.resolver import LayoutRegistry
    from app.simulation import service as simulation

    bitmap = bitmap_for(["#..", ".#."])
    calls = []

    def renderer(*args, on_stage):
        calls.append(args)
        for stage in ("RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING"):
            on_stage(stage)
        return bitmap

    monkeypatch.setattr(simulation, "render_label_item", renderer)
    request = LabelProcessRequest(label_code="roll", mode="simulation", items=[{"item_id": "one", "facts": {}}])
    capture, = simulation.simulate_label_request(request, LayoutRegistry({}))
    monkeypatch.setattr(simulation, "render_label_item", lambda *a, **k: pytest.fail("Second render"))
    forbid_effects(monkeypatch)
    fake = FakeTransport()
    result = submit_processed_bitmap(capture.bitmap, catalog_for(bitmap), fake)
    assert len(calls) == 1
    assert capture.bitmap is result.bitmap is bitmap
    assert capture.bitmap.bitmap_png is result.bitmap.bitmap_png
    assert fake.calls == [result.payload]


def test_printing_imports_no_renderer_binder_or_external_adapter():
    allowed = {"dataclasses", "io", "math", "re", "typing", "PIL", "app.engine.bitmap"}
    for node in ast.walk(ast.parse(Path(service.__file__).read_text())):
        if isinstance(node, ast.Import):
            assert all(alias.name in allowed for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.module in allowed
        elif isinstance(node, ast.Call):
            assert not (isinstance(node.func, ast.Name) and node.func.id in {"__import__", "eval", "exec", "open"})
            assert not (isinstance(node.func, ast.Attribute) and node.func.attr in {"import_module", "render_label_item", "bind_template"})
