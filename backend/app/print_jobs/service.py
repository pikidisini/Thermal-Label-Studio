"""Print-job profile and delivery validation without network dispatch."""

from __future__ import annotations

from decimal import Decimal
from dataclasses import dataclass
from datetime import datetime

from .artifact_storage import ArtifactIntegrityError, ArtifactStorage
from .models import PrintJob, PrintJobStatus, PrinterProfile
from .repository import DeliveryConflictError, InMemoryPrintJobRepository, PrintJobRepository
from .transport import MockPrinterTransport, MockSendResult, MockTransportOutcome


class PrintJobServiceError(ValueError):
    """Base error for deterministic print-job service validation."""


class DpiNotConfirmedError(PrintJobServiceError):
    """Raised when a printer profile has no confirmed DPI."""


class DpiMismatchError(PrintJobServiceError):
    """Raised when a job DPI differs from the printer profile DPI."""


class PrinterProfileNotFoundError(PrintJobServiceError):
    """Raised when a job references an unknown printer profile."""


class SiteMismatchError(PrintJobServiceError):
    """Raised when a job site is not allowed by the printer profile."""


class LanguageMismatchError(PrintJobServiceError):
    """Raised when a job language differs from the printer profile."""


class EmulationMismatchError(PrintJobServiceError):
    """Raised when a job emulation differs from the printer profile."""


class DeliveryNotAllowedError(DeliveryConflictError):
    """Raised when a job is not in the claimed delivery state."""


class LeaseOwnershipError(PrintJobServiceError):
    """Raised when an agent does not own a live claim."""


@dataclass(frozen=True)
class DeliveryResult:
    job: PrintJob
    outcome: MockTransportOutcome
    bytes_sent: int


class PrintJobService:
    """Validates jobs against local profiles and optionally uses only a mock transport."""

    def __init__(
        self,
        profiles: list[PrinterProfile],
        repository: PrintJobRepository | None = None,
        artifact_storage: ArtifactStorage | None = None,
    ) -> None:
        self._profiles = {profile.printer_id: profile for profile in profiles}
        self.repository = repository or InMemoryPrintJobRepository()
        self.artifact_storage = artifact_storage

    def get_printable_profile(self, job: PrintJob) -> PrinterProfile:
        try:
            profile = self._profiles[job.printer_id]
        except KeyError as exc:
            raise PrinterProfileNotFoundError(f"unknown printer profile: {job.printer_id}") from exc
        allowed_sites = set(profile.allowed_site_ids)
        if profile.site_id is not None:
            allowed_sites.add(profile.site_id)
        if job.site_id not in allowed_sites:
            raise SiteMismatchError(f"job site is not allowed for printer: {job.site_id}")
        if job.printer_language is not profile.language:
            raise LanguageMismatchError(f"job language does not match profile: {job.printer_id}")
        if job.emulation is not profile.emulation:
            raise EmulationMismatchError(f"job emulation does not match profile: {job.printer_id}")
        if profile.dpi is None or not profile.dpi_confirmed:
            raise DpiNotConfirmedError(f"printer DPI is not confirmed: {job.printer_id}")
        if Decimal(str(job.dpi)) != Decimal(str(profile.dpi)):
            raise DpiMismatchError(
                f"job DPI {job.dpi} does not match profile DPI {profile.dpi}: {job.printer_id}"
            )
        return profile

    def deliver_with_mock(
        self,
        job_id: str,
        agent_id: str,
        now: datetime,
        transport: MockPrinterTransport,
    ) -> DeliveryResult:
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("datetime must include timezone information")
        if self.artifact_storage is None:
            raise DeliveryNotAllowedError("artifact storage is required for delivery")
        job = self.repository.get(job_id)
        if job.status is not PrintJobStatus.CLAIMED:
            raise DeliveryNotAllowedError("only claimed jobs may be delivered")
        if job.claim is None or job.claim.agent_id != agent_id:
            raise LeaseOwnershipError("agent does not own the claim")
        self.get_printable_profile(job)
        try:
            sending = self.repository.begin_delivery(job_id, agent_id, now)
            if sending.artifact is None or sending.artifact_sha256 is None:
                raise ArtifactIntegrityError("claimed job has no complete artifact")
            payload = self.artifact_storage.read_verified(sending.artifact, sending.artifact_sha256)
        except ArtifactIntegrityError as exc:
            if self.repository.get(job_id).status is PrintJobStatus.SENDING:
                self.repository.finalize_delivery(job_id, agent_id, PrintJobStatus.FAILED, str(exc))
            raise
        result: MockSendResult = transport.send(payload)
        if result.outcome is MockTransportOutcome.SUCCESS:
            final_status = PrintJobStatus.SENT_TO_PRINTER
            error = None
        elif result.outcome is MockTransportOutcome.FAILURE_BEFORE_SEND:
            final_status = PrintJobStatus.FAILED
            error = "mock transport failed before send"
        else:
            final_status = PrintJobStatus.DELIVERY_UNKNOWN
            error = "mock transport delivery outcome is unknown; automatic retry is forbidden"
        final_job = self.repository.finalize_delivery(job_id, agent_id, final_status, error)
        return DeliveryResult(final_job, result.outcome, result.bytes_sent)
