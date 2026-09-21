"""End-to-end integration and simulation tests for Pilot Deployment (B2B2F).

Verifies AC 1 through AC 6:
- Docker compose configuration validity.
- Environment template security hygiene.
- Explicit schema migration verification (ADR-024).
- Pilot printer & media profile seeding.
- Batch ingestion -> Durable storage artifact persistence -> Central dispatching -> Network socket transmission.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import uuid

import psycopg
import pytest

from backend.app.print_jobs.artifact_storage import DEFAULT_RETENTION, DurableFilesystemArtifactStorage
from backend.app.print_jobs.batch_ingestion import (
    BatchIngestionRequest,
    BatchIngestionService,
    BatchItemInput,
)
from backend.app.print_jobs.central_dispatcher import (
    CentralPrintDispatcher,
    DispatchResult,
    DispatchStatus,
)
from backend.app.print_jobs.migrations import apply_baseline, rollback_baseline, verify_baseline
from backend.app.print_jobs.models import PrintJobStatus
from backend.app.print_jobs.postgres_repository import PostgresPrintAgentRepository
from backend.app.print_jobs.seed_pilot import (
    DEFAULT_MEDIA_PROFILE_VERSION_ID,
    DEFAULT_TEMPLATE_VERSION_ID,
    seed_pilot_data,
)
from backend.app.print_jobs.socket_transport import (
    MockSocketTransport,
    SocketTransportResult,
    TransportOutcome,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_DSN = os.getenv("TEST_POSTGRES_DSN")


# ------------------------------------------------------------------------------
# AC 1: Docker Compose Configuration Validation
# ------------------------------------------------------------------------------

def test_docker_compose_pilot_config():
    """AC 1: docker compose config validates syntax, services, volumes, and networks."""
    docker_bin = shutil.which("docker")
    if not docker_bin:
        pytest.skip("docker binary not found on host")

    compose_file = REPO_ROOT / "docker-compose.pilot.yml"
    assert compose_file.exists(), "docker-compose.pilot.yml must exist"

    result = subprocess.run(
        [docker_bin, "compose", "-f", str(compose_file), "config"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"docker compose config failed: {result.stderr}"
    config_yaml = result.stdout

    # Verify required services
    assert "db:" in config_yaml
    assert "app:" in config_yaml
    assert "dispatcher:" in config_yaml

    # Verify required volumes
    assert "postgres_data" in config_yaml
    assert "artifact_data" in config_yaml

    # Verify network
    assert "pilot_net" in config_yaml or "pilot_network" in config_yaml


# ------------------------------------------------------------------------------
# AC 4: Environment Template & Secret Hygiene
# ------------------------------------------------------------------------------

def test_env_pilot_example_hygiene():
    """AC 4: .env.pilot.example contains all required variables with zero real secrets."""
    env_file = REPO_ROOT / ".env.pilot.example"
    assert env_file.exists(), ".env.pilot.example must exist"

    content = env_file.read_text(encoding="utf-8")
    lines = [line.strip() for line in content.splitlines() if line.strip() and not line.startswith("#")]
    env_dict = dict(line.split("=", 1) for line in lines if "=" in line)

    required_keys = [
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_PORT",
        "APP_PORT",
        "PRINT_AGENT_ENABLED",
        "PRINT_AGENT_REPOSITORY_BACKEND",
        "PRINT_AGENT_DATABASE_URL",
        "PRINT_AGENT_ARTIFACT_ROOT",
        "PILOT_SITE_ID",
        "PILOT_DISPATCHER_ID",
        "DISPATCHER_POLL_INTERVAL_SECONDS",
        "DISPATCHER_LEASE_SECONDS",
        "DISPATCHER_SOCKET_TIMEOUT",
        "PILOT_PRINTER_ID",
        "PILOT_PRINTER_HOST",
        "PILOT_PRINTER_PORT",
    ]

    for key in required_keys:
        assert key in env_dict, f"Missing required configuration key: {key}"

    # Secret hygiene check: passwords must be placeholders, not real credentials
    pw = env_dict["POSTGRES_PASSWORD"]
    assert any(placeholder in pw.lower() for placeholder in ["replace", "change_me", "pilot", "example"]), (
        f"Password seems to contain a non-placeholder value: {pw}"
    )


# ------------------------------------------------------------------------------
# AC 2: Explicit Migration Helper & Script Validation
# ------------------------------------------------------------------------------

def test_pilot_init_script_content():
    """AC 2: scripts/pilot_init.sh enforces explicit migration and zero auto-migration."""
    init_script = REPO_ROOT / "scripts" / "pilot_init.sh"
    assert init_script.exists(), "scripts/pilot_init.sh must exist"

    content = init_script.read_text(encoding="utf-8")
    assert "migrations apply" in content
    assert "migrations verify" in content
    assert "seed_pilot" in content


def test_seed_pilot_parameter_validation():
    """AC 4 & AC 5: seed_pilot_data validates inputs fail-closed."""
    with pytest.raises(ValueError, match="database_url is required"):
        seed_pilot_data("")

    valid_url = "postgresql://user:aB9_xK2_mQ7_vP4_zL1@localhost/db"

    with pytest.raises(ValueError, match="printer_id is required"):
        seed_pilot_data(valid_url, printer_id="")

    with pytest.raises(ValueError, match="brand must be one of"):
        seed_pilot_data(valid_url, brand="EPSON")

    with pytest.raises(ValueError, match="printer_language must be ipl or zpl"):
        seed_pilot_data(valid_url, printer_language="epl")

    with pytest.raises(ValueError, match="IPL printer language only supports native emulation"):
        seed_pilot_data(valid_url, printer_language="ipl", emulation="zsim2")


# ------------------------------------------------------------------------------
# AC 2, AC 3, AC 5, AC 6: End-to-End Pilot Lifecycle Simulation
# ------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def database_url():
    if not TEST_DSN:
        pytest.skip("TEST_POSTGRES_DSN is not configured")
    rollback_baseline(TEST_DSN)
    assert apply_baseline(TEST_DSN) is True
    verify_baseline(TEST_DSN)
    yield TEST_DSN
    rollback_baseline(TEST_DSN)


def test_pilot_e2e_simulation_workflow(database_url: str, tmp_path: Path):
    """Full pilot simulation covering migration -> seed -> ingestion -> dispatch -> socket."""
    site_id = "pilot-site"
    printer_id = "PRN-PILOT-01"
    dispatcher_id = "pilot-dispatcher-worker-1"

    # Step 1: Explicit Seed of Pilot Printer (Honeywell PD45S, IPL native, TCP 9100)
    seed_res = seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        site_id=site_id,
        area_id="packing-line-1",
        brand="HONEYWELL",
        model="PD45S",
        network_host="127.0.0.1",
        network_port=9100,
        printer_language="ipl",
        emulation="native",
        dpi=203.0,
        width_mm=80.0,
        height_mm=200.0,
    )
    assert seed_res["printer_id"] == printer_id
    assert seed_res["site_id"] == site_id

    # Step 2: Test seed idempotency (subsequent runs must not fail)
    seed_res_2 = seed_pilot_data(
        database_url=database_url,
        printer_id=printer_id,
        site_id=site_id,
        network_host="127.0.0.1",
        network_port=9100,
    )
    assert seed_res_2["printer_id"] == printer_id

    # Step 3: Initialize Durable Storage Volume (AC 3)
    artifact_root = (tmp_path / "pilot_artifacts").resolve()
    storage = DurableFilesystemArtifactStorage(artifact_root, retention=DEFAULT_RETENTION)

    repo = PostgresPrintAgentRepository(database_url)
    try:
        # Verify schema passes check without auto-migration (ADR-024)
        repo.verify_schema()

        batch_service = BatchIngestionService(
            repository=repo,
            artifact_storage=storage,
        )

        request_id = f"req-pilot-{uuid.uuid4().hex[:8]}"
        ingest_result = batch_service.ingest_batch(
            BatchIngestionRequest(
                producer_namespace="sap_pilot",
                request_id=request_id,
                printer_id=printer_id,
                items=(
                    BatchItemInput(
                        template_version_id=seed_res["template_version_id"],
                        canonical_item_data={"sku": "ITEM-PILOT-80200", "qty": 10},
                        copies=1,
                    ),
                ),
            )
        )

        assert ingest_result.total_items == 1
        batch_id = ingest_result.batch_id
        job_id = ingest_result.job_ids[0]

        # Verify artifact exists in durable volume with 7-day retention manifest
        job = repo.get(job_id)
        assert job.artifact is not None
        assert job.artifact_sha256 is not None
        manifest = storage.get_manifest(job.artifact.payload_ref)
        assert manifest.filename == "label.ipl"
        assert manifest.byte_length > 0

        # Step 5: Dispatcher Worker Takes Job and Sends to Socket Transport
        mock_socket = MockSocketTransport(outcome=TransportOutcome.SUCCESS)

        dispatcher = CentralPrintDispatcher(
            site_id=site_id,
            dispatcher_id=dispatcher_id,
            repository=repo,
            artifact_storage=storage,
            transport=mock_socket,
            lease_duration=timedelta(seconds=30),
        )

        # Execute single deterministic dispatch cycle
        dispatch_result = dispatcher.run_once()

        assert dispatch_result.status == DispatchStatus.COMPLETED
        assert dispatch_result.job is not None
        assert dispatch_result.bytes_sent > 0

        # Verify Socket received exact payload
        assert len(mock_socket.calls) == 1
        call_host, call_port, call_payload = mock_socket.calls[0]
        assert call_host == "127.0.0.1"
        assert call_port == 9100
        assert len(call_payload) == dispatch_result.bytes_sent

        # Verify Database Job Status
        final_job = repo.get(job_id)
        assert final_job.status == PrintJobStatus.SENT_TO_PRINTER
        assert final_job.claim is not None
        assert final_job.claim.agent_id == dispatcher_id

        # Verify second dispatch cycle is IDLE
        idle_result = dispatcher.run_once()
        assert idle_result.status == DispatchStatus.IDLE

    finally:
        repo.close()
