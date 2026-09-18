"""Typed models and errors at the Local Print Agent boundary."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..print_jobs.models import PrintJob


class AgentRunStatus(StrEnum):
    IDLE = "idle"
    COMPLETED = "completed"
    FAILED_BEFORE_SEND = "failed_before_send"
    DELIVERY_UNKNOWN = "delivery_unknown"
    UNCERTAIN = "uncertain"
    API_UNAVAILABLE = "api_unavailable"


class AgentApiError(RuntimeError):
    """Typed HTTP failure without response body, URL, or credential details."""

    def __init__(self, status_code: int, category: str) -> None:
        self.status_code = status_code
        self.category = category
        super().__init__(f"agent API request failed ({status_code}, {category})")


class TypedAgentApiError(AgentApiError):
    """Public alias for typed API failures."""


class AgentValidationError(ValueError):
    """Local job/profile/artifact validation failed before delivery."""


class AgentDeliveryUncertainty(RuntimeError):
    """A transport or result callback left delivery outcome uncertain."""


class TransportFailureBeforeSend(RuntimeError):
    """A transport failed before sending any byte."""


class TransportDeliveryUnknown(RuntimeError):
    """A transport cannot establish whether bytes were delivered."""


class ArtifactPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    payload: bytes = Field(repr=False)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    byte_length: int = Field(gt=0)
    filename: Literal["label.ipl", "label.zpl"]
    media_type: Literal["application/octet-stream"]


class AgentResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job: PrintJob
    outcome: Literal["success", "failure_before_send", "delivery_unknown"]
    bytes_sent: int = Field(ge=0)


@dataclass(frozen=True)
class AgentRunResult:
    status: AgentRunStatus
    job: PrintJob | None = None
    outcome: str | None = None
    bytes_sent: int = 0
    error_category: str | None = None
