import ast
import builtins
import json
from pathlib import Path
import socket
import subprocess

import pytest

from app.labels.models import LabelProcessRequest
from app.labels.resolver import LayoutDefinition, LayoutRegistry
from app.sap import adapter
from app.sap.adapter import MAX_ENVELOPE_BYTES, SapAdapterError, adapt_sap_fixture_json
from app.simulation.service import simulate_label_request


FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def envelope():
    return json.loads((FIXTURES / "sap" / "roll_80x200.provisional-v1.json").read_bytes())


def encode(envelope):
    return json.dumps(envelope, ensure_ascii=False).encode("utf-8")


def reject(payload, code="invalid_sap_envelope"):
    with pytest.raises(SapAdapterError) as raised:
        adapt_sap_fixture_json(payload)
    assert raised.value.code == code
    assert str(raised.value) == adapter._MESSAGES[code]
    assert len(str(raised.value)) < 100
    assert "private" not in str(raised.value)


def test_fixture_maps_exact_existing_internal_request(envelope):
    result = adapt_sap_fixture_json(encode(envelope))
    expected = LabelProcessRequest.model_validate_json(
        (FIXTURES / "payloads" / "roll_80x200.json").read_bytes())
    assert result.request == expected
    assert result.metadata.request_id == envelope["request_id"]
    assert result.metadata.correlation_id == envelope["correlation_id"]
    assert set(result.request.model_dump()) == {"label_code", "mode", "items"}
    assert "external-fixture" not in repr(result)


def test_order_types_and_exact_raw_values_are_preserved_without_source_aliasing(envelope):
    facts = {"text": "  001234 é  ", "empty": "", "flag": False, "count": 7,
             "decimal": 2.5, "negative_zero": -0.0}
    envelope["label_request"] = {"label_code": " unknown exact code ", "mode": "print",
        "items": [{"item_id": " SECOND ", "facts": facts},
                  {"item_id": "FIRST", "facts": {"text": "0001"}}]}
    snapshot = encode(envelope)
    result = adapt_sap_fixture_json(snapshot)
    assert result.request.model_dump() == envelope["label_request"]
    for key, value in facts.items():
        assert type(result.request.items[0].facts[key]) is type(value)
    assert encode(envelope) == snapshot
    envelope["label_request"]["items"][0]["facts"]["text"] = "changed"
    assert result.request.items[0].facts["text"] == "  001234 é  "


@pytest.mark.parametrize("payload", [None, {}, [], "{}", bytearray(b"{}"), b"", b"{", b"[]",
    b"null", b"true", b"\xff", b"\xef\xbb\xbf{}", b"{} {}", b"[[[" * 1000])
def test_malformed_or_wrong_boundary_type(payload):
    reject(payload)


@pytest.mark.parametrize("field,value,code", [
    ("schema", "future-sap", "unsupported_sap_contract"),
    ("contract_version", 2, "unsupported_sap_contract"),
    ("contract_version", "1", "invalid_sap_envelope"),
    ("contract_version", True, "invalid_sap_envelope"),
    ("contract_version", 1.0, "invalid_sap_envelope"),
    ("schema", None, "invalid_sap_envelope"),
])
def test_schema_identity_is_exact_and_version_is_not_coerced(envelope, field, value, code):
    envelope[field] = value
    reject(encode(envelope), code)


@pytest.mark.parametrize("level", ["envelope", "request", "item"])
def test_all_required_fields_missing_or_null_are_rejected(envelope, level):
    obj = {"envelope": envelope, "request": envelope["label_request"],
           "item": envelope["label_request"]["items"][0]}[level]
    for key in list(obj):
        saved = obj.pop(key)
        reject(encode(envelope))
        obj[key] = None
        reject(encode(envelope))
        obj[key] = saved


@pytest.mark.parametrize("key", ["unexpected", "host", "port", "device", "transform", "layout_version"])
@pytest.mark.parametrize("level", ["envelope", "request", "item", "facts"])
def test_unknown_and_control_fields_cannot_be_supplied(envelope, level, key):
    obj = {"envelope": envelope, "request": envelope["label_request"],
           "item": envelope["label_request"]["items"][0],
           "facts": envelope["label_request"]["items"][0]["facts"]}[level]
    obj[key] = "private-unsafe"
    if level == "facts" and key == "unexpected":
        assert adapt_sap_fixture_json(encode(envelope)).request.items[0].facts[key] == "private-unsafe"
        return  # Arbitrary bounded business scalar names are intentional.
    reject(encode(envelope))


@pytest.mark.parametrize("key", sorted(adapter._CONTROL_KEYS) + ["Host", "a.b", "$eval", "__proto__", "a" * 65, "line\nbreak"])
def test_reserved_or_unsafe_fact_names(envelope, key):
    envelope["label_request"]["items"][0]["facts"][key] = "private"
    reject(encode(envelope))


@pytest.mark.parametrize("value", [None, [], {}, ["x"], {"host": "x"}, 2**63, -(2**63)-1,
    float("nan"), float("inf"), -float("inf"), 1e101, "x" * 1025, "a\nb", "a\x00b", "a\x7fb", "a\u202eb", "\ud800"])
def test_unsafe_scalar_values(envelope, value):
    envelope["label_request"]["items"][0]["facts"]["test"] = value
    payload = json.dumps(envelope).encode("utf-8")
    reject(payload)


@pytest.mark.parametrize("path", [("request_id",), ("correlation_id",),
    ("label_request", "label_code"), ("label_request", "items", 0, "item_id")])
@pytest.mark.parametrize("value", ["", "  ", "x" * 129, 1, True, [], "line\nbreak"])
def test_ids_and_label_codes_are_nonblank_bounded_exact_strings(envelope, path, value):
    current = envelope
    for part in path[:-1]:
        current = current[part]
    current[path[-1]] = value
    reject(encode(envelope))


@pytest.mark.parametrize("field,value", [("mode", "SIMULATION"), ("mode", 1),
    ("mode", {}), ("items", []), ("items", {}), ("items", "x"),
    ("items", [None]), ("items", [1]), ("items", [{"item_id": "x", "facts": []}])])
def test_invalid_request_structure(envelope, field, value):
    envelope["label_request"][field] = value
    reject(encode(envelope))


@pytest.mark.parametrize("target", ["envelope", "request", "item", "facts"])
def test_duplicate_keys_are_rejected_at_every_object_depth(envelope, target):
    text = encode(envelope).decode("utf-8")
    old, new = {
        "envelope": ('"request_id":', '"request_id":"private", "request_id":'),
        "request": ('"mode":', '"mode":"print", "mode":'),
        "item": ('"item_id":', '"item_id":"private", "item_id":'),
        "facts": ('"batch":', '"batch":"private", "batch":'),
    }[target]
    reject(text.replace(old, new).encode("utf-8"))


def test_finite_json_overflow_is_rejected(envelope):
    reject(encode(envelope).replace(b'"BATCH-001"', b'1e9999'))


def test_all_numeric_text_count_limits_accept_boundary_and_reject_overflow(envelope):
    envelope["request_id"] = envelope["correlation_id"] = "x" * 128
    envelope["label_request"]["label_code"] = "x" * 128
    facts = {"a" * 64: "x" * 1024, "min": -(2**63), "max": 2**63 - 1,
             "float_min": -1e100, "float_max": 1e100}
    facts.update({f"value_{index}": True for index in range(27)})
    envelope["label_request"]["items"] = [{"item_id": "x" * 128, "facts": facts}]
    assert adapt_sap_fixture_json(encode(envelope)).request.items[0].facts == facts
    facts["overflow"] = 1
    reject(encode(envelope))
    facts.clear()
    envelope["label_request"]["items"] *= 100
    assert len(adapt_sap_fixture_json(encode(envelope)).request.items) == 100
    envelope["label_request"]["items"].append({"item_id": "x", "facts": {}})
    reject(encode(envelope))


def test_utf8_byte_limit_checks_before_json_parse(envelope, monkeypatch):
    payload = encode(envelope)
    at_limit = payload + b" " * (MAX_ENVELOPE_BYTES - len(payload))
    assert adapt_sap_fixture_json(at_limit).request.label_code == "roll_80x200"
    monkeypatch.setattr(adapter.json, "loads", lambda *a, **k: pytest.fail("Oversize was parsed"))
    reject(at_limit + b" ", "sap_envelope_too_large")


def test_deep_nested_json_has_bounded_failure():
    reject(b"[" * 2000 + b"0" + b"]" * 2000)


def test_adapter_has_no_file_network_process_or_logging_effects(envelope, monkeypatch, caplog):
    payload = encode(envelope)
    def forbidden(*args, **kwargs):
        pytest.fail("Adapter attempted external effects")
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    assert adapt_sap_fixture_json(payload).request.label_code == "roll_80x200"
    reject(payload.replace(b'"BATCH-001"', b'null'))
    assert not caplog.records


def test_adapter_imports_only_pure_dependencies():
    allowed = {"dataclasses", "json", "math", "re", "unicodedata", "app.labels.models"}
    for node in ast.walk(ast.parse(Path(adapter.__file__).read_text())):
        if isinstance(node, ast.Import):
            assert all(alias.name in allowed for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.module in allowed
        elif isinstance(node, ast.Call):
            assert not (isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "__import__"})
            assert not (isinstance(node.func, ast.Attribute) and node.func.attr == "import_module")


def test_adapted_request_uses_existing_simulation_and_rendering_pipeline(envelope, real_renderer_settings):
    metadata = json.loads((FIXTURES / "templates" / "roll_80x200.json").read_text())
    metadata["required_facts"] = tuple(metadata["required_facts"])
    layout = LayoutDefinition(**metadata, svg=(FIXTURES / "templates" / "roll_80x200.svg").read_text())
    registry = LayoutRegistry({layout.label_code: layout})
    adapted = adapt_sap_fixture_json(encode(envelope))
    internal = LabelProcessRequest.model_validate_json(
        (FIXTURES / "payloads" / "roll_80x200.json").read_bytes())
    actual, = simulate_label_request(adapted.request, registry)
    expected, = simulate_label_request(internal, registry)
    assert actual.status == expected.status == "CAPTURED"
    assert actual.item_id == expected.item_id and actual.trace == expected.trace
    assert actual.bitmap == expected.bitmap


def test_unknown_label_is_passed_exactly_then_rejected_by_server_resolution(envelope):
    envelope["label_request"]["label_code"] = "unknown-label"
    request = adapt_sap_fixture_json(encode(envelope)).request
    assert request.label_code == "unknown-label"
    result, = simulate_label_request(request, LayoutRegistry({}))
    assert result.status == "FAILED" and result.error.code == "unknown_label_code"
