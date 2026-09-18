"""Transport abstraction with memory-only implementation for offline tests."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from ..print_jobs.models import PrintJob
from .config import LocalPrinterProfile


class TransportOutcome(StrEnum):
    SUCCESS = "success"
    FAILURE_BEFORE_SEND = "failure_before_send"
    DELIVERY_UNKNOWN = "delivery_unknown"


@dataclass(frozen=True)
class TransportResult:
    outcome: TransportOutcome
    bytes_sent: int


class PrinterTransport(Protocol):
    def send(self, payload: bytes, job: PrintJob, profile: LocalPrinterProfile) -> TransportResult: ...


class MemoryPrinterTransport:
    """Records payloads in memory and performs no I/O outside the process."""

    def __init__(self, outcome: TransportOutcome = TransportOutcome.SUCCESS) -> None:
        self.outcome = outcome
        self.payloads: list[bytes] = []
        self.calls = 0

    def send(self, payload: bytes, job: PrintJob, profile: LocalPrinterProfile) -> TransportResult:
        self.calls += 1
        if self.outcome is not TransportOutcome.FAILURE_BEFORE_SEND:
            self.payloads.append(bytes(payload))
        bytes_sent = 0 if self.outcome is TransportOutcome.FAILURE_BEFORE_SEND else len(payload)
        return TransportResult(self.outcome, bytes_sent)
