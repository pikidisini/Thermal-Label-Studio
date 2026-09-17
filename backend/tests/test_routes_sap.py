"""
Tests for Headless SAP Automated Printing Routes and Service.
"""

from unittest.mock import patch
from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import json

from app.models.schemas import SapPrintRequest
from app.services.sap_service import SapService


SAP_ABAP_PAYLOAD = {
    "schema_version": "1.0",
    "generated_at": "20260905 143000",
    "source": {
        "sap_system": "PRD",
        "program": "ZMMR_LABELROL_JSON",
        "plant": "1100",
        "material": "SR_BOPP_20MIC",
        "batch": "B260905001",
        "label_type": "ROLL",
    },
    "fields": {
        "brand": "ASTRIA",
        "type_film": "BOPP Plain",
        "grade": "A",
        "criteria": "Standard",
        "width_mm": "1000",
        "length_m": "6000",
        "width_inch": "39.37",
        "length_feet": "19685",
        "thickness_micron": "20",
        "thickness_gauge": "80",
        "net_weight_kg": "108.00",
        "weight_lbs": "238.10",
        "gross_weight_kg": "112.50",
        "batch_text": "B260905001",
        "roll_no": "R-01",
        "so_item": "100234/10",
        "lot_number": "L-9981",
        "order_no": "PO-7712",
        "splice_1_m": "0",
        "splice_1_feet": "0",
        "splice_2_m": "0",
        "splice_2_feet": "0",
        "core_inch": "3",
        "used_before": "2027.09.05",
        "manuf_date": "05.09.2026",
        "treatment_inside": "None",
        "treatment_outside": "Corona 42 dynes",
    },
    "rules": {
        "has_splice": False,
        "has_micron": True,
        "has_so_item": True,
        "has_halal": False,
        "has_iscc": False,
    },
    "codes": {
        "batch_barcode": "B260905001",
        "roll_barcode": "R01-B260905001",
        "pallet_hu_barcode": "HU99281726",
        "qr_payload": "https://trace.company.com/label?batch=B260905001",
    },
}

INLINE_TOKEN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>{{token}}</text></svg>'


def test_sap_ping(client: TestClient):
    """Test SAP heartbeat ping endpoint."""
    resp = client.get("/api/v1/sap/ping")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "SAP_HEADLESS_LABEL_ENGINE"
    assert "version" in data
    assert data["available_templates"] >= 1


def test_sap_print_dry_run(client: TestClient):
    """Test SAP print in dry_run mode without sending to printer."""
    req_body = dict(SAP_ABAP_PAYLOAD)
    req_body["dry_run"] = True

    resp = client.post("/api/v1/sap/print", json=req_body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["template_id"] == "label_roll_80x200"
    assert data["printer_target"] is None
    assert data["bytes_sent"] == 0
    assert "Dry-run" in data["message"]
    assert data["preview_url"] is not None
    assert data["zpl_command"] is not None
    assert "^XA" in data["zpl_command"]
    assert "^XZ" in data["zpl_command"]


def test_sample_roll_contract_preserves_root_and_normalizes_source_aliases(client: TestClient):
    root = Path(__file__).parents[2]
    sample = json.loads((root / "data_samples" / "sample_roll.json").read_text(encoding="utf-8"))
    sample["source"]["program"] = "ZMMR_LABEL_JSON"
    sample["fields"]["optional_note"] = "additional scalar metadata"
    sample["template_svg"] = '<svg xmlns="http://www.w3.org/2000/svg"><text>{{material_number}} {{batch_number}} {{plant}}</text></svg>'
    sample["dry_run"] = True

    req = SapPrintRequest.model_validate(sample)
    normalized, template_id, _ = SapService.resolve_contract_and_template(req)
    assert normalized["contract_version"] == "1.1"
    assert normalized["label_type"] == "ROLL"
    assert normalized["label_code"] == "PFO-30"
    assert normalized["source"]["matnr"] == "SR01PFO3000810"
    assert normalized["source"]["charg"] == "0000909358"
    assert normalized["source"]["werks"] == "1100"
    assert normalized["source"]["program"] == "ZMMR_LABEL_JSON"
    assert normalized["fields"]["material_number"] == "SR01PFO3000810"
    assert normalized["fields"]["batch_number"] == "0000909358"
    assert normalized["fields"]["plant"] == "1100"
    assert normalized["fields"]["grade"] == ""
    assert normalized["fields"]["optional_note"] == "additional scalar metadata"
    assert template_id == "label_roll_80x200"

    response = client.post("/api/v1/sap/print", json=sample)
    assert response.status_code == 200
    assert response.json()["bytes_sent"] == 0
    assert "Dry-run" in response.json()["message"]


@pytest.mark.parametrize("field_name", ["grade", "pallet_no"])
def test_empty_string_token_is_allowed(client: TestClient, field_name: str):
    payload = {
        **deepcopy(SAP_ABAP_PAYLOAD),
        "fields": {**deepcopy(SAP_ABAP_PAYLOAD["fields"]), field_name: ""},
        "template_svg": INLINE_TOKEN_SVG.replace("{{token}}", "{{" + field_name + "}}"),
        "dry_run": True,
    }
    response = client.post("/api/v1/sap/print", json=payload)
    assert response.status_code == 200
    assert response.json()["bytes_sent"] == 0


def test_missing_token_is_rejected(client: TestClient):
    payload = {
        **deepcopy(SAP_ABAP_PAYLOAD),
        "template_svg": INLINE_TOKEN_SVG.replace("{{token}}", "{{not_in_contract}}"),
        "dry_run": True,
    }
    response = client.post("/api/v1/sap/print", json=payload)
    assert response.status_code == 400
    assert "not_in_contract" in response.json()["detail"]


def test_null_token_is_rejected(client: TestClient):
    payload = {
        **deepcopy(SAP_ABAP_PAYLOAD),
        "fields": {**deepcopy(SAP_ABAP_PAYLOAD["fields"]), "grade": None},
        "template_svg": INLINE_TOKEN_SVG.replace("{{token}}", "{{grade}}"),
        "dry_run": True,
    }
    response = client.post("/api/v1/sap/print", json=payload)
    assert response.status_code == 400
    assert "grade" in response.json()["detail"]


def test_sap_print_tcp_mocked(client: TestClient):
    """Test SAP print dispatched to TCP printer on Port 9100."""
    with patch("app.services.sap_service.send_tcp_raw") as mock_tcp:
        mock_tcp.return_value = 4096

        req_body = dict(SAP_ABAP_PAYLOAD)
        req_body["printer"] = {
            "type": "tcp",
            "host": "192.168.1.188",
            "port": 9100,
            "printer_format": "zpl",
        }

        resp = client.post("/api/v1/sap/print", json=req_body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["bytes_sent"] == 4096
        assert data["printer_target"] == "TCP://192.168.1.188:9100"
        assert mock_tcp.called


def test_sap_print_spooler_mocked(client: TestClient):
    """Test SAP print dispatched to Windows Spooler."""
    with patch("app.services.sap_service.send_windows_spooler_raw") as mock_spooler:
        mock_spooler.return_value = 2048

        req_body = dict(SAP_ABAP_PAYLOAD)
        req_body["printer"] = {
            "type": "spooler",
            "printer_name": "ZDesigner ZT411-203dpi",
            "printer_format": "zpl",
        }

        resp = client.post("/api/v1/sap/print", json=req_body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["bytes_sent"] == 2048
        assert data["printer_target"] == "SPOOLER://ZDesigner ZT411-203dpi"
        assert mock_spooler.called


def test_sap_print_query_params(client: TestClient):
    """Test query parameter injection for printer IP without nested printer config."""
    with patch("app.services.sap_service.send_tcp_raw") as mock_tcp:
        mock_tcp.return_value = 1024

        req_body = dict(SAP_ABAP_PAYLOAD)
        resp = client.post(
            "/api/v1/sap/print?printer_ip=10.10.1.55&printer_port=9100",
            json=req_body,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["bytes_sent"] == 1024
        assert data["printer_target"] == "TCP://10.10.1.55:9100"
        assert mock_tcp.called
