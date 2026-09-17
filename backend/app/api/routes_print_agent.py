"""Fail-closed HTTP adapter for the offline/pilot Local Print Agent API."""

from __future__ import annotations

import hmac
import json
import logging
import os
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from threading import RLock
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from ..print_jobs.artifact_storage import ArtifactConflictError, ArtifactIntegrityError, TemporaryArtifactStorage
from ..print_jobs.models import Emulation, PrintJob, PrintJobStatus, PrinterLanguage, PrinterProfile
from ..print_jobs.repository import (
    ClaimConflictError,
    DeliveryConflictError,
    InMemoryPrintJobRepository,
    JobExpiredError,
    PrintJobNotFoundError,
    PrintJobRepository,
)
from ..print_jobs.service import (
    DpiMismatchError,
    DpiNotConfirmedError,
    EmulationMismatchError,
    LanguageMismatchError,
    PrintJobService,
    PrinterProfileNotFoundError,
    SiteMismatchError,
)
from ..print_jobs.transport import MockTransportOutcome

logger = logging.getLogger(__name__)


class AgentPrincipal(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    agent_id: str
    site_id: str


@dataclass(frozen=True)
class PrintAgentSettings:
    enabled: bool = False
    agent_id: str | None = None
    site_id: str | None = None
    lease_seconds: int = 60
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 60
    bearer_token: str | None = field(default=None, repr=False)

    @classmethod
    def from_environment(cls) -> "PrintAgentSettings":
        def read_int(name: str, default: int) -> int:
            raw_value = os.getenv(name)
            if raw_value is None:
                return default
            try:
                return int(raw_value)
            except ValueError:
                return 0

        enabled = os.getenv("PRINT_AGENT_API_ENABLED", "false").strip().lower() == "true"
        return cls(
            enabled=enabled,
            agent_id=os.getenv("PRINT_AGENT_AGENT_ID"),
            site_id=os.getenv("PRINT_AGENT_SITE_ID"),
            bearer_token=os.getenv("PRINT_AGENT_BEARER_TOKEN"),
            lease_seconds=read_int("PRINT_AGENT_LEASE_SECONDS", 60),
            rate_limit_requests=read_int("PRINT_AGENT_RATE_LIMIT_REQUESTS", 30),
            rate_limit_window_seconds=read_int("PRINT_AGENT_RATE_LIMIT_WINDOW_SECONDS", 60),
        )


@dataclass
class PrintAgentDependencies:
    settings: PrintAgentSettings
    repository: PrintJobRepository
    artifact_storage: TemporaryArtifactStorage
    profiles: tuple[PrinterProfile, ...]
    rate_limiter: "InMemoryAgentRateLimiter"
    profile_registry_ready: bool = True
    temporary_directory: tempfile.TemporaryDirectory[str] | None = field(default=None, repr=False)


class InMemoryAgentRateLimiter:
    """Small single-process limiter; it is intentionally not a production limiter."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate limiter settings must be positive")
        self._limit = limit
        self._window_seconds = window_seconds
        self._events: dict[str, list[float]] = {}
        self._lock = RLock()

    def allow(self, agent_id: str) -> bool:
        now = time.monotonic()
        with self._lock:
            events = [event for event in self._events.get(agent_id, []) if now - event < self._window_seconds]
            if len(events) >= self._limit:
                self._events[agent_id] = events
                return False
            events.append(now)
            self._events[agent_id] = events
            return True


class AgentResultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["success", "failure_before_send", "delivery_unknown"]
    bytes_sent: int = Field(ge=0)


class AgentResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job: PrintJob
    outcome: Literal["success", "failure_before_send", "delivery_unknown"]
    bytes_sent: int


def _disabled(message: str = "print-agent API is disabled") -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


def require_dependencies(request: Request) -> PrintAgentDependencies:
    dependencies = getattr(request.app.state, "print_agent_dependencies", None)
    if not isinstance(dependencies, PrintAgentDependencies):
        raise _disabled()
    if not dependencies.settings.enabled:
        raise _disabled()
    settings = dependencies.settings
    if not settings.bearer_token or not settings.agent_id or not settings.site_id:
        raise _disabled("print-agent authentication is not configured")
    if not dependencies.profile_registry_ready or not dependencies.profiles:
        raise _disabled("print-agent profile registry is not configured")
    if settings.lease_seconds < 1 or settings.rate_limit_requests < 1 or settings.rate_limit_window_seconds < 1:
        raise _disabled("print-agent configuration is invalid")
    return dependencies


def authenticate(
    request: Request,
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
) -> AgentPrincipal:
    authorization = request.headers.get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    configured = dependencies.settings.bearer_token or ""
    if scheme.lower() != "bearer" or not separator or not token or not hmac.compare_digest(token, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required")
    return AgentPrincipal(agent_id=dependencies.settings.agent_id or "", site_id=dependencies.settings.site_id or "")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _rate_limit(dependencies: PrintAgentDependencies, principal: AgentPrincipal) -> None:
    if not dependencies.rate_limiter.allow(principal.agent_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded",
            headers={"Retry-After": str(dependencies.settings.rate_limit_window_seconds)},
        )


def _get_owned_job(dependencies: PrintAgentDependencies, principal: AgentPrincipal, job_id: str) -> PrintJob:
    try:
        job = dependencies.repository.get(job_id)
    except PrintJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found") from exc
    if job.site_id != principal.site_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return job


def _map_repository_error(
    exc: PrintJobNotFoundError | JobExpiredError | ClaimConflictError | DeliveryConflictError,
) -> HTTPException:
    if isinstance(exc, JobExpiredError):
        return HTTPException(status_code=status.HTTP_410_GONE, detail="job expired")
    if isinstance(exc, (ClaimConflictError, DeliveryConflictError)):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="job state conflict")
    if isinstance(exc, PrintJobNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="job operation failed")


def _validate_profile(dependencies: PrintAgentDependencies, job: PrintJob) -> None:
    if not dependencies.profile_registry_ready or not dependencies.profiles:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="printer profile is not configured")
    try:
        PrintJobService(list(dependencies.profiles)).get_printable_profile(job)
    except (DpiMismatchError, DpiNotConfirmedError, EmulationMismatchError, LanguageMismatchError,
            PrinterProfileNotFoundError, SiteMismatchError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="printer profile does not match job") from exc


def _profile_eligible(dependencies: PrintAgentDependencies, job: PrintJob) -> bool:
    if not dependencies.profile_registry_ready:
        return False
    for profile in dependencies.profiles:
        allowed_sites = set(profile.allowed_site_ids)
        if profile.site_id is not None:
            allowed_sites.add(profile.site_id)
        if (
            job.site_id in allowed_sites
            and profile.printer_id == job.printer_id
            and profile.language is job.printer_language
            and profile.emulation is job.emulation
            and profile.dpi_confirmed
            and profile.dpi is not None
            and Decimal(str(profile.dpi)) == Decimal(str(job.dpi))
        ):
            return True
    return False


def build_print_agent_dependencies(
    *,
    settings: PrintAgentSettings | None = None,
    repository: PrintJobRepository | None = None,
    artifact_storage: TemporaryArtifactStorage | None = None,
    profiles: tuple[PrinterProfile, ...] | None = None,
) -> PrintAgentDependencies:
    """Build isolated pilot dependencies; local profile config is optional but fail-closed."""
    resolved_settings = settings or PrintAgentSettings.from_environment()
    temporary_directory: tempfile.TemporaryDirectory[str] | None = None
    resolved_storage = artifact_storage
    if resolved_storage is None:
        temporary_directory = tempfile.TemporaryDirectory(prefix="thermal-label-agent-")
        resolved_storage = TemporaryArtifactStorage(Path(temporary_directory.name))

    profile_registry_ready = profiles is not None
    resolved_profiles = profiles or ()
    if profiles is None:
        configured_path = os.getenv("PRINT_AGENT_PROFILE_CONFIG")
        if configured_path:
            try:
                raw = json.loads(Path(configured_path).read_text(encoding="utf-8"))
                if not isinstance(raw, list):
                    raise ValueError("profile config must be a list")
                resolved_profiles = tuple(PrinterProfile.model_validate(item) for item in raw)
                profile_registry_ready = bool(resolved_profiles)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                profile_registry_ready = False
                resolved_profiles = ()
        else:
            profile_registry_ready = False

    return PrintAgentDependencies(
        settings=resolved_settings,
        repository=repository or InMemoryPrintJobRepository(),
        artifact_storage=resolved_storage,
        profiles=resolved_profiles,
        rate_limiter=InMemoryAgentRateLimiter(
            max(resolved_settings.rate_limit_requests, 1),
            max(resolved_settings.rate_limit_window_seconds, 1),
        ),
        profile_registry_ready=profile_registry_ready,
        temporary_directory=temporary_directory,
    )


def initialize_print_agent_state(application: FastAPI) -> PrintAgentDependencies:
    dependencies = build_print_agent_dependencies()
    application.state.print_agent_dependencies = dependencies
    return dependencies


def cleanup_print_agent_state(application: FastAPI) -> None:
    dependencies = getattr(application.state, "print_agent_dependencies", None)
    if isinstance(dependencies, PrintAgentDependencies) and dependencies.temporary_directory is not None:
        dependencies.temporary_directory.cleanup()
        dependencies.temporary_directory = None
    if hasattr(application.state, "print_agent_dependencies"):
        del application.state.print_agent_dependencies


class PrintAgentRoute(APIRoute):
    """Convert unexpected failures only for Print Agent routes."""

    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def route_handler(request: Request) -> Response:
            try:
                return await original_handler(request)
            except (HTTPException, RequestValidationError):
                raise
            except Exception as exc:
                logger.error(
                    "print_agent_unexpected_error",
                    extra={
                        "event": "print_agent_unexpected_error",
                        "request_method": request.method,
                        "route_template": self.path,
                        "exception_class": type(exc).__name__,
                    },
                )
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={"detail": "internal server error"},
                )

        return route_handler


router = APIRouter(prefix="/print-agent", tags=["Print Agent"], route_class=PrintAgentRoute)


@router.post("/jobs/claim-next", response_model=PrintJob, status_code=status.HTTP_200_OK)
def claim_next(
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
    principal: AgentPrincipal = Depends(authenticate),
) -> PrintJob | Response:
    _rate_limit(dependencies, principal)
    try:
        site_jobs = dependencies.repository.list_site_jobs(principal.site_id)
        eligible_job_ids = frozenset(
            job.job_id for job in site_jobs if _profile_eligible(dependencies, job)
        )
        job = dependencies.repository.claim_next(
            principal.site_id,
            principal.agent_id,
            _utc_now(),
            timedelta(seconds=dependencies.settings.lease_seconds),
            eligible_job_ids=eligible_job_ids,
        )
    except (PrintJobNotFoundError, JobExpiredError, ClaimConflictError, DeliveryConflictError) as exc:
        raise _map_repository_error(exc) from exc
    if job is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return job


@router.get("/jobs/{job_id}", response_model=PrintJob)
def get_job(
    job_id: str,
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
    principal: AgentPrincipal = Depends(authenticate),
) -> PrintJob:
    return _get_owned_job(dependencies, principal, job_id)


@router.get("/jobs/{job_id}/artifact")
def download_artifact(
    job_id: str,
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
    principal: AgentPrincipal = Depends(authenticate),
) -> Response:
    _rate_limit(dependencies, principal)
    job = _get_owned_job(dependencies, principal, job_id)
    if job.status not in {PrintJobStatus.CLAIMED, PrintJobStatus.SENDING}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="artifact is not available")
    if job.claim is None or job.claim.agent_id != principal.agent_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="artifact not found")
    now = _utc_now()
    if now >= job.expires_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="job expired")
    if now >= job.claim.lease_expires_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="claim lease expired")
    if job.artifact is None or job.artifact_sha256 is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="artifact integrity data unavailable")
    try:
        payload = dependencies.artifact_storage.read_verified(job.artifact, job.artifact_sha256)
    except (ArtifactConflictError, ArtifactIntegrityError, FileNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="artifact integrity check failed") from exc
    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={
            "X-Artifact-SHA256": job.artifact_sha256,
            "X-Artifact-Byte-Length": str(len(payload)),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="{job.artifact.filename}"',
        },
    )


@router.post("/jobs/{job_id}/begin-delivery", response_model=PrintJob)
def begin_delivery(
    job_id: str,
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
    principal: AgentPrincipal = Depends(authenticate),
) -> PrintJob:
    _rate_limit(dependencies, principal)
    job = _get_owned_job(dependencies, principal, job_id)
    _validate_profile(dependencies, job)
    try:
        return dependencies.repository.begin_delivery(job_id, principal.agent_id, _utc_now())
    except (PrintJobNotFoundError, JobExpiredError, ClaimConflictError, DeliveryConflictError) as exc:
        raise _map_repository_error(exc) from exc


@router.post("/jobs/{job_id}/result", response_model=AgentResultResponse)
def report_result(
    job_id: str,
    request: AgentResultRequest,
    dependencies: PrintAgentDependencies = Depends(require_dependencies),
    principal: AgentPrincipal = Depends(authenticate),
) -> AgentResultResponse:
    _rate_limit(dependencies, principal)
    job = _get_owned_job(dependencies, principal, job_id)
    if job.claim is None or job.claim.agent_id != principal.agent_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    if job.artifact is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="job artifact unavailable")
    if request.outcome == "success" and request.bytes_sent != job.artifact.byte_length:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="bytes_sent does not match artifact")
    if request.outcome == "failure_before_send" and request.bytes_sent != 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="failure_before_send requires zero bytes")
    if request.bytes_sent > job.artifact.byte_length:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="bytes_sent exceeds artifact length")
    outcome = MockTransportOutcome(request.outcome)
    try:
        updated = dependencies.repository.report_result(job_id, principal.agent_id, outcome, request.bytes_sent)
    except (PrintJobNotFoundError, JobExpiredError, ClaimConflictError, DeliveryConflictError) as exc:
        raise _map_repository_error(exc) from exc
    return AgentResultResponse(job=updated, outcome=request.outcome, bytes_sent=request.bytes_sent)
