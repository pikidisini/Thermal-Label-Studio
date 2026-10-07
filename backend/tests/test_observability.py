import asyncio
from contextvars import copy_context
import json
import logging
from uuid import UUID

import pytest
from starlette.requests import Request
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

from app.observability import CorrelationMiddleware, DiagnosticEvent, current_request_id, record_event, request_context
from app.main import correlated_http_error, stable_request_validation_error
from app.simulation.http import FixtureSimulationRequest, simulate_fixture


@pytest.mark.parametrize("kwargs", [
    {"event": "raw/private"}, {"item_index": -1}, {"item_index": 100},
    {"item_index": True}, {"error_code": "password"}, {"status_code": 600},
    {"status_code": True}, {"request_id": "raw/path"},
])
def test_diagnostics_reject_non_allowlisted_or_unbounded_data(kwargs):
    with request_context() as request_id:
        values = {"request_id": request_id, "event": "RECEIVED", **kwargs}
        with pytest.raises(ValueError):
            DiagnosticEvent(**values)


def test_contexts_reuse_request_identity_and_restore_without_leaking():
    assert current_request_id() is None
    with request_context() as outer:
        with request_context() as nested:
            assert nested == outer
        assert current_request_id() == outer
    assert current_request_id() is None
    with request_context() as fresh:
        assert fresh != outer
        assert UUID(fresh).version == 4


def test_fixture_events_correlate_safe_success_and_failure(caplog, real_renderer_settings):
    caplog.set_level(logging.INFO, logger="thermal_label_studio.events")
    response = simulate_fixture(FixtureSimulationRequest(scenario="mixed"))
    events = [record.diagnostic for record in caplog.records]
    assert len(events) == 14
    assert {event["request_id"] for event in events} == {response.request_id}
    assert [e["event"] for e in events if e["item_index"] == 1] == ["RECEIVED", "RESOLVING_LAYOUT", "BINDING_TEMPLATE", "FAILED"]
    assert events[8]["error_code"] == "invalid_template_or_facts"
    assert events[-1]["event"] == "CAPTURED"
    serialized = json.dumps(events)
    for secret in ["BATCH-001", "MATERIAL-001", "\"facts\"", "svg", "fixture-1"]:
        assert secret not in serialized
    assert all(record.exc_info is None for record in caplog.records)
    assert current_request_id() is None


def test_no_handler_or_output_configured_and_no_context_log(caplog):
    from app.observability import logger
    assert not logger.handlers
    caplog.set_level(logging.INFO)
    record_event("RECEIVED")
    assert not caplog.records


def test_pure_asgi_concurrent_requests_ignore_external_ids_and_correlate(caplog):
    caplog.set_level(logging.INFO, logger="thermal_label_studio.events")
    async def inner(scope, receive, send):
        identity = current_request_id()
        await asyncio.sleep(0)
        assert identity == current_request_id()
        await send({"type": "http.response.start", "status": 200, "headers": [(b"x-request-id", b"spoof")]})
        await send({"type": "http.response.body", "body": identity.encode()})
    app = CorrelationMiddleware(inner)
    results = [[], []]
    coroutines = []
    contexts = [copy_context(), copy_context()]
    for messages in results:
        async def send(message, target=messages): target.append(message)
        async def receive(): return {"type": "http.request", "body": b""}
        coroutines.append(app({"type": "http", "headers": [(b"x-request-id", b"private-password")]}, receive, send))
    # Cooperative direct coroutine stepping exercises overlapping context scopes,
    # without a loop, socket, selector or TestClient.
    for context, coroutine in zip(contexts, coroutines):
        assert context.run(coroutine.send, None) is None
    for context, coroutine in zip(contexts, coroutines):
        with pytest.raises(StopIteration): context.run(coroutine.send, None)
    ids = []
    for messages in results:
        headers = messages[0]["headers"]
        assert len([h for h in headers if h[0] == b"x-request-id"]) == 1
        identity = dict(headers)[b"x-request-id"].decode()
        assert UUID(identity).version == 4
        assert messages[1]["body"].decode() == identity
        ids.append(identity)
    assert ids[0] != ids[1]
    assert "private-password" not in caplog.text
    assert {record.diagnostic["request_id"] for record in caplog.records} == set(ids)
    assert current_request_id() is None


def test_asgi_failure_is_bounded_and_correlated(caplog):
    caplog.set_level(logging.INFO, logger="thermal_label_studio.events")
    async def fail(scope, receive, send): raise RuntimeError("private-password-path")
    messages = []
    async def send(message): messages.append(message)
    async def receive(): return {"type": "http.request"}
    coroutine = CorrelationMiddleware(fail)({"type": "http"}, receive, send)
    with pytest.raises(StopIteration): coroutine.send(None)
    body = json.loads(messages[1]["body"])
    assert messages[0]["status"] == 500
    assert dict(messages[0]["headers"])[b"x-request-id"].decode() == body["request_id"]
    assert body["detail"] == {"code": "processing_failed", "message": "Label processing failed."}
    assert "private" not in json.dumps(body) + caplog.text
    assert caplog.records[-1].diagnostic["event"] == "REQUEST_FAILED"


def test_validation_and_http_error_bodies_are_correlated():
    request = Request({"type": "http"})
    with request_context() as request_id:
        calls = [
            correlated_http_error(request, HTTPException(404, {"code": "unknown_label_code", "message": "No active layout is registered for this label_code."})),
            stable_request_validation_error(request, RequestValidationError([{"loc": ("body", "facts"), "type": "bad", "input": "private-password"}])),
        ]
        for coroutine in calls:
            try: coroutine.send(None)
            except StopIteration as complete: response = complete.value
            body = json.loads(response.body)
            assert body["request_id"] == request_id
            assert "private-password" not in response.body.decode()


def test_http_error_ignores_untrusted_exception_detail():
    with request_context() as identity:
        coroutine = correlated_http_error(Request({"type": "http"}), HTTPException(500, {"code": "fixture_simulation_failed", "message": "private-password-path"}))
        try: coroutine.send(None)
        except StopIteration as done: response = done.value
        assert "private" not in response.body.decode()
        assert json.loads(response.body)["request_id"] == identity


@pytest.mark.parametrize("outcome", ["fixture", "validation", "http_error"])
def test_nested_handler_body_matches_nonnull_asgi_header(outcome):
    async def handler(scope, receive, send):
        request = Request(scope)
        if outcome == "fixture":
            response = simulate_fixture(FixtureSimulationRequest(scenario="sample"))
            from starlette.responses import JSONResponse
            response = JSONResponse(response.model_dump())
        elif outcome == "validation":
            response = await stable_request_validation_error(request, RequestValidationError([{"loc": ("body", "scenario"), "type": "missing"}]))
        else:
            response = await correlated_http_error(request, HTTPException(500, {"code": "fixture_simulation_failed", "message": "unsafe"}))
        await response(scope, receive, send)
    messages = []
    async def send(message): messages.append(message)
    async def receive(): return {"type": "http.request", "body": b""}
    coroutine = CorrelationMiddleware(handler)({"type": "http", "headers": []}, receive, send)
    with pytest.raises(StopIteration): coroutine.send(None)
    identity = dict(messages[0]["headers"])[b"x-request-id"].decode()
    assert UUID(identity).version == 4
    assert json.loads(messages[1]["body"])["request_id"] == identity
    assert current_request_id() is None
