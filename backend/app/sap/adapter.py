"""Strict, effect-free adaptation of a provisional SAP fixture JSON envelope."""

from dataclasses import dataclass, field
import json
import math
import re
import unicodedata

from app.labels.models import LabelProcessRequest


MAX_ENVELOPE_BYTES = 65_536
SCHEMA_NAME = "sap-label-fixture"
CONTRACT_VERSION = 1
_FACT_KEY = re.compile(r"[a-z][a-z0-9_]{0,63}\Z")
_CONTROL_KEYS = frozenset({
    "host", "port", "device", "device_path", "printer", "printer_host",
    "printer_port", "printer_id", "destination", "target", "protocol",
    "layout", "layout_id", "layout_version", "template", "svg", "path",
    "bucket", "object_key", "url", "command", "script", "exec", "eval",
    "expression", "transform", "transformation", "rules", "code",
})
_MESSAGES = {
    "invalid_sap_envelope": "Invalid provisional SAP fixture envelope.",
    "unsupported_sap_contract": "Unsupported provisional SAP fixture contract.",
    "sap_envelope_too_large": "Provisional SAP fixture envelope exceeds its byte limit.",
}


class SapAdapterError(ValueError):
    """Fixed code/message only: never include raw input or parser details."""

    def __init__(self, code: str = "invalid_sap_envelope"):
        self.code = code
        self.message = _MESSAGES[code]
        super().__init__(self.message)


@dataclass(frozen=True)
class SapRequestMetadata:
    """External identities only; neither is an internal job/idempotency identity."""

    request_id: str = field(repr=False)
    correlation_id: str = field(repr=False)


@dataclass(frozen=True)
class AdaptedSapRequest:
    metadata: SapRequestMetadata = field(repr=False)
    request: LabelProcessRequest = field(repr=False)


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise SapAdapterError()
        result[key] = value
    return result


def _reject_constant(value):
    raise SapAdapterError()


def _exact_object(value, keys):
    if type(value) is not dict or value.keys() != keys:
        raise SapAdapterError()


def _text(value, limit, *, nonblank=False):
    if (type(value) is not str or len(value) > limit
            or any(unicodedata.category(char).startswith("C") for char in value)
            or (nonblank and not value.strip())):
        raise SapAdapterError()
    return value


def _facts(value):
    if type(value) is not dict or len(value) > 32:
        raise SapAdapterError()
    for key, fact in value.items():
        if not _FACT_KEY.fullmatch(key) or key in _CONTROL_KEYS:
            raise SapAdapterError()
        if type(fact) is str:
            _text(fact, 1024)
        elif type(fact) is bool:
            pass
        elif type(fact) is int:
            if not -(2**63) <= fact <= 2**63 - 1:
                raise SapAdapterError()
        elif type(fact) is float:
            if not math.isfinite(fact) or abs(fact) > 1e100:
                raise SapAdapterError()
        else:
            raise SapAdapterError()
    return dict(value)


def adapt_sap_fixture_json(payload: bytes) -> AdaptedSapRequest:
    """Parse bytes so duplicate keys cannot be hidden by prior dict conversion.

    This fixture schema is provisional, not a finalized SAP interface. No IO,
    resolution, rendering, job creation, persistence, or submission occurs.
    """
    if type(payload) is not bytes:
        raise SapAdapterError()
    if len(payload) > MAX_ENVELOPE_BYTES:
        raise SapAdapterError("sap_envelope_too_large")
    try:
        envelope = json.loads(payload.decode("utf-8"), object_pairs_hook=_object,
                              parse_constant=_reject_constant)
        _exact_object(envelope, {"schema", "contract_version", "request_id",
                                 "correlation_id", "label_request"})
        if (type(envelope["schema"]) is not str
                or type(envelope["contract_version"]) is not int):
            raise SapAdapterError()
        if envelope["schema"] != SCHEMA_NAME or envelope["contract_version"] != CONTRACT_VERSION:
            raise SapAdapterError("unsupported_sap_contract")
        metadata = SapRequestMetadata(
            _text(envelope["request_id"], 128, nonblank=True),
            _text(envelope["correlation_id"], 128, nonblank=True),
        )
        label = envelope["label_request"]
        _exact_object(label, {"label_code", "mode", "items"})
        code = _text(label["label_code"], 128, nonblank=True)
        if type(label["mode"]) is not str or label["mode"] not in {"simulation", "print"}:
            raise SapAdapterError()
        if type(label["items"]) is not list or not 1 <= len(label["items"]) <= 100:
            raise SapAdapterError()
        items = []
        for item in label["items"]:
            _exact_object(item, {"item_id", "facts"})
            items.append({"item_id": _text(item["item_id"], 128, nonblank=True),
                          "facts": _facts(item["facts"])})
        return AdaptedSapRequest(metadata, LabelProcessRequest(
            label_code=code, mode=label["mode"], items=items))
    except SapAdapterError:
        raise
    except (ValueError, TypeError, RecursionError, OverflowError):
        raise SapAdapterError() from None
