"""Canonical data admission; no storage, raster or transport effects."""
import json
import math
import re
MAX_BYTES = 2 * 1024 * 1024
MAX_SAFE_INTEGER = 9007199254740991
KEY = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")
IDENTITY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}\Z")
CODE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")
FORBIDDEN = {"__proto__", "constructor", "prototype"}
class LabelDataError(ValueError):
    def __init__(self, code="invalid_request"):
        self.code = code
        super().__init__("Label data validation failed.")
def text(value, limit=4096, byte_limit=16384):
    if type(value) is not str or len(value) > limit or "\x00" in value:
        raise LabelDataError()
    try:
        encoded = value.encode("utf-8")
    except UnicodeError:
        raise LabelDataError() from None
    if len(encoded) > byte_limit:
        raise LabelDataError()
def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise LabelDataError("duplicate_member")
        if key in FORBIDDEN:
            raise LabelDataError()
        result[key] = value
    return result
def decode_json(body: bytes, *, limit=MAX_BYTES):
    if len(body) > limit:
        raise LabelDataError("request_too_large")
    try:
        raw = body.decode("utf-8", errors="strict")
        if raw.startswith("\ufeff"):
            raise LabelDataError("malformed_json")
        depth=0
        quoted=False
        escaped=False
        for char in raw:
            if quoted:
                if escaped:
                    escaped=False
                elif char == "\\":
                    escaped=True
                elif char == '"':
                    quoted=False
            elif char == '"':
                quoted=True
            elif char in "[{":
                depth += 1
                if depth > 32:
                    raise LabelDataError("malformed_json")
            elif char in "]}":
                depth -= 1
        return json.loads(raw, object_pairs_hook=_pairs, parse_constant=lambda _: (_ for _ in ()).throw(LabelDataError("malformed_json")))
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise LabelDataError("malformed_json") from None
def shape(value, required, optional=()):
    if type(value) is not dict or not required <= set(value) or set(value) - required - set(optional):
        raise LabelDataError()
def identity(value, pattern=IDENTITY):
    text(value,128,128)
    if not pattern.fullmatch(value):
        raise LabelDataError()
def fields(value, descriptions=False):
    if type(value) is not dict or len(value)>200:
        raise LabelDataError()
    for key, entry in value.items():
        if type(key) is not str or not KEY.fullmatch(key) or key in FORBIDDEN:
            raise LabelDataError()
        if descriptions:
            text(entry,256,1024)
        elif type(entry) is str:
            text(entry)
        elif type(entry) in (int,float):
            try:
                number=float(entry)
            except (OverflowError,ValueError):
                raise LabelDataError() from None
            if not math.isfinite(number) or number.is_integer() and abs(number)>MAX_SAFE_INTEGER:
                raise LabelDataError()
        elif entry is not None and type(entry) is not bool:
            raise LabelDataError()
def validate_payload(payload):
    shape(payload,{"sender","request_id","mode","items"},{"field_descriptions"})
    shape(payload["sender"],{"system"})
    identity(payload["sender"]["system"])
    identity(payload["request_id"])
    if type(payload["mode"]) is not str or payload["mode"] not in ("simulation","print"):
        raise LabelDataError("invalid_mode")
    if "field_descriptions" in payload:
        fields(payload["field_descriptions"],True)
    items=payload["items"]
    if type(items) is not list or not 1<=len(items)<=100:
        raise LabelDataError()
    seen=set()
    for item in items:
        shape(item,{"item_id","label_code","copies","data"})
        identity(item["item_id"])
        identity(item["label_code"],CODE)
        if item["item_id"] in seen:
            raise LabelDataError()
        seen.add(item["item_id"])
        copies=item["copies"]
        if type(copies) not in (int,float) or not 1<=copies<=999 or copies!=int(copies):
            raise LabelDataError("invalid_copies")
        fields(item["data"])
    if reserved_size(payload) > MAX_BYTES:
        raise LabelDataError("request_too_large")
    return payload
def admit_json(body: bytes):
    return validate_payload(decode_json(body))

def reserved_size(value):
    """Cross-language upper reservation: numbers always 32 bytes, not float repr."""
    if type(value) is str:
        return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    if type(value) is dict:
        return 2 + max(0, len(value) - 1) + sum(reserved_size(k) + 1 + reserved_size(v) for k, v in value.items())
    if type(value) is list:
        return 2 + max(0, len(value) - 1) + sum(reserved_size(v) for v in value)
    if type(value) is bool:
        return 4 if value else 5
    if value is None:
        return 4
    return 32
