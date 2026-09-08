"""
Tests for Label Rendering and Preview Routes.
"""

from fastapi.testclient import TestClient


def test_render_label_all_formats(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    req_body = {
        "data": sample_payload,
        "template_svg": sample_custom_svg,
        "formats": ["png", "pdf", "zpl", "tspl", "ipl"],
        "dpi": 203.2,
        "rotation": 0,
        "width_mm": 200.0,
        "height_mm": 80.0
    }
    resp = client.post("/api/v1/render", json=req_body)
    assert resp.status_code == 200
    res = resp.json()
    assert res["success"] is True
    assert "job_id" in res
    assert "files" in res
    assert "png" in res["files"]
    assert "zpl" in res["files"]
    assert "pdf" in res["files"]

    # Test artifact download endpoint
    zpl_download_url = res["files"]["zpl"]
    download_resp = client.get(zpl_download_url)
    assert download_resp.status_code == 200
    assert b"^XA" in download_resp.content or len(download_resp.content) > 0


def test_preview_endpoint_png(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    req_body = {
        "data": sample_payload,
        "template_svg": sample_custom_svg,
        "preview_type": "png",
        "dpi": 203.2
    }
    resp = client.post("/api/v1/render/preview", json=req_body)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert len(resp.content) > 100


def test_preview_endpoint_monochrome_1bit(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    req_body = {
        "data": sample_payload,
        "template_svg": sample_custom_svg,
        "preview_type": "monochrome_1bit",
        "dpi": 203.2
    }
    resp = client.post("/api/v1/render/preview", json=req_body)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert len(resp.content) > 100


def test_render_orphan_token_fails(client: TestClient, sample_payload: dict):
    orphan_svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>{{missing_token}}</text></svg>'
    req_body = {
        "data": sample_payload,
        "template_svg": orphan_svg,
        "formats": ["png"]
    }
    resp = client.post("/api/v1/render", json=req_body)
    assert resp.status_code in (400, 500)
