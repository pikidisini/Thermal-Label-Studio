"""Read approved layout versions with an injected MinIO-compatible client."""

import hashlib
import json
import re
from typing import Mapping, Protocol

from .resolver import LayoutDefinition, UnknownLabelCodeError
from .templates import TemplateError, validate_template

MAX_METADATA_BYTES = 8_192
MAX_SVG_BYTES = 65_536
MAX_SVG_CHARACTERS = 16_384
_SEGMENT = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\Z")
_FACT = re.compile(r"[a-z][a-z0-9_]{0,63}\Z")
_FIELDS = {"schema_version", "label_code", "version", "svg_sha256",
           "width_mm", "height_mm", "dpi", "required_facts"}


class ObjectResponse(Protocol):
    def read(self, amt: int) -> bytes: ...
    def close(self) -> None: ...
    def release_conn(self) -> None: ...


class ObjectClient(Protocol):
    def get_object(self, bucket_name: str, object_name: str) -> ObjectResponse: ...


class LayoutStorageError(TemplateError):
    """Unavailable or invalid stored layout; no partial layout is returned."""

    code = "layout_storage_failed"


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate metadata field.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Nonfinite JSON number.")


class MinioLayoutSource:
    """Fixed keys from a server-owned catalog, with no SDK/config initialization.

    ``versions`` maps approved label codes to exact application-selected versions.
    Objects are ``layouts/{code}/{version}/layout.json`` and ``template.svg``.
    Metadata never supplies keys. Responses are bounded, closed, and released;
    every failure exposes only a fixed message. No cache or fallback is used.
    """

    def __init__(self, client: ObjectClient, bucket_name: str,
                 versions: Mapping[str, str]) -> None:
        if (not isinstance(bucket_name, str)
                or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket_name)):
            raise ValueError("A valid application-owned bucket name is required.")
        catalog = dict(versions)
        if any(not isinstance(value, str) or not _SEGMENT.fullmatch(value)
               for pair in catalog.items() for value in pair):
            raise ValueError("Layout codes and versions must be safe application-owned segments.")
        self._client = client
        self._bucket = bucket_name
        self._versions = catalog

    def _read(self, key: str, limit: int) -> bytes:
        response = self._client.get_object(self._bucket, key)
        try:
            chunks = []
            total = 0
            while True:
                remaining = min(4_096, limit + 1 - total)
                chunk = response.read(remaining)
                if not isinstance(chunk, bytes) or len(chunk) > remaining:
                    raise ValueError("Invalid object response.")
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise ValueError("Stored object is too large.")
                chunks.append(chunk)
            if not total:
                raise ValueError("Stored object is empty.")
            return b"".join(chunks)
        finally:
            try:
                response.close()
            finally:
                response.release_conn()

    def resolve(self, label_code: str) -> LayoutDefinition:
        # Validate before lookup or key construction, including direct callers.
        if not isinstance(label_code, str) or not _SEGMENT.fullmatch(label_code):
            raise UnknownLabelCodeError("No approved layout is registered.")
        version = self._versions.get(label_code)
        if version is None:
            raise UnknownLabelCodeError("No approved layout is registered.")
        prefix = f"layouts/{label_code}/{version}"
        try:
            metadata = json.loads(
                self._read(f"{prefix}/layout.json", MAX_METADATA_BYTES).decode("utf-8"),
                object_pairs_hook=_unique_object, parse_constant=_invalid_constant,
            )
            if (not isinstance(metadata, dict) or set(metadata) != _FIELDS
                    or type(metadata["schema_version"]) is not int
                    or metadata["schema_version"] != 1
                    or metadata["label_code"] != label_code or metadata["version"] != version
                    or not isinstance(metadata["svg_sha256"], str)
                    or not re.fullmatch(r"[0-9a-f]{64}", metadata["svg_sha256"])):
                raise ValueError("Invalid metadata identity or schema.")
            required = metadata["required_facts"]
            if (not isinstance(required, list) or not 1 <= len(required) <= 32
                    or any(not isinstance(key, str) or not _FACT.fullmatch(key) for key in required)
                    or len(set(required)) != len(required)):
                raise ValueError("Invalid required facts.")
            svg_bytes = self._read(f"{prefix}/template.svg", MAX_SVG_BYTES)
            if hashlib.sha256(svg_bytes).hexdigest() != metadata["svg_sha256"]:
                raise ValueError("SVG digest does not match metadata.")
            svg = svg_bytes.decode("utf-8")
            if len(svg) > MAX_SVG_CHARACTERS:
                raise ValueError("Stored template text is too large.")
            layout = LayoutDefinition(label_code=label_code, version=version, svg=svg,
                                      width_mm=metadata["width_mm"], height_mm=metadata["height_mm"],
                                      dpi=metadata["dpi"], required_facts=tuple(required))
            validate_template(layout)
            return layout
        except Exception:
            # Do not propagate SDK exception details, object contents, or secrets.
            raise LayoutStorageError("The approved stored layout is unavailable or invalid.") from None
