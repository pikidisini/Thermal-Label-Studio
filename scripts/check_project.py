"""Provider-neutral source gate. Never builds or starts a container."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
PENDING_RUNTIME = (
    "independently_verified_renderer_checksum",
    "image_build_and_linux_rendering",
    "localhost_binding_health_and_browser",
    "resource_shutdown_and_rollback_rehearsal",
)
MAX_FAILURE_OUTPUT_CHARS = 12_000
NATIVE_PARITY_TESTS = (
    "backend/tests/test_editor_shared_binding.py",
    "backend/tests/test_intake_print.py",
    "backend/tests/test_label_intake.py",
    "backend/tests/test_pipeline_acceptance.py",
)


@dataclass(frozen=True)
class Check:
    name: str
    command: tuple[str, ...]
    cwd: Path


def bounded_failure_output(stdout: bytes | None, stderr: bytes | None) -> str:
    """Return a bounded diagnostic that preserves TAP assertion blocks first."""
    output = b"[stdout]\n" + (stdout or b"") + b"\n[stderr]\n" + (stderr or b"")
    decoded = output.decode("utf-8", errors="replace")
    lines = decoded.splitlines(keepends=True)
    tap_blocks = []
    for index, line in enumerate(lines):
        if "not ok" in line.lower():
            tap_blocks.append("".join(lines[index:index + 31]))
    if not tap_blocks:
        return decoded[-MAX_FAILURE_OUTPUT_CHARS:]
    prioritized = "[TAP failure blocks]\n" + "\n".join(tap_blocks)
    if len(prioritized) >= MAX_FAILURE_OUTPUT_CHARS:
        return prioritized[:MAX_FAILURE_OUTPUT_CHARS]
    tail_marker = "\n[tail]\n"
    tail_budget = MAX_FAILURE_OUTPUT_CHARS - len(prioritized) - len(tail_marker)
    if tail_budget <= 0:
        return prioritized[:MAX_FAILURE_OUTPUT_CHARS]
    return prioritized + tail_marker + decoded[-tail_budget:]


def source_checks(root: Path = ROOT) -> tuple[Check, ...]:
    # Local tools only: no npm ci, npx, downloads, Docker or Git commands.
    npm = shutil.which("npm") or "npm"
    node = shutil.which("node") or "node"
    frontend = root / "frontend"
    pytest = (sys.executable, "-B", "-m", "pytest", "-p", "no:cacheprovider", "-p", "no:tmpdir")
    non_native_ignores = tuple(f"--ignore={path}" for path in NATIVE_PARITY_TESTS)
    return (
        Check("backend_non_native_regression", (*pytest, "backend/tests", *non_native_ignores, "-q"), root),
        Check("backend_native_parity", (*pytest, *NATIVE_PARITY_TESTS, "-q"), root),
        Check("frontend_typecheck", (node, "node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"), frontend),
        Check("frontend_build", (npm, "run", "build"), frontend),
        # The regression suite intentionally verifies the generated dist
        # contract, so it must run after the fresh source build.
        Check("frontend_regression", (npm, "test"), frontend),
    )


def execute_checks(checks: tuple[Check, ...], root: Path = ROOT, *, timeout_seconds: int = 600) -> dict:
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 3600:
        raise ValueError('Per-check timeout must be from 1 to 3600 seconds.')
    env = dict(os.environ)
    # Source regression uses disposable/local fixtures, never operator paths.
    for key in tuple(env):
        if key.startswith("TLS_"):
            del env[key]
    env["PYTHONPATH"] = str(root / "backend")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    results = []
    for check in checks:
        try:
            result = subprocess.run(check.command, cwd=check.cwd, env=env,
                                    capture_output=True, timeout=timeout_seconds, shell=False)
            entry = {"check": check.name, "status": "PASS" if result.returncode == 0 else "FAIL",
                     "exit_code": result.returncode}
            if result.returncode != 0:
                entry["diagnostic_tail"] = bounded_failure_output(result.stdout, result.stderr)
        except (OSError, subprocess.TimeoutExpired):
            entry = {"check": check.name, "status": "BLOCKED", "reason": "tool_unavailable_or_timeout"}
        results.append(entry)
    passed = all(entry["status"] == "PASS" for entry in results) and bool(results)
    return {"source_gate": "PASS" if passed else "FAIL", "checks": results,
            "per_check_timeout_seconds": timeout_seconds,
            "deployment_ready": False,
            "runtime_gates": [{"check": name, "status": "NOT RUN"} for name in PENDING_RUNTIME]}


def save_report(report: dict) -> dict:
    """Keep generated evidence in a unique disposable project child."""
    run_directory = ROOT / ".tmp" / f"source-checks-{uuid4()}"
    run_directory.mkdir(parents=True, exist_ok=False)
    report = {**report, "report_path": str(run_directory / "report.json")}
    (run_directory / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-source-checks", action="store_true",
                        help="Run existing local tests/typecheck/build; no dependency installation.")
    parser.add_argument('--timeout-seconds', type=int, default=600,
                        help='Explicit per-check execution budget, 1..3600 seconds (default 600). Checks and failure rules stay unchanged.')
    args = parser.parse_args(argv)
    if not 1 <= args.timeout_seconds <= 3600:
        parser.error('--timeout-seconds must be from 1 to 3600.')
    checks = source_checks()
    if not args.run_source_checks:
        print(json.dumps({"source_gate": "NOT RUN", "deployment_ready": False,
                          "per_check_timeout_seconds": args.timeout_seconds,
                          "planned_checks": [check.name for check in checks],
                          "runtime_gates": [{"check": name, "status": "NOT RUN"} for name in PENDING_RUNTIME]}, indent=2))
        return 0
    report = execute_checks(checks, timeout_seconds=args.timeout_seconds)
    report = save_report(report)
    serialized = json.dumps(report, indent=2)
    print(serialized)
    return 0 if report["source_gate"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
