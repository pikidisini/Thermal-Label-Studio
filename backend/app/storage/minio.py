"""Fail-closed MinIO adapters.  Filesystem storage remains the default."""
from __future__ import annotations
import io, json, os, re, tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from ..print_jobs.artifact_storage import (ArtifactConflictError, ArtifactIntegrityError, ArtifactManifest,
    ArtifactReference, ArtifactStorage, ALLOWED_FILENAMES, DEFAULT_RETENTION, MANIFEST_SCHEMA_VERSION)

def minio_enabled() -> bool:
    return os.getenv("STORAGE_BACKEND", "filesystem").strip().lower() == "minio"

def _client():
    try:
        from minio import Minio
    except ImportError as exc:
        raise RuntimeError("STORAGE_BACKEND=minio requires the minio package") from exc
    endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000").strip()
    if not endpoint or ":" not in endpoint:
        raise RuntimeError("MINIO_ENDPOINT must include host and port")
    access=os.getenv("MINIO_ACCESS_KEY", "").strip(); secret=os.getenv("MINIO_SECRET_KEY", "").strip()
    if not access or not secret: raise RuntimeError("MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required")
    return Minio(endpoint, access_key=access, secret_key=secret,
                 secure=os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes"})

class MinioArtifactStorage(ArtifactStorage):
    def __init__(self, bucket: str | None = None, prefix: str = "artifacts/", *, retention=DEFAULT_RETENTION, client=None):
        if retention <= timedelta(0): raise ValueError("retention must be positive")
        self.client = client or _client(); self.bucket = bucket or os.getenv("MINIO_ARTIFACT_BUCKET", "thermal-label"); self.prefix = prefix.rstrip("/") + "/"; self.retention = retention
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", self.bucket): raise ValueError("invalid MinIO bucket")
    @staticmethod
    def checksum(payload: bytes) -> str:
        import hashlib; return hashlib.sha256(payload).hexdigest()
    @staticmethod
    def _validate_ref(ref):
        if not isinstance(ref, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", ref) is None: raise ArtifactIntegrityError("payload_ref must be an opaque identifier")
    @staticmethod
    def _validate_filename(name):
        if name not in ALLOWED_FILENAMES: raise ArtifactIntegrityError(f"filename must be one of {sorted(ALLOWED_FILENAMES)}")
    def _key(self, ref, suffix): self._validate_ref(ref); return f"{self.prefix}{ref}.{suffix}"
    def _get(self, key):
        try:
            response = self.client.get_object(self.bucket, key); data = response.read(); response.close(); response.release_conn(); return data
        except Exception as exc:
            try:
                from minio.error import S3Error
                if isinstance(exc, S3Error) and exc.code in {"NoSuchKey", "NoSuchObject"}:
                    raise ArtifactIntegrityError(f"object {key} is missing") from exc
            except ImportError: pass
            raise ArtifactIntegrityError(f"failed to read object {key}") from exc
    def _get_optional(self, key):
        try:
            return self._get(key)
        except ArtifactIntegrityError as exc:
            # _get deliberately collapses SDK absence into this error; inspect
            # the cause so transport/authentication failures remain fatal.
            cause = exc.__cause__
            try:
                from minio.error import S3Error
                if isinstance(cause, S3Error) and cause.code in {"NoSuchKey", "NoSuchObject"}:
                    return None
            except ImportError: pass
            if isinstance(cause, KeyError): return None
            raise
    def put(self, payload_ref, filename, payload):
        self._validate_ref(payload_ref); self._validate_filename(filename); payload=bytes(payload)
        if not payload or len(payload)>10*1024*1024: raise ArtifactIntegrityError("payload byte length must be between 1 and 10MB")
        checksum=self.checksum(payload); media_type="application/pdf" if filename.endswith(".pdf") else "application/octet-stream"
        ref=ArtifactReference(payload_ref=payload_ref, filename=filename, media_type=media_type, byte_length=len(payload)); pkey=self._key(payload_ref,"payload"); mkey=self._key(payload_ref,"manifest.json")
        existing_raw=self._get_optional(mkey); payload_raw=self._get_optional(pkey)
        if existing_raw is None and payload_raw is not None: raise ArtifactIntegrityError("incomplete existing artifact (missing manifest)")
        if existing_raw is not None and payload_raw is None: raise ArtifactIntegrityError("incomplete existing artifact (missing payload)")
        if existing_raw is not None and payload_raw is not None:
            try: existing=ArtifactManifest.from_dict(json.loads(existing_raw.decode()))
            except (json.JSONDecodeError, UnicodeDecodeError, ArtifactIntegrityError) as exc: raise ArtifactIntegrityError("existing artifact manifest is invalid or corrupt") from exc
            actual=payload_raw
            if existing.payload_ref != payload_ref or existing.schema_version != MANIFEST_SCHEMA_VERSION: raise ArtifactIntegrityError("existing artifact manifest identity is invalid")
            if existing.filename!=filename or existing.sha256!=checksum or existing.byte_length!=len(payload) or self.checksum(actual)!=checksum: raise ArtifactConflictError("payload_ref already exists with different content or metadata")
            return ref
        now=datetime.now(timezone.utc); manifest=ArtifactManifest(MANIFEST_SCHEMA_VERSION,payload_ref,filename,media_type,len(payload),checksum,now.isoformat(),(now+self.retention).isoformat())
        self.client.put_object(self.bucket,pkey,io.BytesIO(payload),len(payload),content_type=media_type)
        # Manifest is published last; readers reject a payload without it.
        raw=json.dumps(manifest.to_dict(),sort_keys=True).encode(); self.client.put_object(self.bucket,mkey,io.BytesIO(raw),len(raw),content_type="application/json")
        return ref
    def get_manifest(self, payload_ref):
        self._validate_ref(payload_ref)
        try: return ArtifactManifest.from_dict(json.loads(self._get(self._key(payload_ref,"manifest.json")).decode()))
        except (json.JSONDecodeError, UnicodeDecodeError, ArtifactIntegrityError) as exc: raise ArtifactIntegrityError("manifest is corrupted or missing") from exc
    def read_verified(self, artifact, expected_sha256):
        manifest=self.get_manifest(artifact.payload_ref)
        if (manifest.filename,manifest.media_type,manifest.byte_length,manifest.sha256)!=(artifact.filename,artifact.media_type,artifact.byte_length,expected_sha256): raise ArtifactIntegrityError("artifact manifest does not match requested artifact")
        payload=self._get(self._key(artifact.payload_ref,"payload"))
        if len(payload)!=artifact.byte_length or self.checksum(payload)!=expected_sha256: raise ArtifactIntegrityError("artifact SHA-256 mismatch")
        return payload

class MinioTemplateStore:
    MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
    _SEGMENT = re.compile(r"[A-Za-z0-9 _-]{1,80}\Z")
    def __init__(self, bucket=None, prefix="templates/", cache_dir=None, client=None):
        self.client=client or _client(); self.bucket=bucket or os.getenv("MINIO_TEMPLATE_BUCKET", "thermal-label"); self.prefix=prefix.rstrip("/")+"/"; self.cache_dir=Path(cache_dir or tempfile.gettempdir()) / "thermal-label-minio-templates"; self.cache_dir.mkdir(parents=True,exist_ok=True)
    @classmethod
    def validate_folder(cls, folder):
        if folder is None or folder == "": return ""
        if not isinstance(folder, str): raise ValueError("Invalid folder path")
        raw = folder.replace("\\", "/").strip("/")
        parts = raw.split("/")
        if len(parts) > 8 or any(not cls._SEGMENT.fullmatch(p) or p in {".", ".."} for p in parts):
            raise ValueError("Invalid folder path")
        return "/".join(p.strip() for p in parts)
    @classmethod
    def validate_name(cls, name):
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", name):
            raise ValueError("Invalid template ID")
        return name
    def _key(self, folder, name):
        folder = self.validate_folder(folder); name = self.validate_name(name)
        return f"{self.prefix}{folder+'/' if folder else ''}{name}.svg"
    def list(self):
        return list(self.client.list_objects(self.bucket,prefix=self.prefix,recursive=True))
    def read(self, key):
        if not isinstance(key, str) or not key.startswith(self.prefix) or not key.endswith(".svg"):
            raise ValueError("Invalid template object key")
        response=self.client.get_object(self.bucket,key); data=response.read(); response.close(); response.release_conn()
        if len(data) > self.MAX_TEMPLATE_BYTES: raise ValueError("Template is too large")
        return data.decode("utf-8")
    def materialize(self, template_id, key):
        self.validate_name(template_id)
        target=self.cache_dir/(template_id+".svg"); tmp=target.with_suffix(".tmp")
        tmp.write_text(self.read(key),encoding="utf-8"); tmp.replace(target); return target
