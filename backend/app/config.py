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
PROJECT_ROOT = WEB_APP_DIR if (WEB_APP_DIR / "engine").exists() else WEB_APP_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(WEB_APP_DIR) not in sys.path:
    sys.path.insert(0, str(WEB_APP_DIR))

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

DEFAULT_CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
]

_custom_cors_env = os.getenv("CORS_ORIGINS")
if _custom_cors_env:
    CORS_ORIGINS: List[str] = [
        orig.strip()
        for orig in _custom_cors_env.split(",")
        if orig.strip() and orig.strip() != "*"
    ]
else:
    CORS_ORIGINS: List[str] = DEFAULT_CORS_ORIGINS

DEFAULT_DPI = 203.2
DEFAULT_WIDTH_MM = 200.0
DEFAULT_HEIGHT_MM = 80.0


def is_safe_demo_enabled() -> bool:
    """Check if safe demo mode is explicitly enabled via environment variable.

    Defaults to False for fail-closed security.
    """
    return os.getenv("SAFE_DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")


SAFE_DEMO_MODE = is_safe_demo_enabled()


def is_local_simulation_only() -> bool:
    """Disable legacy physical dispatch routes in local simulation deployments."""
    return os.getenv("LOCAL_SIMULATION_ONLY", "false").strip().lower() == "true"


def is_sap_shadow_simulation_enabled() -> bool:
    """Check if SAP shadow print simulation mode is explicitly enabled via environment variable.

    Defaults to False for fail-closed security.
    """
    return os.getenv("SAP_SHADOW_SIMULATION_ENABLED", "false").strip().lower() in ("true", "1", "yes")


SAP_SHADOW_SIMULATION_ENABLED = is_sap_shadow_simulation_enabled()


def get_sap_simulation_auth_token() -> str:
    """Retrieve configured token for authenticating SAP shadow simulation requests.

    Must be explicitly set; empty token fails closed.
    """
    return os.getenv("SAP_SIMULATION_AUTH_TOKEN", "").strip()


SAP_SIMULATION_AUTH_TOKEN = get_sap_simulation_auth_token()


def is_pilot_operator_enabled() -> bool:
    """Check if pilot operator self-service session mode is enabled via environment variable.

    Defaults to False for fail-closed security.
    """
    return os.getenv("PILOT_OPERATOR_ENABLED", "false").strip().lower() in ("true", "1", "yes")


PILOT_OPERATOR_ENABLED = is_pilot_operator_enabled()


def get_pilot_operator_secret() -> str:
    """Retrieve configured secret/password for pilot operator authentication.

    Must be explicitly set; empty secret fails closed.
    Supports PILOT_OPERATOR_SECRET or PILOT_OPERATOR_PASSWORD.
    """
    secret = os.getenv("PILOT_OPERATOR_SECRET", "").strip()
    if not secret:
        secret = os.getenv("PILOT_OPERATOR_PASSWORD", "").strip()
    return secret


PILOT_OPERATOR_SECRET = get_pilot_operator_secret()


def get_pilot_session_ttl_seconds() -> int:
    """Retrieve session time-to-live in seconds for pilot operator session (default 3600 = 1 hour)."""
    try:
        return int(os.getenv("PILOT_OPERATOR_SESSION_TTL_SECONDS", "3600").strip())
    except (ValueError, TypeError):
        return 3600


PILOT_OPERATOR_SESSION_TTL_SECONDS = get_pilot_session_ttl_seconds()
