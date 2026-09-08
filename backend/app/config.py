"""
Application Configuration and Path Management.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List

# Ensure Project Root is in sys.path so engine modules can be imported
BACKEND_DIR = Path(__file__).resolve().parent.parent
WEB_APP_DIR = BACKEND_DIR.parent
PROJECT_ROOT = WEB_APP_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Directories
BUILTIN_TEMPLATES_DIR = PROJECT_ROOT / "assets" / "templates"
CUSTOM_TEMPLATES_DIR = BACKEND_DIR / "data" / "templates"
DATA_SAMPLES_DIR = PROJECT_ROOT / "data_samples"
STORAGE_OUT_DIR = BACKEND_DIR / "data" / "out"
FRONTEND_DIR = (WEB_APP_DIR / "frontend" / "dist") if (WEB_APP_DIR / "frontend" / "dist" / "index.html").exists() else (WEB_APP_DIR / "frontend")

# Ensure directories exist
CUSTOM_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_OUT_DIR.mkdir(parents=True, exist_ok=True)

# Application Settings
APP_TITLE = "Thermal Label Printer Parser & Engine API"
APP_DESCRIPTION = (
    "RESTful API service for thermal label rendering, vector barcode/QR generation, "
    "template management, and direct printer dispatching (ZPL, TSPL, IPL, PDF, PNG)."
)
APP_VERSION = "1.1.0"

# Server & CORS
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "*",
]

DEFAULT_DPI = 203.2
DEFAULT_WIDTH_MM = 200.0
DEFAULT_HEIGHT_MM = 80.0
