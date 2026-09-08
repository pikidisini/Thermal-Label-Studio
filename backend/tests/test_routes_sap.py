"""
Tests for Headless SAP Automated Printing Routes and Service.
"""

from unittest.mock import patch
from fastapi.testclient import TestClient


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
