"""PostgreSQL-backed Print Agent lifecycle repository.

This adapter intentionally owns only the already-rendered delivery lifecycle.
Batch ingestion and rendering persistence remain a separate service boundary.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Collection, Mapping, Any

from psycopg import errors
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .models import (
    ArtifactReference,
    Claim,
    Emulation,
    PrintJob,
    PrintJobStatus,
    PrinterLanguage,
    SourceMetadata,
)
from .repository import (
    ClaimConflictError,
    DeliveryConflictError,
    JobExpiredError,
    PrintJobNotFoundError,
)
from .transport import MockTransportOutcome


_JOB_SELECT = """
SELECT
    j.job_id::text AS job_id,
    b.request_id,
    j.created_at,
    j.expires_at,
    pr.site_id,
    pr.printer_id,
    pr.printer_language,
    pr.emulation,
    pr.confirmed_dpi,
    bi.copies,
    j.status,
    j.attempt_count,
    j.last_error_category,
    j.executor_id,
    j.claimed_at,
    j.lease_expires_at,
    j.fencing_token,
    j.result_outcome,
    j.bytes_sent,
    b.source_metadata,
    a.payload_ref,
    a.filename,
    a.media_type,
    a.byte_length,
    a.artifact_sha256
FROM print_jobs AS j
JOIN print_batches AS b ON b.batch_id = j.batch_id
JOIN print_batch_items AS bi ON bi.item_id = j.item_id AND bi.batch_id = j.batch_id
JOIN printer_registry AS pr ON pr.printer_id = j.printer_id
LEFT JOIN print_artifacts AS a ON a.job_id = j.job_id
"""


class PostgresPrintAgentRepository:
    """ACID repository for claim, lease reconciliation, and delivery result."""

    def __init__(self, database_url: str, *, min_pool_size: int = 1, max_pool_size: int = 4) -> None:
        if not database_url:
            raise ValueError("database_url is required")
        if min_pool_size < 1 or max_pool_size < min_pool_size:
            raise ValueError("invalid PostgreSQL pool size")
        self._pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_pool_size,
            max_size=max_pool_size,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        self._pool.open(wait=True)

    def close(self) -> None:
        self._pool.close()

    def verify_schema(self) -> None:
        with self._pool.connection() as connection:
            row = connection.execute(
                "SELECT to_regclass('public.print_jobs') AS print_jobs, "
                "to_regclass('public.printer_dispatch_state') AS dispatch_state"
            ).fetchone()
        if row is None or row["print_jobs"] is None or row["dispatch_state"] is None:
            raise RuntimeError("PostgreSQL print pipeline baseline is not installed")

    def get(self, job_id: str) -> PrintJob:
        with self._pool.connection() as connection:
            return self._fetch_job(connection, job_id)

    def list_site_jobs(self, site_id: str) -> tuple[PrintJob, ...]:
        with self._pool.connection() as connection:
            rows = connection.execute(
                _JOB_SELECT + " WHERE pr.site_id = %s ORDER BY j.created_at, j.job_id",
                (site_id,),
            ).fetchall()
        return tuple(self._row_to_job(row) for row in rows)

    def claim_next(
        self,
        site_id: str,
        agent_id: str,
        now: datetime,
        lease: timedelta,
        eligible_job_ids: Collection[str] | None = None,
    ) -> PrintJob | None:
        self._require_aware(now)
        if lease <= timedelta(0):
            raise ValueError("lease must be positive")
        allowed_ids = tuple(eligible_job_ids) if eligible_job_ids is not None else None
        if allowed_ids is not None and not allowed_ids:
            with self._pool.connection() as connection, connection.transaction():
                db_now = self._database_now(connection)
                self._reconcile_locked(connection, db_now, site_id=site_id)
            return None
        try:
            with self._pool.connection() as connection, connection.transaction():
                db_now = self._database_now(connection)
                self._reconcile_locked(connection, db_now, site_id=site_id)
                eligibility_sql = "" if allowed_ids is None else " AND j.job_id::text = ANY(%s)"
                parameters: list[object] = [site_id, db_now]
                if allowed_ids is not None:
                    parameters.append(list(allowed_ids))
                candidate = connection.execute(
                    """
                    SELECT j.job_id::text AS job_id, j.batch_id, j.printer_id
                    FROM print_jobs AS j
                    JOIN printer_registry AS pr ON pr.printer_id = j.printer_id
                    JOIN printer_dispatch_state AS ds ON ds.printer_id = j.printer_id
                    WHERE pr.site_id = %s
                      AND pr.is_enabled
                      AND j.status = 'queued'
                      AND j.expires_at > %s
                      AND ds.active_batch_id IS NULL
                    """
                    + eligibility_sql
                    + """
                    ORDER BY j.created_at, j.job_id
                    FOR UPDATE OF ds, j SKIP LOCKED
                    LIMIT 1
                    """,
                    parameters,
                ).fetchone()
                if candidate is None:
                    return None
                dispatch = connection.execute(
                    """
                    UPDATE printer_dispatch_state
                    SET active_batch_id = %s,
                        executor_type = 'local_agent',
                        executor_id = %s,
                        fencing_generation = fencing_generation + 1,
                        acquired_at = %s,
                        lease_expires_at = LEAST(%s + %s, (
                            SELECT expires_at FROM print_jobs WHERE job_id = %s::uuid
                        )),
                        updated_at = %s
                    WHERE printer_id = %s
                    RETURNING fencing_generation, lease_expires_at
                    """,
                    (
                        candidate["batch_id"], agent_id, db_now, db_now, lease,
                        candidate["job_id"], db_now, candidate["printer_id"],
                    ),
                ).fetchone()
                connection.execute(
                    """
                    UPDATE print_jobs
                    SET status = 'claimed', executor_type = 'local_agent', executor_id = %s,
                        claimed_at = %s, lease_expires_at = %s, fencing_token = %s,
                        updated_at = %s
                    WHERE job_id = %s::uuid
                    """,
                    (
                        agent_id, db_now, dispatch["lease_expires_at"],
                        dispatch["fencing_generation"], db_now, candidate["job_id"],
                    ),
                )
                self._insert_audit(
                    connection,
                    actor_id=agent_id,
                    action="print_job_claimed",
                    job_id=candidate["job_id"],
                    metadata={"fencing_token": dispatch["fencing_generation"]},
                )
                return self._fetch_job(connection, candidate["job_id"])
        except errors.UniqueViolation as exc:
            raise ClaimConflictError("printer already has an active delivery") from exc

    def reconcile_expired_jobs(self, now: datetime) -> tuple[PrintJob, ...]:
        self._require_aware(now)
        with self._pool.connection() as connection, connection.transaction():
            db_now = self._database_now(connection)
            changed_ids = self._reconcile_locked(connection, db_now)
            return tuple(self._fetch_job(connection, job_id) for job_id in changed_ids)

    def reconcile_job(self, job_id: str, now: datetime) -> PrintJob:
        self._require_aware(now)
        with self._pool.connection() as connection, connection.transaction():
            db_now = self._database_now(connection)
            self._reconcile_locked(connection, db_now, job_id=job_id)
            return self._fetch_job(connection, job_id)

    def begin_delivery(
        self,
        job_id: str,
        agent_id: str,
        now: datetime,
        fencing_token: int | None = None,
    ) -> PrintJob:
        self._require_aware(now)
        if fencing_token is None:
            raise DeliveryConflictError("claim fencing token is required")
        expired = False
        with self._pool.connection() as connection, connection.transaction():
            db_now = self._database_now(connection)
            row = connection.execute(
                """
                SELECT j.status, j.executor_id, j.fencing_token, j.lease_expires_at,
                       j.expires_at, j.attempt_count, j.printer_id
                FROM printer_dispatch_state AS ds
                JOIN print_jobs AS j ON j.printer_id = ds.printer_id
                WHERE j.job_id = %s::uuid
                FOR UPDATE OF ds, j
                """,
                (job_id,),
            ).fetchone()
            if row is None:
                raise PrintJobNotFoundError(job_id)
            if db_now >= row["expires_at"]:
                connection.execute(
                    "UPDATE print_jobs SET status = 'expired', updated_at = %s WHERE job_id = %s::uuid",
                    (db_now, job_id),
                )
                self._release_dispatch_if_idle(connection, row["printer_id"], db_now)
                expired = True
            elif (
                row["status"] != "claimed"
                or row["executor_id"] != agent_id
                or row["fencing_token"] != fencing_token
                or db_now >= row["lease_expires_at"]
                or row["attempt_count"] >= 10
            ):
                raise DeliveryConflictError("job claim is stale or cannot enter sending")
            else:
                connection.execute(
                    """
                    UPDATE print_jobs
                    SET status = 'sending', attempt_count = attempt_count + 1, updated_at = %s
                    WHERE job_id = %s::uuid
                    """,
                    (db_now, job_id),
                )
                self._insert_audit(
                    connection,
                    actor_id=agent_id,
                    action="print_job_sending",
                    job_id=job_id,
                    metadata={"fencing_token": fencing_token},
                )
                return self._fetch_job(connection, job_id)
        if expired:
            raise JobExpiredError(job_id)
        raise DeliveryConflictError("job cannot enter sending")

    def report_result(
        self,
        job_id: str,
        agent_id: str,
        outcome: MockTransportOutcome,
        bytes_sent: int,
        fencing_token: int | None = None,
    ) -> PrintJob:
        if bytes_sent < 0:
            raise ValueError("bytes_sent must not be negative")
        if fencing_token is None:
            raise DeliveryConflictError("claim fencing token is required")
        final_status = {
            MockTransportOutcome.SUCCESS: "sent_to_printer",
            MockTransportOutcome.FAILURE_BEFORE_SEND: "failed",
            MockTransportOutcome.DELIVERY_UNKNOWN: "delivery_unknown",
        }[outcome]
        error_category = {
            MockTransportOutcome.SUCCESS: None,
            MockTransportOutcome.FAILURE_BEFORE_SEND: "failure_before_send",
            MockTransportOutcome.DELIVERY_UNKNOWN: "delivery_unknown_no_auto_retry",
        }[outcome]
        with self._pool.connection() as connection, connection.transaction():
            db_now = self._database_now(connection)
            row = connection.execute(
                """
                SELECT j.status, j.executor_id, j.fencing_token, j.result_outcome,
                       j.bytes_sent, j.attempt_count, j.printer_id
                FROM printer_dispatch_state AS ds
                JOIN print_jobs AS j ON j.printer_id = ds.printer_id
                WHERE j.job_id = %s::uuid
                FOR UPDATE OF ds, j
                """,
                (job_id,),
            ).fetchone()
            if row is None:
                raise PrintJobNotFoundError(job_id)
            if row["executor_id"] != agent_id or row["fencing_token"] != fencing_token:
                raise DeliveryConflictError("claim is owned by another or stale agent")
            if row["result_outcome"] is not None:
                if row["result_outcome"] != outcome.value or row["bytes_sent"] != bytes_sent:
                    raise DeliveryConflictError("delivery result conflict")
                return self._fetch_job(connection, job_id)
            if row["status"] != "sending":
                raise DeliveryConflictError("job is not sending")
            connection.execute(
                """
                UPDATE print_jobs
                SET status = %s, result_outcome = %s, bytes_sent = %s,
                    last_error_category = %s, updated_at = %s
                WHERE job_id = %s::uuid
                """,
                (final_status, outcome.value, bytes_sent, error_category, db_now, job_id),
            )
            connection.execute(
                """
                INSERT INTO print_job_outbox (
                    aggregate_type, aggregate_id, event_type, deduplication_key, payload
                ) VALUES ('print_job', %s::uuid, 'print_job_delivery_finalized', %s, %s::jsonb)
                ON CONFLICT (deduplication_key) DO NOTHING
                """,
                (
                    job_id,
                    f"print-job-result:{job_id}:{row['attempt_count']}",
                    self._json_payload(
                        {"job_id": job_id, "outcome": outcome.value, "bytes_sent": bytes_sent}
                    ),
                ),
            )
            self._insert_audit(
                connection,
                actor_id=agent_id,
                action="print_job_delivery_finalized",
                job_id=job_id,
                metadata={"outcome": outcome.value, "bytes_sent": bytes_sent},
            )
            self._release_dispatch_if_idle(connection, row["printer_id"], db_now)
            return self._fetch_job(connection, job_id)

    def _reconcile_locked(
        self,
        connection: Any,
        db_now: datetime,
        *,
        site_id: str | None = None,
        job_id: str | None = None,
    ) -> tuple[str, ...]:
        filters = []
        parameters: list[object] = [db_now]
        if site_id is not None:
            filters.append("pr.site_id = %s")
            parameters.append(site_id)
        if job_id is not None:
            filters.append("j.job_id = %s::uuid")
            parameters.append(job_id)
        suffix = " AND " + " AND ".join(filters) if filters else ""
        changed: set[str] = set()
        sending = connection.execute(
            """
            UPDATE print_jobs AS j
            SET status = 'delivery_unknown', result_outcome = 'delivery_unknown',
                last_error_category = 'lease_expired_while_sending', updated_at = %s
            FROM printer_registry AS pr
            WHERE pr.printer_id = j.printer_id
              AND j.status = 'sending'
              AND (j.expires_at <= %s OR j.lease_expires_at <= %s)
            """ + suffix + " RETURNING j.job_id::text, j.printer_id",
            [db_now, db_now, db_now, *parameters[1:]],
        ).fetchall()
        changed.update(row["job_id"] for row in sending)
        expired_claims = connection.execute(
            """
            UPDATE print_jobs AS j
            SET status = 'expired', updated_at = %s
            FROM printer_registry AS pr
            WHERE pr.printer_id = j.printer_id
              AND j.status = 'claimed' AND j.expires_at <= %s
            """ + suffix + " RETURNING j.job_id::text, j.printer_id",
            [db_now, db_now, *parameters[1:]],
        ).fetchall()
        changed.update(row["job_id"] for row in expired_claims)
        requeued = connection.execute(
            """
            UPDATE print_jobs AS j
            SET status = 'queued', executor_type = NULL, executor_id = NULL,
                claimed_at = NULL, lease_expires_at = NULL, fencing_token = NULL,
                updated_at = %s
            FROM printer_registry AS pr
            WHERE pr.printer_id = j.printer_id
              AND j.status = 'claimed' AND j.expires_at > %s AND j.lease_expires_at <= %s
            """ + suffix + " RETURNING j.job_id::text, j.printer_id",
            [db_now, db_now, db_now, *parameters[1:]],
        ).fetchall()
        changed.update(row["job_id"] for row in requeued)
        pre_delivery = connection.execute(
            """
            UPDATE print_jobs AS j
            SET status = 'expired', updated_at = %s
            FROM printer_registry AS pr
            WHERE pr.printer_id = j.printer_id
              AND j.status IN ('accepted', 'rendered', 'queued') AND j.expires_at <= %s
            """ + suffix + " RETURNING j.job_id::text, j.printer_id",
            [db_now, db_now, *parameters[1:]],
        ).fetchall()
        changed.update(row["job_id"] for row in pre_delivery)
        printer_ids = {
            row["printer_id"] for row in [*sending, *expired_claims, *requeued, *pre_delivery]
        }
        for printer_id in printer_ids:
            self._release_dispatch_if_idle(connection, printer_id, db_now)
        return tuple(sorted(changed))

    @staticmethod
    def _release_dispatch_if_idle(connection: Any, printer_id: str, db_now: datetime) -> None:
        connection.execute(
            """
            UPDATE printer_dispatch_state AS ds
            SET active_batch_id = NULL, executor_type = NULL, executor_id = NULL,
                acquired_at = NULL, lease_expires_at = NULL, updated_at = %s
            WHERE ds.printer_id = %s
              AND NOT EXISTS (
                  SELECT 1 FROM print_jobs AS j
                  WHERE j.printer_id = ds.printer_id AND j.status IN ('claimed', 'sending')
              )
            """,
            (db_now, printer_id),
        )

    @staticmethod
    def _insert_audit(
        connection: Any,
        *,
        actor_id: str,
        action: str,
        job_id: str,
        metadata: Mapping[str, object],
    ) -> None:
        connection.execute(
            """
            INSERT INTO print_audit_events (
                actor_type, actor_id, action, aggregate_type, aggregate_id, metadata
            ) VALUES ('agent', %s, %s, 'print_job', %s::uuid, %s::jsonb)
            """,
            (actor_id, action, job_id, PostgresPrintAgentRepository._json_payload(metadata)),
        )

    @staticmethod
    def _json_payload(value: Mapping[str, object]) -> str:
        import json

        return json.dumps(value, sort_keys=True, separators=(",", ":"))

    def _fetch_job(self, connection: Any, job_id: str) -> PrintJob:
        try:
            row = connection.execute(
                _JOB_SELECT + " WHERE j.job_id = %s::uuid",
                (job_id,),
            ).fetchone()
        except errors.InvalidTextRepresentation as exc:
            raise PrintJobNotFoundError(job_id) from exc
        if row is None:
            raise PrintJobNotFoundError(job_id)
        return self._row_to_job(row)

    @staticmethod
    def _row_to_job(row: Mapping[str, object]) -> PrintJob:
        artifact = None
        checksum = None
        if row["payload_ref"] is not None:
            artifact = ArtifactReference(
                payload_ref=row["payload_ref"],
                filename=row["filename"],
                media_type=row["media_type"],
                byte_length=row["byte_length"],
            )
            checksum = row["artifact_sha256"].strip()
        claim = None
        if row["executor_id"] is not None:
            claim = Claim(
                agent_id=row["executor_id"],
                claimed_at=row["claimed_at"],
                lease_expires_at=row["lease_expires_at"],
                fencing_token=row["fencing_token"],
            )
        dpi = row["confirmed_dpi"]
        if isinstance(dpi, Decimal):
            dpi = float(dpi)
        return PrintJob(
            contract_version="1.0",
            job_id=row["job_id"],
            request_id=row["request_id"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            site_id=row["site_id"],
            printer_id=row["printer_id"],
            printer_language=PrinterLanguage(row["printer_language"]),
            emulation=Emulation(row["emulation"]),
            dpi=dpi,
            copies=row["copies"],
            artifact=artifact,
            artifact_sha256=checksum,
            status=PrintJobStatus(row["status"]),
            attempt_count=row["attempt_count"],
            last_error=row["last_error_category"],
            claim=claim,
            source=SourceMetadata.model_validate(row["source_metadata"]),
        )

    @staticmethod
    def _database_now(connection: Any) -> datetime:
        return connection.execute("SELECT clock_timestamp() AS now").fetchone()["now"]

    @staticmethod
    def _require_aware(value: datetime) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
