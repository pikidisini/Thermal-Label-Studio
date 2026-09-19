"""Thread-safe in-memory repository for the print-job pilot."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import RLock
from typing import Collection, Mapping, Protocol

from .models import Claim, PrintJob, PrintJobStatus
from .transport import MockTransportOutcome
from .state_machine import PrintJobStateMachine


class PrintJobNotFoundError(KeyError):
    """Raised when a repository job id does not exist."""


class IdempotencyConflictError(ValueError):
    """Raised when one request id is reused with different semantic input."""


class ClaimConflictError(ValueError):
    """Raised when another agent already owns a queued job."""


class DeliveryConflictError(ValueError):
    """Raised when a job cannot be entered or finalized by an agent."""


class JobExpiredError(ValueError):
    """Raised when a job is expired or reaches its expiry boundary."""


@dataclass(frozen=True)
class IdempotencyRecord:
    fingerprint: str
    original_job_id: str


class PrintJobRepository(Protocol):
    """Storage boundary for replacing pilot memory with a durable repository."""

    def create_idempotent(self, job: PrintJob, semantic_input: Mapping[str, object]) -> PrintJob: ...

    def get(self, job_id: str) -> PrintJob: ...

    def save(self, job: PrintJob) -> PrintJob: ...

    def claim(self, job_id: str, agent_id: str, now: datetime, lease: timedelta) -> PrintJob: ...

    def list_site_jobs(self, site_id: str) -> tuple[PrintJob, ...]: ...

    def claim_next(
        self,
        site_id: str,
        agent_id: str,
        now: datetime,
        lease: timedelta,
        eligible_job_ids: Collection[str] | None = None,
    ) -> PrintJob | None: ...

    def reconcile_expired_jobs(self, now: datetime) -> tuple[PrintJob, ...]: ...

    def reconcile_job(self, job_id: str, now: datetime) -> PrintJob: ...

    def expire_lease(self, job_id: str, now: datetime) -> PrintJob: ...

    def begin_delivery(
        self,
        job_id: str,
        agent_id: str,
        now: datetime,
        fencing_token: int | None = None,
    ) -> PrintJob: ...

    def finalize_delivery(
        self,
        job_id: str,
        agent_id: str,
        status: PrintJobStatus,
        last_error: str | None = None,
    ) -> PrintJob: ...

    def report_result(
        self,
        job_id: str,
        agent_id: str,
        outcome: MockTransportOutcome,
        bytes_sent: int,
        fencing_token: int | None = None,
    ) -> PrintJob: ...


class PrintAgentRepository(Protocol):
    """Narrow persistence boundary used by the Print Agent HTTP API."""

    def get(self, job_id: str) -> PrintJob: ...

    def list_site_jobs(self, site_id: str) -> tuple[PrintJob, ...]: ...

    def claim_next(
        self,
        site_id: str,
        agent_id: str,
        now: datetime,
        lease: timedelta,
        eligible_job_ids: Collection[str] | None = None,
    ) -> PrintJob | None: ...

    def reconcile_expired_jobs(self, now: datetime) -> tuple[PrintJob, ...]: ...

    def reconcile_job(self, job_id: str, now: datetime) -> PrintJob: ...

    def begin_delivery(
        self,
        job_id: str,
        agent_id: str,
        now: datetime,
        fencing_token: int | None = None,
    ) -> PrintJob: ...

    def report_result(
        self,
        job_id: str,
        agent_id: str,
        outcome: MockTransportOutcome,
        bytes_sent: int,
        fencing_token: int | None = None,
    ) -> PrintJob: ...


def semantic_fingerprint(value: Mapping[str, object]) -> str:
    """Create a key-order-independent fingerprint for semantic request input."""
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class InMemoryPrintJobRepository:
    """Pilot repository; all state is lost when the hosting process restarts."""

    def __init__(self) -> None:
        self._jobs: dict[str, PrintJob] = {}
        self._request_records: dict[str, IdempotencyRecord] = {}
        self._result_records: dict[str, tuple[MockTransportOutcome, int]] = {}
        self._fencing_generation: dict[str, int] = {}
        self._lock = RLock()

    def create_idempotent(self, job: PrintJob, semantic_input: Mapping[str, object]) -> PrintJob:
        fingerprint = semantic_fingerprint(semantic_input)
        with self._lock:
            previous = self._request_records.get(job.request_id)
            if previous is not None:
                if previous.fingerprint != fingerprint:
                    raise IdempotencyConflictError(f"request_id conflict: {job.request_id}")
                return self._jobs[previous.original_job_id].model_copy(deep=True)
            if job.job_id in self._jobs:
                raise IdempotencyConflictError(f"job_id already exists: {job.job_id}")
            self._jobs[job.job_id] = job.model_copy(deep=True)
            self._request_records[job.request_id] = IdempotencyRecord(fingerprint, job.job_id)
            return job.model_copy(deep=True)

    def get(self, job_id: str) -> PrintJob:
        with self._lock:
            try:
                return self._jobs[job_id].model_copy(deep=True)
            except KeyError as exc:
                raise PrintJobNotFoundError(job_id) from exc

    def save(self, job: PrintJob) -> PrintJob:
        with self._lock:
            if job.job_id not in self._jobs:
                raise PrintJobNotFoundError(job.job_id)
            self._jobs[job.job_id] = job.model_copy(deep=True)
            return job.model_copy(deep=True)

    def claim(self, job_id: str, agent_id: str, now: datetime, lease: timedelta) -> PrintJob:
        with self._lock:
            self._require_aware(now)
            job = self.get(job_id)
            if job.status is not PrintJobStatus.QUEUED or job.claim is not None:
                raise ClaimConflictError(f"job is not available for claim: {job_id}")
            if now >= job.expires_at:
                self._mark_expired_locked(job)
                raise JobExpiredError(f"job has expired: {job_id}")
            if lease <= timedelta(0):
                raise ValueError("lease must be positive")
            lease_expires_at = min(now + lease, job.expires_at)
            fencing_token = self._next_fencing_token_locked(job.printer_id)
            claim = Claim(
                agent_id=agent_id,
                claimed_at=now,
                lease_expires_at=lease_expires_at,
                fencing_token=fencing_token,
            )
            updated = PrintJobStateMachine.claim(job, claim)
            self._jobs[job_id] = updated.model_copy(deep=True)
            return updated.model_copy(deep=True)

    def list_site_jobs(self, site_id: str) -> tuple[PrintJob, ...]:
        with self._lock:
            return tuple(job.model_copy(deep=True) for job in self._jobs.values() if job.site_id == site_id)

    def claim_next(
        self,
        site_id: str,
        agent_id: str,
        now: datetime,
        lease: timedelta,
        eligible_job_ids: Collection[str] | None = None,
    ) -> PrintJob | None:
        """Reconcile and atomically claim the oldest eligible queued job for a site."""
        with self._lock:
            self._require_aware(now)
            if lease <= timedelta(0):
                raise ValueError("lease must be positive")
            self._reconcile_expired_jobs_locked(now)
            allowed_ids = set(eligible_job_ids) if eligible_job_ids is not None else None
            candidates = sorted(
                (
                    job
                    for job in self._jobs.values()
                    if job.site_id == site_id and job.status is PrintJobStatus.QUEUED and job.claim is None
                ),
                key=lambda job: (job.created_at, job.job_id),
            )
            for job in candidates:
                if allowed_ids is not None and job.job_id not in allowed_ids:
                    continue
                lease_expires_at = min(now + lease, job.expires_at)
                claim = Claim(
                    agent_id=agent_id,
                    claimed_at=now,
                    lease_expires_at=lease_expires_at,
                    fencing_token=self._next_fencing_token_locked(job.printer_id),
                )
                updated = PrintJobStateMachine.claim(job, claim)
                self._jobs[job.job_id] = updated.model_copy(deep=True)
                return updated.model_copy(deep=True)
            return None

    def expire_lease(self, job_id: str, now: datetime) -> PrintJob:
        return self.reconcile_job(job_id, now)

    def reconcile_expired_jobs(self, now: datetime) -> tuple[PrintJob, ...]:
        with self._lock:
            self._require_aware(now)
            return self._reconcile_expired_jobs_locked(now)

    def reconcile_job(self, job_id: str, now: datetime) -> PrintJob:
        with self._lock:
            self._require_aware(now)
            job = self.get(job_id)
            updated = PrintJobStateMachine.reconcile_expiry(job, now)
            if updated != job:
                self._jobs[job_id] = updated.model_copy(deep=True)
            return updated.model_copy(deep=True)

    def begin_delivery(
        self,
        job_id: str,
        agent_id: str,
        now: datetime,
        fencing_token: int | None = None,
    ) -> PrintJob:
        """Atomically verify claim/expiry/attempts and enter sending once."""
        with self._lock:
            self._require_aware(now)
            job = self.get(job_id)
            if job.status is not PrintJobStatus.CLAIMED:
                raise DeliveryConflictError(f"job is not claimed: {job_id}")
            if job.claim is None or job.claim.agent_id != agent_id:
                raise DeliveryConflictError(f"claim is owned by another agent: {job_id}")
            if fencing_token is not None and job.claim.fencing_token != fencing_token:
                raise DeliveryConflictError(f"claim fencing token is stale: {job_id}")
            if now >= job.expires_at:
                self._mark_expired_locked(job)
                raise JobExpiredError(f"job has expired: {job_id}")
            if now >= job.claim.lease_expires_at:
                raise DeliveryConflictError(f"claim lease has expired: {job_id}")
            if job.attempt_count >= 10:
                raise DeliveryConflictError(f"maximum delivery attempts reached: {job_id}")
            sending_data = job.model_dump()
            sending_data.update({"status": PrintJobStatus.SENDING, "attempt_count": job.attempt_count + 1})
            sending = PrintJob.model_validate(sending_data)
            self._jobs[job_id] = sending.model_copy(deep=True)
            return sending.model_copy(deep=True)

    def finalize_delivery(
        self,
        job_id: str,
        agent_id: str,
        status: PrintJobStatus,
        last_error: str | None = None,
    ) -> PrintJob:
        """Atomically finalize a sending job owned by the same agent."""
        if status not in {
            PrintJobStatus.SENT_TO_PRINTER,
            PrintJobStatus.FAILED,
            PrintJobStatus.DELIVERY_UNKNOWN,
        }:
            raise DeliveryConflictError(f"invalid delivery final status: {status.value}")
        with self._lock:
            job = self.get(job_id)
            if job.status is not PrintJobStatus.SENDING:
                raise DeliveryConflictError(f"job is not sending: {job_id}")
            if job.claim is None or job.claim.agent_id != agent_id:
                raise DeliveryConflictError(f"claim is owned by another agent: {job_id}")
            final_data = job.model_dump()
            final_data.update({"status": status, "last_error": last_error})
            final_job = PrintJob.model_validate(final_data)
            self._jobs[job_id] = final_job.model_copy(deep=True)
            return final_job.model_copy(deep=True)

    def report_result(
        self,
        job_id: str,
        agent_id: str,
        outcome: MockTransportOutcome,
        bytes_sent: int,
        fencing_token: int | None = None,
    ) -> PrintJob:
        """Finalize a delivery once and make an identical callback idempotent."""
        if bytes_sent < 0:
            raise ValueError("bytes_sent must not be negative")
        final_status = {
            MockTransportOutcome.SUCCESS: PrintJobStatus.SENT_TO_PRINTER,
            MockTransportOutcome.FAILURE_BEFORE_SEND: PrintJobStatus.FAILED,
            MockTransportOutcome.DELIVERY_UNKNOWN: PrintJobStatus.DELIVERY_UNKNOWN,
        }[outcome]
        with self._lock:
            current = self.get(job_id)
            if current.claim is None or current.claim.agent_id != agent_id:
                raise DeliveryConflictError(f"claim is owned by another agent: {job_id}")
            if fencing_token is not None and current.claim.fencing_token != fencing_token:
                raise DeliveryConflictError(f"claim fencing token is stale: {job_id}")
            previous = self._result_records.get(job_id)
            if previous is not None:
                if previous != (outcome, bytes_sent):
                    raise DeliveryConflictError(f"delivery result conflict: {job_id}")
                return current
            if current.status is not PrintJobStatus.SENDING:
                raise DeliveryConflictError(f"job is not sending: {job_id}")
            error = None
            if outcome is MockTransportOutcome.FAILURE_BEFORE_SEND:
                error = "agent reported failure before send"
            elif outcome is MockTransportOutcome.DELIVERY_UNKNOWN:
                error = "agent reported unknown delivery; automatic retry is forbidden"
            final_job = self.finalize_delivery(job_id, agent_id, final_status, error)
            self._result_records[job_id] = (outcome, bytes_sent)
            return final_job

    def expire_job(self, job_id: str, now: datetime) -> PrintJob:
        """Atomically mark a pre-sending expired job as expired."""
        return self.reconcile_job(job_id, now)

    def _reconcile_expired_jobs_locked(self, now: datetime) -> tuple[PrintJob, ...]:
        changed: list[PrintJob] = []
        for job_id, job in tuple(self._jobs.items()):
            updated = PrintJobStateMachine.reconcile_expiry(job, now)
            if updated != job:
                self._jobs[job_id] = updated.model_copy(deep=True)
                changed.append(updated.model_copy(deep=True))
        return tuple(changed)

    def _mark_expired_locked(self, job: PrintJob) -> None:
        expired = PrintJobStateMachine.transition(job, PrintJobStatus.EXPIRED)
        self._jobs[job.job_id] = expired.model_copy(deep=True)

    def _next_fencing_token_locked(self, printer_id: str) -> int:
        next_token = self._fencing_generation.get(printer_id, 0) + 1
        self._fencing_generation[printer_id] = next_token
        return next_token

    @staticmethod
    def _require_aware(value: datetime) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
