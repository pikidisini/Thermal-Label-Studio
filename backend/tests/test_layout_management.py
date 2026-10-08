"""Template management uses fake SQL state; no database or object-store access."""
from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.layouts.http import router
from app.layouts.models import RenameLayoutRequest, SaveLayoutRequest
from app.layouts.service import LayoutService, LayoutNotFoundError, LayoutConflictError, LayoutPersistenceError

class Database:
    def __init__(self):
        self.title = None
        self.deleted = False
        self.missing = False
        self.fail = False
        self.sql = []
    def connect(self, _url): return self
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def cursor(self): return self
    def execute(self, sql, args=None):
        self.sql.append(sql)
        if self.fail: raise RuntimeError("database unavailable")
        self.result = None
        if "MAX(version)" in sql: self.result = (2,)
        elif "SELECT deleted_at" in sql: self.result = (datetime.now(timezone.utc) if self.deleted else None,)
        elif "UPDATE label_studio.layouts" in sql:
            if not self.deleted and not self.missing:
                if "title_override =" in sql: self.title = args[0]
                else: self.deleted = True
                self.result = ("example",)
        elif "SELECT v.label_code" in sql and not self.deleted and not self.missing:
            self.result = ("example", self.title or "Original", 1, 80, 40, 203.2, "0" * 64, "layouts/example/v1/layout.svg", datetime.now(timezone.utc))
    def fetchone(self): return self.result
    def fetchall(self): return [] if self.deleted else [self.result]

@pytest.fixture
def managed():
    service = LayoutService.__new__(LayoutService)
    service.settings = SimpleNamespace(database_url="fake")
    service._database = Database()
    # No object-store client: management must never read/write/delete SVG artifacts.
    return service

def test_rename_changes_display_name_without_changing_artifact_or_version(managed):
    result = managed.rename_layout("example", "Renamed")
    assert result.title == "Renamed"
    assert result.version == 1
    assert result.object_key == "layouts/example/v1/layout.svg"
    assert all("UPDATE label_studio.layout_versions" not in sql for sql in managed._database.sql)

def test_delete_hides_layout_preserves_history_and_rejects_reuse(managed):
    managed.delete_layout("example")
    assert managed.list_layouts() == []
    with pytest.raises(LayoutNotFoundError): managed.get_layout("example")
    with pytest.raises(LayoutNotFoundError): managed.rename_layout("example", "Again")
    with pytest.raises(LayoutNotFoundError): managed.delete_layout("example")
    with pytest.raises(LayoutConflictError):
        managed.save_layout(SaveLayoutRequest(label_code="example", title="Again", svg='<svg xmlns="http://www.w3.org/2000/svg"/>', width_mm=80, height_mm=40, dpi=203.2))
    assert not any("DELETE FROM" in sql for sql in managed._database.sql)
    assert any("deleted_at IS NULL" in sql for sql in managed._database.sql)

def test_management_failures_return_safe_errors(managed):
    managed._database.fail = True
    with pytest.raises(LayoutPersistenceError): managed.rename_layout("example", "New")
    with pytest.raises(LayoutPersistenceError): managed.delete_layout("example")

@pytest.mark.parametrize("title", ["", "   ", "x" * 161, 123])
def test_http_rejects_invalid_titles(managed, title):
    application = FastAPI(); application.include_router(router); application.state.layout_service = managed
    with TestClient(application) as client:
        assert client.patch("/layouts/example", json={"title": title}).status_code == 422
    assert not managed._database.sql

def test_http_rename_delete_and_not_found(managed):
    application = FastAPI(); application.include_router(router); application.state.layout_service = managed
    with TestClient(application) as client:
        response = client.patch("/layouts/example", json={"title": "  New name  "})
        assert response.status_code == 200
        assert response.json()["title"] == "New name"
        assert client.delete("/layouts/example").status_code == 204
        assert client.patch("/layouts/example", json={"title": "Again"}).status_code == 404
        assert client.delete("/layouts/example").status_code == 404
        managed._database.fail = True
        assert client.delete("/layouts/example").status_code == 503

def test_management_without_persistence_fails_closed():
    application = FastAPI(); application.include_router(router)
    with TestClient(application) as client:
        assert client.patch("/layouts/example", json={"title": "New"}).status_code == 503
        assert client.delete("/layouts/example").status_code == 503
