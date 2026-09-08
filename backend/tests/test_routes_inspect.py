"""
Tests for Data Inspection and Validation Routes.
"""

from fastapi.testclient import TestClient


def test_get_sample_contract(client: TestClient):
    resp = client.get("/api/v1/inspect/sample-contract")
    assert resp.status_code == 200
    data = resp.json()
    assert "contract_version" in data
    assert "fields" in data
    assert "codes" in data
    assert len(data["fields"]) > 0


def test_validate_contract_success(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    req_body = {
        "data": sample_payload,
        "template_svg": sample_custom_svg
    }
    resp = client.post("/api/v1/inspect/validate", json=req_body)
    assert resp.status_code == 200
    res = resp.json()
    assert res["is_valid"] is True
    assert len(res["orphan_tokens"]) == 0
    assert "material_number" in res["matched_fields"]
    assert res["width_mm"] > 0
    assert res["width_px"] > 0


def test_validate_contract_orphan_token(client: TestClient, sample_payload: dict):
    # SVG with token not provided in sample_payload
    orphan_svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>{{unknown_custom_field}}</text></svg>'
    req_body = {
        "data": sample_payload,
        "template_svg": orphan_svg
    }
    resp = client.post("/api/v1/inspect/validate", json=req_body)
    assert resp.status_code == 200
    res = resp.json()
    assert res["is_valid"] is False
    assert "unknown_custom_field" in res["orphan_tokens"]
    assert len(res["errors"]) > 0
