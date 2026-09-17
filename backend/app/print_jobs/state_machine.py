"""Explicit print-job lifecycle transitions."""

from __future__ import annotations

from datetime import datetime

from .models import Claim, PrintJob, PrintJobStatus


class InvalidTransitionError(ValueError):
    """Raised when a print job attempts an illegal lifecycle transition."""


class LeaseExpiredDuringSendingError(ValueError):
    """Raised when sending has started and the lease expires."""


class PrintJobStateMachine:
    SENDING_LEASE_EXPIRED_ERROR = "delivery lease expired while sending; delivery outcome is unknown"
    _transitions = {
        PrintJobStatus.ACCEPTED: {PrintJobStatus.RENDERED, PrintJobStatus.FAILED, PrintJobStatus.EXPIRED, PrintJobStatus.CANCELLED},
        PrintJobStatus.RENDERED: {PrintJobStatus.QUEUED, PrintJobStatus.FAILED, PrintJobStatus.EXPIRED, PrintJobStatus.CANCELLED},
        PrintJobStatus.QUEUED: {PrintJobStatus.CLAIMED, PrintJobStatus.FAILED, PrintJobStatus.EXPIRED, PrintJobStatus.CANCELLED},
        PrintJobStatus.CLAIMED: {PrintJobStatus.SENDING, PrintJobStatus.FAILED, PrintJobStatus.EXPIRED, PrintJobStatus.CANCELLED},
        PrintJobStatus.SENDING: {PrintJobStatus.SENT_TO_PRINTER, PrintJobStatus.DELIVERY_UNKNOWN, PrintJobStatus.FAILED},
        PrintJobStatus.SENT_TO_PRINTER: set(),
        PrintJobStatus.DELIVERY_UNKNOWN: {PrintJobStatus.FAILED, PrintJobStatus.CANCELLED},
        PrintJobStatus.FAILED: set(),
        PrintJobStatus.EXPIRED: set(),
        PrintJobStatus.CANCELLED: set(),
    }

    @classmethod
    def transition(cls, job: PrintJob, target: PrintJobStatus) -> PrintJob:
        if target not in cls._transitions[job.status]:
            raise InvalidTransitionError(f"invalid transition: {job.status.value} -> {target.value}")
        return PrintJob.model_validate(job.model_copy(update={"status": target}).model_dump())

    @classmethod
    def render(cls, job: PrintJob, artifact: "ArtifactReference", checksum: str) -> PrintJob:
        if job.status is not PrintJobStatus.ACCEPTED:
            raise InvalidTransitionError("only an accepted job can be rendered")
        rendered_data = job.model_dump()
        rendered_data.update(
            {
                "artifact": artifact.model_dump(),
                "artifact_sha256": checksum,
                "status": PrintJobStatus.RENDERED,
            }
        )
        return PrintJob.model_validate(rendered_data)

    @classmethod
    def claim(cls, job: PrintJob, claim: Claim) -> PrintJob:
        if job.status is not PrintJobStatus.QUEUED or job.claim is not None:
            raise InvalidTransitionError("only an unclaimed queued job can be claimed")
        return cls.transition(job.model_copy(update={"claim": claim}), PrintJobStatus.CLAIMED)

    @classmethod
    def expire_lease(cls, job: PrintJob, now: datetime) -> PrintJob:
        """Backward-compatible alias for the atomic reconciliation operation."""
        return cls.reconcile_expiry(job, now)

    @classmethod
    def reconcile_expiry(cls, job: PrintJob, now: datetime) -> PrintJob:
        """Reconcile an expired lease/job without ever requeueing a sending job."""
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
        if job.status in {
            PrintJobStatus.SENT_TO_PRINTER,
            PrintJobStatus.DELIVERY_UNKNOWN,
            PrintJobStatus.FAILED,
            PrintJobStatus.EXPIRED,
            PrintJobStatus.CANCELLED,
        }:
            return job
        if job.status is PrintJobStatus.SENDING and (
            now >= job.expires_at or (job.claim is not None and now >= job.claim.lease_expires_at)
        ):
            data = job.model_dump()
            data.update({"status": PrintJobStatus.DELIVERY_UNKNOWN, "last_error": cls.SENDING_LEASE_EXPIRED_ERROR})
            return PrintJob.model_validate(data)
        if job.status is PrintJobStatus.CLAIMED and job.claim is not None and now >= job.claim.lease_expires_at:
            if now >= job.expires_at:
                return cls.transition(job, PrintJobStatus.EXPIRED)
            requeued_data = job.model_dump()
            requeued_data.update({"claim": None, "status": PrintJobStatus.QUEUED})
            return PrintJob.model_validate(requeued_data)
        if now >= job.expires_at and job.status in {
            PrintJobStatus.ACCEPTED,
            PrintJobStatus.RENDERED,
            PrintJobStatus.QUEUED,
        }:
            return cls.transition(job, PrintJobStatus.EXPIRED)
        if job.status is not PrintJobStatus.CLAIMED or job.claim is None:
            return job
        return job
