"""
Tests for Mass Batch Label Printing Service & Endpoints.
"""

from unittest.mock import patch
from fastapi.testclient import TestClient


SAMPLE_BATCH_DATA = {
    "fields": {
        "material_number": "RM-ST-00129",
        "material_description": "Cold Rolled Steel Coil",
        "batch_number": "B260819001",
        "roll_no": "ROL-001",
        "gross_weight": "2,450.50 KG",
        "net_weight": "2,430.00 KG",
        "production_date": "19.08.2026",
    },
    "codes": {
        "barcode_batch": "B260819001",
        "roll_barcode": "ROL-001",
    }
}


def test_batch_print_dry_run_auto_increment(client: TestClient):
    """Test batch print with auto-increment counter on roll_no."""
    req_body = {
        "method": "raw_tcp",
        "template_id": "label_box_100x50",
        "copies": 3,
        "increment_config": {
            "field_name": "box_no",
            "start_value": "BOX-001",
            "step": 1,
            "pad_digits": 3,
        },
        "data": SAMPLE_BATCH_DATA,
        "dry_run": True,
    }

    resp = client.post("/api/v1/print/batch", json=req_body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["total_labels"] == 3
    assert data["bytes_sent"] == 0
    assert "dry-run" in data["message"].lower()


def test_batch_print_records_array(client: TestClient):
    """Test batch print with explicit records array (e.g. from CSV)."""
    rec1 = dict(SAMPLE_BATCH_DATA)
    rec2 = dict(SAMPLE_BATCH_DATA)
    rec2["fields"] = dict(rec1["fields"], batch_number="B260819002")

    req_body = {
        "method": "raw_tcp",
        "template_id": "label_box_100x50",
        "records": [rec1, rec2],
        "dry_run": True,
    }

    resp = client.post("/api/v1/print/batch", json=req_body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["total_labels"] == 2


def test_batch_print_tcp_mocked(client: TestClient):
    """Test batch print dispatched to TCP socket."""
    with patch("app.services.print_service.send_tcp_raw") as mock_tcp:
        mock_tcp.return_value = 8192

        req_body = {
            "method": "raw_tcp",
            "host": "192.168.1.188",
            "port": 9100,
            "template_id": "label_box_100x50",
            "copies": 2,
            "data": SAMPLE_BATCH_DATA,
            "dry_run": False,
        }

        resp = client.post("/api/v1/print/batch", json=req_body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["total_labels"] == 2
        assert data["bytes_sent"] == 8192
        assert "192.168.1.188:9100" in data["target"]
        assert mock_tcp.called


def test_batch_print_spooler_mocked(client: TestClient):
    """Test batch print dispatched to Windows Spooler."""
    with patch("app.services.print_service.send_windows_spooler_raw") as mock_spooler:
        mock_spooler.return_value = 4096

        req_body = {
            "method": "spooler",
            "printer_name": "ZDesigner ZT411-203dpi",
            "template_id": "label_box_100x50",
            "copies": 2,
            "data": SAMPLE_BATCH_DATA,
            "dry_run": False,
        }

        resp = client.post("/api/v1/print/batch", json=req_body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["total_labels"] == 2
        assert data["bytes_sent"] == 4096
        assert "ZDesigner ZT411-203dpi" in data["target"]
        assert mock_spooler.called
