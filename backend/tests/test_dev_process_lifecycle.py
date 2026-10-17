"""Native Windows regression: abrupt launcher exit must not strand descendants."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(os.name != "nt", reason="Windows job-object lifecycle")
def test_launcher_exit_releases_grandchild_listener():
    run = ROOT / ".tmp" / ("dev-lifecycle-" + uuid4().hex)
    run.mkdir(parents=True)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    ready = run / "ready"
    # A grandchild holds a real listener, mirroring Uvicorn's spawned worker.
    worker = (
        "import socket,time; from pathlib import Path; "
        f"s=socket.socket(); s.bind(('127.0.0.1',{port})); s.listen(); "
        f"Path({str(ready)!r}).write_text('ready'); time.sleep(60)"
    )
    child = f"import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',{worker!r}]); time.sleep(60)"
    launcher = (
        "import importlib.util,subprocess,sys,time; "
        f"s=importlib.util.spec_from_file_location('dev',{str(ROOT / 'scripts/dev.py')!r}); "
        "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
        "m.protect_windows_process_tree(); "
        f"subprocess.Popen([sys.executable,'-c',{child!r}]); time.sleep(60)"
    )
    process = subprocess.Popen([sys.executable, "-B", "-c", launcher])
    try:
        deadline = time.monotonic() + 15
        while not ready.exists() and time.monotonic() < deadline and process.poll() is None:
            time.sleep(0.1)
        assert ready.exists(), "Native process group did not start the listener"
        process.kill()  # Deliberately no /T: the job must remove descendants itself.
        process.wait(timeout=10)
        deadline = time.monotonic() + 10
        while True:
            try:
                with socket.socket() as probe:
                    probe.bind(("127.0.0.1", port))
                break
            except OSError:
                if time.monotonic() >= deadline:
                    pytest.fail("Grandchild retained listener after launcher exit")
                time.sleep(0.1)
    finally:
        if process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           capture_output=True, check=False)
            process.wait(timeout=10)
        assert run.resolve().parent == (ROOT / ".tmp").resolve()
        shutil.rmtree(run)
