"""Read-only inspection of one MinIO bucket and its layouts/ prefix."""
from dataclasses import dataclass, field
from functools import wraps
import hashlib
from itertools import islice
import json
import os
import re

from minio import Minio
from minio.error import MinioException
import urllib3


class ObjectInspectionError(Exception):
    """Message safe to return to an MCP client."""


def safe_errors(method):
    @wraps(method)
    def guarded(*args, **kwargs):
        try:
            return method(*args, **kwargs)
        except (MinioException, urllib3.exceptions.HTTPError, OSError):
            raise ObjectInspectionError("MinIO inspection failed. Check endpoint, reader credentials, policy and object availability.") from None
    return guarded


@dataclass(frozen=True)
class MinioSettings:
    endpoint: str
    access_key: str
    secret_key: str = field(repr=False)
    bucket: str = "thermal-label-layouts"
    secure: bool = False

    @classmethod
    def from_env(cls, root_access_key=None):
        access = os.environ.get("TLS_MCP_MINIO_ACCESS_KEY", "")
        secret = os.environ.get("TLS_MCP_MINIO_SECRET_KEY", "")
        if not access or not secret:
            raise ObjectInspectionError("Set dedicated TLS_MCP_MINIO_ACCESS_KEY and TLS_MCP_MINIO_SECRET_KEY locally.")
        if access == "minioadmin" or (root_access_key and access == root_access_key):
            raise ObjectInspectionError("Use a dedicated MinIO reader, not the application root account.")
        endpoint = os.environ.get("TLS_MCP_MINIO_ENDPOINT", "127.0.0.1:9002")
        if not re.fullmatch(r"[A-Za-z0-9.-]+:[0-9]{1,5}", endpoint) or not 1 <= int(endpoint.rsplit(":", 1)[1]) <= 65535:
            raise ObjectInspectionError("Configure a hostname:port endpoint without a URL scheme or path.")
        bucket = os.environ.get("TLS_MCP_MINIO_BUCKET", "thermal-label-layouts")
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket) or '..' in bucket:
            raise ObjectInspectionError("Configure a valid single bucket name.")
        secure = os.environ.get("TLS_MCP_MINIO_SECURE", "false").lower()
        if secure not in ("true", "false"):
            raise ObjectInspectionError("TLS_MCP_MINIO_SECURE must be true or false.")
        return cls(endpoint, access, secret, bucket, secure == "true")


class MinioInspector:
    PREFIX = "layouts/"
    MAX_SVG_BYTES = 65536

    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client if client is not None else Minio(
            settings.endpoint, access_key=settings.access_key,
            secret_key=settings.secret_key, secure=settings.secure,
            http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5, read=5, total=10),
                                            retries=False, cert_reqs="CERT_REQUIRED"))

    def _key(self, value, prefix=False):
        if not isinstance(value, str) or not value.startswith(self.PREFIX) or len(value.encode("utf-8")) > 1024:
            raise ObjectInspectionError("Object keys and prefixes must stay under layouts/ and within 1024 UTF-8 bytes.")
        if '\\' in value or any(ord(c) < 32 or ord(c) == 127 for c in value) or any(part in ('.', '..') for part in value.split('/')):
            raise ObjectInspectionError("Control characters and ambiguous path segments are not allowed.")
        if not prefix and (value == self.PREFIX or value.endswith('/')):
            raise ObjectInspectionError("Provide a complete object key returned by list_objects.")
        return value

    def _bounded(self, result):
        if len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > 131072:
            raise ObjectInspectionError("Result exceeds 128 KiB. Use a smaller listing limit or a smaller SVG.")
        return result

    @safe_errors
    def list_objects(self, prefix="layouts/", limit=25, start_after=""):
        self._key(prefix, prefix=True)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ObjectInspectionError("limit must be an integer between 1 and 100.")
        if start_after:
            self._key(start_after)
            if not start_after.startswith(prefix):
                raise ObjectInspectionError("start_after must be inside the requested prefix.")
        objects = self.client.list_objects(self.settings.bucket, prefix=prefix,
            recursive=True, start_after=start_after or None, include_user_meta=False)
        try:
            page = list(islice(objects, limit + 1))
        finally:
            close = getattr(objects, 'close', None)
            if close:
                close()
        for obj in page:
            self._key(obj.object_name)
            if not obj.object_name.startswith(prefix):
                raise ObjectInspectionError("MinIO returned an object outside the requested prefix.")
        rows = [{"key": obj.object_name, "size_bytes": obj.size,
                 "etag": obj.etag, "last_modified": obj.last_modified.isoformat() if obj.last_modified else None}
                for obj in page[:limit]]
        return self._bounded({"bucket": self.settings.bucket, "prefix": prefix, "objects": rows,
            "truncated": len(page) > limit,
            "next_start_after": rows[-1]['key'] if len(page) > limit else None})

    @safe_errors
    def stat_object(self, key):
        self._key(key)
        obj = self.client.stat_object(self.settings.bucket, key)
        return self._bounded({"bucket": self.settings.bucket, "key": key, "size_bytes": obj.size,
            "content_type": obj.content_type, "etag": obj.etag,
            "version_id": obj.version_id,
            "last_modified": obj.last_modified.isoformat() if obj.last_modified else None})

    @safe_errors
    def read_layout_svg(self, key, expected_sha256=""):
        self._key(key)
        if not key.endswith('.svg'):
            raise ObjectInspectionError("Only .svg objects can be read as text.")
        if expected_sha256 and not re.fullmatch(r'[0-9a-f]{64}', expected_sha256):
            raise ObjectInspectionError("expected_sha256 must be a lowercase 64-character SHA-256 digest.")
        metadata = self.client.stat_object(self.settings.bucket, key)
        if metadata.size > self.MAX_SVG_BYTES:
            raise ObjectInspectionError("SVG exceeds 64 KiB; text was not returned.")
        response = self.client.get_object(self.settings.bucket, key, version_id=metadata.version_id)
        try:
            payload = response.read(self.MAX_SVG_BYTES + 1)
        finally:
            try:
                response.close()
            finally:
                response.release_conn()
        if len(payload) > self.MAX_SVG_BYTES:
            raise ObjectInspectionError("SVG exceeds 64 KiB; text was not returned.")
        digest = hashlib.sha256(payload).hexdigest()
        if expected_sha256 and digest != expected_sha256:
            raise ObjectInspectionError("SVG checksum does not match expected_sha256; text was not returned.")
        try:
            content = payload.decode('utf-8')
        except UnicodeDecodeError:
            raise ObjectInspectionError("SVG is not valid UTF-8 text.") from None
        return self._bounded({"bucket": self.settings.bucket, "key": key,
            "size_bytes": len(payload), "sha256": digest,
            "checksum_verified": bool(expected_sha256), "svg": content})
