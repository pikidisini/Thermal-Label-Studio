"""HTTP client for Print Agent API using a trusted base URL only."""

from __future__ import annotations

from typing import Protocol
import re

import httpx
from pydantic import ValidationError

from ..print_jobs.models import PrintJob
from .config import PrintAgentConfig
from .models import AgentResultResponse, ArtifactPayload, TypedAgentApiError


class AgentApiClient(Protocol):
    def claim_next(self) -> PrintJob | None: ...

    def download_artifact(self, job_id: str) -> ArtifactPayload: ...

    def begin_delivery(self, job_id: str) -> PrintJob: ...

    def report_result(self, job_id: str, outcome: str, bytes_sent: int) -> AgentResultResponse: ...


class HttpPrintAgentApiClient:
    """Small no-retry client; every endpoint is relative to trusted base_url."""

    def __init__(self, config: PrintAgentConfig, client: httpx.Client | None = None) -> None:
        self.config = config
        self._claim_tokens: dict[str, int] = {}
        self._client = client or httpx.Client(
            base_url=config.base_url,
            headers={"Authorization": f"Bearer {config.bearer_token}"},
            timeout=httpx.Timeout(
                config.request_timeout_seconds,
                connect=config.request_timeout_seconds,
                read=config.request_timeout_seconds,
                write=config.request_timeout_seconds,
                pool=config.request_timeout_seconds,
            ),
            follow_redirects=False,
        )

    def claim_next(self) -> PrintJob | None:
        response = self._request("POST", "/api/v1/print-agent/jobs/claim-next")
        if response.status_code == 204:
            return None
        job = self._parse_job(response)
        if job.claim is None:
            raise TypedAgentApiError(response.status_code, "invalid_job_response")
        self._claim_tokens[job.job_id] = job.claim.fencing_token
        return job

    def download_artifact(self, job_id: str) -> ArtifactPayload:
        try:
            with self._client.stream(
                "GET",
                f"/api/v1/print-agent/jobs/{job_id}/artifact",
                headers=self._claim_headers(job_id),
                follow_redirects=False,
            ) as response:
                self._check_response(response)
                if response.headers.get("content-type", "").split(";", 1)[0].lower() != "application/octet-stream":
                    raise TypedAgentApiError(response.status_code, "invalid_artifact_media_type")
                declared_length = self._parse_positive_header(response, "x-artifact-byte-length")
                if declared_length > self.config.max_artifact_bytes:
                    raise TypedAgentApiError(response.status_code, "artifact_too_large")
                declared_http_length = response.headers.get("content-length")
                if declared_http_length is not None and declared_http_length != str(declared_length):
                    raise TypedAgentApiError(response.status_code, "artifact_length_mismatch")
                checksum = response.headers.get("x-artifact-sha256", "")
                if len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum):
                    raise TypedAgentApiError(response.status_code, "invalid_artifact_checksum")
                filename = self._parse_content_disposition(
                    response.headers.get("content-disposition"), response.status_code
                )
                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > self.config.max_artifact_bytes:
                        raise TypedAgentApiError(response.status_code, "artifact_too_large")
                    chunks.append(chunk)
                payload = b"".join(chunks)
                if len(payload) != declared_length:
                    raise TypedAgentApiError(response.status_code, "artifact_length_mismatch")
                try:
                    return ArtifactPayload(payload=payload, sha256=checksum, byte_length=declared_length, filename=filename, media_type="application/octet-stream")
                except ValidationError as exc:
                    raise TypedAgentApiError(response.status_code, "invalid_artifact_metadata") from exc
        except TypedAgentApiError:
            raise
        except httpx.HTTPError as exc:
            raise TypedAgentApiError(0, "transport_error") from exc
        except Exception as exc:
            raise TypedAgentApiError(0, "transport_error") from exc

    def begin_delivery(self, job_id: str) -> PrintJob:
        return self._parse_job(
            self._request(
                "POST",
                f"/api/v1/print-agent/jobs/{job_id}/begin-delivery",
                headers=self._claim_headers(job_id),
            )
        )

    def report_result(self, job_id: str, outcome: str, bytes_sent: int) -> AgentResultResponse:
        response = self._request(
            "POST",
            f"/api/v1/print-agent/jobs/{job_id}/result",
            json={"outcome": outcome, "bytes_sent": bytes_sent},
            headers=self._claim_headers(job_id),
        )
        try:
            return AgentResultResponse.model_validate(response.json())
        except (ValueError, KeyError, TypeError):
            raise TypedAgentApiError(response.status_code, "invalid_result_response") from None

    def close(self) -> None:
        self._client.close()

    def _request(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        try:
            headers = kwargs.pop("headers", self._auth_headers())
            response = self._client.request(method, path, headers=headers, follow_redirects=False, **kwargs)
        except httpx.HTTPError as exc:
            raise TypedAgentApiError(0, "transport_error") from exc
        except Exception as exc:
            raise TypedAgentApiError(0, "transport_error") from exc
        self._check_response(response)
        return response

    @staticmethod
    def _check_response(response: httpx.Response) -> None:
        if 300 <= response.status_code < 400:
            raise TypedAgentApiError(response.status_code, "redirect_rejected")
        if response.status_code >= 400:
            raise TypedAgentApiError(response.status_code, HttpPrintAgentApiClient._status_category(response.status_code))

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.config.bearer_token}"}

    def _claim_headers(self, job_id: str) -> dict[str, str]:
        token = self._claim_tokens.get(job_id)
        if token is None:
            return self._auth_headers()
        return self._auth_headers() | {"X-Print-Claim-Token": str(token)}

    @staticmethod
    def _parse_job(response: httpx.Response) -> PrintJob:
        try:
            return PrintJob.model_validate(response.json())
        except (ValueError, TypeError):
            raise TypedAgentApiError(response.status_code, "invalid_job_response") from None

    @staticmethod
    def _parse_positive_header(response: httpx.Response, name: str) -> int:
        try:
            value = int(response.headers[name])
        except (KeyError, ValueError):
            raise TypedAgentApiError(response.status_code, "invalid_artifact_length") from None
        if value <= 0:
            raise TypedAgentApiError(response.status_code, "invalid_artifact_length")
        return value

    @staticmethod
    def _parse_content_disposition(value: str | None, status_code: int) -> str:
        if value is None:
            raise TypedAgentApiError(status_code, "invalid_artifact_metadata")
        match = re.fullmatch(r'attachment; filename="(label\.ipl|label\.zpl)"', value)
        if match is None:
            raise TypedAgentApiError(status_code, "invalid_artifact_metadata")
        return match.group(1)

    @staticmethod
    def _status_category(status_code: int) -> str:
        return {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            409: "conflict",
            410: "expired",
            422: "validation",
            429: "rate_limited",
        }.get(status_code, "server_error" if status_code >= 500 else "request_error")
