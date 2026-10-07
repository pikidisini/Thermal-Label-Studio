"""Parse local Compose files only; never contact the Docker daemon or services."""

import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[2]


def compose_config(missing=None):
    docker = shutil.which("docker")
    if docker is None:
        pytest.skip("Docker Compose CLI unavailable; configuration parse not run")
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("TLS_", "COMPOSE_")) and key != "RESVG_SHA256"}
    environment.update({
        "RESVG_SHA256": "0" * 64,  # Syntax fixture, never a verified build checksum.
        "TLS_APP_PORT": "8002",
        "TLS_DB_PASSWORD": "synthetic-config-password",
        "TLS_MINIO_ACCESS_KEY": "synthetic-config-user",
        "TLS_MINIO_SECRET_KEY": "synthetic-config-secret",
    })
    if missing:
        environment[missing] = ""
    command = [docker, "compose", "--env-file", os.devnull, "-f", "docker-compose.yml"]
    command += ["config", "--format", "json"]
    return subprocess.run(command, cwd=ROOT, env=environment, capture_output=True,
                          text=True, timeout=30)


def test_standard_stack_keeps_data_identity_loopback_and_app_safeguards():
    result = compose_config()
    assert result.returncode == 0, result.stderr
    model = json.loads(result.stdout)
    assert model["name"] == "thermal-label-studio"
    services = model["services"]
    assert set(services) == {"app", "postgres", "minio"}
    app = services["app"]
    assert app["image"] == "thermal-label-studio:local"
    assert app["build"]["dockerfile"] == "Dockerfile"
    assert app["read_only"] and app["cap_drop"] == ["ALL"]
    assert "no-new-privileges:true" in app["security_opt"]
    assert app["pids_limit"] == 64 and app["mem_limit"] == "536870912"
    assert len(app["ports"]) == 1
    assert str(app["ports"][0]["published"]) == "8002"
    assert all(port["host_ip"] == "127.0.0.1" for service in services.values() for port in service.get("ports", []))
    assert model["volumes"]["postgres-data"] == {"name": "thermal-label-studio-p8c_p8c-postgres", "external": True}
    assert model["volumes"]["minio-data"] == {"name": "thermal-label-studio-p8c_p8c-minio", "external": True}
    assert "TLS_DATABASE_URL" in app["environment"]
    assert app["depends_on"]["postgres"]["condition"] == "service_healthy"
    assert app["depends_on"]["minio"]["condition"] == "service_started"
    assert not any("profiles" in service for service in services.values())


@pytest.mark.parametrize("missing", ["RESVG_SHA256", "TLS_DB_PASSWORD", "TLS_MINIO_ACCESS_KEY", "TLS_MINIO_SECRET_KEY"])
def test_persistence_configuration_rejects_missing_required_values(missing):
    result = compose_config(missing)
    assert result.returncode != 0
    assert missing in result.stderr
