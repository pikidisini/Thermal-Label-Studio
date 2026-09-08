"""
Tests for Template Management Routes.
"""

from fastapi.testclient import TestClient


def test_list_templates(client: TestClient):
    response = client.get("/api/v1/templates")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Check that built-in template exists
    template_ids = [t["id"] for t in data]
    assert any("label" in tid for tid in template_ids)


def test_get_template_detail(client: TestClient):
    response = client.get("/api/v1/templates")
    assert response.status_code == 200
    first_id = response.json()[0]["id"]

    detail_resp = client.get(f"/api/v1/templates/{first_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "tokens" in detail
    assert "raw_svg" in detail
    assert "barcode_fields" in detail
    assert "qr_fields" in detail
    assert isinstance(detail["tokens"], list)


def test_get_nonexistent_template(client: TestClient):
    resp = client.get("/api/v1/templates/non_existent_template_xyz")
    assert resp.status_code == 404


def test_parse_raw_svg(client: TestClient, sample_custom_svg: str):
    resp = client.post("/api/v1/templates/parse-raw", params={"svg_content": sample_custom_svg})
    assert resp.status_code == 200
    data = resp.json()
    assert "material_number" in data["tokens"]
    assert "barcode_batch" in data["barcode_fields"]
    assert "qr_traceability" in data["qr_fields"]


def test_save_custom_template(client: TestClient, sample_custom_svg: str):
    resp = client.post(
        "/api/v1/templates",
        json={
            "template_id": "test_saved_template_unit",
            "svg_content": sample_custom_svg,
            "width_mm": 200,
            "height_mm": 80,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "test_saved_template_unit"
    assert "material_number" in data["tokens"]


def test_save_custom_template_invalid(client: TestClient):
    resp = client.post(
        "/api/v1/templates",
        json={
            "template_id": "bad_template",
            "svg_content": "not an svg content string",
            "width_mm": 200,
            "height_mm": 80,
        },
    )
    assert resp.status_code == 400
