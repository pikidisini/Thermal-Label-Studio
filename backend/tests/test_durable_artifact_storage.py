"""Comprehensive tests for DurableFilesystemArtifactStorage."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.print_jobs.artifact_storage import (
    DEFAULT_RETENTION,
    MANIFEST_SCHEMA_VERSION,
    ArtifactConflictError,
    ArtifactIntegrityError,
    ArtifactManifest,
    DurableFilesystemArtifactStorage,
)
from app.print_jobs.models import ArtifactReference


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_put_creates_atomic_payload_and_manifest(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDTEST-PAYLOAD^FS^XZ"
    expected_sha = _sha256(payload)
    payload_ref = "job-12345"

    ref = storage.put(payload_ref, "label.zpl", payload)

    assert ref.payload_ref == payload_ref
    assert ref.filename == "label.zpl"
    assert ref.media_type == "application/octet-stream"
    assert ref.byte_length == len(payload)

    # Verify files on disk
    payload_file = tmp_path / f"{payload_ref}.payload"
    manifest_file = tmp_path / f"{payload_ref}.manifest.json"

    assert payload_file.is_file()
    assert payload_file.read_bytes() == payload
    assert manifest_file.is_file()

    # Verify manifest contents
    manifest = storage.get_manifest(payload_ref)
    assert manifest.schema_version == MANIFEST_SCHEMA_VERSION
    assert manifest.payload_ref == payload_ref
    assert manifest.filename == "label.zpl"
    assert manifest.media_type == "application/octet-stream"
    assert manifest.byte_length == len(payload)
    assert manifest.sha256 == expected_sha

    created_at = datetime.fromisoformat(manifest.created_at)
    retention_expires_at = datetime.fromisoformat(manifest.retention_expires_at)
    assert created_at.tzinfo is not None
    assert retention_expires_at.tzinfo is not None
    assert retention_expires_at - created_at == DEFAULT_RETENTION
    assert retention_expires_at - created_at == timedelta(days=7)


def test_put_idempotency_same_content(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"<STX>L\n121100000500050TEST\nE\n"
    payload_ref = "job-idempotent"

    ref1 = storage.put(payload_ref, "label.ipl", payload)
    ref2 = storage.put(payload_ref, "label.ipl", payload)

    assert ref1 == ref2
    assert storage.read_verified(ref1, _sha256(payload)) == payload


def test_put_conflict_different_filename(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"SAME-PAYLOAD-DIFFERENT-FILENAME"
    payload_ref = "job-conflict-fn"

    ref1 = storage.put(payload_ref, "label.zpl", payload)
    assert ref1.filename == "label.zpl"

    with pytest.raises(ArtifactConflictError, match="already exists"):
        storage.put(payload_ref, "label.ipl", payload)


def test_put_conflict_different_bytes(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload_ref = "job-conflict-bytes"

    storage.put(payload_ref, "label.zpl", b"FIRST_PAYLOAD")

    with pytest.raises(ArtifactConflictError, match="already exists"):
        storage.put(payload_ref, "label.zpl", b"SECOND_PAYLOAD")


def test_put_rejects_unallowed_filename(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"TEST"

    with pytest.raises(ArtifactIntegrityError, match="filename must be one of"):
        storage.put("job-bad-fn-1", "malicious.exe", payload)

    with pytest.raises(ArtifactIntegrityError, match="filename must be one of"):
        storage.put("job-bad-fn-2", "../label.zpl", payload)

    with pytest.raises(ArtifactIntegrityError, match="filename must be one of"):
        storage.put("job-bad-fn-3", "label.txt", payload)


def test_read_verified_success(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDVERIFIED^FS^XZ"
    payload_ref = "job-read-ok"
    ref = storage.put(payload_ref, "label.zpl", payload)

    checksum = _sha256(payload)
    verified = storage.read_verified(ref, checksum)
    assert verified == payload
    assert storage.checksum(payload) == checksum


def test_read_verified_corrupted_payload(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDCORRUPT_ME^FS^XZ"  # 22 bytes
    payload_ref = "job-corrupt-payload"
    ref = storage.put(payload_ref, "label.zpl", payload)

    payload_file = tmp_path / f"{payload_ref}.payload"

    # Tamper with payload (exact same 22 bytes length to test sha256 mismatch)
    payload_file.write_bytes(b"^XA^FDCORRUPTED!^FS^XZ")

    with pytest.raises(ArtifactIntegrityError, match="artifact SHA-256 mismatch"):
        storage.read_verified(ref, _sha256(payload))


def test_read_verified_corrupted_byte_length(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDCORRUPT_ME^FS^XZ"
    payload_ref = "job-corrupt-length"
    ref = storage.put(payload_ref, "label.zpl", payload)

    payload_file = tmp_path / f"{payload_ref}.payload"

    # Tamper with payload length
    payload_file.write_bytes(b"^XA^FDMUCH_LONGER_TAMPERED_PAYLOAD^FS^XZ")

    with pytest.raises(ArtifactIntegrityError, match="artifact byte_length mismatch"):
        storage.read_verified(ref, _sha256(payload))


def test_read_verified_corrupted_manifest_sha(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDMAP_ME^FS^XZ"
    payload_ref = "job-corrupt-manifest-sha"
    ref = storage.put(payload_ref, "label.zpl", payload)

    manifest_file = tmp_path / f"{payload_ref}.manifest.json"

    # Tamper with manifest sha256
    manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
    manifest_data["sha256"] = "0" * 64
    manifest_file.write_text(json.dumps(manifest_data), encoding="utf-8")

    with pytest.raises(ArtifactIntegrityError, match="manifest SHA-256 mismatch"):
        storage.read_verified(ref, _sha256(payload))


def test_read_verified_missing_manifest(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    payload = b"^XA^FDMISSING_MANIFEST^FS^XZ"
    payload_ref = "job-missing-manifest"
    ref = storage.put(payload_ref, "label.zpl", payload)

    manifest_file = tmp_path / f"{payload_ref}.manifest.json"
    manifest_file.unlink()

    with pytest.raises(ArtifactIntegrityError, match="artifact manifest is missing"):
        storage.read_verified(ref, _sha256(payload))


def test_path_traversal_rejection(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)

    bad_refs = [
        "../etc/passwd",
        "..\\windows\\system32",
        "/absolute/path",
        ":illegal:chars",
        "has space",
        "has?query",
    ]

    for bad_ref in bad_refs:
        with pytest.raises(ArtifactIntegrityError):
            storage.put(bad_ref, "label.zpl", b"TEST")

        # Bypass pydantic validation using model_construct to test storage-layer protection
        constructed_ref = ArtifactReference.model_construct(
            payload_ref=bad_ref,
            filename="label.zpl",
            media_type="application/octet-stream",
            byte_length=4,
        )
        with pytest.raises(ArtifactIntegrityError):
            storage.read_verified(constructed_ref, "dummy-sha")


def test_custom_retention(tmp_path: Path) -> None:
    custom_retention = timedelta(days=14)
    storage = DurableFilesystemArtifactStorage(tmp_path, retention=custom_retention)
    payload = b"^XA^FDCUSTOM_RETENTION^FS^XZ"
    payload_ref = "job-custom-retention"

    ref = storage.put(payload_ref, "label.zpl", payload)
    manifest = storage.get_manifest(payload_ref)

    created = datetime.fromisoformat(manifest.created_at)
    expires = datetime.fromisoformat(manifest.retention_expires_at)
    assert expires - created == custom_retention
    assert expires - created == timedelta(days=14)


def test_staging_directory_cleanup(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    staging_dir = tmp_path / ".staging"

    assert staging_dir.is_dir()
    # Before put, staging dir is empty
    assert list(staging_dir.iterdir()) == []

    storage.put("job-staging-test", "label.zpl", b"^XA^FDTEST^FS^XZ")

    # After atomic put, staging temp files must be cleanly moved or removed
    assert list(staging_dir.iterdir()) == []
