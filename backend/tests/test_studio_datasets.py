"""Sample dataset tests use in-memory fakes only."""
from copy import deepcopy
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.studio_datasets.http import router
from app.studio_datasets.service import StudioDatasetService, DatasetPersistenceError
from app.studio_datasets.validation import validate_payload

PAYLOAD = {"sender": {"system": "SAP_ECC", "plant": "1000"}, "request_id": "R1", "field_descriptions": {"ZZWIDTH": "WIDTH"}, "items": [{"item_id": "I1", "label_code": "A013", "copies": 1, "data": {"ZZWIDTH": 0, "flag": False, "empty": None}}, {"item_id": "I2", "label_code": "A013", "copies": 2, "data": {"ZZWIDTH": 700}}]}

class Database:
    def __init__(self): self.rows = {}; self.description = None; self.fail = False; self.sql = []
    def connect(self, _url): return self
    def cursor(self): return self
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def execute(self, sql, args=None):
        self.sql.append((sql, args)); self.description = None
        if self.fail: raise RuntimeError("secret connection detail")
        if "INSERT INTO" in sql:
            identifier, name, filename, payload, created, updated = args
            self.rows[str(identifier)] = (identifier, name, filename, created, updated, deepcopy(payload))
        elif "SELECT id" in sql:
            self.description = True
            self.result = self.rows.get(str(args[0])) if args else list(self.rows.values())
    def fetchone(self): return self.result
    def fetchall(self): return [row[:5] for row in self.result]

@pytest.fixture
def managed():
    result = StudioDatasetService.__new__(StudioDatasetService)
    result.settings = SimpleNamespace(database_url="fake")
    result._database = Database(); result._jsonb = lambda value: value
    return result

@pytest.mark.parametrize("mutate", [
    lambda p: p["items"][0].update(copies=True),
    lambda p: p["items"][0]["data"].update(nested={"x": 1}),
    lambda p: p["items"][0]["data"].update(number=float("inf")),
    lambda p: p["sender"].update(extra=float("nan")),
    lambda p: p["sender"].update(extra="\x00"),
    lambda p: p["sender"].update(extra="\ud800"),
    lambda p: p["items"][1].update(item_id="I1"),
    lambda p: p["items"][0]["data"].update(constructor="unsafe"),
    lambda p: p.update(field_descriptions={"ZZWIDTH": "x" * 257}),
    lambda p: p.update(items=[]),
])
def test_invalid_envelopes_fail(mutate):
    payload = deepcopy(PAYLOAD); mutate(payload)
    with pytest.raises((ValueError, UnicodeError)): validate_payload(payload)

def test_roundtrip_preserves_original_envelope_and_distinct_uploads(managed):
    first = managed.create("First", "sample.json", validate_payload(PAYLOAD))
    second = managed.create("Second", "sample.json", PAYLOAD)
    assert first["id"] != second["id"]
    assert managed.get(first["id"])["payload"] == PAYLOAD
    assert all("payload" not in summary for summary in managed.list())
    assert all("minio" not in sql.lower() for sql, _ in managed._database.sql)

def test_http_validates_before_storage_and_unconfigured_fails(managed):
    app = FastAPI(); app.include_router(router); app.state.studio_dataset_service = managed
    with TestClient(app) as client:
        assert client.post("/studio-sample-datasets", json={"name":"Sample", "original_filename":"sample.json", "payload":PAYLOAD}).status_code == 201
        before = len(managed._database.sql)
        assert client.post("/studio-sample-datasets", json={"name":"Sample", "original_filename":"sample.json", "payload":{}}).status_code == 422
        assert len(managed._database.sql) == before
        assert client.get("/studio-sample-datasets").status_code == 200
        assert client.get("/studio-sample-datasets/00000000-0000-0000-0000-000000000000").status_code == 404
        assert client.post("/studio-sample-datasets", content=b"x" * (2 * 1024 * 1024 + 4097)).status_code == 413
        managed._database.fail = True
        assert client.get("/studio-sample-datasets").status_code == 503
    empty = FastAPI(); empty.include_router(router)
    with TestClient(empty) as client: assert client.get("/studio-sample-datasets").status_code == 503

def test_database_failures_are_bounded(managed):
    managed._database.fail = True
    with pytest.raises(DatasetPersistenceError, match=r"^Sample dataset storage is unavailable\.$"):
        managed.list()
