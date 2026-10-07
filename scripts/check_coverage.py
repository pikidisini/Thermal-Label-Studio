"""Run meaningful source/browser tests and emit portable Sonar reports in .tmp."""
from __future__ import annotations

import json
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
    manifest = "\n".join(f"{path.relative_to(ROOT).as_posix()} {hashlib.sha256(path.read_bytes()).hexdigest()}"
                         for path in sorted(files))
    return hashlib.sha256(manifest.encode()).hexdigest()


def verify_reports(directory: Path) -> None:
    directory.resolve().relative_to(ROOT / ".tmp")
    result = json.loads((directory / "result.json").read_text())
    if result["status"] != "PASS" or result["source_sha256"] != source_fingerprint():
        raise ValueError("Coverage reports do not match passing tests of the current source.")
    for name, expected in result["report_sha256"].items():
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Coverage report integrity check failed.")


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--verify-inputs":
        verify_reports(Path(sys.argv[2]))
        print("Coverage source and report integrity: PASS")
        return 0
    directory = ROOT / ".tmp" / f"coverage-{uuid4()}"
    directory.mkdir(parents=True)
    frontend = ROOT / "frontend"
    initial_fingerprint = source_fingerprint()
    env = {key: value for key, value in os.environ.items() if not key.startswith("TLS_")}
    env.update(PYTHONPATH=str(ROOT / "backend"), PYTHONDONTWRITEBYTECODE="1",
               COVERAGE_FILE=str(directory / "python.coverage"),
               TLS_COVERAGE_BUILD="1", TLS_COVERAGE_DIRECTORY=str(directory / "v8"))
    plan = list(source_checks())
    commands = [
        ("backend_coverage", (sys.executable, "-m", "coverage", "run", "--branch", "--source=backend/app",
                              "-m", "pytest", "-p", "no:cacheprovider", "-p", "no:tmpdir", "backend/tests", "-q"), ROOT),
        ("backend_xml", (sys.executable, "-m", "coverage", "xml", "-o", str(directory / "python.xml")), ROOT),
        (plan[1].name, plan[1].command, frontend),
        (plan[2].name, plan[2].command, frontend),
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
            result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
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
