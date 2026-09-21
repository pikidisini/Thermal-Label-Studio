"""Integration tests for BatchIngestionService on disposable PostgreSQL and Durable Storage."""

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
from app.print_jobs.batch_ingestion import (
    BatchCompatibilityError,
    BatchIngestionRequest,
    BatchIngestionService,
    BatchItemInput,
    BatchValidationError,
)
from app.print_jobs.central_dispatcher import (
    CentralPrintDispatcher,
    DispatchStatus,
)
from app.print_jobs.migrations import apply_baseline, rollback_baseline, verify_baseline
from app.print_jobs.models import PrintJobStatus
from app.print_jobs.postgres_repository import PostgresPrintAgentRepository
from app.print_jobs.socket_transport import MockSocketTransport

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


def _setup_media_and_templates(connection: psycopg.Connection) -> tuple[str, str, str, str]:
    """Sets up 80x200 media profile and two templates: one matching (80x200) and one mismatching (100x150)."""
    connection.execute(
        """
        INSERT INTO media_profiles (media_profile_id, name)
        VALUES ('MEDIA-80x200', 'Standard 80x200 roll')
        ON CONFLICT (media_profile_id) DO NOTHING
        """
    )
    media_vid = connection.execute(
        """
        INSERT INTO media_profile_versions (
            media_profile_id, version, width_mm, height_mm,
            material_type, sensor_mode, orientation
        ) VALUES ('MEDIA-80x200', 1, 80, 200, 'paper', 'gap', 'portrait')
        ON CONFLICT (media_profile_id, version) DO UPDATE SET width_mm = EXCLUDED.width_mm
        RETURNING media_profile_version_id
        """
    ).fetchone()[0]

    # Template matching 80x200 portrait
    tmpl_matching_id = connection.execute(
        """
        INSERT INTO template_versions (
            template_id, version, svg_payload_ref, svg_content_sha256,
            width_mm, height_mm, orientation
        ) VALUES ('tmpl-80x200', 1, 'svg-ref-80x200', %s, 80, 200, 'portrait')
        ON CONFLICT (template_id, version) DO UPDATE SET width_mm = EXCLUDED.width_mm
        RETURNING template_version_id
        """,
        ("a" * 64,),
    ).fetchone()[0]

    # Template mismatching: 100x150 landscape
    tmpl_mismatch_id = connection.execute(
        """
        INSERT INTO template_versions (
            template_id, version, svg_payload_ref, svg_content_sha256,
            width_mm, height_mm, orientation
        ) VALUES ('tmpl-100x150', 1, 'svg-ref-100x150', %s, 100, 150, 'landscape')
        ON CONFLICT (template_id, version) DO UPDATE SET width_mm = EXCLUDED.width_mm
        RETURNING template_version_id
        """,
        ("b" * 64,),
    ).fetchone()[0]

    printer_id = "printer-ingest-1"
    connection.execute(
        """
        INSERT INTO printer_registry (
            printer_id, site_id, area_id, brand, model, delivery_mode,
            configured_media_profile_version_id, network_host, network_port,
            printer_language, emulation, confirmed_dpi, is_enabled
        ) VALUES (%s, 'site-ingest', 'area-1', 'ZEBRA', 'ZT411',
                  'central_tcp', %s, '127.0.0.1', 9100, 'zpl', 'native', 203, TRUE)
        ON CONFLICT (printer_id) DO UPDATE
        SET delivery_mode = 'central_tcp', network_host = '127.0.0.1', network_port = 9100, is_enabled = TRUE
        """,
        (printer_id, media_vid),
    )
    connection.execute(
        """
        INSERT INTO printer_dispatch_state (printer_id)
        VALUES (%s)
        ON CONFLICT (printer_id) DO NOTHING
        """,
        (printer_id,),
    )

    return str(media_vid), str(tmpl_matching_id), str(tmpl_mismatch_id), printer_id


def test_batch_ingestion_and_dispatcher_end_to_end(database_url: str, tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    with psycopg.connect(database_url) as conn, conn.transaction():
        media_vid, tmpl_match_vid, _, printer_id = _setup_media_and_templates(conn)

    service = BatchIngestionService(repository=repository, artifact_storage=storage)

    req = BatchIngestionRequest(
        producer_namespace="sap_wm",
        request_id="batch-req-001",
        printer_id=printer_id,
        items=[
            BatchItemInput(
                template_version_id=tmpl_match_vid,
                canonical_item_data={"material": "MAT-001", "batch": "B100"},
                copies=1,
            ),
            BatchItemInput(
                template_version_id=tmpl_match_vid,
                canonical_item_data={"material": "MAT-002", "batch": "B200"},
                copies=2,
            ),
        ],
    )

    result = service.ingest_batch(req)
    assert result.batch_id is not None
    assert result.total_items == 2
    assert len(result.job_ids) == 2

    # Verify rows in PostgreSQL
    with psycopg.connect(database_url) as conn:
        batch_row = conn.execute(
            "SELECT status, total_items FROM print_batches WHERE batch_id = %s",
            (result.batch_id,),
        ).fetchone()
        assert batch_row[0] == "accepted"
        assert batch_row[1] == 2

        items = conn.execute(
            "SELECT item_sequence, copies, status FROM print_batch_items WHERE batch_id = %s ORDER BY item_sequence",
            (result.batch_id,),
        ).fetchall()
        assert len(items) == 2
        assert items[0] == (1, 1, "rendered")
        assert items[1] == (2, 2, "rendered")

        jobs = conn.execute(
            "SELECT job_id, status FROM print_jobs WHERE batch_id = %s ORDER BY created_at",
            (result.batch_id,),
        ).fetchall()
        assert len(jobs) == 2
        assert jobs[0][1] == "queued"
        assert jobs[1][1] == "queued"

    # Now verify CentralPrintDispatcher claims and dispatches item 1 and item 2 in sequence
    mock_transport = MockSocketTransport()
    dispatcher = CentralPrintDispatcher(
        site_id="site-ingest",
        dispatcher_id="dispatcher-ingest-worker",
        repository=repository,
        artifact_storage=storage,
        transport=mock_transport,
    )

    # Dispatch item 1
    disp1 = dispatcher.run_once()
    assert disp1.status == DispatchStatus.COMPLETED
    assert disp1.job is not None
    assert disp1.job.job_id == result.job_ids[0]
    assert disp1.job.status == PrintJobStatus.SENT_TO_PRINTER

    # Dispatch item 2
    disp2 = dispatcher.run_once()
    assert disp2.status == DispatchStatus.COMPLETED
    assert disp2.job is not None
    assert disp2.job.job_id == result.job_ids[1]
    assert disp2.job.status == PrintJobStatus.SENT_TO_PRINTER

    # Next cycle should be IDLE
    disp3 = dispatcher.run_once()
    assert disp3.status == DispatchStatus.IDLE


def test_batch_ingestion_atomic_compatibility_rejection_all_or_nothing(
    database_url: str,
    tmp_path: Path,
) -> None:
    """Verifies AC 6: Template dimension mismatch rejects all-or-nothing with zero orphan rows."""
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)

    with psycopg.connect(database_url) as conn, conn.transaction():
        _, tmpl_match_vid, tmpl_mismatch_vid, printer_id = _setup_media_and_templates(conn)

    service = BatchIngestionService(repository=repository, artifact_storage=storage)

    req = BatchIngestionRequest(
        producer_namespace="sap_wm",
        request_id="batch-req-mismatch",
        printer_id=printer_id,
        items=[
            # Item 1 is compatible (80x200)
            BatchItemInput(
                template_version_id=tmpl_match_vid,
                canonical_item_data={"material": "MAT-001"},
            ),
            # Item 2 is incompatible (100x150) -> must fail the ENTIRE batch atomically
            BatchItemInput(
                template_version_id=tmpl_mismatch_vid,
                canonical_item_data={"material": "MAT-002"},
            ),
        ],
    )

    with pytest.raises(BatchCompatibilityError, match="do not match media profile dimensions"):
        service.ingest_batch(req)

    # Prove that ZERO rows were committed to PostgreSQL
    with psycopg.connect(database_url) as conn:
        batch_count = conn.execute(
            "SELECT count(*) FROM print_batches WHERE request_id = 'batch-req-mismatch'"
        ).fetchone()[0]
        assert batch_count == 0


def test_batch_ingestion_validation_errors(database_url: str, tmp_path: Path) -> None:
    storage = DurableFilesystemArtifactStorage(tmp_path / "artifacts", retention=DEFAULT_RETENTION)
    repository = PostgresPrintAgentRepository(database_url, min_pool_size=1, max_pool_size=4)
    service = BatchIngestionService(repository=repository, artifact_storage=storage)

    # Empty namespace
    with pytest.raises(BatchValidationError, match="producer_namespace is required"):
        service.ingest_batch(
            BatchIngestionRequest(
                producer_namespace="",
                request_id="r1",
                printer_id="p1",
                items=[BatchItemInput("t1", {})],
            )
        )

    # Empty items
    with pytest.raises(BatchValidationError, match="items cannot be empty"):
        service.ingest_batch(
            BatchIngestionRequest(
                producer_namespace="ns",
                request_id="r1",
                printer_id="p1",
                items=[],
            )
        )

    # Unknown printer
    with pytest.raises(BatchValidationError, match="unknown printer_id"):
        service.ingest_batch(
            BatchIngestionRequest(
                producer_namespace="ns",
                request_id="r1",
                printer_id="non-existent-printer",
                items=[BatchItemInput("t1", {})],
            )
        )
