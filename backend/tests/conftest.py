"""
Pytest configuration and fixtures for backend test suite.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure root paths are in sys.path
TEST_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TEST_DIR.parent
WEB_APP_DIR = BACKEND_DIR.parent
PROJECT_ROOT = WEB_APP_DIR if (WEB_APP_DIR / "engine").exists() else WEB_APP_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(WEB_APP_DIR) not in sys.path:
    sys.path.insert(0, str(WEB_APP_DIR))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_payload():
    return {
        "contract_version": "1.1",
        "metadata": {
            "source_system": "SAP_ECC_PRD",
            "generated_at": "2026-08-19T10:00:00Z"
        },
        "fields": {
            "material_number": "RM-ST-00129",
            "material_description": "Cold Rolled Steel Coil 1.2mm x 1200mm",
            "batch_number": "B260819001",
            "gross_weight": "2,450.50 KG",
            "net_weight": "2,430.00 KG",
            "production_date": "19.08.2026",
            "operator_id": "OP-9821"
        },
        "codes": {
            "barcode_batch": "B260819001",
            "qr_traceability": "https://trace.company.com/label?batch=B260819001&mat=RM-ST-00129"
        }
    }


@pytest.fixture
def sample_custom_svg():
    return """<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm" viewBox="0 0 1600 640">
  <rect x="10" y="10" width="1580" height="620" fill="none" stroke="#000" stroke-width="4"/>
  <text x="50" y="80" font-family="Arial" font-size="28" fill="#000">{{material_number}}</text>
  <rect x="50" y="150" width="600" height="120" data-barcode="barcode_batch" fill="none"/>
  <rect x="800" y="150" width="200" height="200" data-qr="qr_traceability" fill="none"/>
</svg>"""
