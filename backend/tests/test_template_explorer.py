"""Disposable storage coverage for F3.22 folder persistence and path safety."""
from fastapi.testclient import TestClient


def test_nested_folder_list_and_move_preserves_custom_id(client: TestClient, sample_custom_svg: str, tmp_path, monkeypatch):
    import app.services.template_service as service
    monkeypatch.setattr(service, "CUSTOM_TEMPLATES_DIR", tmp_path)
    root = client.post("/api/v1/templates/folders", json={"name": "Labels"})
    assert root.status_code == 200
    nested = client.post("/api/v1/templates/folders", json={"name": "Inbound", "parent_id": "Labels"})
    assert nested.status_code == 200
    saved = client.post("/api/v1/templates", json={"template_id": "nested_label", "folder_id": "Labels/Inbound", "svg_content": sample_custom_svg})
    assert saved.status_code == 200
    moved = client.post("/api/v1/templates/nested_label/move", json={"folder_id": "Labels"})
    assert moved.status_code == 200
    detail = client.get("/api/v1/templates/nested_label")
    assert detail.status_code == 200 and detail.json()["id"] == "nested_label" and detail.json()["is_builtin"] is False
    assert (tmp_path / "Labels" / "nested_label.svg").exists()


def test_save_existing_nested_template_preserves_folder_and_duplicate_is_rejected(client: TestClient, sample_custom_svg: str, tmp_path, monkeypatch):
    import app.services.template_service as service
    monkeypatch.setattr(service, "CUSTOM_TEMPLATES_DIR", tmp_path)
    client.post("/api/v1/templates/folders", json={"name": "A"})
    client.post("/api/v1/templates/folders", json={"name": "B"})
    assert client.post("/api/v1/templates", json={"template_id": "same_id", "folder_id": "A", "svg_content": sample_custom_svg}).status_code == 200
    assert client.post("/api/v1/templates", json={"template_id": "same_id", "folder_id": "A", "svg_content": sample_custom_svg}).status_code == 200
    assert client.post("/api/v1/templates", json={"template_id": "same_id", "folder_id": "B", "svg_content": sample_custom_svg}).status_code == 400
    assert (tmp_path / "A" / "same_id.svg").exists() and not (tmp_path / "B" / "same_id.svg").exists()


def test_folder_path_validation_and_mutation_auth(client: TestClient):
    assert client.post("/api/v1/templates/folders", json={"name": "../escape"}).status_code == 400
    assert client.post("/api/v1/templates/folders", json={"name": "Bad/Name"}).status_code == 400
    assert client.post("/api/v1/templates/folders", json={"name": "NoCsrf"}, headers={"X-CSRF-Token": "invalid"}).status_code == 403
