"""Failure recovery for the concrete layout writer, without storage drivers/I/O."""
from types import SimpleNamespace
import pytest
from app.layouts.models import SaveLayoutRequest
from app.layouts.service import LayoutService, LayoutPersistenceError

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm"><rect width="80" height="200" fill="white"/></svg>'

class MissingObject(Exception):
    code = "NoSuchKey"

class Objects:
    def __init__(self):
        self.objects = {}
        self.probes = []
        self.failure = None
    def stat_object(self, bucket, key):
        self.probes.append(key)
        if key not in self.objects:
            raise MissingObject()
    def put_object(self, bucket, key, stream, **kwargs):
        self.objects[key] = stream.read()
        if self.failure:
            raise RuntimeError("upload acknowledgement lost")
    def remove_object(self, *args):
        raise AssertionError("Never delete a possibly committed immutable SVG")

class Database:
    def __init__(self):
        self.versions = []
        self.failure = None
        self.locks = 0
    def connect(self, url):
        return Connection(self)

class Connection:
    def __init__(self, database):
        self.database = database
        self.pending = []
    def __enter__(self):
        return self
    def __exit__(self, kind, value, trace):
        if kind is not None:
            return False
        if self.database.failure == "commit_rejected":
            raise RuntimeError("commit rejected")
        self.database.versions.extend(self.pending)
        if self.database.failure == "commit_ack_lost":
            raise RuntimeError("commit response lost")
    def cursor(self):
        return Cursor(self)

class Cursor:
    def __init__(self, connection):
        self.connection = connection
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def execute(self, sql, args=None):
        database = self.connection.database
        if "pg_advisory_xact_lock" in sql:
            database.locks += 1
        if "INSERT INTO label_studio.layout_versions" in sql:
            if database.failure == "insert_failed":
                raise RuntimeError("insert rejected")
            self.connection.pending.append(args[1])
    def fetchone(self):
        return (max(self.connection.database.versions, default=0) + 1,)

@pytest.fixture
def writer():
    service = LayoutService.__new__(LayoutService)
    service.settings = SimpleNamespace(database_url="fake", minio_bucket="fake")
    service._database = Database()
    service.client = Objects()
    service._s3_error = MissingObject
    return service

@pytest.fixture
def draft():
    return SaveLayoutRequest(label_code="recovery", title="Recovery", width_mm=80, height_mm=200, dpi=203.2, svg=SVG)

@pytest.mark.parametrize("failure", ["insert_failed", "commit_rejected", "commit_ack_lost"])
def test_retry_after_database_failure_preserves_svg_and_publishes_fresh_version(writer, draft, failure):
    writer._database.failure = failure
    with pytest.raises(LayoutPersistenceError):
        writer.save_layout(draft)
    previous = dict(writer.client.objects)
    assert "layouts/recovery/v1/layout.svg" in previous
    writer._database.failure = None
    saved = writer.save_layout(draft)
    assert saved.version == 2
    assert saved.object_key == "layouts/recovery/v2/layout.svg"
    assert all(writer.client.objects[key] == value for key, value in previous.items())
    assert writer._database.versions == ([1, 2] if failure == "commit_ack_lost" else [2])
    assert writer._database.locks == 2

def test_upload_acknowledgement_failure_does_not_block_next_save(writer, draft):
    writer.client.failure = True
    with pytest.raises(LayoutPersistenceError):
        writer.save_layout(draft)
    assert writer._database.versions == []
    writer.client.failure = None
    assert writer.save_layout(draft).version == 2

def test_existing_artifact_is_never_overwritten_even_with_different_content(writer, draft):
    writer.client.objects["layouts/recovery/v1/layout.svg"] = b"previous uncertain artifact"
    assert writer.save_layout(draft).version == 2
    assert writer.client.objects["layouts/recovery/v1/layout.svg"] == b"previous uncertain artifact"

def test_allocation_is_bounded_and_fails_closed(writer, draft):
    writer.client.objects = {f"layouts/recovery/v{v}/layout.svg": b"preserve" for v in range(1, 33)}
    with pytest.raises(LayoutPersistenceError):
        writer.save_layout(draft)
    assert len(writer.client.probes) == 32
    assert writer._database.versions == []
    assert len(writer.client.objects) == 32

def test_successive_saves_publish_monotonic_versions(writer, draft):
    assert writer.save_layout(draft).version == 1
    assert writer.save_layout(draft).version == 2
    assert writer._database.versions == [1, 2]


def test_http_failed_commit_returns_error_and_following_save_returns_new_version(writer, draft):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.layouts.http import router
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    application.state.layout_service = writer
    writer._database.failure = "commit_rejected"
    with TestClient(application) as client:
        failed = client.post("/api/v1/layouts", json=draft.model_dump())
        assert failed.status_code == 503
        assert failed.json()["detail"]["code"] == "layout_persistence_unavailable"
        writer._database.failure = None
        saved = client.post("/api/v1/layouts", json=draft.model_dump())
        assert saved.status_code == 201
        assert saved.json()["version"] == 2
        assert saved.json()["object_key"] == "layouts/recovery/v2/layout.svg"
