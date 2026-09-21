"""Central Print Dispatcher service for dispatching batch jobs to network printers.

Follows ADR-015, ADR-018, ADR-020, ADR-021:
- Runs as a background service on the Linux application server.
- Claims jobs with executor_type = 'central_dispatcher'.
- Strictly enforces single active delivery owner per physical printer and monotonic fencing tokens.
- ZERO DB lock held during network socket I/O:
  1. claim_next (short DB transaction)
  2. resolve endpoint & read artifact (zero DB lock)
  3. begin_delivery (short DB transaction, committed immediately)
  4. socket_transport.send (pure network I/O, completely outside DB lock)
  5. report_result (short DB transaction)
- Resolves endpoints exclusively from printer_registry (delivery_mode = 'central_tcp').
  Rejects non-TCP or disabled printers fail-closed before any socket I/O.
- On DELIVERY_UNKNOWN mid-stream failure, reports delivery_unknown, which triggers
  automatic batch pause in the repository, holding remaining items with zero auto-retry.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
import logging
from typing import Callable

from .artifact_storage import ArtifactStorage
from .models import PrintJob
from .postgres_repository import PostgresPrintAgentRepository
from .socket_transport import SocketTransport, TransportOutcome
from .transport import MockTransportOutcome

logger = logging.getLogger(__name__)


class DispatchStatus(StrEnum):
    IDLE = "idle"
    COMPLETED = "completed"
    FAILED_BEFORE_SEND = "failed_before_send"
    DELIVERY_UNKNOWN = "delivery_unknown"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class DispatchResult:
    status: DispatchStatus
    job: PrintJob | None = None
    outcome: str | None = None
    bytes_sent: int = 0
    error_category: str | None = None


class CentralPrintDispatcher:
    """Central print dispatcher orchestrator for network TCP printers."""

    def __init__(
        self,
        site_id: str,
        dispatcher_id: str,
        repository: PostgresPrintAgentRepository,
        artifact_storage: ArtifactStorage,
        transport: SocketTransport,
        lease_duration: timedelta = timedelta(seconds=30),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if not site_id:
            raise ValueError("site_id is required")
        if not dispatcher_id:
            raise ValueError("dispatcher_id is required")
        if lease_duration <= timedelta(0):
            raise ValueError("lease_duration must be positive")

        self.site_id = site_id
        self.dispatcher_id = dispatcher_id
        self.repository = repository
        self.artifact_storage = artifact_storage
        self.transport = transport
        self.lease_duration = lease_duration
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def run_once(self) -> DispatchResult:
        """Executes a single deterministic dispatch cycle."""
        now = self._clock()

        # Step 1: Claim next job from PostgreSQL
        try:
            job = self.repository.claim_next(
                site_id=self.site_id,
                agent_id=self.dispatcher_id,
                now=now,
                lease=self.lease_duration,
                executor_type="central_dispatcher",
            )
        except Exception as exc:
            logger.error("dispatcher_claim_failed", extra={"site_id": self.site_id, "error": str(exc)})
            return DispatchResult(
                status=DispatchStatus.UNCERTAIN,
                error_category=f"claim_failed: {exc}",
            )

        if job is None:
            return DispatchResult(status=DispatchStatus.IDLE)

        fencing_token = job.claim.fencing_token if job.claim else None

        # Step 2: Validate printer endpoint strictly from printer_registry (AC 5)
        endpoint = self.repository.get_printer_endpoint(job.printer_id)
        if (
            endpoint is None
            or not endpoint.get("is_enabled", False)
            or endpoint.get("delivery_mode") != "central_tcp"
            or not endpoint.get("network_host")
            or not endpoint.get("network_port")
        ):
            logger.warning(
                "dispatcher_invalid_endpoint",
                extra={"job_id": job.job_id, "printer_id": job.printer_id, "endpoint": endpoint},
            )
            # Fail closed: must transition to sending and then failed before send
            self.repository.begin_delivery(
                job.job_id, self.dispatcher_id, now, fencing_token=fencing_token
            )
            final_job = self.repository.report_result(
                job_id=job.job_id,
                agent_id=self.dispatcher_id,
                outcome=MockTransportOutcome.FAILURE_BEFORE_SEND,
                bytes_sent=0,
                fencing_token=fencing_token,
            )
            return DispatchResult(
                status=DispatchStatus.FAILED_BEFORE_SEND,
                job=final_job,
                outcome="failure_before_send",
                bytes_sent=0,
                error_category="invalid_or_disabled_printer_endpoint",
            )

        # Step 3: Validate and read artifact from Durable Storage
        if job.artifact is None or job.artifact_sha256 is None:
            self.repository.begin_delivery(
                job.job_id, self.dispatcher_id, now, fencing_token=fencing_token
            )
            final_job = self.repository.report_result(
                job_id=job.job_id,
                agent_id=self.dispatcher_id,
                outcome=MockTransportOutcome.FAILURE_BEFORE_SEND,
                bytes_sent=0,
                fencing_token=fencing_token,
            )
            return DispatchResult(
                status=DispatchStatus.FAILED_BEFORE_SEND,
                job=final_job,
                outcome="failure_before_send",
                bytes_sent=0,
                error_category="missing_artifact",
            )

        try:
            payload = self.artifact_storage.read_verified(job.artifact, job.artifact_sha256)
        except Exception as exc:
            logger.error("dispatcher_artifact_read_failed", extra={"job_id": job.job_id, "error": str(exc)})
            self.repository.begin_delivery(
                job.job_id, self.dispatcher_id, now, fencing_token=fencing_token
            )
            final_job = self.repository.report_result(
                job_id=job.job_id,
                agent_id=self.dispatcher_id,
                outcome=MockTransportOutcome.FAILURE_BEFORE_SEND,
                bytes_sent=0,
                fencing_token=fencing_token,
            )
            return DispatchResult(
                status=DispatchStatus.FAILED_BEFORE_SEND,
                job=final_job,
                outcome="failure_before_send",
                bytes_sent=0,
                error_category=f"artifact_verification_failed: {exc}",
            )

        # Step 4: Begin Delivery (transitions status claimed -> sending, commits immediately)
        sending_job = self.repository.begin_delivery(
            job.job_id, self.dispatcher_id, now, fencing_token=fencing_token
        )

        # Step 5: Pure Network Socket I/O (ZERO DB lock held during this call!)
        host = str(endpoint["network_host"]).split("/")[0]
        port = int(endpoint["network_port"])
        transport_result = self.transport.send(host, port, payload)

        # Step 6: Report Result in a short-lived DB transaction
        outcome_str = transport_result.outcome.value
        repo_outcome = MockTransportOutcome(outcome_str)
        final_job = self.repository.report_result(
            job_id=job.job_id,
            agent_id=self.dispatcher_id,
            outcome=repo_outcome,
            bytes_sent=transport_result.bytes_sent,
            fencing_token=fencing_token,
        )

        status_map = {
            TransportOutcome.SUCCESS: DispatchStatus.COMPLETED,
            TransportOutcome.FAILURE_BEFORE_SEND: DispatchStatus.FAILED_BEFORE_SEND,
            TransportOutcome.DELIVERY_UNKNOWN: DispatchStatus.DELIVERY_UNKNOWN,
        }
        dispatch_status = status_map.get(transport_result.outcome, DispatchStatus.UNCERTAIN)

        return DispatchResult(
            status=dispatch_status,
            job=final_job,
            outcome=outcome_str,
            bytes_sent=transport_result.bytes_sent,
            error_category=transport_result.error_message,
        )
