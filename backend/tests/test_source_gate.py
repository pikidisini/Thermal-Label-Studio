from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import check_project as gate


def test_default_plan_has_no_process_effects(monkeypatch, capsys):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Plan ran a process"))
    assert gate.main([]) == 0
    import json
    report = json.loads(capsys.readouterr().out)
    assert report["source_gate"] == "NOT RUN"
    assert report["deployment_ready"] is False
    assert all(item["status"] == "NOT RUN" for item in report["runtime_gates"])


def test_source_commands_use_local_tools_and_full_typecheck():
    checks = gate.source_checks()
    assert [item.name for item in checks] == ["backend_regression", "frontend_typecheck", "frontend_build", "frontend_regression"]
    assert "backend/tests" in checks[0].command
    assert "node_modules/typescript/bin/tsc" in checks[1].command
    assert "tsconfig.json" in checks[1].command
    assert not any(token in {"docker", "jenkins", "git", "ci", "install", "npx"} for item in checks for token in item.command)
    assert all(item.cwd in {ROOT, ROOT / "frontend"} for item in checks)


def test_pass_does_not_promote_deployment_and_does_not_log_process_output(monkeypatch):
    calls = []
    monkeypatch.setenv("TLS_RENDERER_PATH", "operator-private-path")
    def run(command, **kwargs):
        calls.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, b"private facts", b"private error")
    monkeypatch.setattr(subprocess, "run", run)
    report = gate.execute_checks(gate.source_checks())
    assert report["source_gate"] == "PASS"
    assert report["deployment_ready"] is False
    assert "private" not in str(report)
    assert len(calls) == 4
    for _, kwargs in calls:
        assert kwargs["shell"] is False and kwargs["timeout"] == 600
        assert "TLS_RENDERER_PATH" not in kwargs["env"]
        assert kwargs["env"]["PYTHONPATH"] == str(ROOT / "backend")


@pytest.mark.parametrize("failure", ["exit", "missing", "timeout"])
def test_gate_fails_closed_and_reports_remaining_checks(monkeypatch, failure):
    count = 0
    def run(command, **kwargs):
        nonlocal count
        count += 1
        if count == 1:
            if failure == "missing":
                raise FileNotFoundError("private path")
            if failure == "timeout":
                raise subprocess.TimeoutExpired(command, 600, output=b"private")
            return subprocess.CompletedProcess(command, 2)
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(subprocess, "run", run)
    report = gate.execute_checks(gate.source_checks())
    assert report["source_gate"] == "FAIL"
    assert report["checks"][0]["status"] == ("FAIL" if failure == "exit" else "BLOCKED")
    assert len(report["checks"]) == 4
    assert "private" not in str(report)
    assert report["deployment_ready"] is False


def test_explicit_run_returns_failure_exit_code(monkeypatch):
    monkeypatch.setattr(gate, "execute_checks", lambda checks: {"source_gate": "FAIL"})
    monkeypatch.setattr(gate, "save_report", lambda report: report)
    assert gate.main(["--run-source-checks"]) == 1
