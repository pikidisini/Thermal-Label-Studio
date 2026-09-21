"""Unit tests for RawTcpSocketTransport and socket delivery semantics."""

from __future__ import annotations

import socket
import threading
import time
from pathlib import Path

import pytest

from app.print_jobs.socket_transport import (
    MockSocketTransport,
    RawTcpSocketTransport,
    SocketTransportResult,
    TransportOutcome,
)


def test_invalid_timeouts_raise_error() -> None:
    with pytest.raises(ValueError, match="connect_timeout must be positive"):
        RawTcpSocketTransport(connect_timeout=0.0)
    with pytest.raises(ValueError, match="write_timeout must be positive"):
        RawTcpSocketTransport(connect_timeout=1.0, write_timeout=-1.0)


def test_invalid_port_or_host_fails_before_send() -> None:
    transport = RawTcpSocketTransport(connect_timeout=1.0, write_timeout=1.0)
    result_host = transport.send("", 9100, b"data")
    assert result_host.outcome == TransportOutcome.FAILURE_BEFORE_SEND
    assert result_host.bytes_sent == 0
    assert "invalid host" in (result_host.error_message or "")

    result_port = transport.send("127.0.0.1", 70000, b"data")
    assert result_port.outcome == TransportOutcome.FAILURE_BEFORE_SEND
    assert result_port.bytes_sent == 0
    assert "invalid port" in (result_port.error_message or "")


def test_empty_payload_succeeds_immediately() -> None:
    transport = RawTcpSocketTransport(connect_timeout=1.0, write_timeout=1.0)
    result = transport.send("127.0.0.1", 9100, b"")
    assert result.outcome == TransportOutcome.SUCCESS
    assert result.bytes_sent == 0


def test_connection_refused_returns_failure_before_send() -> None:
    # Find an unused local port
    temp_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    temp_sock.bind(("127.0.0.1", 0))
    unused_port = temp_sock.getsockname()[1]
    temp_sock.close()

    transport = RawTcpSocketTransport(connect_timeout=0.5, write_timeout=1.0)
    result = transport.send("127.0.0.1", unused_port, b"test_payload")
    assert result.outcome == TransportOutcome.FAILURE_BEFORE_SEND
    assert result.bytes_sent == 0
    assert "connect failed" in (result.error_message or "")


def test_successful_send_on_loopback_server() -> None:
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.bind(("127.0.0.1", 0))
    server_sock.listen(1)
    port = server_sock.getsockname()[1]

    received_data = bytearray()
    server_ready = threading.Event()

    def server_thread() -> None:
        server_ready.set()
        conn, _ = server_sock.accept()
        try:
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                received_data.extend(chunk)
        finally:
            conn.close()
            server_sock.close()

    t = threading.Thread(target=server_thread, daemon=True)
    t.start()
    server_ready.wait(timeout=2.0)

    payload = b"^XA^FO50,50^FDTEST_LABEL^FS^XZ" * 20
    transport = RawTcpSocketTransport(connect_timeout=2.0, write_timeout=2.0)
    result = transport.send("127.0.0.1", port, payload)

    t.join(timeout=2.0)
    assert result.outcome == TransportOutcome.SUCCESS
    assert result.bytes_sent == len(payload)
    assert bytes(received_data) == payload


def test_mid_stream_sever_returns_delivery_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.bind(("127.0.0.1", 0))
    server_sock.listen(1)
    port = server_sock.getsockname()[1]

    def server_thread() -> None:
        conn, _ = server_sock.accept()
        try:
            conn.recv(4096)
        finally:
            conn.close()
            server_sock.close()

    t = threading.Thread(target=server_thread, daemon=True)
    t.start()

    orig_send = socket.socket.send
    calls = 0

    def mock_send(self: socket.socket, data: bytes) -> int:
        nonlocal calls
        calls += 1
        if calls == 1:
            return orig_send(self, data[:100])
        raise ConnectionResetError("Connection reset by peer mid-stream")

    monkeypatch.setattr(socket.socket, "send", mock_send)

    payload = b"X" * 1000
    transport = RawTcpSocketTransport(connect_timeout=2.0, write_timeout=2.0, chunk_size=100)
    result = transport.send("127.0.0.1", port, payload)

    t.join(timeout=2.0)
    assert result.outcome == TransportOutcome.DELIVERY_UNKNOWN
    assert result.bytes_sent == 100
    assert "Connection reset by peer mid-stream" in (result.error_message or "")


def test_initial_write_failure_returns_failure_before_send(monkeypatch: pytest.MonkeyPatch) -> None:
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.bind(("127.0.0.1", 0))
    server_sock.listen(1)
    port = server_sock.getsockname()[1]

    def server_thread() -> None:
        conn, _ = server_sock.accept()
        try:
            conn.recv(4096)
        finally:
            conn.close()
            server_sock.close()

    t = threading.Thread(target=server_thread, daemon=True)
    t.start()

    def mock_send(self: socket.socket, data: bytes) -> int:
        raise ConnectionResetError("Connection reset immediately before write")

    monkeypatch.setattr(socket.socket, "send", mock_send)

    payload = b"X" * 1000
    transport = RawTcpSocketTransport(connect_timeout=2.0, write_timeout=2.0, chunk_size=100)
    result = transport.send("127.0.0.1", port, payload)

    t.join(timeout=2.0)
    assert result.outcome == TransportOutcome.FAILURE_BEFORE_SEND
    assert result.bytes_sent == 0
    assert "Connection reset immediately before write" in (result.error_message or "")


def test_mock_socket_transport() -> None:
    mock_success = MockSocketTransport(outcome=TransportOutcome.SUCCESS)
    res1 = mock_success.send("10.0.0.1", 9100, b"payload123")
    assert res1.outcome == TransportOutcome.SUCCESS
    assert res1.bytes_sent == 10
    assert mock_success.calls == [("10.0.0.1", 9100, b"payload123")]

    mock_fail = MockSocketTransport(outcome=TransportOutcome.FAILURE_BEFORE_SEND)
    res2 = mock_fail.send("10.0.0.1", 9100, b"payload123")
    assert res2.outcome == TransportOutcome.FAILURE_BEFORE_SEND
    assert res2.bytes_sent == 0

    mock_unknown = MockSocketTransport(outcome=TransportOutcome.DELIVERY_UNKNOWN, partial_bytes=4)
    res3 = mock_unknown.send("10.0.0.1", 9100, b"payload123")
    assert res3.outcome == TransportOutcome.DELIVERY_UNKNOWN
    assert res3.bytes_sent == 4
