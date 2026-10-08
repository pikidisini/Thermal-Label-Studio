"""Bounded versionless sample-envelope validation, independent of SAP intake."""
import json
import math
import re

MAX_BYTES = 2 * 1024 * 1024


def validate_payload(payload: object) -> dict:
    def text(value):
        return isinstance(value, str) and bool(value.strip())
    def safe_key(key):
        return bool(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key)) and key not in {"__proto__", "constructor", "prototype"}
    if not isinstance(payload, dict) or "contract_version" in payload or "contract_schema_version" in payload:
        raise ValueError("Invalid sample envelope.")
    if not isinstance(payload.get("sender"), dict) or not text(payload["sender"].get("system")) or not text(payload.get("request_id")):
        raise ValueError("Invalid sample envelope.")
    descriptions = payload.get("field_descriptions", {})
    if not isinstance(descriptions, dict) or len(descriptions) > 200 or any(not safe_key(k) or not isinstance(v, str) or len(v) > 256 for k, v in descriptions.items()):
        raise ValueError("Invalid descriptions.")
    items = payload.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError("Invalid items.")
    identities = set()
    for item in items:
        if not isinstance(item, dict) or not text(item.get("item_id")) or not text(item.get("label_code")):
            raise ValueError("Invalid item.")
        if item["item_id"] in identities:
            raise ValueError("Duplicate item.")
        identities.add(item["item_id"])
        copies = item.get("copies")
        if type(copies) is not int or not 1 <= copies <= 1000:
            raise ValueError("Invalid copies.")
        data = item.get("data")
        if not isinstance(data, dict) or len(data) > 200:
            raise ValueError("Invalid fields.")
        for key, value in data.items():
            if not safe_key(key) or not (value is None or type(value) in (str, bool, int, float)):
                raise ValueError("Invalid field.")
    # PostgreSQL JSONB rejects NUL and unpaired surrogates. Check all preserved
    # metadata as well as fields; no normalization loses uploaded content.
    def check(value):
        if isinstance(value, str):
            if "\x00" in value: raise ValueError("Invalid text.")
            value.encode("utf-8")
        elif isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Invalid number.")
        elif isinstance(value, dict):
            for key, entry in value.items(): check(key); check(entry)
        elif isinstance(value, list):
            for entry in value: check(entry)
    check(payload)
    if len(json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")) > MAX_BYTES:
        raise ValueError("Sample too large.")
    return payload
