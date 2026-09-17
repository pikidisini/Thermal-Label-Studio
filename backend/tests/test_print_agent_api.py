"""Offline TestClient coverage for the fail-closed Print Agent API."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import logging
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_print_agent import (
    InMemoryAgentRateLimiter,
    PrintAgentDependencies,
    PrintAgentSettings,
    router,
)
from app.main import app as main_app
from app.print_jobs import (
    ArtifactReference,
    Claim,
    Emulation,
    InMemoryPrintJobRepository,
    PrintJob,
    PrintJobStatus,
    PrinterLanguage,
    PrinterProfile,
    SourceMetadata,
    TemporaryArtifactStorage,
)


NOW = datetime.now(timezone.utc)
TOKEN = "unit-only-bearer-token"


def make_job(*, job_id: str = "job-001", site_id: str = "site-001", printer_id: str = "pm45-pilot",
             expires_at: datetime | None = None) -> PrintJob:
    payload = b"IPL"
    checksum = sha256(payload).hexdigest()
    artifact = ArtifactReference(
        payload_ref=f"payload-{job_id}",
        filename="label.ipl",
        media_type="application/octet-stream",
        byte_length=len(payload),
    )
    created_at = NOW - timedelta(minutes=10) if expires_at is not None and expires_at <= NOW else NOW
    return PrintJob(
        contract_version="1.0",
        job_id=job_id,
        request_id=f"request-{job_id}",
        created_at=created_at,
        expires_at=expires_at or NOW + timedelta(minutes=5),
        site_id=site_id,
        printer_id=printer_id,
        printer_language=PrinterLanguage.IPL,
        emulation=Emulation.NATIVE,
        dpi=203,
        copies=1,
        artifact=artifact,
        artifact_sha256=checksum,
        status=PrintJobStatus.QUEUED,
        attempt_count=0,
        last_error=None,
        claim=None,
        source=SourceMetadata(producer_type="sap", program="pilot-metadata"),
    )


def make_context(tmp_path: Path, *, agent_id: str = "agent-001", site_id: str = "site-001", enabled: bool = True,
                 rate_limit_requests: int = 30) -> tuple[FastAPI, InMemoryPrintJobRepository, TemporaryArtifactStorage]:
    repository = InMemoryPrintJobRepository()
    storage = TemporaryArtifactStorage(tmp_path / agent_id)
    settings = PrintAgentSettings(
        enabled=enabled,
        bearer_token=TOKEN,
        agent_id=agent_id,
        site_id=site_id,
        lease_seconds=60,
        rate_limit_requests=rate_limit_requests,
        rate_limit_window_seconds=60,
    )
    dependencies = PrintAgentDependencies(
        settings=settings,
        repository=repository,
        artifact_storage=storage,
        profiles=(
            PrinterProfile(
                printer_id="pm45-pilot",
                language=PrinterLanguage.IPL,
                emulation=Emulation.NATIVE,
                site_id=site_id,
                dpi=203,
                dpi_confirmed=True,
            ),
        ),
        rate_limiter=InMemoryAgentRateLimiter(rate_limit_requests, 60),
    )
    application = FastAPI()
    application.state.print_agent_dependencies = dependencies
    application.include_router(router, prefix="/api/v1")
    return application, repository, storage


def seed(repository: InMemoryPrintJobRepository, storage: TemporaryArtifactStorage, job: PrintJob) -> None:
    payload = b"IPL"
    assert job.artifact is not None
    storage.put(job.artifact.payload_ref, job.artifact.filename, payload)
    repository.create_idempotent(job, {"job": job.job_id})


def headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def test_feature_flag_disabled_returns_503_without_authentication(tmp_path: Path) -> None:
    application, _, _ = make_context(tmp_path, enabled=False)
    with TestClient(application) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next")
    assert response.status_code == 503


def test_main_defaults_to_disabled_when_environment_is_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PRINT_AGENT_API_ENABLED", raising=False)
    monkeypatch.delenv("PRINT_AGENT_BEARER_TOKEN", raising=False)
    monkeypatch.delenv("PRINT_AGENT_AGENT_ID", raising=False)
    monkeypatch.delenv("PRINT_AGENT_SITE_ID", raising=False)
    monkeypatch.delenv("PRINT_AGENT_PROFILE_CONFIG", raising=False)
    with TestClient(main_app) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next")
    assert response.status_code == 503


def test_main_bootstrap_reads_environment_and_restarts_with_empty_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRINT_AGENT_API_ENABLED", "true")
    monkeypatch.setenv("PRINT_AGENT_BEARER_TOKEN", TOKEN)
    monkeypatch.setenv("PRINT_AGENT_AGENT_ID", "agent-main")
    monkeypatch.setenv("PRINT_AGENT_SITE_ID", "site-001")
    profile_file = tmp_path / "profiles.json"
    profile_file.write_text(
        '[{"printer_id":"pm45-pilot","language":"ipl","emulation":"native","site_id":"site-001",'
        '"dpi":203,"dpi_confirmed":true}]', encoding="utf-8"
    )
    monkeypatch.setenv("PRINT_AGENT_PROFILE_CONFIG", str(profile_file))
    with TestClient(main_app) as client:
        assert client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).status_code == 204
        dependencies = main_app.state.print_agent_dependencies
        seed(dependencies.repository, dependencies.artifact_storage, make_job())
        assert client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).status_code == 200
    with TestClient(main_app) as client:
        assert client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).status_code == 204


def test_main_bootstrap_enabled_without_auth_or_profile_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRINT_AGENT_API_ENABLED", "true")
    monkeypatch.delenv("PRINT_AGENT_BEARER_TOKEN", raising=False)
    monkeypatch.delenv("PRINT_AGENT_AGENT_ID", raising=False)
    monkeypatch.delenv("PRINT_AGENT_SITE_ID", raising=False)
    monkeypatch.delenv("PRINT_AGENT_PROFILE_CONFIG", raising=False)
    with TestClient(main_app) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next")
    assert response.status_code == 503


def test_missing_invalid_token_and_token_not_echoed(tmp_path: Path) -> None:
    application, _, _ = make_context(tmp_path)
    with TestClient(application) as client:
        missing = client.post("/api/v1/print-agent/jobs/claim-next")
        invalid = client.post(
            "/api/v1/print-agent/jobs/claim-next",
            headers={"Authorization": "Bearer definitely-wrong"},
        )
    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert TOKEN not in missing.text + invalid.text


def test_claim_next_is_site_scoped_and_expired_jobs_are_not_claimed(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job(site_id="other-site"))
    seed(repository, storage, make_job(job_id="expired", expires_at=NOW - timedelta(seconds=1)))
    with TestClient(application) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert response.status_code == 204
    assert repository.get("expired").status is PrintJobStatus.EXPIRED


def test_claim_next_skips_jobs_without_matching_printer_profile(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job(job_id="a-wrong", printer_id="other-printer"))
    seed(repository, storage, make_job(job_id="z-right"))
    with TestClient(application) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert response.status_code == 200
    assert response.json()["job_id"] == "z-right"
    assert repository.get("a-wrong").claim is None


def test_claim_next_recovers_expired_claimed_job(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    job = make_job(job_id="recover-api")
    seed(repository, storage, job)
    repository.claim(job.job_id, "agent-old", NOW - timedelta(seconds=3), timedelta(seconds=1))
    with TestClient(application) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert response.status_code == 200
    assert response.json()["job_id"] == job.job_id
    assert response.json()["claim"]["agent_id"] == "agent-001"


def test_claim_next_expires_expired_claim_and_never_returns_sending_unknown(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    expired = make_job(job_id="expired-api", expires_at=NOW - timedelta(seconds=1))
    seed(repository, storage, expired)
    repository.claim(expired.job_id, "agent-old", NOW - timedelta(seconds=3), timedelta(seconds=1))
    sending_data = make_job(job_id="sending-api").model_dump()
    sending_data.update({
        "status": PrintJobStatus.SENDING,
        "claim": Claim(agent_id="agent-old", claimed_at=NOW - timedelta(seconds=3), lease_expires_at=NOW - timedelta(seconds=2)),
    })
    sending = PrintJob.model_validate(sending_data)
    seed(repository, storage, sending)
    with TestClient(application) as client:
        response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert response.status_code == 204
    assert repository.get(expired.job_id).status is PrintJobStatus.EXPIRED
    assert repository.get(sending.job_id).status is PrintJobStatus.DELIVERY_UNKNOWN
    assert repository.get(sending.job_id).claim is not None


def test_late_result_after_reconciliation_is_conflict_and_not_requeued(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    sending_data = make_job(job_id="late-api").model_dump()
    sending_data.update({
        "status": PrintJobStatus.SENDING,
        "claim": Claim(agent_id="agent-001", claimed_at=NOW, lease_expires_at=NOW + timedelta(seconds=1)),
    })
    job = PrintJob.model_validate(sending_data)
    seed(repository, storage, job)
    repository.reconcile_job(job.job_id, NOW + timedelta(seconds=2))
    with TestClient(application) as client:
        result = client.post(
            f"/api/v1/print-agent/jobs/{job.job_id}/result",
            headers=headers(),
            json={"outcome": "success", "bytes_sent": 3},
        )
        claim = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert result.status_code == 409
    assert claim.status_code == 204
    assert repository.get(job.job_id).status is PrintJobStatus.DELIVERY_UNKNOWN


def test_claim_next_is_atomic_for_two_agents(tmp_path: Path) -> None:
    _, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    app_a, _, _ = make_context(tmp_path, agent_id="agent-a")
    app_a.state.print_agent_dependencies.repository = repository
    app_a.state.print_agent_dependencies.artifact_storage = storage
    app_b, _, _ = make_context(tmp_path, agent_id="agent-b")
    app_b.state.print_agent_dependencies.repository = repository
    app_b.state.print_agent_dependencies.artifact_storage = storage

    def claim(application: FastAPI) -> int:
        with TestClient(application) as client:
            return client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(claim, [app_a, app_b]))
    assert sorted(statuses) == [200, 204]


def test_artifact_requires_active_claim_owner_and_returns_integrity_headers(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
        artifact = client.get(f"/api/v1/print-agent/jobs/{claimed.json()['job_id']}/artifact", headers=headers())
    assert artifact.status_code == 200
    assert artifact.headers["content-type"] == "application/octet-stream"
    assert artifact.headers["x-artifact-byte-length"] == "3"
    assert artifact.headers["x-artifact-sha256"] == sha256(b"IPL").hexdigest()
    assert artifact.headers["cache-control"] == "no-store"
    assert artifact.headers["x-content-type-options"] == "nosniff"
    assert artifact.headers["content-disposition"] == 'attachment; filename="label.ipl"'

    other_app, _, _ = make_context(tmp_path, agent_id="agent-other")
    other_app.state.print_agent_dependencies.repository = repository
    other_app.state.print_agent_dependencies.artifact_storage = storage
    with TestClient(other_app) as client:
        denied = client.get(f"/api/v1/print-agent/jobs/{claimed.json()['job_id']}/artifact", headers=headers())
    assert denied.status_code == 404


def test_rate_limit_also_protects_artifact_download(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path, rate_limit_requests=1)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
        limited = client.get(
            f"/api/v1/print-agent/jobs/{claimed.json()['job_id']}/artifact",
            headers=headers(),
        )
    assert claimed.status_code == 200
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"


def test_happy_path_and_result_callbacks_are_idempotent(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).json()
        downloaded = client.get(f"/api/v1/print-agent/jobs/{claimed['job_id']}/artifact", headers=headers())
        assert sha256(downloaded.content).hexdigest() == downloaded.headers["x-artifact-sha256"]
        begun = client.post(f"/api/v1/print-agent/jobs/{claimed['job_id']}/begin-delivery", headers=headers())
        result = client.post(
            f"/api/v1/print-agent/jobs/{claimed['job_id']}/result",
            headers=headers(),
            json={"outcome": "success", "bytes_sent": 3},
        )
        repeated = client.post(
            f"/api/v1/print-agent/jobs/{claimed['job_id']}/result",
            headers=headers(),
            json={"outcome": "success", "bytes_sent": 3},
        )
        conflict = client.post(
            f"/api/v1/print-agent/jobs/{claimed['job_id']}/result",
            headers=headers(),
            json={"outcome": "delivery_unknown", "bytes_sent": 3},
        )
    assert begun.status_code == 200
    assert result.status_code == repeated.status_code == 200
    assert result.json()["job"]["status"] == "sent_to_printer"
    assert conflict.status_code == 409
    assert repository.get("job-001").attempt_count == 1


def test_concurrent_begin_delivery_has_one_winner(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).json()
    def begin() -> int:
        with TestClient(application) as client:
            return client.post(f"/api/v1/print-agent/jobs/{claimed['job_id']}/begin-delivery", headers=headers()).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: begin(), range(2)))
    assert sorted(statuses) == [200, 409]
    assert repository.get(claimed["job_id"]).attempt_count == 1


def test_result_validation_unknown_delivery_and_rate_limit(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path, rate_limit_requests=10)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).json()
        begun = client.post(f"/api/v1/print-agent/jobs/{claimed['job_id']}/begin-delivery", headers=headers())
        invalid = client.post(
            f"/api/v1/print-agent/jobs/{claimed['job_id']}/result",
            headers=headers(),
            json={"outcome": "success", "bytes_sent": 2},
        )
        unknown = client.post(
            f"/api/v1/print-agent/jobs/{claimed['job_id']}/result",
            headers=headers(),
            json={"outcome": "delivery_unknown", "bytes_sent": 2},
        )
        retry = client.post(f"/api/v1/print-agent/jobs/{claimed['job_id']}/begin-delivery", headers=headers())
    assert begun.status_code == 200
    assert invalid.status_code == 422
    assert unknown.status_code == 200
    assert retry.status_code == 409


def test_mutating_endpoint_rate_limit_is_per_agent(tmp_path: Path) -> None:
    application, _, _ = make_context(tmp_path, rate_limit_requests=1)
    with TestClient(application) as client:
        first = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
        second = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert first.status_code == 204
    assert second.status_code == 429


def test_rate_limit_is_per_authenticated_principal(tmp_path: Path) -> None:
    app_a, _, _ = make_context(tmp_path, agent_id="agent-a", rate_limit_requests=1)
    app_b, _, _ = make_context(tmp_path, agent_id="agent-b", rate_limit_requests=1)
    shared_limiter = InMemoryAgentRateLimiter(1, 60)
    app_a.state.print_agent_dependencies.rate_limiter = shared_limiter
    app_b.state.print_agent_dependencies.rate_limiter = shared_limiter
    with TestClient(app_a) as client_a, TestClient(app_b) as client_b:
        first = client_a.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
        second = client_b.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert first.status_code == second.status_code == 204


def test_result_body_rejects_arbitrary_host_or_path(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        response = client.post(
            "/api/v1/print-agent/jobs/job-001/result",
            headers=headers(),
            json={"outcome": "success", "bytes_sent": 3, "host": "127.0.0.1", "path": "x"},
        )
    assert response.status_code == 422


def test_result_callback_checks_agent_ownership_before_idempotency(tmp_path: Path) -> None:
    application, repository, storage = make_context(tmp_path)
    seed(repository, storage, make_job())
    with TestClient(application) as client:
        claimed = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers()).json()
        client.post(f"/api/v1/print-agent/jobs/{claimed['job_id']}/begin-delivery", headers=headers())

    other, _, _ = make_context(tmp_path, agent_id="agent-other")
    other.state.print_agent_dependencies.repository = repository
    other.state.print_agent_dependencies.artifact_storage = storage
    result_path = f"/api/v1/print-agent/jobs/{claimed['job_id']}/result"
    with TestClient(other) as client:
        first = client.post(result_path, headers=headers(), json={"outcome": "success", "bytes_sent": 3})
        repeated = client.post(result_path, headers=headers(), json={"outcome": "success", "bytes_sent": 3})
    assert first.status_code == repeated.status_code == 404


def test_settings_and_dependencies_repr_and_logs_do_not_contain_token(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    application, _, _ = make_context(tmp_path)
    dependencies = application.state.print_agent_dependencies
    assert TOKEN not in repr(dependencies.settings)
    assert TOKEN not in repr(dependencies)
    with TestClient(application) as client:
        client.post("/api/v1/print-agent/jobs/claim-next", headers={"Authorization": "Bearer wrong"})
    assert TOKEN not in caplog.text


def test_unexpected_repository_failure_returns_generic_500(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    application, repository, _ = make_context(tmp_path)

    def unexpected(*args: object, **kwargs: object) -> None:
        raise RuntimeError("internal test detail")

    setattr(repository, "claim_next", unexpected)
    with caplog.at_level(logging.ERROR, logger="app.api.routes_print_agent"):
        with TestClient(application, raise_server_exceptions=False) as client:
            response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
    assert response.status_code == 500
    assert response.json() == {"detail": "internal server error"}
    assert "internal test detail" not in response.text
    events = [record for record in caplog.records if record.getMessage() == "print_agent_unexpected_error"]
    assert len(events) == 1
    event = events[0]
    assert event.request_method == "POST"
    assert event.route_template.endswith("/print-agent/jobs/claim-next")
    assert event.exception_class == "RuntimeError"
    assert "internal test detail" not in caplog.text
    assert TOKEN not in caplog.text


def test_print_agent_error_handler_is_route_scoped(tmp_path: Path) -> None:
    application, repository, _ = make_context(tmp_path)

    @application.get("/outside")
    def outside_failure() -> None:
        raise RuntimeError("outside internal detail")

    def unexpected(*args: object, **kwargs: object) -> None:
        raise RuntimeError("agent internal detail")

    setattr(repository, "claim_next", unexpected)
    with TestClient(application, raise_server_exceptions=False) as client:
        agent_response = client.post("/api/v1/print-agent/jobs/claim-next", headers=headers())
        outside_response = client.get("/outside")
    assert agent_response.status_code == 500
    assert agent_response.json() == {"detail": "internal server error"}
    assert outside_response.status_code == 500
    assert outside_response.text == "Internal Server Error"


def test_main_has_no_global_exception_catch_all_for_print_agent() -> None:
    assert Exception not in main_app.exception_handlers
