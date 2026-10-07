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
    return (
        Check("backend_regression", (sys.executable, "-B", "-m", "pytest", "-p", "no:cacheprovider", "-p", "no:tmpdir", "backend/tests", "-q"), root),
        Check("frontend_typecheck", (node, "node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"), frontend),
        Check("frontend_build", (npm, "run", "build"), frontend),
        # The regression suite intentionally verifies the generated dist
        # contract, so it must run after the fresh source build.
        Check("frontend_regression", (npm, "test"), frontend),
    )


def execute_checks(checks: tuple[Check, ...], root: Path = ROOT) -> dict:
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
                                    capture_output=True, timeout=600, shell=False)
            entry = {"check": check.name, "status": "PASS" if result.returncode == 0 else "FAIL",
                     "exit_code": result.returncode}
            if result.returncode != 0:
                entry["diagnostic_tail"] = bounded_failure_output(result.stdout, result.stderr)
        except (OSError, subprocess.TimeoutExpired):
            entry = {"check": check.name, "status": "BLOCKED", "reason": "tool_unavailable_or_timeout"}
        results.append(entry)
    passed = all(entry["status"] == "PASS" for entry in results) and bool(results)
    return {"source_gate": "PASS" if passed else "FAIL", "checks": results,
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
    args = parser.parse_args(argv)
    checks = source_checks()
    if not args.run_source_checks:
        print(json.dumps({"source_gate": "NOT RUN", "deployment_ready": False,
                          "planned_checks": [check.name for check in checks],
                          "runtime_gates": [{"check": name, "status": "NOT RUN"} for name in PENDING_RUNTIME]}, indent=2))
        return 0
    report = execute_checks(checks)
    report = save_report(report)
    serialized = json.dumps(report, indent=2)
    print(serialized)
    return 0 if report["source_gate"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
