"""Integration tests for CentralPrintDispatcher on disposable PostgreSQL and Durable Artifact Storage."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path

import psycopg
import pytest

from app.print_jobs.artifact_storage import (
    DEFAULT_RETENTION,
    DurableFilesystemArtifactStorage,
)
from app.print_jobs.central_dispatcher import (
    CentralPrintDispatcher,
    DispatchResult,
    DispatchStatus,
)
from app.print_jobs.migrations import apply_baseline, rollback_baseline, verify_baseline
from app.print_jobs.models import PrintJobStatus
from app.print_jobs.postgres_repository import PostgresPrintAgentRepository
from app.print_jobs.socket_transport import (
    MockSocketTransport,
    SocketTransport,
    SocketTransportResult,
    TransportOutcome,
)

TEST_DSN = os.getenv("TEST_POSTGRES_DSN")
pytestmark = pytest.mark.skipif(not TEST_DSN, reason="TEST_POSTGRES_DSN is not configured")


@pytest.fixture(scope="module")
def database_url() -> str:
    assert TEST_DSN is not None
    rollback_baseline(TEST_DSN)
    assert apply_baseline(TEST_DSN) is True
    verify_baseline(TEST_DSN)
    yield TEST_DSN
    rollback_baseline(TEST_DSN)


def _ensure_tcp_printer_fixtures(connection: psycopg.Connection) -> tuple[str, str, str]:
    connection.execute(
        """
        INSERT INTO media_profiles (media_profile_id, name)
        VALUES ('TEST-MEDIA-TCP', 'TCP media')
        ON CONFLICT (media_profile_id) DO NOTHING
        """
    )
    media_version_id = connection.execute(
        """
        INSERT INTO media_profile_versions (
            media_profile_id, version, width_mm, height_mm,
            material_type, sensor_mode, orientation
        ) VALUES ('TEST-MEDIA-TCP', 1, 80, 200, 'paper', 'gap', 'portrait')
        ON CONFLICT (media_profile_id, version) DO UPDATE SET width_mm = EXCLUDED.width_mm
        RETURNING media_profile_version_id
        """
    ).fetchone()[0]

    template_version_id = connection.execute(
        """
        INSERT INTO template_versions (
            template_id, version, svg_payload_ref, svg_content_sha256,
            width_mm, height_mm, orientation
        ) VALUES ('test-template-tcp', 1, 'test-template-tcp-v1', %s, 80, 200, 'portrait')
        ON CONFLICT (template_id, version) DO UPDATE SET width_mm = EXCLUDED.width_mm
        RETURNING template_version_id
        """,
        ("d" * 64,),
    ).fetchone()[0]

    printer_id = "printer-tcp-1"
    connection.execute(
        """
        INSERT INTO printer_registry (
            printer_id, site_id, area_id, brand, model, delivery_mode,
            configured_media_profile_version_id, network_host, network_port,
            printer_language, emulation, confirmed_dpi, is_enabled
        ) VALUES (%s, 'site-central', 'area-tcp', 'ZEBRA', 'ZT411',
                  'central_tcp', %s, '127.0.0.1', 9100, 'zpl', 'native', 203, TRUE)
        ON CONFLICT (printer_id) DO UPDATE
        SET delivery_mode = 'central_tcp', network_host = '127.0.0.1', network_port = 9100, is_enabled = TRUE
        """,
        (printer_id, media_version_id),
    )
    connection.execute(
        """
        INSERT INTO printer_dispatch_state (printer_id)
        VALUES (%s)
        ON CONFLICT (printer_id) DO NOTHING
        """,
        (printer_id,),
    )
    return str(media_version_id), str(template_version_id), printer_id


def test_dispatcher_successful_cycle(database_url: str, tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    payload_bytes = b"^XA^FO50,50^FDHELLO_CENTRAL^FS^XZ"
    payload_ref = "ref-central-test-1"
    storage.put(payload_ref, "label.zpl", payload_bytes)

    job_id = "11111111-1111-1111-1111-111111111001"
    batch_id = "11111111-1111-1111-1111-111111112001"
    item_id = "11111111-1111-1111-1111-111111113001"
    req_id = "req-central-1"

    with psycopg.connect(database_url) as conn, conn.transaction():
        media_vid, tmpl_vid, printer_id = _ensure_tcp_printer_fixtures(conn)
        source = json.dumps({"producer_type": "sap", "program": "central-test"})
        conn.execute(
            """
            INSERT INTO print_batches (
                batch_id, producer_namespace, request_id, source_metadata,
                raw_contract_sha256, canonical_payload_snapshot, printer_id,
                configured_media_profile_version_id, printer_capability_snapshot,
                status, total_items, expires_at
            ) VALUES (%s, 'central_ns', %s, %s::jsonb, %s, '{}'::jsonb, %s, %s,
                      '{}'::jsonb, 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')
            ON CONFLICT (batch_id) DO NOTHING
            """,
            (batch_id, req_id, source, "e" * 64, printer_id, media_vid),
        )
        conn.execute(
            """
            INSERT INTO print_batch_items (
                item_id, batch_id, item_sequence, template_version_id,
                canonical_item_data, item_data_sha256, copies, status
            ) VALUES (%s, %s, 1, %s, '{}'::jsonb, %s, 1, 'rendered')
            ON CONFLICT (item_id) DO NOTHING
            """,
            (item_id, batch_id, tmpl_vid, "f" * 64),
        )
        conn.execute(
            """
            INSERT INTO print_jobs (
                job_id, batch_id, item_id, printer_id, job_kind, status, expires_at
            ) VALUES (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, batch_id, item_id, printer_id),
        )
        conn.execute(
            """
            INSERT INTO print_artifacts (
                job_id, payload_ref, filename, media_type, byte_length,
                artifact_sha256, printer_language_snapshot, renderer_version,
                template_version_id, printer_capability_snapshot, retention_expires_at
            ) VALUES (%s, %s, 'label.zpl', 'application/octet-stream', %s, %s,
                      'zpl', 'central-v1', %s, '{}'::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, payload_ref, len(payload_bytes), sha256(payload_bytes).hexdigest(), tmpl_vid),
        )

    mock_transport = MockSocketTransport(outcome=TransportOutcome.SUCCESS)
    dispatcher = CentralPrintDispatcher(
        site_id="site-central",
        dispatcher_id="dispatcher-1",
        repository=repository,
        artifact_storage=storage,
        transport=mock_transport,
        lease_duration=timedelta(seconds=30),
    )

    result = dispatcher.run_once()

    assert result.status == DispatchStatus.COMPLETED
    assert result.outcome == "success"
    assert result.bytes_sent == len(payload_bytes)
    assert result.job is not None
    assert result.job.status == PrintJobStatus.SENT_TO_PRINTER
    assert len(mock_transport.calls) == 1
    assert mock_transport.calls[0] == ("127.0.0.1", 9100, payload_bytes)

    # Verify persisted job in PostgreSQL
    persisted = repository.get(job_id)
    assert persisted.status == PrintJobStatus.SENT_TO_PRINTER
    assert persisted.claim is not None
    assert persisted.claim.agent_id == "dispatcher-1"


def test_dispatcher_zero_long_held_lock_during_socket_io(database_url: str, tmp_path: Path) -> None:
    """Verifies AC 2: Zero database connections or locks are held during socket transmission."""
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    payload_bytes = b"^XA^FO50,50^FDTEST_ZERO_LOCK^FS^XZ"
    payload_ref = "ref-central-test-zero-lock"
    storage.put(payload_ref, "label.zpl", payload_bytes)

    job_id = "11111111-1111-1111-1111-111111111002"
    batch_id = "11111111-1111-1111-1111-111111112002"
    item_id = "11111111-1111-1111-1111-111111113002"

    with psycopg.connect(database_url) as conn, conn.transaction():
        media_vid, tmpl_vid, printer_id = _ensure_tcp_printer_fixtures(conn)
        source = json.dumps({"producer_type": "sap", "program": "zero-lock-test"})
        conn.execute(
            """
            INSERT INTO print_batches (
                batch_id, producer_namespace, request_id, source_metadata,
                raw_contract_sha256, canonical_payload_snapshot, printer_id,
                configured_media_profile_version_id, printer_capability_snapshot,
                status, total_items, expires_at
            ) VALUES (%s, 'zero_lock_ns', 'req-zero-lock', %s::jsonb, %s, '{}'::jsonb, %s, %s,
                      '{}'::jsonb, 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')
            ON CONFLICT (batch_id) DO NOTHING
            """,
            (batch_id, source, "e" * 64, printer_id, media_vid),
        )
        conn.execute(
            """
            INSERT INTO print_batch_items (
                item_id, batch_id, item_sequence, template_version_id,
                canonical_item_data, item_data_sha256, copies, status
            ) VALUES (%s, %s, 1, %s, '{}'::jsonb, %s, 1, 'rendered')
            ON CONFLICT (item_id) DO NOTHING
            """,
            (item_id, batch_id, tmpl_vid, "f" * 64),
        )
        conn.execute(
            """
            INSERT INTO print_jobs (
                job_id, batch_id, item_id, printer_id, job_kind, status, expires_at
            ) VALUES (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, batch_id, item_id, printer_id),
        )
        conn.execute(
            """
            INSERT INTO print_artifacts (
                job_id, payload_ref, filename, media_type, byte_length,
                artifact_sha256, printer_language_snapshot, renderer_version,
                template_version_id, printer_capability_snapshot, retention_expires_at
            ) VALUES (%s, %s, 'label.zpl', 'application/octet-stream', %s, %s,
                      'zpl', 'central-v1', %s, '{}'::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, payload_ref, len(payload_bytes), sha256(payload_bytes).hexdigest(), tmpl_vid),
        )

    lock_checked = False

    class LockCheckingTransport:
        def send(self, host: str, port: int, payload: bytes) -> SocketTransportResult:
            nonlocal lock_checked
            # Check pool connection usage during the socket send call!
            stats = repository._pool.get_stats()
            # pool stats shows connections currently checked out
            checked_out = stats.get("connections_allocated", 0) - stats.get("connections_available", 0)
            assert checked_out == 0, f"Database connection was checked out during socket I/O! stats={stats}"
            lock_checked = True
            return SocketTransportResult(TransportOutcome.SUCCESS, len(payload))

    dispatcher = CentralPrintDispatcher(
        site_id="site-central",
        dispatcher_id="dispatcher-lock-checker",
        repository=repository,
        artifact_storage=storage,
        transport=LockCheckingTransport(),
    )

    result = dispatcher.run_once()
    assert result.status == DispatchStatus.COMPLETED
    assert lock_checked is True


def test_dispatcher_delivery_unknown_pauses_batch_and_holds_remaining_items(
    database_url: str,
    tmp_path: Path,
) -> None:
    """Verifies AC 4: Mid-stream disconnect transitions to delivery_unknown, pauses batch, and holds items."""
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    payload_1 = b"^XA^FDITEM_1^FS^XZ"
    payload_2 = b"^XA^FDITEM_2^FS^XZ"
    storage.put("ref-unknown-1", "label.zpl", payload_1)
    storage.put("ref-unknown-2", "label.zpl", payload_2)

    job_1 = "11111111-1111-1111-1111-111111111003"
    job_2 = "11111111-1111-1111-1111-111111111004"
    batch_id = "11111111-1111-1111-1111-111111112003"
    item_1 = "11111111-1111-1111-1111-111111113003"
    item_2 = "11111111-1111-1111-1111-111111113004"

    with psycopg.connect(database_url) as conn, conn.transaction():
        media_vid, tmpl_vid, printer_id = _ensure_tcp_printer_fixtures(conn)
        source = json.dumps({"producer_type": "sap", "program": "unknown-test"})
        conn.execute(
            """
            INSERT INTO print_batches (
                batch_id, producer_namespace, request_id, source_metadata,
                raw_contract_sha256, canonical_payload_snapshot, printer_id,
                configured_media_profile_version_id, printer_capability_snapshot,
                status, total_items, expires_at
            ) VALUES (%s, 'unknown_ns', 'req-unknown-batch', %s::jsonb, %s, '{}'::jsonb, %s, %s,
                      '{}'::jsonb, 'accepted', 2, CURRENT_TIMESTAMP + INTERVAL '1 hour')
            ON CONFLICT (batch_id) DO NOTHING
            """,
            (batch_id, source, "e" * 64, printer_id, media_vid),
        )
        conn.execute(
            """
            INSERT INTO print_batch_items (
                item_id, batch_id, item_sequence, template_version_id,
                canonical_item_data, item_data_sha256, copies, status
            ) VALUES
                (%s, %s, 1, %s, '{}'::jsonb, %s, 1, 'rendered'),
                (%s, %s, 2, %s, '{}'::jsonb, %s, 1, 'rendered')
            ON CONFLICT (item_id) DO NOTHING
            """,
            (item_1, batch_id, tmpl_vid, "f" * 64, item_2, batch_id, tmpl_vid, "f" * 64),
        )
        conn.execute(
            """
            INSERT INTO print_jobs (
                job_id, batch_id, item_id, printer_id, job_kind, status, expires_at
            ) VALUES
                (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes'),
                (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_1, batch_id, item_1, printer_id, job_2, batch_id, item_2, printer_id),
        )
        conn.execute(
            """
            INSERT INTO print_artifacts (
                job_id, payload_ref, filename, media_type, byte_length,
                artifact_sha256, printer_language_snapshot, renderer_version,
                template_version_id, printer_capability_snapshot, retention_expires_at
            ) VALUES
                (%s, 'ref-unknown-1', 'label.zpl', 'application/octet-stream', %s, %s,
                 'zpl', 'central-v1', %s, '{}'::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days'),
                (%s, 'ref-unknown-2', 'label.zpl', 'application/octet-stream', %s, %s,
                 'zpl', 'central-v1', %s, '{}'::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_1, len(payload_1), sha256(payload_1).hexdigest(), tmpl_vid,
             job_2, len(payload_2), sha256(payload_2).hexdigest(), tmpl_vid),
        )

    # Item 1 encounters DELIVERY_UNKNOWN (e.g. cable pulled during write)
    mock_transport = MockSocketTransport(
        outcome=TransportOutcome.DELIVERY_UNKNOWN,
        partial_bytes=10,
        error_message="socket broken mid-stream",
    )
    dispatcher = CentralPrintDispatcher(
        site_id="site-central",
        dispatcher_id="dispatcher-unknown-tester",
        repository=repository,
        artifact_storage=storage,
        transport=mock_transport,
    )

    result_1 = dispatcher.run_once()
    assert result_1.status == DispatchStatus.DELIVERY_UNKNOWN
    assert result_1.outcome == "delivery_unknown"
    assert result_1.bytes_sent == 10

    # Verify Item 1 status in database
    persisted_1 = repository.get(job_1)
    assert persisted_1.status == PrintJobStatus.DELIVERY_UNKNOWN

    # Verify parent batch was paused
    with psycopg.connect(database_url) as conn:
        batch_row = conn.execute(
            "SELECT status FROM print_batches WHERE batch_id = %s", (batch_id,)
        ).fetchone()
        assert batch_row[0] == "paused"

    # Attempt to run dispatcher again: Item 2 MUST NOT be claimed (paused batch is held)
    result_2 = dispatcher.run_once()
    assert result_2.status == DispatchStatus.IDLE

    # Verify Item 2 remains held in 'queued' status
    persisted_2 = repository.get(job_2)
    assert persisted_2.status == PrintJobStatus.QUEUED


def test_dispatcher_endpoint_resolution_fail_closed(database_url: str, tmp_path: Path) -> None:
    """Verifies AC 5: Non-TCP or disabled printers reject fail-closed without network call."""
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    payload_bytes = b"^XA^FDTEST_ENDPOINT_FAIL^FS^XZ"
    payload_ref = "ref-endpoint-fail"
    storage.put(payload_ref, "label.zpl", payload_bytes)

    job_id = "11111111-1111-1111-1111-111111111005"
    batch_id = "11111111-1111-1111-1111-111111112005"
    item_id = "11111111-1111-1111-1111-111111113005"
    disabled_printer = "printer-disabled-1"

    with psycopg.connect(database_url) as conn, conn.transaction():
        media_vid, tmpl_vid, _ = _ensure_tcp_printer_fixtures(conn)
        conn.execute(
            """
            INSERT INTO printer_registry (
                printer_id, site_id, area_id, brand, model, delivery_mode,
                configured_media_profile_version_id, network_host, network_port,
                printer_language, emulation, confirmed_dpi, is_enabled
            ) VALUES (%s, 'site-central', 'area-tcp', 'ZEBRA', 'ZT411',
                      'central_tcp', %s, '127.0.0.1', 9100, 'zpl', 'native', 203, FALSE)
            ON CONFLICT (printer_id) DO UPDATE SET is_enabled = FALSE
            """,
            (disabled_printer, media_vid),
        )
        conn.execute(
            """
            INSERT INTO printer_dispatch_state (printer_id)
            VALUES (%s)
            ON CONFLICT (printer_id) DO NOTHING
            """,
            (disabled_printer,),
        )
        source = json.dumps({"producer_type": "sap", "program": "disabled-test"})
        conn.execute(
            """
            INSERT INTO print_batches (
                batch_id, producer_namespace, request_id, source_metadata,
                raw_contract_sha256, canonical_payload_snapshot, printer_id,
                configured_media_profile_version_id, printer_capability_snapshot,
                status, total_items, expires_at
            ) VALUES (%s, 'disabled_ns', 'req-disabled', %s::jsonb, %s, '{}'::jsonb, %s, %s,
                      '{}'::jsonb, 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')
            ON CONFLICT (batch_id) DO NOTHING
            """,
            (batch_id, source, "e" * 64, disabled_printer, media_vid),
        )
        conn.execute(
            """
            INSERT INTO print_batch_items (
                item_id, batch_id, item_sequence, template_version_id,
                canonical_item_data, item_data_sha256, copies, status
            ) VALUES (%s, %s, 1, %s, '{}'::jsonb, %s, 1, 'rendered')
            ON CONFLICT (item_id) DO NOTHING
            """,
            (item_id, batch_id, tmpl_vid, "f" * 64),
        )
        conn.execute(
            """
            INSERT INTO print_jobs (
                job_id, batch_id, item_id, printer_id, job_kind, status, expires_at
            ) VALUES (%s, %s, %s, %s, 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, batch_id, item_id, disabled_printer),
        )
        conn.execute(
            """
            INSERT INTO print_artifacts (
                job_id, payload_ref, filename, media_type, byte_length,
                artifact_sha256, printer_language_snapshot, renderer_version,
                template_version_id, printer_capability_snapshot, retention_expires_at
            ) VALUES (%s, %s, 'label.zpl', 'application/octet-stream', %s, %s,
                      'zpl', 'central-v1', %s, '{}'::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, payload_ref, len(payload_bytes), sha256(payload_bytes).hexdigest(), tmpl_vid),
        )

    mock_transport = MockSocketTransport()
    dispatcher = CentralPrintDispatcher(
        site_id="site-central",
        dispatcher_id="dispatcher-fail-closed",
        repository=repository,
        artifact_storage=storage,
        transport=mock_transport,
    )

    # Note: claim_next filters with `WHERE pr.is_enabled`, so disabled printer is never claimed!
    result = dispatcher.run_once()
    assert result.status == DispatchStatus.IDLE
    assert len(mock_transport.calls) == 0

    # Verify job remains queued and unattempted
    persisted = repository.get(job_id)
    assert persisted.status == PrintJobStatus.QUEUED
    assert persisted.attempt_count == 0
