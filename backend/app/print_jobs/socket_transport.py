"""Socket transport abstraction and Raw TCP Port 9100 implementation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
import hashlib
import json
from pathlib import Path
import socket
import time
from typing import Any, Protocol


class PhysicalPrintDisabledError(RuntimeError):
    """Raised when physical printer dispatch is attempted while disabled."""


class TransportOutcome(StrEnum):
    SUCCESS = "success"
    FAILURE_BEFORE_SEND = "failure_before_send"
    DELIVERY_UNKNOWN = "delivery_unknown"


@dataclass(frozen=True)
class SocketTransportResult:
    outcome: TransportOutcome
    bytes_sent: int
    error_message: str | None = None


class SocketTransport(Protocol):
    """Protocol for sending raw printer payloads over a socket."""

    def send(self, host: str, port: int, payload: bytes) -> SocketTransportResult: ...


class RawTcpSocketTransport:
    """Production socket transport for sending raw printer payloads via TCP Port 9100.

    Enforces strict connect and write timeouts with fail-closed semantics.
    Differentiates between:
    - FAILURE_BEFORE_SEND: connection failed or broken before any bytes were transmitted.
    - DELIVERY_UNKNOWN: connection timed out or severed after transmitting partial bytes;
      cannot determine whether printer buffered or printed the partial command.
    - SUCCESS: all bytes successfully written to socket.
    """

    def __init__(
        self,
        connect_timeout: float = 3.0,
        write_timeout: float = 10.0,
        chunk_size: int = 16384,
        dispatch_enabled: bool = False,
    ) -> None:
        if connect_timeout <= 0:
            raise ValueError("connect_timeout must be positive")
        if write_timeout <= 0:
            raise ValueError("write_timeout must be positive")
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        self.connect_timeout = float(connect_timeout)
        self.write_timeout = float(write_timeout)
        self.chunk_size = int(chunk_size)
        self.dispatch_enabled = bool(dispatch_enabled)

    def send(self, host: str, port: int, payload: bytes) -> SocketTransportResult:
        if not self.dispatch_enabled:
            raise PhysicalPrintDisabledError(
                f"Physical printer dispatch is disabled (dispatch_enabled=False). "
                f"Direct TCP socket connection to {host}:{port} is blocked."
            )
        if not host or not isinstance(host, str):
            return SocketTransportResult(TransportOutcome.FAILURE_BEFORE_SEND, 0, "invalid host")
        if not (1 <= port <= 65535):
            return SocketTransportResult(
                TransportOutcome.FAILURE_BEFORE_SEND, 0, f"invalid port: {port}"
            )
        if not payload:
            return SocketTransportResult(TransportOutcome.SUCCESS, 0)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.connect_timeout)

        # 1. Connect Phase
        try:
            sock.connect((host, port))
        except (socket.timeout, TimeoutError, ConnectionRefusedError, OSError) as exc:
            sock.close()
            return SocketTransportResult(
                TransportOutcome.FAILURE_BEFORE_SEND, 0, f"connect failed: {exc}"
            )

        # 2. Write Phase
        sock.settimeout(self.write_timeout)
        total_sent = 0
        try:
            while total_sent < len(payload):
                chunk = payload[total_sent : total_sent + self.chunk_size]
                sent = sock.send(chunk)
                if sent == 0:
                    # Connection closed prematurely by peer
                    break
                total_sent += sent
        except (socket.timeout, TimeoutError, OSError) as exc:
            outcome = (
                TransportOutcome.DELIVERY_UNKNOWN
                if total_sent > 0
                else TransportOutcome.FAILURE_BEFORE_SEND
            )
            return SocketTransportResult(outcome, total_sent, f"send error: {exc}")
        finally:
            try:
                sock.close()
            except OSError:
                pass

        if total_sent == len(payload):
            return SocketTransportResult(TransportOutcome.SUCCESS, total_sent)
        elif total_sent > 0:
            return SocketTransportResult(
                TransportOutcome.DELIVERY_UNKNOWN,
                total_sent,
                "connection closed before complete payload was sent",
            )
        else:
            return SocketTransportResult(
                TransportOutcome.FAILURE_BEFORE_SEND,
                0,
                "connection closed before any payload was sent",
            )


class MockSocketTransport:
    """Mock socket transport for deterministic testing without real network I/O."""

    def __init__(
        self,
        outcome: TransportOutcome = TransportOutcome.SUCCESS,
        partial_bytes: int = 0,
        error_message: str | None = None,
    ) -> None:
        self.outcome = outcome
        self.partial_bytes = partial_bytes
        self.error_message = error_message
        self.calls: list[tuple[str, int, bytes]] = []

    def send(self, host: str, port: int, payload: bytes) -> SocketTransportResult:
        self.calls.append((host, port, payload))
        if self.outcome == TransportOutcome.SUCCESS:
            return SocketTransportResult(TransportOutcome.SUCCESS, len(payload))
        elif self.outcome == TransportOutcome.FAILURE_BEFORE_SEND:
            return SocketTransportResult(
                TransportOutcome.FAILURE_BEFORE_SEND,
                0,
                self.error_message or "mock connect failed",
            )
        else:
            bytes_sent = self.partial_bytes if self.partial_bytes > 0 else (len(payload) // 2 or 1)
            return SocketTransportResult(
                TransportOutcome.DELIVERY_UNKNOWN,
                bytes_sent,
                self.error_message or "mock connection severed mid-stream",
            )


class SimulatorSocketTransport:
    """Safe simulator transport for demonstration, CI, and local evaluation.

    Satisfies the SocketTransport protocol. Never opens real network sockets.
    Records transmitted payloads in-memory and optionally appends JSON lines
    to a simulator output file.
    """

    def __init__(self, log_path: Path | None = None) -> None:
        self.log_path = log_path
        self.calls: list[tuple[str, int, bytes]] = []
        self.dispatches: list[dict[str, Any]] = []

    def send(self, host: str, port: int, payload: bytes) -> SocketTransportResult:
        self.calls.append((host, port, payload))
        dispatch_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "host": host,
            "port": port,
            "byte_count": len(payload),
            "payload_sha256": hashlib.sha256(payload).hexdigest(),
        }
        self.dispatches.append(dispatch_record)

        if self.log_path:
            try:
                self.log_path.parent.mkdir(parents=True, exist_ok=True)
                with self.log_path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(dispatch_record) + "\n")
            except OSError:
                pass

        return SocketTransportResult(TransportOutcome.SUCCESS, len(payload))
