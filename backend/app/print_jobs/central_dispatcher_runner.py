"""Central Print Dispatcher runner for continuous container execution.

Provides an operational worker entrypoint that runs CentralPrintDispatcher in a
loop, handles OS shutdown signals (SIGTERM, SIGINT) gracefully, verifies database
schema fail-closed per ADR-024, and releases all resources cleanly on termination.
"""

from __future__ import annotations

from datetime import timedelta
import logging
import os
from pathlib import Path
import signal
import socket
import sys
import threading
from typing import Callable

from .artifact_storage import DEFAULT_RETENTION, DurableFilesystemArtifactStorage
from .central_dispatcher import CentralPrintDispatcher, DispatchResult, DispatchStatus
from .postgres_repository import PostgresPrintAgentRepository
from .security_validation import validate_database_credentials
from .socket_transport import (
    PhysicalPrintDisabledError,
    RawTcpSocketTransport,
    SimulatorSocketTransport,
)

logger = logging.getLogger("central_dispatcher_runner")


class DispatcherRunnerConfig:
    """Validated configuration for Central Print Dispatcher runner."""

    def __init__(
        self,
        database_url: str,
        artifact_root: Path,
        site_id: str = "pilot-site",
        dispatcher_id: str | None = None,
        poll_interval_seconds: float = 2.0,
        lease_seconds: float = 30.0,
        socket_timeout_seconds: float = 10.0,
        max_cycles: int | None = None,
        print_dispatch_enabled: bool = False,
        transport_mode: str = "simulator",
        allow_insecure_credentials: bool = False,
    ) -> None:
        if not database_url or not database_url.strip():
            raise ValueError("PRINT_AGENT_DATABASE_URL is required and cannot be empty")
        validate_database_credentials(database_url, allow_insecure=allow_insecure_credentials)

        resolved_root = artifact_root.resolve() if not artifact_root.is_absolute() else artifact_root
        if not artifact_root.is_absolute():
            raise ValueError(f"PRINT_AGENT_ARTIFACT_ROOT must be an absolute path: {artifact_root}")
        if poll_interval_seconds <= 0:
            raise ValueError("poll_interval_seconds must be positive")
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        if socket_timeout_seconds <= 0:
            raise ValueError("socket_timeout_seconds must be positive")
        if transport_mode not in ("simulator", "mock", "tcp"):
            raise ValueError(f"Invalid transport_mode '{transport_mode}'. Must be one of: simulator, mock, tcp")

        self.database_url = database_url
        self.artifact_root = artifact_root
        self.site_id = site_id
        self.dispatcher_id = dispatcher_id or f"dispatcher-{socket.gethostname()}"
        self.poll_interval_seconds = poll_interval_seconds
        self.lease_seconds = lease_seconds
        self.socket_timeout_seconds = socket_timeout_seconds
        self.max_cycles = max_cycles
        self.print_dispatch_enabled = print_dispatch_enabled
        self.transport_mode = transport_mode
        self.allow_insecure_credentials = allow_insecure_credentials

    @classmethod
    def from_environment(cls, env: dict[str, str] | None = None) -> DispatcherRunnerConfig:
        source = os.environ if env is None else env
        database_url = source.get("PRINT_AGENT_DATABASE_URL", "").strip()
        if not database_url:
            raise ValueError("Environment variable PRINT_AGENT_DATABASE_URL is required")

        # Security boundary: ALLOW_INSECURE_TEST_CREDENTIALS is an explicit environment-controlled
        # exception strictly reserved for disposable test containers (CI / local tests) and is
        # strictly prohibited in pilot or production deployments.
        allow_insecure = source.get("ALLOW_INSECURE_TEST_CREDENTIALS", "").strip().lower() in ("true", "1", "yes")

        raw_artifact_root = source.get("PRINT_AGENT_ARTIFACT_ROOT", "").strip()
        if not raw_artifact_root:
            raise ValueError("Environment variable PRINT_AGENT_ARTIFACT_ROOT is required")
        artifact_root = Path(raw_artifact_root)

        site_id = source.get("PRINT_AGENT_SITE_ID", source.get("PILOT_SITE_ID", "pilot-site")).strip()
        dispatcher_id = source.get("PRINT_AGENT_DISPATCHER_ID", source.get("PILOT_DISPATCHER_ID"))
        if dispatcher_id:
            dispatcher_id = dispatcher_id.strip()

        poll_interval = float(source.get("DISPATCHER_POLL_INTERVAL_SECONDS", "2.0"))
        lease_seconds = float(source.get("DISPATCHER_LEASE_SECONDS", "30.0"))
        socket_timeout = float(source.get("DISPATCHER_SOCKET_TIMEOUT", "10.0"))
        max_cycles_val = source.get("DISPATCHER_MAX_CYCLES")
        max_cycles = int(max_cycles_val) if max_cycles_val else None

        print_dispatch_enabled = source.get("PRINT_DISPATCH_ENABLED", "false").strip().lower() in ("true", "1", "yes")
        transport_mode = source.get("DISPATCHER_TRANSPORT_MODE", "simulator").strip().lower()

        return cls(
            database_url=database_url,
            artifact_root=artifact_root,
            site_id=site_id,
            dispatcher_id=dispatcher_id,
            poll_interval_seconds=poll_interval,
            lease_seconds=lease_seconds,
            socket_timeout_seconds=socket_timeout,
            max_cycles=max_cycles,
            print_dispatch_enabled=print_dispatch_enabled,
            transport_mode=transport_mode,
            allow_insecure_credentials=allow_insecure,
        )


def run_dispatcher_loop(
    dispatcher: CentralPrintDispatcher,
    stop_event: threading.Event,
    poll_interval_seconds: float = 2.0,
    max_cycles: int | None = None,
    on_cycle: Callable[[DispatchResult], None] | None = None,
) -> int:
    """Runs dispatcher loop until stop_event is set or max_cycles is reached.

    Returns the count of executed cycles.
    """
    cycles = 0
    while not stop_event.is_set():
        if max_cycles is not None and cycles >= max_cycles:
            break
        try:
            result = dispatcher.run_once()
            cycles += 1
            if on_cycle:
                on_cycle(result)
            if result.status == DispatchStatus.IDLE:
                stop_event.wait(timeout=poll_interval_seconds)
            elif result.status == DispatchStatus.COMPLETED:
                job_id = result.job.job_id if result.job else "unknown"
                logger.info("Job %s dispatched successfully (%d bytes sent)", job_id, result.bytes_sent)
            else:
                logger.warning("Dispatch outcome: %s (error: %s)", result.status, result.error_category)
        except Exception as exc:
            logger.error("Unexpected error during dispatch cycle: %s", exc, exc_info=True)
            cycles += 1
            stop_event.wait(timeout=poll_interval_seconds)

    return cycles


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for running the Central Print Dispatcher."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Starting Central Print Dispatcher runner process...")

    try:
        config = DispatcherRunnerConfig.from_environment()
    except Exception as exc:
        logger.error("Dispatcher configuration failed: %s", exc)
        return 1

    repository = None
    try:
        repository = PostgresPrintAgentRepository(config.database_url)
        # ADR-024: Verify schema without running DDL, fail closed if unmigrated
        repository.verify_schema()
        logger.info("Database schema verified successfully against PostgreSQL baseline.")

        artifact_storage = DurableFilesystemArtifactStorage(
            config.artifact_root,
            retention=DEFAULT_RETENTION,
        )

        if config.transport_mode == "tcp":
            if not config.print_dispatch_enabled:
                raise PhysicalPrintDisabledError(
                    "Physical printer dispatch is disabled (PRINT_DISPATCH_ENABLED=false). "
                    "Direct TCP socket connection to network printers is blocked."
                )
            transport = RawTcpSocketTransport(
                write_timeout=config.socket_timeout_seconds,
                dispatch_enabled=config.print_dispatch_enabled,
            )
            logger.info("Transport initialized: RawTcpSocketTransport (physical network socket).")
        elif config.transport_mode == "simulator":
            simulator_log = config.artifact_root / ".simulator_dispatches.jsonl"
            transport = SimulatorSocketTransport(log_path=simulator_log)
            logger.info("Transport initialized: SimulatorSocketTransport (safe demo/simulation mode).")
        elif config.transport_mode == "mock":
            from .socket_transport import MockSocketTransport
            transport = MockSocketTransport()
            logger.info("Transport initialized: MockSocketTransport (test mode).")
        else:
            raise ValueError(f"Unknown transport mode: {config.transport_mode}")

        dispatcher = CentralPrintDispatcher(
            site_id=config.site_id,
            dispatcher_id=config.dispatcher_id,
            repository=repository,
            artifact_storage=artifact_storage,
            transport=transport,
            lease_duration=timedelta(seconds=config.lease_seconds),
        )

        stop_event = threading.Event()

        def _signal_handler(signum: int, frame: object) -> None:
            try:
                sig_name = signal.Signals(signum).name
            except Exception:
                sig_name = str(signum)
            logger.info("Received signal %s, initiating graceful shutdown...", sig_name)
            stop_event.set()

        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                signal.signal(sig, _signal_handler)
            except (ValueError, OSError, AttributeError):
                pass

        logger.info(
            "Central Print Dispatcher running [site_id=%s, dispatcher_id=%s, poll=%.1fs, lease=%.1fs]",
            config.site_id,
            config.dispatcher_id,
            config.poll_interval_seconds,
            config.lease_seconds,
        )

        run_dispatcher_loop(
            dispatcher=dispatcher,
            stop_event=stop_event,
            poll_interval_seconds=config.poll_interval_seconds,
            max_cycles=config.max_cycles,
        )

        logger.info("Central Print Dispatcher runner stopped cleanly.")
        return 0
    except Exception as exc:
        logger.error("Fatal error in Central Print Dispatcher: %s", exc, exc_info=True)
        return 1
    finally:
        if repository is not None:
            try:
                repository.close()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
