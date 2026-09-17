"""Non-network printer transport doubles for deterministic tests."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class MockTransportOutcome(StrEnum):
    SUCCESS = "success"
    FAILURE_BEFORE_SEND = "failure_before_send"
    DELIVERY_UNKNOWN = "delivery_unknown"


@dataclass(frozen=True)
class MockSendResult:
    outcome: MockTransportOutcome
    bytes_sent: int


class MockPrinterTransport:
    """Records bytes in memory and never imports or uses a network API."""

    def __init__(self, outcome: MockTransportOutcome = MockTransportOutcome.SUCCESS) -> None:
        self.outcome = outcome
        self.sent_payloads: list[bytes] = []

    def send(self, payload: bytes) -> MockSendResult:
        if self.outcome is MockTransportOutcome.FAILURE_BEFORE_SEND:
            return MockSendResult(self.outcome, 0)
        self.sent_payloads.append(bytes(payload))
        if self.outcome is MockTransportOutcome.DELIVERY_UNKNOWN:
            return MockSendResult(self.outcome, len(payload))
        return MockSendResult(self.outcome, len(payload))
