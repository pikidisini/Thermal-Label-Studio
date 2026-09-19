"""Comprehensive tests for DurableFilesystemArtifactStorage."""

from __future__ import annotations

import concurrent.futures
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


def _worker_put_artifact(
    root_str: str, payload_ref: str, filename: str, payload: bytes
) -> tuple[bool, str]:
    """Top-level worker function for multiprocessing tests."""
    try:
        storage = DurableFilesystemArtifactStorage(Path(root_str))
        ref = storage.put(payload_ref, filename, payload)
        return True, ref.payload_ref
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


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


def test_root_relative_path_rejected() -> None:
    with pytest.raises(ArtifactIntegrityError, match="artifact root must be an absolute path"):
        DurableFilesystemArtifactStorage(Path("relative/storage/path"))


def test_symlink_payload_rejected(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    target_outside = tmp_path.parent / "outside_payload_target.txt"
    target_outside.write_bytes(b"OUTSIDE_PAYLOAD")
    symlink_path = tmp_path / "job-symlink-payload.payload"

    try:
        symlink_path.symlink_to(target_outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation is not permitted or supported in this environment")

    # Trying to put to a ref where payload is already a symlink must fail
    with pytest.raises(ArtifactIntegrityError, match="symlinks are not permitted"):
        storage.put("job-symlink-payload", "label.zpl", b"TEST")

    # Trying to read_verified from a symlink must fail
    ref = ArtifactReference.model_construct(
        payload_ref="job-symlink-payload",
        filename="label.zpl",
        media_type="application/octet-stream",
        byte_length=len(b"OUTSIDE_PAYLOAD"),
    )
    with pytest.raises(ArtifactIntegrityError, match="symlinks are not permitted"):
        storage.read_verified(ref, _sha256(b"OUTSIDE_PAYLOAD"))


def test_symlink_manifest_rejected(tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    target_outside = tmp_path.parent / "outside_manifest.json"
    target_outside.write_text("{}", encoding="utf-8")
    symlink_path = tmp_path / "job-symlink-manifest.manifest.json"

    try:
        symlink_path.symlink_to(target_outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation is not permitted or supported in this environment")

    ref = ArtifactReference.model_construct(
        payload_ref="job-symlink-manifest",
        filename="label.zpl",
        media_type="application/octet-stream",
        byte_length=4,
    )
    with pytest.raises(ArtifactIntegrityError, match="symlinks are not permitted"):
        storage.read_verified(ref, "dummy")


def test_symlink_mocked_rejection(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path)
    monkeypatch.setattr(Path, "is_symlink", lambda self: True)

    with pytest.raises(ArtifactIntegrityError, match="symlinks are not permitted"):
        storage.put("job-mock-symlink", "label.zpl", b"TEST")

    ref = ArtifactReference.model_construct(
        payload_ref="job-mock-symlink",
        filename="label.zpl",
        media_type="application/octet-stream",
        byte_length=4,
    )
    with pytest.raises(ArtifactIntegrityError, match="symlinks are not permitted"):
        storage.read_verified(ref, "dummy")


def test_multiprocess_concurrent_put_same_content_idempotent(tmp_path: Path) -> None:
    payload_ref = "job-multiprocess-idempotent"
    payload = b"^XA^FDMULTIPROCESS-IDEMPOTENT^FS^XZ"

    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(_worker_put_artifact, str(tmp_path), payload_ref, "label.zpl", payload),
            executor.submit(_worker_put_artifact, str(tmp_path), payload_ref, "label.zpl", payload),
        ]
        results = [f.result(timeout=15) for f in futures]

    for success, message in results:
        assert success is True, f"Process failed: {message}"
        assert message == payload_ref

    storage = DurableFilesystemArtifactStorage(tmp_path)
    ref = ArtifactReference(
        payload_ref=payload_ref,
        filename="label.zpl",
        media_type="application/octet-stream",
        byte_length=len(payload),
    )
    assert storage.read_verified(ref, _sha256(payload)) == payload


def test_multiprocess_concurrent_put_different_content_conflict(tmp_path: Path) -> None:
    payload_ref = "job-multiprocess-conflict"
    payload_a = b"^XA^FDPAYLOAD-A^FS^XZ"
    payload_b = b"^XA^FDPAYLOAD-B^FS^XZ"

    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(_worker_put_artifact, str(tmp_path), payload_ref, "label.zpl", payload_a),
            executor.submit(_worker_put_artifact, str(tmp_path), payload_ref, "label.zpl", payload_b),
        ]
        results = [f.result(timeout=15) for f in futures]

    successes = [r for r in results if r[0] is True]
    conflicts = [r for r in results if r[0] is False and "ArtifactConflictError" in r[1]]

    assert len(successes) == 1, f"Expected exactly 1 success, got results: {results}"
    assert len(conflicts) == 1, f"Expected exactly 1 conflict, got results: {results}"
