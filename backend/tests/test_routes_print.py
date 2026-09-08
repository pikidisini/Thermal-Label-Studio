"""
Tests for Printing Dispatch Routes.
"""

from unittest.mock import patch
from fastapi.testclient import TestClient


def test_list_printers(client: TestClient):
    with patch("app.services.print_service.list_windows_printers") as mock_list:
        mock_list.return_value = ["ZDesigner ZT411", "TSC TE200"]
        resp = client.get("/api/v1/print/printers")
        assert resp.status_code == 200
        printers = resp.json()
        assert "ZDesigner ZT411" in printers


def test_print_tcp_mocked(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    with patch("app.services.print_service.send_tcp_raw") as mock_sender:
        mock_sender.return_value = 1234

        req_body = {
            "host": "192.168.1.200",
            "port": 9100,
            "printer_format": "zpl",
            "data": sample_payload,
            "template_svg": sample_custom_svg
        }
        resp = client.post("/api/v1/print/tcp", json=req_body)
        assert resp.status_code == 200
        res = resp.json()
        assert res["success"] is True
        assert res["bytes_sent"] == 1234
        assert "192.168.1.200:9100" in res["target"]
        assert mock_sender.called


def test_print_spooler_mocked(client: TestClient, sample_payload: dict, sample_custom_svg: str):
    with patch("app.services.print_service.send_windows_spooler_raw") as mock_spooler:
        mock_spooler.return_value = 5678

        req_body = {
            "printer_name": "ZDesigner ZT411-203dpi",
            "printer_format": "zpl",
            "data": sample_payload,
            "template_svg": sample_custom_svg
        }
        resp = client.post("/api/v1/print/spooler", json=req_body)
        assert resp.status_code == 200
        res = resp.json()
        assert res["success"] is True
        assert res["bytes_sent"] == 5678
        assert mock_spooler.called
