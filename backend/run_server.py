"""
Standalone server launcher for Label Engine FastAPI backend.
Usage:
    python web_app/backend/run_server.py
"""

import sys
from pathlib import Path
import uvicorn

# Ensure UTF-8 output encoding for Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root is in sys.path
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from app.config import HOST, PORT

if __name__ == "__main__":
    print(f"Starting Thermal Label Engine Server on http://{HOST}:{PORT}")
    print(f"Interactive Swagger Docs: http://{HOST}:{PORT}/docs")
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
