"""Disposable PostgreSQL integration tests for the B2B2C repository."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path

import httpx
import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_print_agent import InMemoryAgentRateLimiter, PrintAgentDependencies, PrintAgentSettings, router
from app.local_print_agent.api_client import HttpPrintAgentApiClient
from app.local_print_agent.config import LocalPrinterProfile, PrintAgentConfig
from app.local_print_agent.models import AgentRunStatus
from app.local_print_agent.runner import LocalPrintAgentRunner
from app.local_print_agent.transport import MemoryPrinterTransport
from app.print_jobs.artifact_storage import TemporaryArtifactStorage
from app.print_jobs.migrations import apply_baseline, verify_baseline
from app.print_jobs.models import Emulation, PrinterLanguage, PrinterProfile
from app.print_jobs.postgres_repository import PostgresPrintAgentRepository
from app.print_jobs.repository import DeliveryConflictError, JobExpiredError
from app.print_jobs.transport import MockTransportOutcome


TEST_DSN = os.getenv("TEST_POSTGRES_DSN")
pytestmark = pytest.mark.skipif(not TEST_DSN, reason="TEST_POSTGRES_DSN is not configured")


@pytest.fixture(scope="module")
def database_url() -> str:
    assert TEST_DSN is not None
    assert apply_baseline(TEST_DSN) is True
    assert apply_baseline(TEST_DSN) is False
    verify_baseline(TEST_DSN)
    return TEST_DSN


def _seed(database_url: str) -> tuple[str, str, str, str]:
    job_one = "00000000-0000-0000-0000-000000001001"
    job_two = "00000000-0000-0000-0000-000000001002"
    job_three = "00000000-0000-0000-0000-000000001003"
    job_four = "00000000-0000-0000-0000-000000001004"
    source = json.dumps({"producer_type": "sap", "program": "pytest-b2b2c"})
    with psycopg.connect(database_url) as connection, connection.transaction():
        media_version = connection.execute(
            """
            INSERT INTO media_profiles (media_profile_id, name)
            VALUES ('TEST-MEDIA', 'B2B2C media')
            RETURNING media_profile_id
            """
        ).fetchone()[0]
        media_version_id = connection.execute(
            """
            INSERT INTO media_profile_versions (
                media_profile_id, version, width_mm, height_mm,
                material_type, sensor_mode, orientation
            ) VALUES (%s, 1, 80, 200, 'paper', 'gap', 'portrait')
            RETURNING media_profile_version_id
            """,
            (media_version,),
        ).fetchone()[0]
        template_version_id = connection.execute(
            """
            INSERT INTO template_versions (
                template_id, version, svg_payload_ref, svg_content_sha256,
                width_mm, height_mm, orientation
            ) VALUES ('test-template', 1, 'test-template-v1', %s, 80, 200, 'portrait')
            RETURNING template_version_id
            """,
            ("a" * 64,),
        ).fetchone()[0]
        for printer_id in ("printer-pg-1", "printer-pg-2"):
            connection.execute(
                """
                INSERT INTO printer_registry (
                    printer_id, site_id, area_id, brand, model, delivery_mode,
                    configured_media_profile_version_id, gateway_executor_id,
                    printer_language, emulation, confirmed_dpi
                ) VALUES (%s, 'site-pg', 'line-test', 'HONEYWELL', 'PM45',
                          'gateway_agent', %s, 'agent-pg', 'ipl', 'native', 203)
                """,
                (printer_id, media_version_id),
            )
            connection.execute(
                "INSERT INTO printer_dispatch_state (printer_id) VALUES (%s)",
                (printer_id,),
            )
        fixture_rows = (
            ("00000000-0000-0000-0000-000000002001", "request-pg-1", "printer-pg-1", job_one, "00000000-0000-0000-0000-000000003001", "payload-pg-1"),
            ("00000000-0000-0000-0000-000000002002", "request-pg-2", "printer-pg-2", job_two, "00000000-0000-0000-0000-000000003002", "payload-pg-2"),
            ("00000000-0000-0000-0000-000000002003", "request-pg-3", "printer-pg-2", job_three, "00000000-0000-0000-0000-000000003003", "payload-pg-3"),
            ("00000000-0000-0000-0000-000000002004", "request-pg-4", "printer-pg-1", job_four, "00000000-0000-0000-0000-000000003004", "payload-pg-4"),
        )
        for batch_id, request_id, printer_id, job_id, item_id, payload_ref in fixture_rows:
            connection.execute(
                """
                INSERT INTO print_batches (
                    batch_id, producer_namespace, request_id, source_metadata,
                    raw_contract_sha256, canonical_payload_snapshot, printer_id,
                    configured_media_profile_version_id, printer_capability_snapshot,
                    status, total_items, expires_at
                ) VALUES (%s, 'pytest', %s, %s::jsonb, %s, '{}'::jsonb, %s, %s,
                          '{}'::jsonb, 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')
                """,
                (batch_id, request_id, source, "b" * 64, printer_id, media_version_id),
            )
            connection.execute(
                """
                INSERT INTO print_batch_items (
                    item_id, batch_id, item_sequence, template_version_id,
                    canonical_item_data, item_data_sha256, copies, status
                ) VALUES (%s, %s, 1, %s, '{}'::jsonb, %s, 1, 'rendered')
                """,
                (item_id, batch_id, template_version_id, "c" * 64),
            )
            connection.execute(
                """
                INSERT INTO print_jobs (
                    job_id, batch_id, item_id, printer_id, job_kind, status, expires_at
                ) VALUES (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
                """,
                (job_id, batch_id, item_id, printer_id),
            )
            connection.execute(
                """
                INSERT INTO print_artifacts (
                    job_id, payload_ref, filename, media_type, byte_length,
                    artifact_sha256, printer_language_snapshot, renderer_version,
                    template_version_id, printer_capability_snapshot, retention_expires_at
                ) VALUES (%s, %s, 'label.ipl', 'application/octet-stream', 3, %s,
                          'ipl', 'pytest-renderer', %s, '{}'::jsonb,
                          CURRENT_TIMESTAMP + INTERVAL '1 day')
                """,
                (job_id, payload_ref, sha256(b"IPL").hexdigest(), template_version_id),
            )
    return job_one, job_two, job_three, job_four


def test_postgres_repository_atomic_lifecycle_and_concurrent_claim(
    database_url: str,
    tmp_path: Path,
) -> None:
    job_one, job_two, job_three, job_four = _seed(database_url)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=6)
    now = datetime.now(timezone.utc)
    try:
        queued = repository.get(job_one)
        assert queued.status.value == "queued"
        claimed = repository.claim_next(
            "site-pg", "agent-pg", now, timedelta(seconds=60), eligible_job_ids={job_one}
        )
        assert claimed is not None and claimed.job_id == job_one
        assert claimed.claim is not None and claimed.claim.fencing_token >= 1
        with pytest.raises(DeliveryConflictError):
            repository.begin_delivery(
                job_one,
                "agent-pg",
                now,
                fencing_token=claimed.claim.fencing_token + 1,
            )
        sending = repository.begin_delivery(
            job_one,
            "agent-pg",
            now,
            fencing_token=claimed.claim.fencing_token,
        )
        assert sending.status.value == "sending" and sending.attempt_count == 1
        final = repository.report_result(
            job_one,
            "agent-pg",
            MockTransportOutcome.SUCCESS,
            3,
            fencing_token=claimed.claim.fencing_token,
        )
        assert final.status.value == "sent_to_printer"
        repeated = repository.report_result(
            job_one,
            "agent-pg",
            MockTransportOutcome.SUCCESS,
            3,
            fencing_token=claimed.claim.fencing_token,
        )
        assert repeated == final
        with pytest.raises(DeliveryConflictError):
            repository.report_result(
                job_one,
                "agent-pg",
                MockTransportOutcome.DELIVERY_UNKNOWN,
                3,
                fencing_token=claimed.claim.fencing_token,
            )

        def claim_for_printer_two(agent_id: str):
            return repository.claim_next(
                "site-pg",
                agent_id,
                datetime.now(timezone.utc),
                timedelta(seconds=60),
                eligible_job_ids={job_two, job_three},
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(claim_for_printer_two, ("agent-a", "agent-b")))
        winners = [result for result in results if result is not None]
        assert len(winners) == 1
        assert winners[0].job_id in {job_two, job_three}

        recovered_job = winners[0]
        assert recovered_job.claim is not None
        first_fencing_token = recovered_job.claim.fencing_token
        with psycopg.connect(database_url) as connection, connection.transaction():
            connection.execute(
                """
                UPDATE print_jobs
                SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
                    lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
                WHERE job_id = %s::uuid
                """,
                (recovered_job.job_id,),
            )
            connection.execute(
                """
                UPDATE printer_dispatch_state
                SET acquired_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
                    lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
                WHERE printer_id = 'printer-pg-2'
                """
            )
        requeued = repository.reconcile_job(recovered_job.job_id, datetime.now(timezone.utc))
        assert requeued.status.value == "queued" and requeued.claim is None
        reclaimed = repository.claim_next(
            "site-pg",
            "agent-recovered",
            datetime.now(timezone.utc),
            timedelta(seconds=60),
            eligible_job_ids={recovered_job.job_id},
        )
        assert reclaimed is not None and reclaimed.claim is not None
        assert reclaimed.claim.fencing_token > first_fencing_token
        repository.begin_delivery(
            reclaimed.job_id,
            "agent-recovered",
            datetime.now(timezone.utc),
            fencing_token=reclaimed.claim.fencing_token,
        )
        with psycopg.connect(database_url) as connection, connection.transaction():
            connection.execute(
                """
                UPDATE print_jobs
                SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
                    lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
                WHERE job_id = %s::uuid
                """,
                (reclaimed.job_id,),
            )
        unknown = repository.reconcile_job(reclaimed.job_id, datetime.now(timezone.utc))
        assert unknown.status.value == "delivery_unknown"
        assert unknown.claim is not None

        losing_job_id = ({job_two, job_three} - {recovered_job.job_id}).pop()
        expiring = repository.claim_next(
            "site-pg",
            "agent-expired",
            datetime.now(timezone.utc),
            timedelta(seconds=60),
            eligible_job_ids={losing_job_id},
        )
        assert expiring is not None and expiring.claim is not None
        with psycopg.connect(database_url) as connection, connection.transaction():
            connection.execute(
                """
                UPDATE print_jobs
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
                    expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
                WHERE job_id = %s::uuid
                """,
                (losing_job_id,),
            )
        with pytest.raises(JobExpiredError):
            repository.begin_delivery(
                losing_job_id,
                "agent-expired",
                datetime.now(timezone.utc),
                fencing_token=expiring.claim.fencing_token,
            )
        assert repository.get(losing_job_id).status.value == "expired"

        with psycopg.connect(database_url) as connection:
            outbox_count = connection.execute(
                "SELECT count(*) FROM print_job_outbox WHERE aggregate_id = %s::uuid", (job_one,)
            ).fetchone()[0]
            audit_count = connection.execute(
                "SELECT count(*) FROM print_audit_events WHERE aggregate_id = %s::uuid", (job_one,)
            ).fetchone()[0]
        assert outbox_count == 1
        assert audit_count == 3

        storage = TemporaryArtifactStorage(tmp_path / "durable-artifacts")
        storage.put("payload-pg-4", "label.ipl", b"IPL")
        settings = PrintAgentSettings(
            enabled=True,
            bearer_token="postgres-test-token",
            agent_id="agent-pg",
            site_id="site-pg",
        )
        dependencies = PrintAgentDependencies(
            settings=settings,
            repository=repository,
            artifact_storage=storage,
            profiles=(
                PrinterProfile(
                    printer_id="printer-pg-1",
                    site_id="site-pg",
                    language=PrinterLanguage.IPL,
                    emulation=Emulation.NATIVE,
                    dpi=203,
                    dpi_confirmed=True,
                ),
            ),
            rate_limiter=InMemoryAgentRateLimiter(30, 60),
        )
        application = FastAPI()
        application.state.print_agent_dependencies = dependencies
        application.include_router(router, prefix="/api/v1")
        agent_config = PrintAgentConfig(
            base_url="http://127.0.0.1:8000",
            bearer_token="postgres-test-token",
            agent_id="agent-pg",
            site_id="site-pg",
            profiles=(
                LocalPrinterProfile(
                    printer_id="printer-pg-1",
                    site_id="site-pg",
                    language=PrinterLanguage.IPL,
                    emulation=Emulation.NATIVE,
                    dpi=203,
                    dpi_confirmed=True,
                    transport_id="memory",
                ),
            ),
        )
        with TestClient(application) as server:
            def bridge(request: httpx.Request) -> httpx.Response:
                forwarded = {
                    key: value
                    for key, value in request.headers.items()
                    if key.lower() in {"authorization", "content-type", "x-print-claim-token"}
                }
                server_response = server.request(
                    request.method,
                    request.url.path,
                    headers=forwarded,
                    content=request.content,
                )
                return httpx.Response(
                    server_response.status_code,
                    headers=dict(server_response.headers),
                    content=server_response.content,
                    request=request,
                )

            with httpx.Client(
                transport=httpx.MockTransport(bridge),
                base_url=agent_config.base_url,
                follow_redirects=False,
            ) as http_client:
                api_client = HttpPrintAgentApiClient(agent_config, http_client)
                transport = MemoryPrinterTransport()
                run = LocalPrintAgentRunner(
                    agent_config,
                    api_client,
                    {"memory": transport},
                ).run_once()
        assert run.status is AgentRunStatus.COMPLETED
        assert run.job is not None and run.job.job_id == job_four
        assert transport.payloads == [b"IPL"]
        assert repository.get(job_four).status.value == "sent_to_printer"
    finally:
        repository.close()
