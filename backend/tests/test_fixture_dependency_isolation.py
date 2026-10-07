"""Persistence stays inactive without configuration, even without its drivers."""

import os
from pathlib import Path
import subprocess
import sys


def test_fixture_http_works_when_persistence_drivers_are_unavailable():
    root = Path(__file__).resolve().parents[2]
    environment = {key: value for key, value in os.environ.items() if not key.startswith("TLS_")}
    environment["PYTHONPATH"] = str(root / "backend")
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    # A fresh interpreter prevents installed/cached drivers from masking a leak.
    script = """
import builtins
original_import = builtins.__import__
def fixture_import(name, *args, **kwargs):
    if name.split('.')[0] in {'psycopg', 'minio'}:
        raise AssertionError('Fixture imported a persistence driver')
    return original_import(name, *args, **kwargs)
builtins.__import__ = fixture_import
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    assert client.get('/health').json() == {'status': 'ok'}
    response = client.get('/api/v1/layouts')
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'layout_persistence_unavailable'
"""
    result = subprocess.run(
        [sys.executable, "-B", "-c", script], cwd=root, env=environment,
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
