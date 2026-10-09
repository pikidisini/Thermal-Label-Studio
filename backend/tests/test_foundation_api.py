import ast
import builtins
import importlib
import socket
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutDefinition, LayoutRegistry, UnknownLabelCodeError
from app.labels.service import (
    InvalidLabelCodeError,
    accept_label_process_request,
    validate_label_process_request,
)
from app.main import health, request_validation_detail, validate_label_process


def fixture_request(mode: str = "simulation") -> dict:
    return {
        "label_code": "roll_80x200",
        "mode": mode,
        "items": [
            {"item_id": "SECOND", "facts": {"batch": "fixture-2"}},
            {"item_id": "FIRST", "facts": {"batch": "fixture-1"}},
        ],
    }


@pytest.mark.parametrize("mode", ["simulation", "print"])
def test_api_handler_reaches_real_service_and_accepts_fixture(monkeypatch, mode) -> None:
    main = importlib.import_module("app.main")
    calls = []

    def observe_service(request, registry):
        calls.append((request, registry))
        return accept_label_process_request(request, registry)

    monkeypatch.setattr(main, "accept_label_process_request", observe_service)
    response = validate_label_process(LabelProcessRequest.model_validate(fixture_request(mode)))

    assert response.model_dump() == {
        "status": "accepted",
        "label_code": "roll_80x200",
        "layout_version": "fixture-v1",
        "mode": mode,
        "item_count": 2,
    }
    assert len(calls) == 1
    request, registry = calls[0]
    assert registry is main.ACTIVE_LAYOUTS
    assert [item.item_id for item in request.items] == ["SECOND", "FIRST"]
    assert [item.facts for item in request.items] == [
        {"batch": "fixture-2"}, {"batch": "fixture-1"}
    ]


@pytest.mark.parametrize(
    ("payload", "code", "message"),
    [
        ({"mode": "simulation"}, "invalid_label_code", "label_code is required."),
        ({"label_code": "", "mode": "simulation"}, "invalid_label_code", "label_code must not be blank."),
        ({"label_code": " \t ", "mode": "simulation"}, "invalid_label_code", "label_code must not be blank."),
        ({"label_code": "roll_80x200", "mode": "unsupported"}, "invalid_mode", "mode must be either simulation or print."),
        ({"label_code": "roll_80x200"}, "invalid_mode", "mode must be either simulation or print."),
        ({"label_code": "roll_80x200", "mode": "simulation", "items": [{"item_id": " "}]}, "invalid_item", "item_id must not be blank."),
        ({"label_code": "roll_80x200", "mode": "simulation", "items": "bad"}, "invalid_request", "Request validation failed."),
        ({"label_code": "roll_80x200", "mode": "simulation", "items": [{"item_id": "a", "facts": []}]}, "invalid_request", "Request validation failed."),
        ({"label_code": "roll_80x200", "mode": "simulation", "extra": True}, "invalid_request", "Request validation failed."),
    ],
)
def test_invalid_request_has_stable_error_mapping(monkeypatch, payload, code, message) -> None:
    def forbidden_service(*args, **kwargs):
        pytest.fail("Invalid input reached the label service")

    monkeypatch.setattr("app.main.accept_label_process_request", forbidden_service)
    with pytest.raises(ValidationError) as raised:
        request = LabelProcessRequest.model_validate(payload)
        validate_label_process(request)
    assert request_validation_detail(raised.value.errors()) == {"code": code, "message": message}


def test_blank_label_code_fails_closed_at_handler_boundary() -> None:
    request = LabelProcessRequest.model_construct(label_code=" ", mode="print", items=[])
    with pytest.raises(HTTPException) as raised:
        validate_label_process(request)
    assert raised.value.status_code == 422
    assert raised.value.detail == {
        "code": "invalid_label_code", "message": "label_code must not be blank."
    }


@pytest.mark.parametrize("mode", ["simulation", "print"])
def test_acceptance_has_no_files_network_or_process_effects(monkeypatch, mode) -> None:
    def forbidden_effect(*args, **kwargs):
        pytest.fail("Acceptance attempted an external effect")

    monkeypatch.setattr(builtins, "open", forbidden_effect)
    monkeypatch.setattr(Path, "open", forbidden_effect)
    monkeypatch.setattr(socket.socket, "connect", forbidden_effect)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden_effect)
    monkeypatch.setattr(socket, "create_connection", forbidden_effect)
    monkeypatch.setattr(subprocess, "Popen", forbidden_effect)

    response = validate_label_process(LabelProcessRequest.model_validate(fixture_request(mode)))
    assert response.status == "accepted"


def test_foundation_imports_only_implemented_in_memory_dependencies() -> None:
    # Acceptance modules remain isolated. The main composition root may include
    # implemented HTTP routers; no foundation service gains those dependencies.
    app_root = Path(__file__).resolve().parents[1] / "app"
    foundation_modules = (
        app_root / "config.py",
        app_root / "main.py",
        app_root / "labels" / "models.py",
        app_root / "labels" / "resolver.py",
        app_root / "labels" / "service.py",
    )
    allowed = {
        "dataclasses", "typing", "pydantic", "fastapi", "fastapi.exceptions",
        "fastapi.responses", "config", "labels.models", "labels.resolver",
        "labels.service", "models", "resolver",
        "os", "pathlib", "contextlib",
    }
    for source in foundation_modules:
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert all(alias.name in allowed or (source.name == "config.py" and alias.name == "ipaddress") for alias in node.names), source
            elif isinstance(node, ast.ImportFrom):
                assert node.module in allowed or (
                        source.name == "main.py" and node.module in {"simulation.http", "simulation.editor_http", "observability", "runtime", "layouts.http", "layouts.service", "studio_datasets.http", "studio_datasets.service", "printing.http"}
                ), source
            elif isinstance(node, ast.Call):
                assert not (
                    isinstance(node.func, ast.Name) and node.func.id in {"__import__", "eval", "exec"}
                ), source
                assert not (
                    isinstance(node.func, ast.Attribute) and node.func.attr == "import_module"
                ), source


def test_health_is_available() -> None:
    assert health() == {"status": "ok"}


def test_missing_label_code_has_stable_422_error() -> None:
    detail = request_validation_detail(
        [{"type": "missing", "loc": ("body", "label_code"), "msg": "Field required"}]
    )

    assert detail == {"code": "invalid_label_code", "message": "label_code is required."}


def test_blank_label_code_is_rejected() -> None:
    with pytest.raises(ValidationError):
        LabelProcessRequest(label_code="   ", mode="simulation")


def test_unknown_layout_fails_closed_without_processing() -> None:
    with pytest.raises(HTTPException) as raised:
        validate_label_process(LabelProcessRequest(label_code="UNREGISTERED", mode="print"))

    assert raised.value.status_code == 404
    assert raised.value.detail == {
        "code": "unknown_label_code",
        "message": "No active layout is registered for this label_code.",
    }


def test_mode_validation_rejects_unsupported_values() -> None:
    detail = request_validation_detail(
        [{"type": "literal_error", "loc": ("body", "mode"), "msg": "Invalid mode"}]
    )

    assert detail == {
        "code": "invalid_mode",
        "message": "mode must be either simulation or print.",
    }


def test_item_order_is_retained_by_the_request_model() -> None:
    request = LabelProcessRequest.model_validate(
        {
            "label_code": "UNREGISTERED",
            "mode": "simulation",
            "items": [{"item_id": "SECOND"}, {"item_id": "FIRST"}],
        }
    )

    assert [item.item_id for item in request.items] == ["SECOND", "FIRST"]


def test_validation_slice_only_resolves_and_never_calls_an_output_sink() -> None:
    request = LabelProcessRequest(label_code="KNOWN", mode="simulation")
    layout = LayoutDefinition(label_code="KNOWN", version="v1")
    registry = LayoutRegistry({"KNOWN": layout})

    assert validate_label_process_request(request, registry) is layout

    with pytest.raises(UnknownLabelCodeError):
        validate_label_process_request(
            LabelProcessRequest(label_code="UNKNOWN", mode="print"), registry
        )

    with pytest.raises(InvalidLabelCodeError):
        validate_label_process_request(
            LabelProcessRequest.model_construct(label_code=" ", mode="simulation"), registry
        )
