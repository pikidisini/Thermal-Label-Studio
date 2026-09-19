"""Path-safe artifact storage for temporary tests or a configured durable root."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from threading import RLock

from .models import ArtifactReference, PrinterLanguage


class ArtifactIntegrityError(ValueError):
    """Raised when an artifact is missing or fails integrity checks."""


class ArtifactConflictError(ArtifactIntegrityError):
    """Raised when an existing payload_ref is reused for different bytes."""


class TemporaryArtifactStorage:
    """Stores artifacts below an injected trusted root, never from a payload path."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._metadata: dict[str, tuple[str, str]] = {}

    @staticmethod
    def _validate_ref(payload_ref: str) -> None:
        if re.fullmatch(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", payload_ref) is None:
            raise ArtifactIntegrityError("payload_ref must be an opaque identifier")

    def _path_for(self, payload_ref: str) -> Path:
        self._validate_ref(payload_ref)
        path = (self.root / f"{payload_ref}.payload").resolve()
        if path.parent != self.root:
            raise ArtifactIntegrityError("artifact path escapes temporary storage")
        return path

    def _metadata_path_for(self, payload_ref: str) -> Path:
        return self._path_for(payload_ref).with_suffix(".metadata.json")

    def put(self, payload_ref: str, filename: str, payload: bytes) -> ArtifactReference:
        artifact = ArtifactReference(
            payload_ref=payload_ref,
            filename=filename,
            media_type="application/octet-stream",
            byte_length=len(payload),
        )
        path = self._path_for(payload_ref)
        metadata_path = self._metadata_path_for(payload_ref)
        checksum = self.checksum(payload)
        with self._lock:
            existing_metadata = self._metadata.get(payload_ref)
            if path.exists():
                if existing_metadata is None and metadata_path.exists():
                    try:
                        persisted = json.loads(metadata_path.read_text(encoding="utf-8"))
                        existing_metadata = (persisted["filename"], persisted["sha256"])
                    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
                        raise ArtifactIntegrityError("existing artifact metadata is invalid") from exc
                if existing_metadata is None:
                    raise ArtifactIntegrityError("existing artifact metadata is unavailable")
                existing_filename, existing_checksum = existing_metadata
                actual_checksum = self.checksum(path.read_bytes())
                if (
                    existing_filename != filename
                    or existing_checksum != checksum
                    or actual_checksum != checksum
                ):
                    raise ArtifactConflictError("payload_ref already contains different content or filename")
                self._metadata[payload_ref] = existing_metadata
                return artifact
            payload_temp = path.with_suffix(".payload.tmp")
            metadata_temp = metadata_path.with_suffix(".json.tmp")
            payload_temp.write_bytes(payload)
            metadata_temp.write_text(
                json.dumps({"filename": filename, "sha256": checksum}, sort_keys=True),
                encoding="utf-8",
            )
            os.replace(payload_temp, path)
            os.replace(metadata_temp, metadata_path)
            self._metadata[payload_ref] = (filename, checksum)
            return artifact

    @staticmethod
    def checksum(payload: bytes) -> str:
        """Return the lowercase SHA-256 checksum of the actual payload bytes."""
        return hashlib.sha256(payload).hexdigest()

    def read_verified(self, artifact: ArtifactReference, expected_sha256: str) -> bytes:
        path = self._path_for(artifact.payload_ref)
        try:
            payload = path.read_bytes()
        except FileNotFoundError as exc:
            raise ArtifactIntegrityError("artifact payload is missing") from exc
        if len(payload) != artifact.byte_length:
            raise ArtifactIntegrityError("artifact byte_length mismatch")
        actual_sha256 = hashlib.sha256(payload).hexdigest()
        if actual_sha256 != expected_sha256:
            raise ArtifactIntegrityError("artifact SHA-256 mismatch")
        return payload
