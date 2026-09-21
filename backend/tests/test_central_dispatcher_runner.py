"""Unit and integration tests for Central Print Dispatcher runner."""

from __future__ import annotations

import os
from pathlib import Path
import threading
from unittest.mock import MagicMock, patch

import pytest

from backend.app.print_jobs.central_dispatcher import (
    CentralPrintDispatcher,
    DispatchResult,
    DispatchStatus,
)
from backend.app.print_jobs.central_dispatcher_runner import (
    DispatcherRunnerConfig,
    main,
    run_dispatcher_loop,
)
from backend.app.print_jobs.models import PrintJob, PrintJobStatus


def test_config_from_valid_environment(tmp_path: Path):
    artifact_dir = (tmp_path / "artifacts").resolve()
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://user:pass@localhost:5432/testdb",
        "PRINT_AGENT_ARTIFACT_ROOT": str(artifact_dir),
        "PRINT_AGENT_SITE_ID": "plant-alpha",
        "PRINT_AGENT_DISPATCHER_ID": "worker-01",
        "DISPATCHER_POLL_INTERVAL_SECONDS": "1.5",
        "DISPATCHER_LEASE_SECONDS": "45.0",
        "DISPATCHER_SOCKET_TIMEOUT": "5.0",
        "DISPATCHER_MAX_CYCLES": "10",
    }
    config = DispatcherRunnerConfig.from_environment(env)
    assert config.database_url == "postgresql://user:pass@localhost:5432/testdb"
    assert config.artifact_root == artifact_dir
    assert config.site_id == "plant-alpha"
    assert config.dispatcher_id == "worker-01"
    assert config.poll_interval_seconds == 1.5
    assert config.lease_seconds == 45.0
    assert config.socket_timeout_seconds == 5.0
    assert config.max_cycles == 10


def test_config_missing_database_url(tmp_path: Path):
    env = {
        "PRINT_AGENT_ARTIFACT_ROOT": str(tmp_path.resolve()),
    }
    with pytest.raises(ValueError, match="PRINT_AGENT_DATABASE_URL is required"):
        DispatcherRunnerConfig.from_environment(env)


def test_config_missing_artifact_root():
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://user:pass@localhost:5432/testdb",
    }
    with pytest.raises(ValueError, match="PRINT_AGENT_ARTIFACT_ROOT is required"):
        DispatcherRunnerConfig.from_environment(env)


def test_config_relative_artifact_root():
    with pytest.raises(ValueError, match="must be an absolute path"):
        DispatcherRunnerConfig(
            database_url="postgresql://localhost/db",
            artifact_root=Path("relative/path"),
        )


def test_config_invalid_timing_values(tmp_path: Path):
    root = tmp_path.resolve()
    with pytest.raises(ValueError, match="poll_interval_seconds must be positive"):
        DispatcherRunnerConfig("postgresql://localhost/db", root, poll_interval_seconds=0)
    with pytest.raises(ValueError, match="lease_seconds must be positive"):
        DispatcherRunnerConfig("postgresql://localhost/db", root, lease_seconds=-1)
    with pytest.raises(ValueError, match="socket_timeout_seconds must be positive"):
        DispatcherRunnerConfig("postgresql://localhost/db", root, socket_timeout_seconds=0)


def test_run_dispatcher_loop_stops_on_max_cycles():
    mock_dispatcher = MagicMock(spec=CentralPrintDispatcher)
    mock_dispatcher.run_once.return_value = DispatchResult(status=DispatchStatus.IDLE)

    stop_event = threading.Event()
    results = []

    cycles = run_dispatcher_loop(
        dispatcher=mock_dispatcher,
        stop_event=stop_event,
        poll_interval_seconds=0.01,
        max_cycles=3,
        on_cycle=lambda res: results.append(res),
    )

    assert cycles == 3
    assert len(results) == 3
    assert mock_dispatcher.run_once.call_count == 3


def test_run_dispatcher_loop_stops_on_event():
    mock_dispatcher = MagicMock(spec=CentralPrintDispatcher)
    mock_dispatcher.run_once.return_value = DispatchResult(status=DispatchStatus.COMPLETED, bytes_sent=128)

    stop_event = threading.Event()
    call_count = 0

    def on_cycle(res: DispatchResult):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            stop_event.set()

    cycles = run_dispatcher_loop(
        dispatcher=mock_dispatcher,
        stop_event=stop_event,
        poll_interval_seconds=0.01,
        on_cycle=on_cycle,
    )

    assert cycles == 2
    assert stop_event.is_set()


def test_run_dispatcher_loop_handles_exception():
    mock_dispatcher = MagicMock(spec=CentralPrintDispatcher)
    mock_dispatcher.run_once.side_effect = [
        RuntimeError("Transient error"),
        DispatchResult(status=DispatchStatus.IDLE),
    ]

    stop_event = threading.Event()
    call_count = 0

    def on_cycle(res: DispatchResult):
        nonlocal call_count
        call_count += 1
        stop_event.set()

    cycles = run_dispatcher_loop(
        dispatcher=mock_dispatcher,
        stop_event=stop_event,
        poll_interval_seconds=0.01,
        max_cycles=2,
        on_cycle=on_cycle,
    )

    assert cycles == 2
    assert mock_dispatcher.run_once.call_count == 2


def test_main_cli_missing_config_returns_error():
    with patch.dict(os.environ, {}, clear=True):
        exit_code = main([])
        assert exit_code == 1


def test_main_cli_unmigrated_database_fails_closed(tmp_path: Path):
    artifact_root = str(tmp_path.resolve())
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://fake:fake@127.0.0.1:5432/fake",
        "PRINT_AGENT_ARTIFACT_ROOT": artifact_root,
        "DISPATCHER_MAX_CYCLES": "1",
    }
    with patch.dict(os.environ, env, clear=True):
        with patch("backend.app.print_jobs.central_dispatcher_runner.PostgresPrintAgentRepository") as mock_repo_cls:
            mock_repo = MagicMock()
            mock_repo.verify_schema.side_effect = RuntimeError("PostgreSQL print pipeline baseline is not installed")
            mock_repo_cls.return_value = mock_repo

            exit_code = main([])
            assert exit_code == 1
            mock_repo.verify_schema.assert_called_once()
            mock_repo.close.assert_called_once()


def test_main_cli_successful_cycle(tmp_path: Path):
    artifact_root = str(tmp_path.resolve())
    env = {
        "PRINT_AGENT_DATABASE_URL": "postgresql://fake:fake@127.0.0.1:5432/fake",
        "PRINT_AGENT_ARTIFACT_ROOT": artifact_root,
        "DISPATCHER_MAX_CYCLES": "1",
        "DISPATCHER_POLL_INTERVAL_SECONDS": "0.01",
    }
    with patch.dict(os.environ, env, clear=True):
        with patch("backend.app.print_jobs.central_dispatcher_runner.PostgresPrintAgentRepository") as mock_repo_cls, \
             patch("backend.app.print_jobs.central_dispatcher_runner.CentralPrintDispatcher") as mock_disp_cls:
            mock_repo = MagicMock()
            mock_repo_cls.return_value = mock_repo
            mock_disp = MagicMock()
            mock_disp.run_once.return_value = DispatchResult(status=DispatchStatus.IDLE)
            mock_disp_cls.return_value = mock_disp

            exit_code = main([])
            assert exit_code == 0
            mock_repo.verify_schema.assert_called_once()
            mock_disp.run_once.assert_called_once()
            mock_repo.close.assert_called_once()
