"""One deterministic, offline Local Print Agent job cycle."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Callable, Mapping

from ..print_jobs.models import PrintJob, PrintJobStatus, PrinterLanguage
from .api_client import AgentApiClient
from .config import LocalPrinterProfile, PrintAgentConfig
from .models import AgentApiError, AgentResultResponse, AgentRunResult, AgentRunStatus, AgentValidationError, ArtifactPayload, TransportDeliveryUnknown, TransportFailureBeforeSend
from .transport import PrinterTransport, TransportOutcome

logger = logging.getLogger(__name__)


class LocalPrintAgentRunner:
    def __init__(
        self,
        config: PrintAgentConfig,
        api_client: AgentApiClient,
        transports: Mapping[str, PrinterTransport],
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config
        self.api_client = api_client
        self.transports = transports
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def run_once(self) -> AgentRunResult:
        logger.info("local_print_agent_run_started", extra={"event": "local_print_agent_run_started", "agent_id": self.config.agent_id})
        try:
            job = self.api_client.claim_next()
        except AgentApiError as exc:
            logger.warning("local_print_agent_api_unavailable", extra={"phase": "claim_next"})
            return AgentRunResult(AgentRunStatus.API_UNAVAILABLE, error_category=exc.category)
        if job is None:
            logger.info("local_print_agent_idle", extra={"event": "local_print_agent_idle", "agent_id": self.config.agent_id})
            return AgentRunResult(AgentRunStatus.IDLE)
        try:
            profile = self._validate_job(job)
            artifact = self.api_client.download_artifact(job.job_id)
            payload = self._verify_artifact(job, artifact, profile)
        except (AgentApiError, AgentValidationError) as exc:
            logger.warning("local_print_agent_pre_delivery_failure", extra={"job_id": job.job_id, "phase": "validation"})
            return AgentRunResult(AgentRunStatus.FAILED_BEFORE_SEND, job, error_category=type(exc).__name__)
        except Exception as exc:
            return AgentRunResult(AgentRunStatus.FAILED_BEFORE_SEND, job, error_category=type(exc).__name__)

        try:
            transport = self.transports[profile.transport_id]
        except KeyError:
            return AgentRunResult(AgentRunStatus.FAILED_BEFORE_SEND, job, error_category="transport_not_configured")
        try:
            sending = self.api_client.begin_delivery(job.job_id)
        except AgentApiError as exc:
            if self._is_definitive_rejection(exc):
                return AgentRunResult(AgentRunStatus.FAILED_BEFORE_SEND, job, error_category=exc.category)
            return self._recover_ambiguous_begin(job, exc)
        except Exception as exc:
            return self._recover_ambiguous_begin(job, exc)
        try:
            self._validate_sending_response(job, sending, profile)
        except AgentValidationError as exc:
            return self._recover_ambiguous_begin(job, exc)
        try:
            result = transport.send(payload, sending, profile)
        except TransportFailureBeforeSend:
            return self._report_after_begin(job, sending, "failure_before_send", 0, AgentRunStatus.FAILED_BEFORE_SEND)
        except TransportDeliveryUnknown:
            return self._report_after_begin(job, sending, "delivery_unknown", 0, AgentRunStatus.DELIVERY_UNKNOWN)
        except Exception:
            return self._report_after_begin(job, sending, "delivery_unknown", 0, AgentRunStatus.DELIVERY_UNKNOWN)
        outcome, bytes_sent = self._validated_transport_result(result, len(payload))
        if outcome is None:
            return self._report_after_begin(job, sending, "delivery_unknown", 0, AgentRunStatus.DELIVERY_UNKNOWN)
        status = {
            TransportOutcome.SUCCESS: AgentRunStatus.COMPLETED,
            TransportOutcome.FAILURE_BEFORE_SEND: AgentRunStatus.FAILED_BEFORE_SEND,
            TransportOutcome.DELIVERY_UNKNOWN: AgentRunStatus.DELIVERY_UNKNOWN,
        }[outcome]
        return self._report_after_begin(job, sending, outcome.value, bytes_sent, status)

    def _report_after_begin(self, job: PrintJob, sending: PrintJob, outcome: str, bytes_sent: int, status: AgentRunStatus) -> AgentRunResult:
        try:
            response = self.api_client.report_result(job.job_id, outcome, bytes_sent)
            self._validate_final_response(response, sending, outcome, bytes_sent)
        except AgentApiError as exc:
            return AgentRunResult(AgentRunStatus.UNCERTAIN, sending, outcome, bytes_sent, type(exc).__name__)
        except AgentValidationError as exc:
            return AgentRunResult(AgentRunStatus.UNCERTAIN, sending, outcome, bytes_sent, type(exc).__name__)
        except Exception as exc:
            return AgentRunResult(AgentRunStatus.UNCERTAIN, sending, outcome, bytes_sent, type(exc).__name__)
        logger.info("local_print_agent_run_finished", extra={"job_id": job.job_id, "phase": "result", "outcome": outcome, "bytes_sent": bytes_sent})
        return AgentRunResult(status, response.job, outcome, bytes_sent)

    @staticmethod
    def _is_definitive_rejection(error: AgentApiError) -> bool:
        return error.status_code in {401, 403, 404, 409, 410, 422, 429}

    def _recover_ambiguous_begin(self, job: PrintJob, error: Exception) -> AgentRunResult:
        try:
            response = self.api_client.report_result(job.job_id, "failure_before_send", 0)
            self._validate_final_response(response, job, "failure_before_send", 0, allow_attempt_increment=True)
        except Exception as callback_error:
            return AgentRunResult(AgentRunStatus.UNCERTAIN, job, "failure_before_send", 0, type(callback_error).__name__)
        return AgentRunResult(AgentRunStatus.FAILED_BEFORE_SEND, response.job, "failure_before_send", 0, type(error).__name__)

    def _validate_final_response(
        self,
        response: AgentResultResponse,
        reference: PrintJob,
        expected_outcome: str,
        expected_bytes: int,
        *,
        allow_attempt_increment: bool = False,
    ) -> None:
        expected_status = {
            "success": PrintJobStatus.SENT_TO_PRINTER,
            "failure_before_send": PrintJobStatus.FAILED,
            "delivery_unknown": PrintJobStatus.DELIVERY_UNKNOWN,
        }[expected_outcome]
        if response.outcome != expected_outcome or response.bytes_sent != expected_bytes:
            raise AgentValidationError("result response does not match submitted result")
        job = response.job
        if job.status is not expected_status or job.job_id != reference.job_id:
            raise AgentValidationError("result response has inconsistent identity or status")
        for field_name in ("request_id", "contract_version", "created_at", "expires_at", "site_id", "printer_id", "printer_language", "emulation", "dpi", "copies", "source", "artifact", "artifact_sha256"):
            if getattr(job, field_name) != getattr(reference, field_name):
                raise AgentValidationError("result response changed immutable job data")
        if job.claim is None or job.claim.agent_id != self.config.agent_id:
            raise AgentValidationError("result response has an unowned or missing claim")
        if reference.claim is not None and job.claim != reference.claim:
            raise AgentValidationError("result response changed claim ownership")
        if allow_attempt_increment:
            if job.attempt_count < reference.attempt_count or job.attempt_count > reference.attempt_count + 1:
                raise AgentValidationError("result response changed attempt count unexpectedly")
        elif job.attempt_count != reference.attempt_count:
            raise AgentValidationError("result response changed attempt count")

    def _validate_job(self, job: PrintJob) -> LocalPrinterProfile:
        if job.status is not PrintJobStatus.CLAIMED:
            raise AgentValidationError("job is not claimed")
        if job.claim is None or job.claim.agent_id != self.config.agent_id:
            raise AgentValidationError("claim is not owned by this agent")
        now = self._clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise AgentValidationError("agent clock must be timezone-aware")
        if now >= job.expires_at or now >= job.claim.lease_expires_at:
            raise AgentValidationError("job lease or expiry has elapsed")
        for profile in self.config.profiles:
            allowed_sites = set(profile.allowed_site_ids) | {profile.site_id}
            if (
                job.site_id in allowed_sites
                and profile.printer_id == job.printer_id
                and profile.language is job.printer_language
                and profile.emulation is job.emulation
                and profile.dpi_confirmed
                and profile.dpi is not None
                and profile.dpi == job.dpi
            ):
                return profile
        raise AgentValidationError("no matching confirmed local printer profile")

    def _verify_artifact(self, job: PrintJob, artifact: ArtifactPayload, profile: LocalPrinterProfile) -> bytes:
        expected_filename = "label.ipl" if profile.language is PrinterLanguage.IPL else "label.zpl"
        if artifact.filename != expected_filename or artifact.media_type != "application/octet-stream":
            raise AgentValidationError("artifact filename or media type does not match profile")
        if job.artifact is None or job.artifact_sha256 is None:
            raise AgentValidationError("job artifact reference is incomplete")
        if artifact.byte_length != job.artifact.byte_length or artifact.byte_length > self.config.max_artifact_bytes:
            raise AgentValidationError("artifact byte length mismatch")
        actual = hashlib.sha256(artifact.payload).hexdigest()
        if actual != artifact.sha256 or actual != job.artifact_sha256 or len(artifact.payload) != artifact.byte_length:
            raise AgentValidationError("artifact checksum or length mismatch")
        return artifact.payload

    def _validate_sending_response(self, claimed: PrintJob, sending: PrintJob, profile: LocalPrinterProfile) -> None:
        now = self._clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise AgentValidationError("agent clock must be timezone-aware")
        if sending.job_id != claimed.job_id or sending.status is not PrintJobStatus.SENDING:
            raise AgentValidationError("begin-delivery returned inconsistent job identity or status")
        if sending.claim is None or sending.claim.agent_id != self.config.agent_id:
            raise AgentValidationError("begin-delivery returned an unowned claim")
        if sending.claim != claimed.claim or sending.attempt_count != claimed.attempt_count + 1:
            raise AgentValidationError("begin-delivery changed claim or attempt count")
        for field_name in ("contract_version", "copies", "source", "request_id", "site_id", "printer_id", "printer_language", "emulation", "dpi", "artifact", "artifact_sha256"):
            if getattr(sending, field_name) != getattr(claimed, field_name):
                raise AgentValidationError("begin-delivery changed immutable job data")
        if sending.expires_at != claimed.expires_at or sending.created_at != claimed.created_at:
            raise AgentValidationError("begin-delivery changed immutable timestamps")
        if now >= sending.expires_at or now >= sending.claim.lease_expires_at:
            raise AgentValidationError("begin-delivery returned an expired lease")
        allowed_sites = set(profile.allowed_site_ids) | {profile.site_id}
        if sending.printer_id != profile.printer_id or sending.site_id not in allowed_sites:
            raise AgentValidationError("begin-delivery returned an incompatible profile")

    @staticmethod
    def _validated_transport_result(result: TransportResult, payload_length: int) -> tuple[TransportOutcome | None, int]:
        try:
            outcome = TransportOutcome(result.outcome)
        except (TypeError, ValueError):
            return None, 0
        if result.bytes_sent < 0 or result.bytes_sent > payload_length:
            return None, 0
        if outcome is TransportOutcome.SUCCESS and result.bytes_sent != payload_length:
            return None, 0
        if outcome is TransportOutcome.FAILURE_BEFORE_SEND and result.bytes_sent != 0:
            return None, 0
        return outcome, result.bytes_sent
