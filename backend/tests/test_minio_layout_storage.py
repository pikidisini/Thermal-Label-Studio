import builtins
import hashlib
from io import BytesIO
import json
from pathlib import Path
import socket
import subprocess

from PIL import Image
import pytest

from app.labels.models import LabelProcessRequest
from app.labels.resolver import ACTIVE_LAYOUTS, UnknownLabelCodeError
from app.labels.service import accept_label_process_request
from app.labels.storage import (MAX_METADATA_BYTES, MAX_SVG_BYTES, MAX_SVG_CHARACTERS,
                                LayoutStorageError, MinioLayoutSource)
from app.simulation.service import simulate_label_request


PREFIX = "layouts/roll_80x200/fixture-v1"
META_KEY = f"{PREFIX}/layout.json"
SVG_KEY = f"{PREFIX}/template.svg"


class FakeResponse:
    def __init__(self, data, *, fragment=997, failure=None, close_failure=False, release_failure=False):
        self.data = data
        self.position = 0
        self.fragment = fragment
        self.failure = failure
        self.close_failure = close_failure
        self.release_failure = release_failure
        self.reads = []
        self.closed = 0
        self.released = 0

    def read(self, amt):
        self.reads.append(amt)
        if self.failure:
            raise self.failure
        end = self.position + min(amt, self.fragment)
        data = self.data[self.position:end]
        self.position += len(data)
        return data

    def close(self):
        self.closed += 1
        if self.close_failure:
            raise RuntimeError("private connection detail")

    def release_conn(self):
        self.released += 1
        if self.release_failure:
            raise RuntimeError("private connection detail")


class FakeClient:
    def __init__(self, objects):
        self.objects = objects
        self.calls = []
        self.responses = []

    def get_object(self, bucket_name, object_name):
        self.calls.append((bucket_name, object_name))
        obj = self.objects[object_name]
        if isinstance(obj, Exception):
            raise obj
        response = obj if isinstance(obj, FakeResponse) else FakeResponse(obj)
        self.responses.append(response)
        return response


@pytest.fixture
def objects():
    directory = Path(__file__).parent / "fixtures" / "templates"
    svg = (directory / "roll_80x200.svg").read_bytes()
    metadata = json.loads((directory / "roll_80x200.json").read_text())
    metadata.update(schema_version=1, svg_sha256=hashlib.sha256(svg).hexdigest())
    return {META_KEY: json.dumps(metadata).encode(), SVG_KEY: svg}


def source(objects, versions=None):
    client = FakeClient(objects)
    return MinioLayoutSource(client, "approved-layouts", versions or {"roll_80x200": "fixture-v1"}), client


def update_metadata(objects, **changes):
    metadata = json.loads(objects[META_KEY])
    metadata.update(changes)
    objects[META_KEY] = json.dumps(metadata).encode()


def update_svg(objects, svg):
    objects[SVG_KEY] = svg
    update_metadata(objects, svg_sha256=hashlib.sha256(svg).hexdigest())


def assert_closed(client):
    assert all(response.closed == response.released == 1 for response in client.responses)
    assert all(1 <= size <= 4096 for response in client.responses for size in response.reads)


def test_approved_exact_keys_layout_and_response_cleanup(objects):
    versions = {"roll_80x200": "fixture-v1"}
    registry, client = source(objects, versions)
    versions["roll_80x200"] = "unapproved"
    layout = registry.resolve("roll_80x200")
    assert client.calls == [("approved-layouts", META_KEY), ("approved-layouts", SVG_KEY)]
    assert layout.label_code == "roll_80x200" and layout.version == "fixture-v1"
    assert (layout.width_mm, layout.height_mm, layout.dpi) == (80, 200, 203.2)
    assert layout.required_facts == ("batch", "material")
    assert layout.svg.encode() == objects[SVG_KEY]
    assert_closed(client)


@pytest.mark.parametrize("code", ["unknown", "", " ", "../roll_80x200", "roll_80x200/fixture-v1",
                                  "roll_80x200%2f..", "roll_80x200\\x", "x" * 129, None, [], 4])
def test_unapproved_or_unsafe_input_never_calls_client(objects, code):
    registry, client = source(objects)
    with pytest.raises(UnknownLabelCodeError):
        registry.resolve(code)
    assert client.calls == []


@pytest.mark.parametrize("catalog", [{"../x": "v1"}, {"x": "../v1"}, {"x": "v.1"},
                                     {"x": ""}, {"x": 1}, {4: "v1"}, {"x": "v/1"}])
def test_unsafe_application_catalog_rejected_without_client_calls(objects, catalog):
    client = FakeClient(objects)
    with pytest.raises(ValueError):
        MinioLayoutSource(client, "approved-layouts", catalog)
    assert client.calls == []


@pytest.mark.parametrize("bucket", ["../bucket", "bucket/path", "A_BUCKET", "", "ab", None])
def test_invalid_bucket_config_rejected(objects, bucket):
    with pytest.raises(ValueError):
        MinioLayoutSource(FakeClient(objects), bucket, {"roll_80x200": "fixture-v1"})


@pytest.mark.parametrize("changes", [
    {"schema_version": 2}, {"schema_version": True}, {"label_code": "other"},
    {"version": "fixture-v2"}, {"svg_sha256": "x" * 64}, {"svg_sha256": 123},
    {"svg_key": "../../secret"}, {"required_facts": None}, {"required_facts": []},
    {"required_facts": ["batch", "batch"]}, {"required_facts": ["Batch"]},
    {"required_facts": ["x" * 65]}, {"required_facts": ["x"] * 33},
    {"required_facts": "batch"}, {"required_facts": [None]},
])
def test_invalid_metadata_stops_before_svg_read(objects, changes):
    update_metadata(objects, **changes)
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError, match="approved stored layout"):
        registry.resolve("roll_80x200")
    assert client.calls == [("approved-layouts", META_KEY)]
    assert_closed(client)


@pytest.mark.parametrize("metadata", [b"", b"{", b"[]", b"null", b"\xff", b'{"x":NaN}',
                                     b'{"x":Infinity}', b'{"x":1,"x":2}'])
def test_malformed_absent_or_ambiguous_metadata_fails_closed(objects, metadata):
    objects[META_KEY] = metadata
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert len(client.calls) == 1
    assert_closed(client)


def test_missing_metadata_field_fails_closed(objects):
    metadata = json.loads(objects[META_KEY])
    del metadata["width_mm"]
    objects[META_KEY] = json.dumps(metadata).encode()
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert len(client.calls) == 1


@pytest.mark.parametrize("change", [{"width_mm": None}, {"width_mm": True}, {"height_mm": -1},
                                  {"dpi": "203.2"}, {"dpi": 1}, {"dpi": float("inf")},
                                  {"width_mm": 99999}, {"required_facts": ["different"]}])
def test_media_and_bindings_must_match_svg(objects, change):
    update_metadata(objects, **change)
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert_closed(client)


@pytest.mark.parametrize("svg", [b"", b"\xff", b"<svg", b'<svg xmlns="http://www.w3.org/2000/svg"/>',
                                b'<!DOCTYPE svg><svg/>',
                                b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'])
def test_absent_malformed_or_unsupported_svg_rejected(objects, svg):
    update_svg(objects, svg)
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert_closed(client)


def test_svg_digest_disagreement_fails_closed(objects):
    objects[SVG_KEY] += b" "
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert_closed(client)


def test_metadata_byte_boundary_and_bounded_overflow_read(objects):
    objects[META_KEY] += b" " * (MAX_METADATA_BYTES - len(objects[META_KEY]))
    registry, client = source(objects)
    assert registry.resolve("roll_80x200").version == "fixture-v1"
    assert_closed(client)
    objects[META_KEY] += b" "
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert client.responses[0].position == MAX_METADATA_BYTES + 1
    assert len(client.calls) == 1
    assert_closed(client)


def test_svg_byte_limit_stops_at_one_extra_byte(objects):
    update_svg(objects, b"x" * (MAX_SVG_BYTES + 50_000))
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert client.responses[-1].position == MAX_SVG_BYTES + 1
    assert_closed(client)


def test_svg_character_boundary_and_multibyte_overflow(objects):
    padded = objects[SVG_KEY] + b" " * (MAX_SVG_CHARACTERS - len(objects[SVG_KEY].decode()))
    update_svg(objects, padded)
    registry, client = source(objects)
    assert len(registry.resolve("roll_80x200").svg) == MAX_SVG_CHARACTERS
    assert_closed(client)
    update_svg(objects, padded + "\u00e9".encode())
    registry, client = source(objects)
    assert len(objects[SVG_KEY]) < MAX_SVG_BYTES
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert_closed(client)


@pytest.mark.parametrize("key", [META_KEY, SVG_KEY])
@pytest.mark.parametrize("failure", ["missing", "get", "read", "close", "release"])
def test_storage_failures_return_fixed_error_and_release_open_response(objects, key, failure):
    if failure == "missing":
        del objects[key]
    elif failure == "get":
        objects[key] = RuntimeError("private credentials and path")
    else:
        objects[key] = FakeResponse(objects[key], failure=RuntimeError("private") if failure == "read" else None,
                                    close_failure=failure == "close", release_failure=failure == "release")
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError) as raised:
        registry.resolve("roll_80x200")
    assert str(raised.value) == "The approved stored layout is unavailable or invalid."
    assert raised.value.code == "layout_storage_failed"
    assert raised.value.__suppress_context__
    assert_closed(client)


@pytest.mark.parametrize("chunk", ["not bytes", None, b"x" * 4097])
def test_broken_response_read_contract_fails_closed(objects, chunk):
    response = FakeResponse(objects[META_KEY])
    response.read = lambda amt: chunk
    objects[META_KEY] = response
    registry, client = source(objects)
    with pytest.raises(LayoutStorageError):
        registry.resolve("roll_80x200")
    assert_closed(client)


def forbid_effects(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Unexpected network, filesystem, or process effect")
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)


def test_resolve_and_acceptance_consume_source_with_no_external_effects(objects, monkeypatch):
    registry, client = source(objects)
    request = LabelProcessRequest(label_code="roll_80x200", mode="simulation")
    forbid_effects(monkeypatch)
    accepted = accept_label_process_request(request, registry)
    assert accepted.layout_version == "fixture-v1" and accepted.item_count == 0
    assert len(client.calls) == 2
    assert ACTIVE_LAYOUTS.resolve("roll_80x200").svg is None
    assert_closed(client)


def test_simulation_uses_stored_layout_shared_renderer_with_fake_process(objects, monkeypatch):
    registry, client = source(objects)
    image_bytes = BytesIO()
    Image.new("RGB", (640, 1600), "white").save(image_bytes, format="PNG")
    request = LabelProcessRequest(label_code="roll_80x200", mode="simulation", items=[
        {"item_id": "one", "facts": {"batch": "BATCH1", "material": "MATERIAL1"}},
    ])
    original = request.model_dump()
    forbid_effects(monkeypatch)
    monkeypatch.setattr(Path, "is_file", lambda path: True)
    calls = []

    def fake_raster(command, **kwargs):
        calls.append(command)
        assert Path(command[0]).name == "resvg.exe"
        assert b"BATCH1" in kwargs["input"] and b"MATERIAL1" in kwargs["input"]
        assert b"data-fact" not in kwargs["input"]
        return subprocess.CompletedProcess(command, 0, image_bytes.getvalue(), b"")

    monkeypatch.setattr(subprocess, "run", fake_raster)
    result, = simulate_label_request(request, registry)
    assert result.status == "CAPTURED" and result.bitmap.layout_version == "fixture-v1"
    assert [entry.status for entry in result.trace] == [
        "RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "RASTERIZING", "CAPTURED"]
    assert len(calls) == 1 and len(client.calls) == 2
    assert request.model_dump() == original
    with Image.open(BytesIO(result.bitmap.bitmap_png)) as image:
        assert image.mode == "1" and image.size == (640, 1600)
    assert_closed(client)


def test_bad_stored_layout_fails_simulation_at_resolution_without_bitmap(objects, monkeypatch):
    update_metadata(objects, version="wrong")
    registry, client = source(objects)
    request = LabelProcessRequest(label_code="roll_80x200", mode="simulation", items=[{"item_id": "one"}])
    forbid_effects(monkeypatch)
    result, = simulate_label_request(request, registry)
    assert result.bitmap is None and result.status == "FAILED"
    assert result.error.code == "invalid_template_or_facts"
    assert [entry.status for entry in result.trace] == ["RECEIVED", "RESOLVING_LAYOUT", "FAILED"]
    assert len(client.calls) == 1
