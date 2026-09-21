"""Path-safe artifact storage for temporary tests or a configured durable root."""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Mapping, Protocol

from .models import ArtifactReference, PrinterLanguage

DEFAULT_RETENTION = timedelta(days=7)
MANIFEST_SCHEMA_VERSION = "1.0"
ALLOWED_FILENAMES = frozenset({"label.ipl", "label.zpl"})


class ArtifactIntegrityError(ValueError):
    """Raised when an artifact is missing or fails integrity checks."""


class ArtifactConflictError(ArtifactIntegrityError):
    """Raised when an existing payload_ref is reused for different bytes."""


@dataclass(frozen=True)
class ArtifactManifest:
    """Integrity manifest stored alongside the binary artifact on trusted durable storage."""

    schema_version: str
    payload_ref: str
    filename: str
    media_type: str
    byte_length: int
    sha256: str
    created_at: str
    retention_expires_at: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> ArtifactManifest:
        try:
            return cls(
                schema_version=str(data["schema_version"]),
                payload_ref=str(data["payload_ref"]),
                filename=str(data["filename"]),
                media_type=str(data["media_type"]),
                byte_length=int(data["byte_length"]),
                sha256=str(data["sha256"]),
                created_at=str(data["created_at"]),
                retention_expires_at=str(data["retention_expires_at"]),
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise ArtifactIntegrityError("malformed artifact manifest") from exc


class ArtifactStorage(Protocol):
    """Storage boundary for label print artifacts."""

    def put(self, payload_ref: str, filename: str, payload: bytes) -> ArtifactReference: ...

    def read_verified(self, artifact: ArtifactReference, expected_sha256: str) -> bytes: ...

    @staticmethod
    def checksum(payload: bytes) -> str: ...


def _is_reparse_or_link(path: Path) -> bool:
    """Return True if path is a symbolic link or Windows reparse point (junction)."""
    if path.is_symlink():
        return True
    if hasattr(os, "readlink"):
        try:
            os.readlink(path)
            return True
        except (OSError, ValueError):
            pass
    return False


if os.name == "nt":
    import msvcrt

    def _try_lock_fd(fd: int) -> bool:
        try:
            msvcrt.locking(fd, msvcrt.LK_NBRLCK, 1)
            return True
        except OSError:
            return False

    def _unlock_fd(fd: int) -> None:
        try:
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        except OSError:
            pass

else:
    import fcntl

    def _try_lock_fd(fd: int) -> bool:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except (BlockingIOError, OSError):
            return False

    def _unlock_fd(fd: int) -> None:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass


class _ProcessLock:
    """Inter-process lock bound to the operating system process lifetime.

    On POSIX systems, this uses fcntl.flock(LOCK_EX | LOCK_NB).
    On Windows systems, this uses msvcrt.locking(LK_NBRLCK, 1).
    When the process terminates (or crashes), the OS automatically releases the lock.
    Stale locks are never taken over based on timestamps/mtime; if a lock cannot
    be acquired within the timeout, the operation fails closed without modifying
    or unlinking the active owner's lock.
    """

    def __init__(self, lock_file_path: Path, timeout: float = 10.0, poll_interval: float = 0.02) -> None:
        self.lock_file_path = lock_file_path
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._acquired = False
        self._file = None

    def acquire(self) -> None:
        deadline = time.monotonic() + self.timeout
        # Open in append/read-binary mode so existing file is not truncated
        f = open(self.lock_file_path, "a+b")
        while True:
            f.seek(0)
            if _try_lock_fd(f.fileno()):
                self._file = f
                self._acquired = True
                return
            if time.monotonic() >= deadline:
                f.close()
                raise TimeoutError(f"timed out waiting for process lock on {self.lock_file_path.name}")
            time.sleep(self.poll_interval)

    def release(self) -> None:
        if self._acquired and self._file is not None:
            try:
                self._file.seek(0)
                _unlock_fd(self._file.fileno())
            finally:
                self._file.close()
                self._file = None
                self._acquired = False
                try:
                    self.lock_file_path.unlink(missing_ok=True)
                except OSError:
                    pass

    def __enter__(self) -> "_ProcessLock":
        self.acquire()
        return self

    def __exit__(self, *exc: object) -> None:
        self.release()


class DurableFilesystemArtifactStorage:
    """Durable filesystem volume adapter with atomic staging, fsync, and integrity manifests."""

    def __init__(
        self,
        root: Path,
        *,
        retention: timedelta = DEFAULT_RETENTION,
    ) -> None:
        if retention <= timedelta(0):
            raise ValueError("retention must be positive")
        if not root.is_absolute():
            raise ArtifactIntegrityError("artifact root must be an absolute path")
        self.root = root.resolve()
        if _is_reparse_or_link(self.root):
            raise ArtifactIntegrityError("artifact root must not be a symlink or junction")
        self.root.mkdir(parents=True, exist_ok=True)

        self.staging_dir = self.root / ".staging"
        if self.staging_dir.exists():
            if _is_reparse_or_link(self.staging_dir):
                raise ArtifactIntegrityError("staging directory must not be a symlink or junction")
            if self.staging_dir.resolve() != self.root / ".staging":
                raise ArtifactIntegrityError("staging directory escapes storage root")
        else:
            self.staging_dir.mkdir(parents=True, exist_ok=True)
            if _is_reparse_or_link(self.staging_dir):
                raise ArtifactIntegrityError("staging directory must not be a symlink or junction")
            if self.staging_dir.resolve() != self.root / ".staging":
                raise ArtifactIntegrityError("staging directory escapes storage root")

        self.retention = retention
        self._lock = RLock()

    @staticmethod
    def _validate_ref(payload_ref: str) -> None:
        if not isinstance(payload_ref, str):
            raise ArtifactIntegrityError("payload_ref must be a string")
        if re.fullmatch(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", payload_ref) is None:
            raise ArtifactIntegrityError("payload_ref must be an opaque identifier")
        if any(char in payload_ref for char in ("/\\:?#")):
            raise ArtifactIntegrityError("payload_ref contains invalid path or URL characters")

    @staticmethod
    def _validate_filename(filename: str) -> None:
        if filename not in ALLOWED_FILENAMES:
            raise ArtifactIntegrityError(f"filename must be one of {sorted(ALLOWED_FILENAMES)}")

    def _path_for(self, payload_ref: str) -> Path:
        self._validate_ref(payload_ref)
        path = self.root / f"{payload_ref}.payload"
        if path.is_symlink():
            raise ArtifactIntegrityError("symlinks are not permitted in artifact storage")
        resolved = path.resolve()
        if resolved.is_symlink():
            raise ArtifactIntegrityError("symlinks are not permitted in artifact storage")
        try:
            resolved.relative_to(self.root)
        except ValueError:
            raise ArtifactIntegrityError("artifact path escapes storage root")
        if resolved.parent != self.root:
            raise ArtifactIntegrityError("artifact path escapes storage root")
        return path

    def _manifest_path_for(self, payload_ref: str) -> Path:
        self._validate_ref(payload_ref)
        path = self.root / f"{payload_ref}.manifest.json"
        if path.is_symlink():
            raise ArtifactIntegrityError("symlinks are not permitted in artifact storage")
        resolved = path.resolve()
        if resolved.is_symlink():
            raise ArtifactIntegrityError("symlinks are not permitted in artifact storage")
        try:
            resolved.relative_to(self.root)
        except ValueError:
            raise ArtifactIntegrityError("artifact manifest path escapes storage root")
        if resolved.parent != self.root:
            raise ArtifactIntegrityError("artifact manifest path escapes storage root")
        return path

    @staticmethod
    def checksum(payload: bytes) -> str:
        """Return the lowercase SHA-256 checksum of the payload bytes."""
        return hashlib.sha256(payload).hexdigest()

    def put(self, payload_ref: str, filename: str, payload: bytes) -> ArtifactReference:
        self._validate_ref(payload_ref)
        self._validate_filename(filename)
        if not isinstance(payload, (bytes, bytearray)):
            raise TypeError("payload must be bytes")
        payload_bytes = bytes(payload)
        byte_length = len(payload_bytes)
        if byte_length == 0 or byte_length > 10 * 1024 * 1024:
            raise ArtifactIntegrityError("payload byte length must be between 1 and 10MB")
        checksum = self.checksum(payload_bytes)

        artifact = ArtifactReference(
            payload_ref=payload_ref,
            filename=filename,
            media_type="application/octet-stream",
            byte_length=byte_length,
        )

        final_payload_path = self._path_for(payload_ref)
        final_manifest_path = self._manifest_path_for(payload_ref)
        lock_file_path = self.staging_dir / f"{payload_ref}.lock"

        with self._lock, _ProcessLock(lock_file_path):
            # Check for existing artifact
            if final_payload_path.exists() and final_manifest_path.exists():
                manifest = self._load_manifest(payload_ref)
                if manifest is None:
                    raise ArtifactIntegrityError("existing artifact manifest is invalid or corrupt")
                actual_checksum = self.checksum(final_payload_path.read_bytes())
                if (
                    manifest.filename != filename
                    or manifest.sha256 != checksum
                    or manifest.byte_length != byte_length
                    or actual_checksum != checksum
                ):
                    raise ArtifactConflictError(
                        "payload_ref already exists with different content or metadata"
                    )
                return artifact
            elif final_payload_path.exists() or final_manifest_path.exists():
                raise ArtifactIntegrityError("incomplete existing artifact (missing payload or manifest)")

            # Atomic write via staging
            now = datetime.now(timezone.utc)
            retention_expires_at = now + self.retention
            manifest = ArtifactManifest(
                schema_version=MANIFEST_SCHEMA_VERSION,
                payload_ref=payload_ref,
                filename=filename,
                media_type="application/octet-stream",
                byte_length=byte_length,
                sha256=checksum,
                created_at=now.isoformat(),
                retention_expires_at=retention_expires_at.isoformat(),
            )
            manifest_json = json.dumps(manifest.to_dict(), indent=2, sort_keys=True)

            staging_id = uuid.uuid4().hex
            staging_payload = self.staging_dir / f"{payload_ref}.{staging_id}.payload.tmp"
            staging_manifest = self.staging_dir / f"{payload_ref}.{staging_id}.manifest.tmp"

            try:
                with open(staging_payload, "wb") as f:
                    f.write(payload_bytes)
                    f.flush()
                    os.fsync(f.fileno())

                with open(staging_manifest, "w", encoding="utf-8") as f:
                    f.write(manifest_json)
                    f.flush()
                    os.fsync(f.fileno())

                # Atomic publish
                os.replace(staging_payload, final_payload_path)
                os.replace(staging_manifest, final_manifest_path)
            except Exception:
                # Clean up staging files on failure
                staging_payload.unlink(missing_ok=True)
                staging_manifest.unlink(missing_ok=True)
                raise

            return artifact

    def _load_manifest(self, payload_ref: str) -> ArtifactManifest | None:
        manifest_path = self._manifest_path_for(payload_ref)
        if not manifest_path.exists():
            return None
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            return ArtifactManifest.from_dict(data)
        except (OSError, json.JSONDecodeError, ArtifactIntegrityError):
            return None

    def read_verified(self, artifact: ArtifactReference, expected_sha256: str) -> bytes:
        payload_path = self._path_for(artifact.payload_ref)
        manifest_path = self._manifest_path_for(artifact.payload_ref)

        if not payload_path.exists():
            raise ArtifactIntegrityError("artifact payload is missing")
        if not manifest_path.exists():
            raise ArtifactIntegrityError("artifact manifest is missing")

        manifest = self._load_manifest(artifact.payload_ref)
        if manifest is None:
            raise ArtifactIntegrityError("artifact manifest is corrupted or unparseable")

        if manifest.payload_ref != artifact.payload_ref:
            raise ArtifactIntegrityError("manifest payload_ref mismatch")
        if manifest.filename != artifact.filename:
            raise ArtifactIntegrityError("manifest filename mismatch")
        if manifest.media_type != artifact.media_type:
            raise ArtifactIntegrityError("manifest media_type mismatch")
        if manifest.byte_length != artifact.byte_length:
            raise ArtifactIntegrityError("manifest byte_length mismatch")
        if manifest.sha256 != expected_sha256:
            raise ArtifactIntegrityError("manifest SHA-256 mismatch")

        try:
            payload = payload_path.read_bytes()
        except OSError as exc:
            raise ArtifactIntegrityError("failed to read artifact payload") from exc

        if len(payload) != artifact.byte_length:
            raise ArtifactIntegrityError("artifact byte_length mismatch")
        actual_sha256 = self.checksum(payload)
        if actual_sha256 != expected_sha256:
            raise ArtifactIntegrityError("artifact SHA-256 mismatch")

        return payload

    def get_manifest(self, payload_ref: str) -> ArtifactManifest:
        self._validate_ref(payload_ref)
        manifest = self._load_manifest(payload_ref)
        if manifest is None:
            raise ArtifactIntegrityError(f"manifest for {payload_ref} not found or corrupted")
        return manifest


class TemporaryArtifactStorage:
    """Stores artifacts below an injected trusted root, never from a payload path."""

    def __init__(self, root: Path) -> None:
        if not root.is_absolute():
            raise ArtifactIntegrityError("temporary artifact root must be an absolute path")
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
