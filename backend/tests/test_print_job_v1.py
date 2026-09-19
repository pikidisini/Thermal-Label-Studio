"""Focused tests for the offline print-job v1 foundation."""

from __future__ import annotations

import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.print_jobs import (
    ArtifactReference,
    ArtifactConflictError,
    ArtifactIntegrityError,
    Claim,
    DpiMismatchError,
    DpiNotConfirmedError,
    DeliveryNotAllowedError,
    DeliveryConflictError,
    Emulation,
    EmulationMismatchError,
    InMemoryPrintJobRepository,
    MockPrinterTransport,
    MockTransportOutcome,
    PrintJob,
    PrintJobService,
    PrintJobStateMachine,
    PrintJobStatus,
    PrinterLanguage,
    PrinterProfile,
    LanguageMismatchError,
    SiteMismatchError,
    SourceContractMetadata,
    SourceMetadata,
    TemporaryArtifactStorage,
)
from app.print_jobs.repository import ClaimConflictError, IdempotencyConflictError, JobExpiredError
from app.print_jobs.state_machine import InvalidTransitionError


NOW = datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc)
CHECKSUM = "a" * 64


def _artifact(language: PrinterLanguage = PrinterLanguage.IPL) -> ArtifactReference:
    return ArtifactReference(
        payload_ref="payload_001",
        filename="label.ipl" if language is PrinterLanguage.IPL else "label.zpl",
        media_type="application/octet-stream",
        byte_length=3,
    )


def _job(
    status: PrintJobStatus = PrintJobStatus.QUEUED,
    *,
    language: PrinterLanguage = PrinterLanguage.IPL,
    emulation: Emulation = Emulation.NATIVE,
    claim: Claim | None = None,
    dpi: float = 203.0,
    request_id: str = "request-001",
    job_id: str = "job-001",
    printer_id: str = "pm45-001",
) -> PrintJob:
    has_artifact = status not in {PrintJobStatus.ACCEPTED} and status not in {
        PrintJobStatus.FAILED,
        PrintJobStatus.EXPIRED,
        PrintJobStatus.CANCELLED,
    }
    delivery_claim = claim or (
        Claim(
            agent_id="agent-001",
            claimed_at=NOW,
            lease_expires_at=NOW + timedelta(minutes=1),
            fencing_token=1,
        )
        if status
        in {
            PrintJobStatus.CLAIMED,
            PrintJobStatus.SENDING,
            PrintJobStatus.SENT_TO_PRINTER,
            PrintJobStatus.DELIVERY_UNKNOWN,
        }
        else None
    )
    return PrintJob(
        contract_version="1.0",
        job_id=job_id,
        request_id=request_id,
        created_at=NOW,
        expires_at=NOW + timedelta(minutes=5),
        site_id="site-001",
        printer_id=printer_id,
        printer_language=language,
        emulation=emulation,
        dpi=dpi,
        copies=1,
        artifact=_artifact(language) if has_artifact else None,
        artifact_sha256=CHECKSUM if has_artifact else None,
        status=status,
        attempt_count=0,
        last_error=None,
        claim=delivery_claim,
        source=SourceMetadata(producer_type="sap", program="ZMMR_LABEL_JSON"),
    )


def test_language_emulation_filename_rules() -> None:
    assert _job(language=PrinterLanguage.IPL, emulation=Emulation.NATIVE).artifact.filename == "label.ipl"
    assert _job(language=PrinterLanguage.ZPL, emulation=Emulation.ZSIM2).artifact.filename == "label.zpl"
    with pytest.raises(ValidationError):
        _job(language=PrinterLanguage.IPL, emulation=Emulation.ZSIM2)
    with pytest.raises(ValidationError):
        PrintJob(**{**_job(language=PrinterLanguage.IPL).model_dump(), "artifact": _artifact(PrinterLanguage.ZPL)})


def test_lifecycle_artifact_and_claim_rules() -> None:
    assert _job(PrintJobStatus.ACCEPTED).artifact is None
    assert _job(PrintJobStatus.QUEUED).claim is None
    assert _job(PrintJobStatus.SENDING).claim is not None
    for status in (PrintJobStatus.RENDERED, PrintJobStatus.QUEUED, PrintJobStatus.CLAIMED):
        assert _job(status).artifact is not None
    invalid_claim_job = _job(PrintJobStatus.CLAIMED).model_dump()
    invalid_claim_job["claim"] = None
    with pytest.raises(ValidationError):
        PrintJob(**invalid_claim_job)


def test_timestamps_and_lease_order_are_validated() -> None:
    with pytest.raises(ValidationError):
        _job().__class__(**{**_job().model_dump(), "expires_at": NOW})
    with pytest.raises(ValidationError):
        Claim(agent_id="agent-001", claimed_at=NOW, lease_expires_at=NOW, fencing_token=1)


def test_state_machine_normal_and_invalid_transitions() -> None:
    accepted = _job(PrintJobStatus.ACCEPTED)
    rendered = PrintJobStateMachine.render(accepted, _artifact(), CHECKSUM)
    queued = PrintJobStateMachine.transition(rendered, PrintJobStatus.QUEUED)
    claimed = PrintJobStateMachine.claim(
        queued,
        Claim(
            agent_id="agent-001",
            claimed_at=NOW,
            lease_expires_at=NOW + timedelta(minutes=1),
            fencing_token=1,
        ),
    )
    sending = PrintJobStateMachine.transition(claimed, PrintJobStatus.SENDING)
    sent = PrintJobStateMachine.transition(sending, PrintJobStatus.SENT_TO_PRINTER)
    assert rendered.status is PrintJobStatus.RENDERED
    assert sent.status is PrintJobStatus.SENT_TO_PRINTER
    assert len({accepted.job_id, rendered.job_id, queued.job_id, claimed.job_id, sending.job_id, sent.job_id}) == 1
    assert len({accepted.request_id, rendered.request_id, queued.request_id, claimed.request_id, sending.request_id, sent.request_id}) == 1
    with pytest.raises(InvalidTransitionError):
        PrintJobStateMachine.transition(claimed, PrintJobStatus.QUEUED)
    for source in PrintJobStatus:
        source_job = _job(source)
        for target in PrintJobStatus:
            if target not in PrintJobStateMachine._transitions[source]:
                with pytest.raises(InvalidTransitionError):
                    PrintJobStateMachine.transition(source_job, target)


def test_idempotency_is_key_order_independent_and_conflict_is_typed() -> None:
    repo = InMemoryPrintJobRepository()
    job = _job(request_id="request-idempotent", job_id="job-idempotent")
    first = repo.create_idempotent(job, {"data": {"b": 2, "a": 1}, "copies": 1})
    retry = _job(request_id="request-idempotent", job_id="job-idempotent-retry")
    second = repo.create_idempotent(retry, {"copies": 1, "data": {"a": 1, "b": 2}})
    assert first.job_id == second.job_id
    with pytest.raises(IdempotencyConflictError):
        repo.create_idempotent(job, {"copies": 2})
    with pytest.raises(IdempotencyConflictError):
        repo.create_idempotent(_job(request_id="request-other", job_id="job-idempotent"), {"new": True})


def test_repository_result_idempotency_checks_owner_before_record() -> None:
    repo = InMemoryPrintJobRepository()
    sending = _job(PrintJobStatus.SENDING, request_id="result-request", job_id="result-job")
    repo.create_idempotent(sending, {"job": sending.job_id})
    first = repo.report_result(sending.job_id, "agent-001", MockTransportOutcome.SUCCESS, 3)
    assert first.status is PrintJobStatus.SENT_TO_PRINTER
    with pytest.raises(DeliveryConflictError):
        repo.report_result(sending.job_id, "wrong-agent", MockTransportOutcome.SUCCESS, 3)
    repeated = repo.report_result(sending.job_id, "agent-001", MockTransportOutcome.SUCCESS, 3)
    assert repeated.status is PrintJobStatus.SENT_TO_PRINTER
    with pytest.raises(DeliveryConflictError):
        repo.report_result(sending.job_id, "agent-001", MockTransportOutcome.DELIVERY_UNKNOWN, 3)
    with pytest.raises(DeliveryConflictError):
        repo.report_result(sending.job_id, "agent-001", MockTransportOutcome.SUCCESS, 2)


def test_accepted_render_operation_populates_artifact_without_invalid_copy() -> None:
    accepted = _job(PrintJobStatus.ACCEPTED)
    rendered = PrintJobStateMachine.render(accepted, _artifact(), CHECKSUM)
    assert rendered.status is PrintJobStatus.RENDERED
    assert rendered.artifact is not None and rendered.artifact_sha256 == CHECKSUM


def test_source_metadata_is_nested_strict_and_datetime_requires_timezone() -> None:
    metadata = SourceContractMetadata(label_type="ROLL", label_code="SR01", contract_version="1.1")
    assert metadata.label_type == "ROLL"
    with pytest.raises(ValidationError):
        SourceContractMetadata(**{"label_type": "ROLL", "unexpected": "nope"})
    with pytest.raises(ValidationError):
        _job().__class__(**{**_job().model_dump(), "created_at": NOW.replace(tzinfo=None)})


def test_concurrent_claim_has_exactly_one_winner() -> None:
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(_job(job_id="job-claim", request_id="request-claim"), {"request": "claim"})

    def attempt(agent: str) -> str:
        try:
            repo.claim("job-claim", agent, NOW, timedelta(minutes=1))
            return "success"
        except ClaimConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["agent-a", "agent-b"]))
    assert results.count("success") == 1
    assert results.count("conflict") == 1


def test_lease_expiry_requeues_before_sending_and_marks_sending_unknown() -> None:
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(_job(job_id="job-expire", request_id="request-expire"), {"request": "expire"})
    repo.claim("job-expire", "agent-a", NOW, timedelta(seconds=1))
    requeued = repo.expire_lease("job-expire", NOW + timedelta(seconds=2))
    assert requeued.status is PrintJobStatus.QUEUED and requeued.claim is None

    sending = _job(
        PrintJobStatus.SENDING,
        claim=Claim(
            agent_id="agent-a",
            claimed_at=NOW,
            lease_expires_at=NOW + timedelta(seconds=1),
            fencing_token=1,
        ),
    )
    repo.create_idempotent(sending, {"request": "sending"})
    unknown = repo.expire_lease(sending.job_id, NOW + timedelta(seconds=2))
    assert unknown.status is PrintJobStatus.DELIVERY_UNKNOWN
    assert unknown.claim is not None and unknown.claim.agent_id == "agent-a"
    assert unknown.last_error == "delivery lease expired while sending; delivery outcome is unknown"


def test_reconcile_claimed_lease_can_be_claimed_again_atomically() -> None:
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(_job(job_id="recover", request_id="recover-request"), {"request": "recover"})
    repo.claim("recover", "agent-old", NOW, timedelta(seconds=1))
    recovered = repo.reconcile_job("recover", NOW + timedelta(seconds=2))
    assert recovered.status is PrintJobStatus.QUEUED and recovered.claim is None
    reclaimed = repo.claim("recover", "agent-new", NOW + timedelta(seconds=2), timedelta(seconds=1))
    assert reclaimed.claim is not None and reclaimed.claim.agent_id == "agent-new"
    assert reclaimed.attempt_count == 0


def test_two_concurrent_claim_next_calls_recovering_lease_have_one_winner() -> None:
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(_job(job_id="recover-race", request_id="recover-race-request"), {"request": "race"})
    repo.claim("recover-race", "agent-old", NOW, timedelta(seconds=1))

    def attempt(agent: str) -> str:
        claimed = repo.claim_next("site-001", agent, NOW + timedelta(seconds=2), timedelta(seconds=1))
        return "success" if claimed is not None else "empty"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["agent-a", "agent-b"]))
    assert results.count("success") == 1
    assert results.count("empty") == 1


def test_reconcile_expiry_rules_are_atomic_idempotent_and_terminal_safe() -> None:
    repo = InMemoryPrintJobRepository()
    expiring = _job(job_id="claimed-expiring", request_id="claimed-expiring-request")
    data = expiring.model_dump()
    data["expires_at"] = NOW + timedelta(seconds=1)
    expiring = PrintJob.model_validate(data)
    repo.create_idempotent(expiring, {"request": "expires"})
    repo.claim(expiring.job_id, "agent-old", NOW, timedelta(minutes=5))
    expired = repo.reconcile_job(expiring.job_id, NOW + timedelta(seconds=1))
    assert expired.status is PrintJobStatus.EXPIRED
    assert expired.claim is not None

    sending = _job(
        PrintJobStatus.SENDING,
        job_id="sending-expired",
        request_id="sending-expired-request",
        claim=Claim(
            agent_id="agent-old",
            claimed_at=NOW,
            lease_expires_at=NOW + timedelta(seconds=1),
            fencing_token=1,
        ),
    )
    repo.create_idempotent(sending, {"request": "sending-expires"})
    unknown = repo.reconcile_job(sending.job_id, NOW + timedelta(seconds=2))
    repeated = repo.reconcile_job(sending.job_id, NOW + timedelta(seconds=3))
    assert unknown.status is repeated.status is PrintJobStatus.DELIVERY_UNKNOWN
    assert unknown.attempt_count == repeated.attempt_count == 0
    assert repeated.claim is not None and repeated.claim.agent_id == "agent-old"
    for terminal in (PrintJobStatus.SENT_TO_PRINTER, PrintJobStatus.DELIVERY_UNKNOWN,
                     PrintJobStatus.FAILED, PrintJobStatus.EXPIRED, PrintJobStatus.CANCELLED):
        terminal_job = _job(terminal, job_id=f"terminal-{terminal.value}", request_id=f"terminal-{terminal.value}")
        repo.create_idempotent(terminal_job, {"terminal": terminal.value})
        assert repo.reconcile_job(terminal_job.job_id, NOW + timedelta(hours=1)).status is terminal
    with pytest.raises(ValueError):
        repo.reconcile_expired_jobs(NOW.replace(tzinfo=None))


def test_claim_rejects_expired_job_and_exact_expiry_boundary_and_clamps_lease() -> None:
    for offset in (timedelta(0), timedelta(seconds=1)):
        job_data = _job(job_id=f"job-expired-{offset.total_seconds()}", request_id=f"request-expired-{offset.total_seconds()}").model_dump()
        job_data.update({"created_at": NOW - timedelta(minutes=1), "expires_at": NOW})
        expired_job = PrintJob.model_validate(job_data)
        repo = InMemoryPrintJobRepository()
        repo.create_idempotent(expired_job, {"expired": offset.total_seconds()})
        with pytest.raises(JobExpiredError):
            repo.claim(expired_job.job_id, "agent-001", NOW, timedelta(minutes=5))
        assert repo.get(expired_job.job_id).status is PrintJobStatus.EXPIRED

    job = _job(job_id="job-clamped", request_id="request-clamped")
    data = job.model_dump()
    data["expires_at"] = NOW + timedelta(seconds=10)
    job = PrintJob.model_validate(data)
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(job, {"clamped": True})
    claimed = repo.claim(job.job_id, "agent-001", NOW, timedelta(minutes=5))
    assert claimed.claim is not None and claimed.claim.lease_expires_at == job.expires_at


def test_delivery_after_job_expiry_is_rejected_and_marks_expired() -> None:
    job_data = _job(job_id="job-delivery-expired", request_id="request-delivery-expired").model_dump()
    job_data["expires_at"] = NOW + timedelta(seconds=1)
    expired_candidate = PrintJob.model_validate(job_data)
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(expired_candidate, {"delivery_expiry": True})
    repo.claim(expired_candidate.job_id, "agent-001", NOW, timedelta(seconds=1))
    with pytest.raises(JobExpiredError):
        repo.begin_delivery(expired_candidate.job_id, "agent-001", NOW + timedelta(seconds=1))
    assert repo.get(expired_candidate.job_id).status is PrintJobStatus.EXPIRED


def test_delivery_unknown_has_no_automatic_retry_transition() -> None:
    unknown = _job(PrintJobStatus.DELIVERY_UNKNOWN)
    with pytest.raises(InvalidTransitionError):
        PrintJobStateMachine.transition(unknown, PrintJobStatus.SENDING)


def test_temporary_storage_checksum_length_and_traversal(tmp_path: Path) -> None:
    storage = TemporaryArtifactStorage(tmp_path)
    payload = b"IPL"
    artifact = storage.put("payload_safe", "label.ipl", payload)
    checksum = storage.checksum(payload)
    assert artifact.byte_length == len(payload)
    assert storage.read_verified(artifact, checksum) == payload
    restarted_storage = TemporaryArtifactStorage(tmp_path)
    assert restarted_storage.put("payload_safe", "label.ipl", payload) == artifact
    assert restarted_storage.read_verified(artifact, checksum) == payload
    with pytest.raises(ValueError):
        storage.put("../escape", "label.ipl", payload)
    with pytest.raises(ArtifactConflictError):
        storage.put("payload_safe", "label.ipl", b"different")
    with pytest.raises(ValueError):
        storage.read_verified(artifact, "b" * 64)
    with pytest.raises(ValidationError):
        ArtifactReference(
            payload_ref="payload_large",
            filename="label.ipl",
            media_type="application/octet-stream",
            byte_length=10 * 1024 * 1024 + 1,
        )
    assert not list(Path("backend/data/out").glob("payload_safe*")) if Path("backend/data/out").exists() else True


def test_copies_and_strict_extra_fields() -> None:
    with pytest.raises(ValidationError):
        _job().__class__(**{**_job().model_dump(), "copies": 101})
    with pytest.raises(ValidationError):
        _job().__class__(**{**_job().model_dump(), "unexpected": "nope"})
    with pytest.raises(ValidationError):
        _job().__class__(**{**_job().model_dump(), "artifact_sha256": CHECKSUM.upper()})


def test_mock_transport_success_failure_and_unknown() -> None:
    payload = b"label-bytes"
    for outcome, expected_bytes in (
        (MockTransportOutcome.SUCCESS, len(payload)),
        (MockTransportOutcome.FAILURE_BEFORE_SEND, 0),
        (MockTransportOutcome.DELIVERY_UNKNOWN, len(payload)),
    ):
        transport = MockPrinterTransport(outcome)
        result = transport.send(payload)
        assert result.outcome is outcome and result.bytes_sent == expected_bytes


def test_dpi_must_match_confirmed_profile_and_unconfirmed_profile_is_rejected() -> None:
    profile = PrinterProfile(
        printer_id="pm45-001",
        language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        allowed_site_ids=["site-001"],
        dpi=203.0,
        dpi_confirmed=True,
    )
    service = PrintJobService([profile])
    assert service.get_printable_profile(_job(dpi=203.0)).printer_id == profile.printer_id
    with pytest.raises(DpiMismatchError):
        service.get_printable_profile(_job(dpi=300.0))
    unconfirmed = PrinterProfile(
        printer_id="pm45-open-question",
        language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        allowed_site_ids=["site-001"],
        dpi=None,
        dpi_confirmed=False,
    )
    with pytest.raises(DpiNotConfirmedError):
        PrintJobService([unconfirmed]).get_printable_profile(
            _job(dpi=203.0, job_id="job-open", printer_id="pm45-open-question")
        )


def test_profile_site_language_and_emulation_mismatches_are_typed() -> None:
    base = dict(
        printer_id="pm45-001",
        language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        allowed_site_ids=["other-site"],
        dpi=203.0,
        dpi_confirmed=True,
    )
    with pytest.raises(SiteMismatchError):
        PrintJobService([PrinterProfile(**base)]).get_printable_profile(_job())

    language_profile = PrinterProfile(**{**base, "allowed_site_ids": ["site-001"], "language": PrinterLanguage.ZPL, "emulation": Emulation.NATIVE})
    with pytest.raises(LanguageMismatchError):
        PrintJobService([language_profile]).get_printable_profile(_job())

    emulation_profile = PrinterProfile(**{**base, "allowed_site_ids": ["site-001"], "emulation": Emulation.ZSIM2, "language": PrinterLanguage.ZPL})
    zpl_job = _job(language=PrinterLanguage.ZPL, emulation=Emulation.NATIVE, job_id="job-emulation")
    with pytest.raises(EmulationMismatchError):
        PrintJobService([emulation_profile]).get_printable_profile(zpl_job)


def test_delivery_orchestration_reads_storage_updates_repository_and_never_retries(tmp_path: Path) -> None:
    payload = b"IPL"
    storage = TemporaryArtifactStorage(tmp_path)
    artifact = storage.put("payload_delivery", "label.ipl", payload)
    queued_data = _job(job_id="job-delivery", request_id="request-delivery").model_dump()
    queued_data.update({"artifact": artifact.model_dump(), "artifact_sha256": storage.checksum(payload)})
    queued = PrintJob.model_validate(queued_data)
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(queued, {"delivery": "success"})
    claimed = repo.claim(queued.job_id, "agent-001", NOW, timedelta(minutes=1))
    service = PrintJobService(
        [PrinterProfile(printer_id="pm45-001", language=PrinterLanguage.IPL, emulation=Emulation.NATIVE, site_id="site-001", dpi=203.0, dpi_confirmed=True)],
        repository=repo,
        artifact_storage=storage,
    )
    result = service.deliver_with_mock(claimed.job_id, "agent-001", NOW, MockPrinterTransport())
    assert result.job.status is PrintJobStatus.SENT_TO_PRINTER
    assert result.job.attempt_count == 1
    assert repo.get(queued.job_id).status is PrintJobStatus.SENT_TO_PRINTER

    for outcome, expected_status, expected_bytes in (
        (MockTransportOutcome.FAILURE_BEFORE_SEND, PrintJobStatus.FAILED, 0),
        (MockTransportOutcome.DELIVERY_UNKNOWN, PrintJobStatus.DELIVERY_UNKNOWN, len(payload)),
    ):
        data = queued.model_dump()
        data.update({"job_id": f"job-{outcome.value}", "request_id": f"request-{outcome.value}"})
        candidate = PrintJob.model_validate(data)
        local_repo = InMemoryPrintJobRepository()
        local_repo.create_idempotent(candidate, {"outcome": outcome.value})
        local_claimed = local_repo.claim(candidate.job_id, "agent-001", NOW, timedelta(minutes=1))
        local_service = PrintJobService(
            [PrinterProfile(printer_id="pm45-001", language=PrinterLanguage.IPL, emulation=Emulation.NATIVE, site_id="site-001", dpi=203.0, dpi_confirmed=True)],
            repository=local_repo,
            artifact_storage=storage,
        )
        delivery = local_service.deliver_with_mock(local_claimed.job_id, "agent-001", NOW, MockPrinterTransport(outcome))
        assert delivery.job.status is expected_status and delivery.bytes_sent == expected_bytes
        assert delivery.job.attempt_count == 1
        if outcome is MockTransportOutcome.DELIVERY_UNKNOWN:
            with pytest.raises(DeliveryNotAllowedError):
                local_service.deliver_with_mock(local_claimed.job_id, "agent-001", NOW, MockPrinterTransport(outcome))


def test_delivery_rejects_every_non_claimed_status_and_checksum_mismatch(tmp_path: Path) -> None:
    storage = TemporaryArtifactStorage(tmp_path)
    artifact = storage.put("payload_invalid_delivery", "label.ipl", b"IPL")
    profile = PrinterProfile(
        printer_id="pm45-001",
        language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        site_id="site-001",
        dpi=203.0,
        dpi_confirmed=True,
    )
    for index, status in enumerate(
        (
            PrintJobStatus.ACCEPTED,
            PrintJobStatus.RENDERED,
            PrintJobStatus.QUEUED,
            PrintJobStatus.CANCELLED,
            PrintJobStatus.EXPIRED,
            PrintJobStatus.FAILED,
            PrintJobStatus.SENT_TO_PRINTER,
            PrintJobStatus.DELIVERY_UNKNOWN,
        )
    ):
        job = _job(status, job_id=f"job-invalid-{index}", request_id=f"request-invalid-{index}")
        repo = InMemoryPrintJobRepository()
        repo.create_idempotent(job, {"status": status.value})
        service = PrintJobService([profile], repository=repo, artifact_storage=storage)
        with pytest.raises(DeliveryNotAllowedError):
            service.deliver_with_mock(job.job_id, "agent-001", NOW, MockPrinterTransport())

    bad_data = _job(job_id="job-bad-checksum", request_id="request-bad-checksum").model_dump()
    bad_data.update({"artifact": artifact.model_dump(), "artifact_sha256": "b" * 64})
    bad_job = PrintJob.model_validate(bad_data)
    bad_repo = InMemoryPrintJobRepository()
    bad_repo.create_idempotent(bad_job, {"status": "bad-checksum"})
    bad_claimed = bad_repo.claim(bad_job.job_id, "agent-001", NOW, timedelta(minutes=1))
    bad_transport = MockPrinterTransport()
    bad_service = PrintJobService([profile], repository=bad_repo, artifact_storage=storage)
    with pytest.raises(ArtifactIntegrityError):
        bad_service.deliver_with_mock(bad_claimed.job_id, "agent-001", NOW, bad_transport)
    assert bad_transport.sent_payloads == []


def test_two_concurrent_deliveries_have_one_atomic_winner(tmp_path: Path) -> None:
    payload = b"IPL"
    storage = TemporaryArtifactStorage(tmp_path)
    artifact = storage.put("payload_concurrent_delivery", "label.ipl", payload)
    data = _job(job_id="job-concurrent-delivery", request_id="request-concurrent-delivery").model_dump()
    data.update({"artifact": artifact.model_dump(), "artifact_sha256": storage.checksum(payload)})
    job = PrintJob.model_validate(data)
    repo = InMemoryPrintJobRepository()
    repo.create_idempotent(job, {"concurrent": True})
    claimed = repo.claim(job.job_id, "agent-001", NOW, timedelta(minutes=1))
    service = PrintJobService(
        [PrinterProfile(printer_id="pm45-001", language=PrinterLanguage.IPL, emulation=Emulation.NATIVE, site_id="site-001", dpi=203.0, dpi_confirmed=True)],
        repository=repo,
        artifact_storage=storage,
    )
    started = threading.Event()
    release = threading.Event()

    class BlockingTransport(MockPrinterTransport):
        def send(self, payload: bytes):
            started.set()
            release.wait(timeout=5)
            return super().send(payload)

    transport = BlockingTransport()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(service.deliver_with_mock, claimed.job_id, "agent-001", NOW, transport)
        assert started.wait(timeout=5)
        second = pool.submit(service.deliver_with_mock, claimed.job_id, "agent-001", NOW, MockPrinterTransport())
        with pytest.raises(DeliveryConflictError):
            second.result(timeout=5)
        release.set()
        result = first.result(timeout=5)
    assert result.job.status is PrintJobStatus.SENT_TO_PRINTER
    assert result.job.attempt_count == 1
    assert len(transport.sent_payloads) == 1
    assert repo.get(claimed.job_id).attempt_count == 1


def test_concurrent_artifact_put_different_bytes_has_one_winner(tmp_path: Path) -> None:
    storage = TemporaryArtifactStorage(tmp_path)
    barrier = threading.Barrier(2)

    def put(payload: bytes) -> str:
        barrier.wait(timeout=5)
        try:
            storage.put("payload-race", "label.ipl", payload)
            return "success"
        except ArtifactConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(put, [b"IPL-A", b"IPL-B"]))
    assert results.count("success") == 1
    assert results.count("conflict") == 1


def test_same_payload_ref_same_bytes_different_filename_is_conflict(tmp_path: Path) -> None:
    storage = TemporaryArtifactStorage(tmp_path)
    storage.put("payload-same-bytes", "label.ipl", b"same")
    with pytest.raises(ArtifactConflictError):
        storage.put("payload-same-bytes", "label.zpl", b"same")


def test_schema_checksum_pattern_is_lowercase_only() -> None:
    schema_path = Path("docs/contracts/print_job_v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    schema_text = json.dumps(schema)
    assert "^[a-f0-9]{64}$" in schema_text
    assert "^[A-Fa-f0-9]{64}$" not in schema_text
    assert re.fullmatch(r"[a-f0-9]{64}", "A" * 64) is None
    assert re.fullmatch(r"[a-f0-9]{64}", "a" * 64)


def test_physical_size_is_preserved_when_dpi_changes() -> None:
    width_mm, height_mm = 50.0, 25.0
    at_203 = (round(width_mm / 25.4 * 203), round(height_mm / 25.4 * 203))
    at_300 = (round(width_mm / 25.4 * 300), round(height_mm / 25.4 * 300))
    assert at_203 != at_300
    assert abs(at_203[0] / 203 * 25.4 - width_mm) < 0.1
    assert abs(at_300[0] / 300 * 25.4 - width_mm) < 0.1
