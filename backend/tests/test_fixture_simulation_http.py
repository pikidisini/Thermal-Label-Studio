import base64
import builtins
from dataclasses import replace
from pathlib import Path
import socket

from fastapi import HTTPException
from pydantic import ValidationError
import pytest

from app.main import app, validate_label_process
from app.labels.models import LabelProcessRequest
from app.simulation import http
from app.simulation.service import SimulationError, TraceEntry


@pytest.fixture
def captured(real_renderer_settings):
    return http.simulate_label_request(LabelProcessRequest(
        label_code="roll_80x200", mode="simulation",
        items=[{"item_id": "fixture-1", "facts": {"batch": "BATCH-001", "material": "MATERIAL-001"}}],
    ), http.FIXTURE_LAYOUTS)


def test_route_registered_without_changing_acceptance():
    schema = app.openapi()
    assert schema["paths"]["/api/v1/simulation/fixture"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/FixtureSimulationResponse")
    assert validate_label_process(LabelProcessRequest(label_code="roll_80x200", mode="print")).status == "accepted"


@pytest.mark.parametrize("scenario,count,statuses", [
    ("sample", 1, ["CAPTURED"]), ("mixed", 3, ["CAPTURED", "FAILED", "CAPTURED"]),
])
def test_handler_uses_real_pipeline_once_per_item_and_exact_capture(monkeypatch, scenario, count, statuses, real_renderer_settings):
    actual = http.simulate_label_request
    captures = []
    requests = []

    def observe(request, registry):
        requests.append(request)
        assert registry is http.FIXTURE_LAYOUTS
        results = actual(request, registry)
        captures.extend(results)
        return results

    def forbidden(*args, **kwargs):
        pytest.fail("Fixture handler attempted file output or network")

    monkeypatch.setattr(http, "simulate_label_request", observe)
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    response = http.simulate_fixture(http.FixtureSimulationRequest(scenario=scenario))
    assert len(requests) == 1 and len(response.items) == count
    assert [item.status for item in response.items] == statuses
    for index, (item, capture) in enumerate(zip(response.items, captures)):
        assert item.item_index == index and item.item_id == f"fixture-{index + 1}"
        assert [entry.status for entry in item.trace] == [entry.status for entry in capture.trace]
        if item.preview:
            assert base64.b64decode(item.preview.png_base64, validate=True) == capture.bitmap.bitmap_png
        else:
            assert item.error.code == "invalid_template_or_facts"
    wire = response.model_dump_json()
    assert len(wire.encode()) < 300000
    assert "facts" not in response.model_dump() and "BATCH-001" not in wire
    assert "MATERIAL-001" not in wire and "template.svg" not in wire


@pytest.mark.parametrize("payload", [{}, {"scenario": None}, {"scenario": "print"}, {"scenario": 1}, {"scenario": []}, {"scenario": "sample", "facts": {}}, {"scenario": "sample", "label_code": "other"}])
def test_request_rejects_missing_unknown_and_control_fields(payload):
    with pytest.raises(ValidationError):
        http.FixtureSimulationRequest.model_validate(payload)


def test_serializer_ignores_raw_trace_messages(captured):
    item = replace(captured[0], trace=tuple(replace(entry, message="private/path/raw-facts") for entry in captured[0].trace))
    assert "private" not in http.serialize_fixture_results((item,)).model_dump_json()


def test_serializer_ignores_raw_error_messages(captured):
    failed = replace(captured[0], status="FAILED", bitmap=None,
        trace=(TraceEntry("RECEIVED", "private"), TraceEntry("FAILED", "private")),
        error=SimulationError("processing_failed", "private/password"))
    assert "private" not in http.serialize_fixture_results((failed,)).model_dump_json()


@pytest.mark.parametrize("change", ["oversize", "signature", "dimensions", "identity", "trace", "status", "error", "empty", "count"])
def test_serializer_rejects_invalid_capture(captured, change):
    item = captured[0]
    results = captured
    if change == "oversize": item = replace(item, bitmap=replace(item.bitmap, bitmap_png=b"\x89PNG\r\n\x1a\n" + b"x" * 65536))
    if change == "signature": item = replace(item, bitmap=replace(item.bitmap, bitmap_png=b"private-path"))
    if change == "dimensions": item = replace(item, bitmap=replace(item.bitmap, width_px=1))
    if change == "identity": item = replace(item, item_id="private")
    if change == "trace": item = replace(item, trace=(TraceEntry("RECEIVED", "ok"),) * 6)
    if change == "status": item = replace(item, status="FAILED")
    if change == "error": item = replace(item, error=SimulationError("processing_failed", "private"))
    if change == "empty": results = ()
    elif change == "count": results = (item,) * 4
    else: results = (item,)
    with pytest.raises(ValueError):
        http.serialize_fixture_results(results)


def test_handler_sanitizes_unexpected_failure(monkeypatch):
    def fail(*args): raise RuntimeError("private/password/path")
    monkeypatch.setattr(http, "simulate_label_request", fail)
    with pytest.raises(HTTPException) as raised:
        http.simulate_fixture(http.FixtureSimulationRequest(scenario="sample"))
    assert raised.value.status_code == 500
    assert raised.value.detail == {"code": "fixture_simulation_failed", "message": "Fixture simulation could not be completed."}
