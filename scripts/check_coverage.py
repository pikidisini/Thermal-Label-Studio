"""Run meaningful source/browser tests and emit portable Sonar reports in .tmp."""
from __future__ import annotations

import json
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4
import xml.etree.ElementTree as ET

from check_project import ROOT, source_checks


def source_fingerprint() -> str:
    files = [path for root in ("backend/app", "backend/tests", "frontend/src", "frontend/tests")
             for path in (ROOT / root).rglob("*") if path.is_file() and "__pycache__" not in path.parts]
    files.extend(ROOT / name for name in ("requirements.txt", "frontend/package.json", "frontend/package-lock.json",
                                         "frontend/tsconfig.json", "frontend/vite.config.js"))
    # Normalize separators explicitly because candidate reports are produced in
    # Linux while verification may run on Windows.  pathlib.as_posix() does
    # not rewrite separators on Windows paths, so normalize the relative text
    # before hashing to keep the candidate fingerprint portable.
    normalized = [(str(path.relative_to(ROOT)).replace("\\", "/"), path) for path in files]
    manifest = "\n".join(f"{relative} {hashlib.sha256(path.read_bytes()).hexdigest()}"
                         for relative, path in sorted(normalized, key=lambda item: item[0]))
    return hashlib.sha256(manifest.encode()).hexdigest()


def verify_reports(directory: Path) -> None:
    directory.resolve().relative_to(ROOT / ".tmp")
    result = json.loads((directory / "result.json").read_text())
    if result["status"] != "PASS" or result["source_sha256"] != source_fingerprint():
        raise ValueError("Coverage reports do not match passing tests of the current source.")
    for name, expected in result["report_sha256"].items():
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Coverage report integrity check failed.")


def frontend_preparation(checks):
    """Resolve prerequisites by identity; source-gate ordering may change."""
    by_name = {check.name: check for check in checks}
    return [(by_name[name].name, by_name[name].command, by_name[name].cwd)
            for name in ('frontend_typecheck', 'frontend_build')]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-inputs', type=Path)
    parser.add_argument('--timeout', type=int, default=1800, help='Per-check timeout in seconds (1..3600).')
    args = parser.parse_args()
    if not 1 <= args.timeout <= 3600:
        parser.error('Per-check timeout must be from 1 to 3600 seconds.')
    if args.verify_inputs is not None:
        verify_reports(args.verify_inputs)
        print("Coverage source and report integrity: PASS")
        return 0
    directory = ROOT / ".tmp" / f"coverage-{uuid4()}"
    directory.mkdir(parents=True)
    frontend = ROOT / "frontend"
    initial_fingerprint = source_fingerprint()
    env = {key: value for key, value in os.environ.items() if not key.startswith("TLS_")}
    # Coverage runs in the isolated Linux runner and needs its pinned,
    # non-secret renderer/font fixtures.  Keep credentials and runtime
    # integration settings filtered while passing only these explicit test
    # inputs to the child processes.
    for key in ("TLS_RENDERER_PATH", "TLS_FIXTURE_FONT_PATH", "TLS_FIXTURE_FONT_FAMILY", "TLS_TEST_BASE_URL"):
        if key in os.environ:
            env[key] = os.environ[key]
    env.update(PYTHONPATH=str(ROOT / "backend"), PYTHONDONTWRITEBYTECODE="1",
               COVERAGE_FILE=str(directory / "python.coverage"),
               TLS_COVERAGE_BUILD="1", TLS_COVERAGE_DIRECTORY=str(directory / "v8"))
    plan = list(source_checks())
    commands = [
        ("backend_coverage", (sys.executable, "-m", "coverage", "run", "--branch", "--source=backend/app",
                              "-m", "pytest", "-p", "no:cacheprovider", "-p", "no:tmpdir", "backend/tests", "-q"), ROOT),
        ("backend_xml", (sys.executable, "-m", "coverage", "xml", "-o", str(directory / "python.xml")), ROOT),
        *frontend_preparation(plan),
    ]
    tests = json.loads((frontend / "package.json").read_text())["scripts"]["test"].removeprefix("tsx --test ").split()
    c8 = ("node", "node_modules/c8/bin/c8.js")
    report_args = ("--all", "--exclude-after-remap", "--include=src/**", "--exclude=src/**/*.d.ts", "--reporter=lcov", "--reporter=json-summary",
                   f"--temp-directory={directory / 'v8'}", f"--reports-dir={directory / 'frontend'}")
    commands.extend([
        ("frontend_unit_coverage", (*c8, *report_args, "node", "--import", "tsx", "--test", *tests), frontend),
        ("frontend_browser_coverage", ("node", "node_modules/@playwright/test/cli.js", "test", "--project=ui"), frontend),
        ("frontend_lcov", (*c8, "report", *report_args), frontend),
    ])
    checks = []
    for name, command, cwd in commands:
        with (directory / f"{name}.log").open("wb") as log:
            try:
                result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout)
            except subprocess.TimeoutExpired:
                checks.append({'check': name, 'status': 'BLOCKED', 'reason': 'timeout'})
                (directory / 'result.json').write_text(json.dumps({'status':'BLOCKED','checks':checks,'per_check_timeout_seconds':args.timeout},indent=2))
                print(f'{name}: BLOCKED (timeout); Evidence: {directory}',flush=True)
                return 1
        checks.append({"check": name, "exit_code": result.returncode})
        print(f"{name}: {'PASS' if result.returncode == 0 else 'FAIL'}", flush=True)
        if result.returncode:
            print(f"Evidence: {directory}", flush=True)
            (directory / "result.json").write_text(json.dumps({"status": "FAIL", "checks": checks}, indent=2))
            return 1
    tree = ET.parse(directory / "python.xml")
    for source in tree.findall("./sources/source"):
        source.text = "."
    tree.write(directory / "python.xml", encoding="utf-8", xml_declaration=True)
    lcov = directory / "frontend/lcov.info"
    lines = []
    for line in lcov.read_text().splitlines():
        if line.startswith("SF:"):
            source = Path(line[3:])
            if not source.is_absolute():
                source = frontend / source
            line = "SF:" + source.resolve().relative_to(ROOT).as_posix()
        lines.append(line)
    lcov.write_text("\n".join(lines) + "\n")
    if initial_fingerprint != source_fingerprint():
        raise ValueError("Source changed during the coverage run; rerun on a stable snapshot.")
    result = {"status": "PASS", "checks": checks, "reports_directory": str(directory),
              "source_sha256": initial_fingerprint,
              "report_sha256": {name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                                for name in ("python.xml", "frontend/lcov.info")}}
    (directory / "result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
