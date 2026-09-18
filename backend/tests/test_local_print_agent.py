"""Offline tests for one deterministic Local Print Agent cycle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.local_print_agent.api_client import HttpPrintAgentApiClient
from app.local_print_agent.config import LocalPrinterProfile, PrintAgentConfig
from app.local_print_agent.models import (
    AgentApiError,
    AgentResultResponse,
    AgentRunStatus,
    ArtifactPayload,
    TransportDeliveryUnknown,
    TransportFailureBeforeSend,
    TypedAgentApiError,
)
from app.local_print_agent.runner import LocalPrintAgentRunner
from app.local_print_agent.transport import MemoryPrinterTransport, TransportOutcome, TransportResult
from app.print_jobs.models import ArtifactReference, Claim, Emulation, PrintJob, PrintJobStatus, PrinterLanguage, PrinterProfile, SourceMetadata
from app.api.routes_print_agent import InMemoryAgentRateLimiter, PrintAgentDependencies, PrintAgentSettings, router
from app.print_jobs.repository import InMemoryPrintJobRepository
from app.print_jobs.artifact_storage import TemporaryArtifactStorage


NOW = datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc)
PAYLOAD = b"IPL TEST"
CHECKSUM = sha256(PAYLOAD).hexdigest()


def profile(*, dpi_confirmed: bool = True, dpi: float | None = 203) -> LocalPrinterProfile:
    return LocalPrinterProfile(
        printer_id="printer-test",
        site_id="site-test",
        language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        dpi=dpi,
        dpi_confirmed=dpi_confirmed,
        transport_id="memory",
    )


def job(*, status: PrintJobStatus = PrintJobStatus.CLAIMED, claim_agent: str = "agent-test",
        expires_at: datetime = NOW + timedelta(minutes=5), lease_expires_at: datetime = NOW + timedelta(minutes=1)) -> PrintJob:
    return PrintJob(
        contract_version="1.0", job_id="job-test", request_id="request-test",
        created_at=NOW - timedelta(minutes=1), expires_at=expires_at, site_id="site-test",
        printer_id="printer-test", printer_language=PrinterLanguage.IPL, emulation=Emulation.NATIVE,
        dpi=203, copies=1,
        artifact=ArtifactReference(payload_ref="payload-test", filename="label.ipl",
                                   media_type="application/octet-stream", byte_length=len(PAYLOAD)),
        artifact_sha256=CHECKSUM, status=status, attempt_count=0, last_error=None,
        claim=Claim(
            agent_id=claim_agent,
            claimed_at=NOW if lease_expires_at > NOW else lease_expires_at - timedelta(seconds=1),
            lease_expires_at=lease_expires_at,
        )
        if status in {PrintJobStatus.CLAIMED, PrintJobStatus.SENDING} else None,
        source=SourceMetadata(producer_type="sap", program="test"),
    )


class FakeApi:
    def __init__(self, claimed: PrintJob | None, artifact: ArtifactPayload | None = None) -> None:
        self.claimed = claimed
        self.artifact = artifact or ArtifactPayload(payload=PAYLOAD, sha256=CHECKSUM, byte_length=len(PAYLOAD), filename="label.ipl", media_type="application/octet-stream")
        self.calls: list[str] = []
        self.report_error: TypedAgentApiError | None = None
        self.reported: tuple[str, int] | None = None
        self.begin_response: PrintJob | None = None
        self.claim_error: AgentApiError | None = None
        self.report_response: AgentResultResponse | None = None

    def claim_next(self) -> PrintJob | None:
        self.calls.append("claim_next")
        if self.claim_error is not None:
            raise self.claim_error
        return self.claimed

    def download_artifact(self, job_id: str) -> ArtifactPayload:
        self.calls.append("download_artifact")
        return self.artifact

    def begin_delivery(self, job_id: str) -> PrintJob:
        self.calls.append("begin_delivery")
        assert self.claimed is not None
        return self.begin_response or PrintJob.model_validate(self.claimed.model_dump() | {"status": PrintJobStatus.SENDING, "attempt_count": 1})

    def report_result(self, job_id: str, outcome: str, bytes_sent: int) -> AgentResultResponse:
        self.calls.append("report_result")
        if self.report_error is not None:
            raise self.report_error
        self.reported = (outcome, bytes_sent)
        assert self.claimed is not None
        final_status = PrintJobStatus.SENT_TO_PRINTER if outcome == "success" else PrintJobStatus.DELIVERY_UNKNOWN if outcome == "delivery_unknown" else PrintJobStatus.FAILED
        final_job = PrintJob.model_validate(self.claimed.model_dump() | {"status": final_status, "attempt_count": 1})
        return self.report_response or AgentResultResponse(job=final_job, outcome=outcome, bytes_sent=bytes_sent)


def config(*, printer_profile: LocalPrinterProfile | None = None) -> PrintAgentConfig:
    return PrintAgentConfig(
        base_url="http://127.0.0.1:8000",
        bearer_token="unit-token",
        agent_id="agent-test",
        site_id="site-test",
        profiles=(printer_profile or profile(),),
    )


def test_no_job_is_idle_and_does_not_call_transport() -> None:
    api = FakeApi(None)
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.IDLE
    assert transport.calls == 0
    assert api.calls == ["claim_next"]


def test_happy_path_has_exact_call_order_and_lifecycle_outcome() -> None:
    api = FakeApi(job())
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert api.calls == ["claim_next", "download_artifact", "begin_delivery", "report_result"]
    assert result.status is AgentRunStatus.COMPLETED
    assert result.job is not None and result.job.status is PrintJobStatus.SENT_TO_PRINTER
    assert result.bytes_sent == len(PAYLOAD)
    assert transport.payloads == [PAYLOAD]
    assert api.reported == ("success", len(PAYLOAD))


@pytest.mark.parametrize("response_mutation", [
    {"outcome": "delivery_unknown"},
    {"bytes_sent": 0},
])
def test_final_response_outcome_and_bytes_must_match_request(response_mutation: dict[str, object]) -> None:
    api = FakeApi(job())
    final_job = PrintJob.model_validate(job().model_dump() | {"status": PrintJobStatus.SENT_TO_PRINTER, "attempt_count": 1})
    response_data: dict[str, object] = {"job": final_job, "outcome": "success", "bytes_sent": len(PAYLOAD)}
    response_data.update(response_mutation)
    api.report_response = AgentResultResponse.model_validate(response_data)
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.UNCERTAIN
    assert api.calls.count("report_result") == 1


@pytest.mark.parametrize("job_mutation", [
    {"job_id": "other-job"},
    {"request_id": "other-request"},
    {"copies": 2},
    {"source": {"producer_type": "sap", "program": "other"}},
    {"artifact_sha256": "b" * 64},
    {"claim": {"agent_id": "other-agent", "claimed_at": NOW.isoformat(), "lease_expires_at": (NOW + timedelta(minutes=1)).isoformat()}},
    {"attempt_count": 2},
])
def test_final_response_immutable_fields_are_verified(job_mutation: dict[str, object]) -> None:
    api = FakeApi(job())
    final_data = job().model_dump(mode="json") | {"status": PrintJobStatus.SENT_TO_PRINTER.value, "attempt_count": 1}
    final_data.update(job_mutation)
    api.report_response = AgentResultResponse.model_validate({"job": final_data, "outcome": "success", "bytes_sent": len(PAYLOAD)})
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.UNCERTAIN
    assert api.calls.count("report_result") == 1


def test_final_response_wrong_status_is_uncertain_without_resend() -> None:
    api = FakeApi(job())
    final_job = PrintJob.model_validate(job().model_dump() | {"status": PrintJobStatus.DELIVERY_UNKNOWN, "attempt_count": 1})
    api.report_response = AgentResultResponse(job=final_job, outcome="success", bytes_sent=len(PAYLOAD))
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.UNCERTAIN
    assert transport.calls == 1


def test_happy_path_uses_timezone_aware_utc_default_clock() -> None:
    live_now = datetime.now(timezone.utc)
    api = FakeApi(job(expires_at=live_now + timedelta(minutes=5), lease_expires_at=live_now + timedelta(minutes=1)))
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}).run_once()
    assert result.status is AgentRunStatus.COMPLETED


def test_missing_transport_is_rejected_before_begin_delivery() -> None:
    api = FakeApi(job())
    result = LocalPrintAgentRunner(config(), api, {}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next", "download_artifact"]


def test_begin_response_invariant_failure_is_uncertain_without_transport_call() -> None:
    api = FakeApi(job())
    api.begin_response = PrintJob.model_validate(job().model_dump() | {"job_id": "different-job", "status": PrintJobStatus.SENDING, "attempt_count": 1})
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert transport.calls == 0
    assert api.calls == ["claim_next", "download_artifact", "begin_delivery", "report_result"]
    assert api.reported == ("failure_before_send", 0)


def test_ambiguous_begin_failure_attempts_one_failure_before_send_recovery() -> None:
    api = FakeApi(job())
    api.begin_response = None
    def ambiguous_begin(job_id: str) -> PrintJob:
        api.calls.append("begin_delivery")
        raise TypedAgentApiError(0, "transport_error")
    api.begin_delivery = ambiguous_begin
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next", "download_artifact", "begin_delivery", "report_result"]
    assert api.reported == ("failure_before_send", 0)


def test_definitive_begin_rejection_does_not_attempt_recovery_callback() -> None:
    api = FakeApi(job())
    def rejected_begin(job_id: str) -> PrintJob:
        api.calls.append("begin_delivery")
        raise TypedAgentApiError(409, "conflict")
    api.begin_delivery = rejected_begin
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next", "download_artifact", "begin_delivery"]
    assert api.reported is None


class RaisingUnknownTransport:
    def send(self, payload: bytes, job: PrintJob, profile: LocalPrinterProfile) -> TransportResult:
        raise RuntimeError("internal transport message must not escape")


def test_generic_transport_exception_reports_unknown_without_retry() -> None:
    api = FakeApi(job())
    transport = RaisingUnknownTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.DELIVERY_UNKNOWN
    assert api.reported == ("delivery_unknown", 0)
    assert api.calls.count("begin_delivery") == 1


def test_transport_result_validation_reports_invalid_success_as_unknown() -> None:
    class InvalidTransport:
        def send(self, payload: bytes, job: PrintJob, profile: LocalPrinterProfile) -> TransportResult:
            return TransportResult(TransportOutcome.SUCCESS, 0)

    api = FakeApi(job())
    result = LocalPrintAgentRunner(config(), api, {"memory": InvalidTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.DELIVERY_UNKNOWN
    assert api.reported == ("delivery_unknown", 0)


def test_claim_api_error_returns_typed_unavailable_outcome() -> None:
    api = FakeApi(None)
    api.claim_error = TypedAgentApiError(429, "rate_limited")
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}).run_once()
    assert result.status is AgentRunStatus.API_UNAVAILABLE
    assert result.error_category == "rate_limited"


def test_injected_naive_clock_is_rejected() -> None:
    api = FakeApi(job())
    result = LocalPrintAgentRunner(config(), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW.replace(tzinfo=None)).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND


@pytest.mark.parametrize("artifact", [
    ArtifactPayload(payload=b"bad", sha256=CHECKSUM, byte_length=len(PAYLOAD), filename="label.ipl", media_type="application/octet-stream"),
    ArtifactPayload(payload=PAYLOAD, sha256="b" * 64, byte_length=len(PAYLOAD), filename="label.ipl", media_type="application/octet-stream"),
    ArtifactPayload(payload=PAYLOAD, sha256=CHECKSUM, byte_length=999, filename="label.ipl", media_type="application/octet-stream"),
    ArtifactPayload(payload=PAYLOAD, sha256=CHECKSUM, byte_length=len(PAYLOAD), filename="label.zpl", media_type="application/octet-stream"),
])
def test_invalid_artifact_never_begins_or_sends(artifact: ArtifactPayload) -> None:
    api = FakeApi(job(), artifact)
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next", "download_artifact"]
    assert transport.calls == 0


def test_oversized_artifact_is_rejected_before_begin() -> None:
    oversized = ArtifactPayload(
        payload=PAYLOAD,
        sha256=CHECKSUM,
        byte_length=len(PAYLOAD),
        filename="label.ipl",
        media_type="application/octet-stream",
    )
    api = FakeApi(job(), oversized)
    small_config = PrintAgentConfig(
        base_url="http://127.0.0.1:8000",
        bearer_token="unit-token",
        agent_id="agent-test",
        site_id="site-test",
        max_artifact_bytes=4,
        profiles=(profile(),),
    )
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(small_config, api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next", "download_artifact"]
    assert transport.calls == 0


@pytest.mark.parametrize("bad_job", [
    job(claim_agent="other-agent"),
    job(expires_at=NOW),
    job(lease_expires_at=NOW - timedelta(seconds=1)),
    PrintJob.model_validate(job().model_dump() | {"site_id": "other-site"}),
    PrintJob.model_validate(job().model_dump() | {"printer_id": "other-printer"}),
    PrintJob.model_validate(job().model_dump() | {"dpi": 300}),
])
def test_claim_ownership_expiry_and_profile_mismatch_stop_before_delivery(bad_job: PrintJob) -> None:
    api = FakeApi(bad_job)
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND
    assert api.calls == ["claim_next"]
    assert transport.calls == 0


def test_unconfirmed_dpi_is_rejected() -> None:
    api = FakeApi(job())
    result = LocalPrintAgentRunner(config(printer_profile=profile(dpi_confirmed=False)), api, {"memory": MemoryPrinterTransport()}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.FAILED_BEFORE_SEND


@pytest.mark.parametrize("outcome,expected", [
    (TransportOutcome.FAILURE_BEFORE_SEND, AgentRunStatus.FAILED_BEFORE_SEND),
    (TransportOutcome.DELIVERY_UNKNOWN, AgentRunStatus.DELIVERY_UNKNOWN),
])
def test_transport_outcomes_are_reported_without_retry(outcome: TransportOutcome, expected: AgentRunStatus) -> None:
    api = FakeApi(job())
    transport = MemoryPrinterTransport(outcome)
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is expected
    assert transport.calls == 1
    assert api.calls[-1] == "report_result"
    assert api.calls.count("begin_delivery") == 1


def test_result_callback_failure_is_uncertain_and_payload_is_not_sent_again() -> None:
    api = FakeApi(job())
    api.report_error = TypedAgentApiError(500, "server_error")
    transport = MemoryPrinterTransport()
    result = LocalPrintAgentRunner(config(), api, {"memory": transport}, clock=lambda: NOW).run_once()
    assert result.status is AgentRunStatus.UNCERTAIN
    assert transport.calls == 1
    assert len(transport.payloads) == 1
    assert api.calls == ["claim_next", "download_artifact", "begin_delivery", "report_result"]


def test_config_rejects_insecure_or_ambiguous_base_url_and_hides_token() -> None:
    with pytest.raises(ValueError):
        PrintAgentConfig("http://example.test", "secret-token", "agent", "site")
    with pytest.raises(ValueError):
        PrintAgentConfig("https://user:pass@example.test", "secret-token", "agent", "site")
    with pytest.raises(ValueError):
        PrintAgentConfig("https://example.test/path?token=secret-token", "secret-token", "agent", "site")
    assert "secret-token" not in repr(config())


@pytest.mark.parametrize("status_code", [401, 403, 404, 409, 410, 429, 500])
def test_http_statuses_become_typed_errors_without_response_body(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, request=request, content=b"token=secret; internal path")

    client = HttpPrintAgentApiClient(config(), httpx.Client(transport=httpx.MockTransport(handler), base_url=config().base_url, follow_redirects=False))
    with pytest.raises(TypedAgentApiError) as raised:
        client.claim_next()
    assert raised.value.status_code == status_code
    assert "secret" not in str(raised.value)


def test_http_redirect_is_rejected_and_not_followed() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(307, headers={"Location": "https://other.invalid"}, request=request)

    client = HttpPrintAgentApiClient(config(), httpx.Client(transport=httpx.MockTransport(handler), base_url=config().base_url, follow_redirects=False))
    with pytest.raises(TypedAgentApiError) as raised:
        client.claim_next()
    assert raised.value.category == "redirect_rejected"
    assert calls == 1


def test_http_artifact_is_typed_and_rejects_extra_job_fields() -> None:
    artifact_response = httpx.Response(
        200,
        headers={
            "Content-Type": "application/octet-stream",
            "X-Artifact-SHA256": CHECKSUM,
            "X-Artifact-Byte-Length": str(len(PAYLOAD)),
            "Content-Disposition": 'attachment; filename="label.ipl"',
        },
        content=PAYLOAD,
    )
    transport = httpx.MockTransport(lambda request: artifact_response)
    client = HttpPrintAgentApiClient(config(), httpx.Client(transport=transport, base_url=config().base_url, follow_redirects=False))
    artifact = client.download_artifact("job-test")
    assert artifact.payload == PAYLOAD
    assert artifact.byte_length == len(PAYLOAD)

    job_payload = job().model_dump(mode="json")
    job_payload["unexpected"] = True
    job_response = httpx.MockTransport(lambda request: httpx.Response(200, json=job_payload, request=request))
    strict_client = HttpPrintAgentApiClient(config(), httpx.Client(transport=job_response, base_url=config().base_url, follow_redirects=False))
    with pytest.raises(TypedAgentApiError):
        strict_client.claim_next()


class CountingStream(httpx.SyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.iterated = 0

    def __iter__(self):
        for chunk in self.chunks:
            self.iterated += 1
            yield chunk


def stream_client(stream: CountingStream, *, declared_length: str, max_bytes: int = 10 * 1024 * 1024,
                  disposition: str | None = 'attachment; filename="label.ipl"', checksum: str = CHECKSUM) -> HttpPrintAgentApiClient:
    settings = PrintAgentConfig(
        base_url="http://127.0.0.1:8000", bearer_token="unit-token", agent_id="agent-test", site_id="site-test",
        max_artifact_bytes=max_bytes, profiles=(profile(),),
    )
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={
            "Content-Type": "application/octet-stream", "X-Artifact-SHA256": checksum,
            "X-Artifact-Byte-Length": declared_length, **({"Content-Disposition": disposition} if disposition is not None else {}),
        }, stream=stream, request=request)
    return HttpPrintAgentApiClient(settings, httpx.Client(transport=httpx.MockTransport(handler), base_url=settings.base_url, follow_redirects=True))


def test_streaming_rejects_declared_oversize_without_consuming_body() -> None:
    stream = CountingStream([b"too-large"])
    client = stream_client(stream, declared_length="5", max_bytes=4)
    with pytest.raises(TypedAgentApiError) as raised:
        client.download_artifact("job-test")
    assert raised.value.category == "artifact_too_large"
    assert stream.iterated == 0


@pytest.mark.parametrize("declared_length", ["", "not-a-number", "0"])
def test_streaming_rejects_missing_or_invalid_length(declared_length: str) -> None:
    stream = CountingStream([PAYLOAD])
    client = stream_client(stream, declared_length=declared_length)
    with pytest.raises(TypedAgentApiError):
        client.download_artifact("job-test")
    assert stream.iterated == 0


def test_streaming_stops_when_body_exceeds_local_limit() -> None:
    stream = CountingStream([b"123", b"456", b"789"])
    client = stream_client(stream, declared_length="3", max_bytes=4)
    with pytest.raises(TypedAgentApiError) as raised:
        client.download_artifact("job-test")
    assert raised.value.category == "artifact_too_large"
    assert stream.iterated == 2


def test_streaming_normal_response_succeeds() -> None:
    stream = CountingStream([b"IPL", b" TEST"])
    client = stream_client(stream, declared_length=str(len(PAYLOAD)))
    artifact = client.download_artifact("job-test")
    assert artifact.payload == PAYLOAD
    assert stream.iterated == 2


def test_artifact_payload_repr_hides_bytes() -> None:
    artifact = ArtifactPayload(payload=b"secret-payload", sha256=CHECKSUM, byte_length=14, filename="label.ipl", media_type="application/octet-stream")
    assert "secret-payload" not in repr(artifact)


@pytest.mark.parametrize("disposition", [None, "attachment; filename=label.ipl", "attachment; filename=other.ipl", "attachment; filename=../label.ipl", 'attachment; filename="label.ipl"; filename="label.zpl"', 'attachment; filename="label.ipl"; x=unexpected'])
def test_artifact_content_disposition_is_strict_and_typed(disposition: str | None) -> None:
    client = stream_client(CountingStream([PAYLOAD]), declared_length=str(len(PAYLOAD)), disposition=disposition)
    with pytest.raises(TypedAgentApiError) as raised:
        client.download_artifact("job-test")
    assert raised.value.category == "invalid_artifact_metadata"
    assert "filename" not in str(raised.value)


def test_malformed_artifact_sha_is_typed_without_raw_validation_error() -> None:
    client = stream_client(CountingStream([PAYLOAD]), declared_length=str(len(PAYLOAD)), checksum="NOT-A-SHA")
    with pytest.raises(TypedAgentApiError) as raised:
        client.download_artifact("job-test")
    assert raised.value.category == "invalid_artifact_checksum"


def make_actual_api(tmp_path: Path, *, job_status: PrintJobStatus = PrintJobStatus.QUEUED) -> tuple[FastAPI, InMemoryPrintJobRepository, PrintAgentConfig]:
    live_now = datetime.now(timezone.utc)
    queued = job(status=job_status, expires_at=live_now + timedelta(minutes=5), lease_expires_at=live_now + timedelta(minutes=1))
    repository = InMemoryPrintJobRepository()
    storage = TemporaryArtifactStorage(tmp_path / "agent-artifacts")
    assert queued.artifact is not None
    storage.put(queued.artifact.payload_ref, queued.artifact.filename, PAYLOAD)
    repository.create_idempotent(queued, {"job": queued.job_id})
    settings = PrintAgentSettings(enabled=True, bearer_token="unit-token", agent_id="agent-test", site_id="site-test")
    dependencies = PrintAgentDependencies(
        settings=settings, repository=repository, artifact_storage=storage,
        profiles=(PrinterProfile(printer_id="printer-test", site_id="site-test", language=PrinterLanguage.IPL, emulation=Emulation.NATIVE, dpi=203, dpi_confirmed=True),),
        rate_limiter=InMemoryAgentRateLimiter(30, 60),
    )
    application = FastAPI()
    application.state.print_agent_dependencies = dependencies
    application.include_router(router, prefix="/api/v1")
    config_value = PrintAgentConfig(base_url="http://127.0.0.1:8000", bearer_token="unit-token", agent_id="agent-test", site_id="site-test", profiles=(profile(),))
    return application, repository, config_value


class _TestClientAgentSession:
    def __init__(self, application: FastAPI, config_value: PrintAgentConfig) -> None:
        self.server = TestClient(application)
        self.config_value = config_value
        self.client: HttpPrintAgentApiClient | None = None

    def __enter__(self) -> HttpPrintAgentApiClient:
        self.server.__enter__()
        def bridge(request: httpx.Request) -> httpx.Response:
            headers: dict[str, str] = {}
            if request.headers.get("authorization"):
                headers["Authorization"] = request.headers["authorization"]
            if request.headers.get("content-type"):
                headers["Content-Type"] = request.headers["content-type"]
            server_response = self.server.request(request.method, request.url.path, headers=headers, content=request.content)
            return httpx.Response(server_response.status_code, headers=dict(server_response.headers), content=server_response.content, request=request)
        self.client = HttpPrintAgentApiClient(self.config_value, httpx.Client(transport=httpx.MockTransport(bridge), base_url=self.config_value.base_url, follow_redirects=False))
        return self.client

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        if self.client is not None:
            self.client.close()
        self.server.__exit__(exc_type, exc_value, traceback)


def test_offline_integration_runner_uses_actual_print_agent_api(tmp_path: Path) -> None:
    application, repository, config_value = make_actual_api(tmp_path)
    memory_transport = MemoryPrinterTransport()
    with _TestClientAgentSession(application, config_value) as client:
        result = LocalPrintAgentRunner(config_value, client, {"memory": memory_transport}).run_once()
    assert result.status is AgentRunStatus.COMPLETED
    stored = repository.get("job-test")
    assert stored.status is PrintJobStatus.SENT_TO_PRINTER
    assert stored.attempt_count == 1
    assert memory_transport.payloads == [PAYLOAD]


def test_actual_api_rejects_wrong_or_missing_authorization_without_claim(tmp_path: Path) -> None:
    application, repository, config_value = make_actual_api(tmp_path)
    with TestClient(application) as server:
        wrong = server.post("/api/v1/print-agent/jobs/claim-next", headers={"Authorization": "Bearer wrong-token"})
        missing = server.post("/api/v1/print-agent/jobs/claim-next")
    assert wrong.status_code == 401
    assert missing.status_code == 401
    assert repository.get("job-test").status is PrintJobStatus.QUEUED
    assert config_value.bearer_token not in wrong.text
    assert config_value.bearer_token not in missing.text


def test_http_client_wrong_bearer_is_forwarded_through_bridge_and_cannot_claim(tmp_path: Path) -> None:
    application, repository, config_value = make_actual_api(tmp_path)
    wrong_config = PrintAgentConfig(
        base_url=config_value.base_url,
        bearer_token="wrong-token",
        agent_id=config_value.agent_id,
        site_id=config_value.site_id,
        profiles=config_value.profiles,
    )
    with _TestClientAgentSession(application, wrong_config) as client:
        result = LocalPrintAgentRunner(wrong_config, client, {"memory": MemoryPrinterTransport()}).run_once()
    assert result.status is AgentRunStatus.API_UNAVAILABLE
    assert repository.get("job-test").status is PrintJobStatus.QUEUED
    assert "wrong-token" not in repr(result)


def test_offline_integration_no_job_is_idle(tmp_path: Path) -> None:
    application, _, config_value = make_actual_api(tmp_path)
    # A fresh repository represents an agent restart with no queued state.
    application.state.print_agent_dependencies.repository = InMemoryPrintJobRepository()
    with _TestClientAgentSession(application, config_value) as client:
        result = LocalPrintAgentRunner(config_value, client, {"memory": MemoryPrinterTransport()}).run_once()
    assert result.status is AgentRunStatus.IDLE


def test_offline_integration_transport_exception_reports_delivery_unknown(tmp_path: Path) -> None:
    application, repository, config_value = make_actual_api(tmp_path)
    with _TestClientAgentSession(application, config_value) as client:
        result = LocalPrintAgentRunner(config_value, client, {"memory": RaisingUnknownTransport()}).run_once()
    assert result.status is AgentRunStatus.DELIVERY_UNKNOWN
    assert repository.get("job-test").status is PrintJobStatus.DELIVERY_UNKNOWN


def test_offline_integration_callback_failure_is_uncertain_without_resend(tmp_path: Path) -> None:
    application, _, config_value = make_actual_api(tmp_path)
    class CallbackFailureClient:
        def __init__(self, delegate: HttpPrintAgentApiClient) -> None:
            self.delegate = delegate
        def claim_next(self):
            return self.delegate.claim_next()
        def download_artifact(self, job_id: str):
            return self.delegate.download_artifact(job_id)
        def begin_delivery(self, job_id: str):
            return self.delegate.begin_delivery(job_id)
        def report_result(self, job_id: str, outcome: str, bytes_sent: int):
            self.delegate.report_result(job_id, outcome, bytes_sent)
            raise TypedAgentApiError(500, "callback_failure")

    with _TestClientAgentSession(application, config_value) as client:
        memory_transport = MemoryPrinterTransport()
        result = LocalPrintAgentRunner(config_value, CallbackFailureClient(client), {"memory": memory_transport}).run_once()
    assert result.status is AgentRunStatus.UNCERTAIN
    assert len(memory_transport.payloads) == 1


def test_package_has_no_real_printer_or_process_transport_symbols() -> None:
    package_dir = Path(__file__).parents[1] / "app" / "local_print_agent"
    source = "\n".join(path.read_text(encoding="utf-8") for path in package_dir.glob("*.py"))
    for forbidden in ("import socket", "win32print", "subprocess", "PowerShell", "port 9100", "DATA.DAX"):
        assert forbidden not in source
