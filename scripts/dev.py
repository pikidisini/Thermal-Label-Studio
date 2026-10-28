"""Run the same application with Vite HMR and Uvicorn reload on loopback."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
PERSISTENCE_KEYS = (
    "TLS_DATABASE_URL", "TLS_MINIO_ENDPOINT", "TLS_MINIO_ACCESS_KEY",
    "TLS_MINIO_SECRET_KEY", "TLS_MINIO_BUCKET",
)
_WINDOWS_JOB_HANDLE = None


def protect_windows_process_tree() -> None:
    """Keep every dev descendant tied to the launcher's lifetime, even on a crash.

    The unnamed, non-inheritable job handle stays open until this process exits.
    Windows then closes it and kills remaining descendants. Do not close it
    manually: the launcher itself is a member. Attach before spawning children
    so a reload worker cannot escape during an assignment race.
    """
    global _WINDOWS_JOB_HANDLE
    if os.name != "nt" or _WINDOWS_JOB_HANDLE is not None:
        return
    import ctypes
    from ctypes import wintypes

    class BasicLimits(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint64) for name in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("BasicLimitInformation", BasicLimits), ("IoInfo", IoCounters),
                    ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes.c_size_t),
                    ("PeakJobMemoryUsed", ctypes.c_size_t)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int,
                                               ctypes.c_void_p, wintypes.DWORD]
    kernel.SetInformationJobObject.restype = wintypes.BOOL
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel.GetCurrentProcess.argtypes = []
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateJobObjectW(None, None)
    if not handle:
        raise OSError("Cannot create Windows development process group.")
    limits = ExtendedLimits()
    limits.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
    if not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
        kernel.CloseHandle(handle)
        raise OSError("Cannot configure Windows development process cleanup.")
    if not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        kernel.CloseHandle(handle)
        raise OSError("Cannot attach launcher to Windows development process group.")
    _WINDOWS_JOB_HANDLE = handle


def compose_storage_environment(config: dict) -> dict[str, str]:
    """Translate only verified loopback published storage ports to host settings."""
    services = config["services"]

    def port(service: str, target: int) -> str:
        matches = [entry for entry in services[service]["ports"]
                   if int(entry["target"]) == target and entry.get("host_ip") == "127.0.0.1"]
        if len(matches) != 1:
            raise ValueError("Storage requires exactly one loopback published port.")
        return str(int(matches[0]["published"]))

    values = services["app"]["environment"]
    database = urlsplit(values["TLS_DATABASE_URL"])
    if database.hostname != "postgres" or "@" not in database.netloc:
        raise ValueError("Expected the standard Compose PostgreSQL service.")
    credentials = database.netloc.rsplit("@", 1)[0]
    database_url = urlunsplit(database._replace(
        netloc=credentials + "@127.0.0.1:" + port("postgres", 5432)))
    result = {key: str(values[key]) for key in PERSISTENCE_KEYS}
    result["TLS_DATABASE_URL"] = database_url
    result["TLS_MINIO_ENDPOINT"] = "127.0.0.1:" + port("minio", 9000)
    result["TLS_MINIO_SECURE"] = str(values.get("TLS_MINIO_SECURE", "false"))
    # Carry an explicitly configured Compose target; an empty host stays disabled.
    for key in ("TLS_AUTH_ORIGINS", "TLS_AUTH_LOCAL_HTTP", "TLS_AUTH_TRUSTED_LAN_HTTP", "TLS_TRUSTED_PROXY_IPS", "TLS_PRINTER_HOST", "TLS_PRINTER_PORT", "TLS_MANAGEMENT_ENABLED", "TLS_MANAGEMENT_KEY_ENCRYPTION", "TLS_ACTIVITY_ENABLED", "TLS_SAP_RFC_ENABLED", "TLS_SAP_RFC_PYTHON", "TLS_SAP_RFC_TARGETS", "TLS_SAP_RFC_FUNCTIONS"):
        if key in values:
            result[key] = str(values[key])
    return result


def load_compose_storage() -> dict[str, str]:
    running = subprocess.run(["docker", "compose", "ps", "--status", "running", "--services"],
                             cwd=ROOT, capture_output=True, text=True, check=False)
    if running.returncode:
        raise ValueError("Cannot inspect the existing Compose services.")
    services = set(running.stdout.split())
    if "app" in services:
        raise ValueError("Stop the Compose app before sharing its storage with development.")
    if not {"postgres", "minio"}.issubset(services):
        raise ValueError("The authorized existing PostgreSQL and MinIO services must be running.")
    result = subprocess.run(["docker", "compose", "config", "--format", "json"],
                            cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError("Cannot resolve Compose settings; check local .env and Docker CLI.")
    try:
        return compose_storage_environment(json.loads(result.stdout))
    except (KeyError, ValueError, TypeError):
        raise ValueError("Compose storage configuration is invalid for local development.") from None


def prepare_environment(persistence: bool, storage: dict[str, str] | None = None) -> dict[str, str]:
    environment = dict(os.environ)
    if storage is not None:
        environment.update(storage)
    if persistence and not all(environment.get(key) for key in PERSISTENCE_KEYS):
        raise ValueError("Set all TLS persistence variables before using --persistence.")
    if not persistence:
        for key in (*PERSISTENCE_KEYS, "TLS_MINIO_SECURE"):
            environment.pop(key, None)
    environment.pop("TLS_FRONTEND_DIST", None)
    environment["PYTHONPATH"] = str(ROOT / "backend")
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["TLS_BIND_HOST"] = "127.0.0.1"
    renderer = ROOT / "engine/bin/resvg.exe"
    if "TLS_RENDERER_PATH" not in environment and renderer.is_file():
        environment["TLS_RENDERER_PATH"] = str(renderer)
    return environment


def powershell_json(script: str, environment: dict | None = None) -> object:
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True, text=True, timeout=15, env=environment, check=False)
    if result.returncode:
        raise ValueError("Windows process inspection failed; no process was stopped.")
    return json.loads(result.stdout.strip() or "null")


def port_owner(port: int) -> dict | None:
    if os.name != "nt":
        return None
    try:
        return powershell_json(
            f"$entries=@(Get-NetTCPConnection -State Listen -LocalPort {int(port)} -ErrorAction SilentlyContinue); "
            "$ids=@($entries.OwningProcess | Select-Object -Unique); "
            "if($ids.Count -eq 1) { $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[0]); "
            "if($p) { [pscustomobject]@{pid=$p.ProcessId; name=$p.Name; "
            "command=$p.CommandLine; created=$p.CreationDate.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress } }")
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return None


def is_project_server(owner: dict) -> bool:
    command = str(owner.get("command", "")).replace("/", "\\").replace('"', '').lower()
    backend = str(ROOT / "backend/app").replace("/", "\\").lower()
    vite = str(ROOT / "frontend/node_modules/vite/bin/vite.js").replace("/", "\\").lower()
    name = str(owner.get("name", "")).lower()
    return ((name in {"python.exe", "pythonw.exe"} and
             "-m uvicorn app.main:app " in command and
             (f"--reload-dir {backend} " in command or command.endswith(f"--reload-dir {backend}")))
            or (name == "node.exe" and (f" {vite} " in command or command.endswith(f" {vite}"))))


def stop_verified_owner(owner: dict) -> None:
    # Revalidate identity immediately before termination, including creation time
    # to reject PID reuse. Pass expected command privately, never print it.
    if not is_project_server(owner):
        raise ValueError("Port owner is not a verified project server; no process stopped.")
    environment = dict(os.environ)
    environment.update(DEV_EXPECTED_COMMAND=owner["command"], DEV_EXPECTED_CREATED=owner["created"])
    stopped = powershell_json(
        f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(owner['pid'])}'; "
        "if(!$p -or $p.CommandLine -cne $env:DEV_EXPECTED_COMMAND -or "
        "$p.CreationDate.ToUniversalTime().Ticks.ToString() -ne $env:DEV_EXPECTED_CREATED) { exit 1 }; "
        "& taskkill.exe /PID $p.ProcessId /T /F | Out-Null; "
        "if($LASTEXITCODE -ne 0) { exit 1 }; 'true'", environment)
    if stopped is not True:
        raise ValueError("Process identity changed or termination failed; startup cancelled.")


def resolve_port_conflict(port: int, interactive: bool) -> bool:
    owner = port_owner(port)
    if not owner:
        print(f"Port {port}: owner unavailable or no listener found. No process will be stopped.")
        return False
    project = is_project_server(owner)
    print(f"Port {port} is occupied. PID: {owner['pid']}; process: {owner['name']}; "
          f"owner: {'this project development server' if project else 'other/unverified application'}.")
    if not project or not interactive or not sys.stdin.isatty():
        return False
    try:
        answer = input("Stop this project server and its child processes, then continue startup? [y/N]: ")
    except (EOFError, KeyboardInterrupt):
        return False
    if answer.strip().lower() not in {"y", "yes"}:
        return False
    stop_verified_owner(owner)
    return True


def wait_for_port(port: int, timeout: float) -> bool:
    """Retry with fresh sockets while the previous launcher's children exit."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.2)


def show_port_summary() -> None:
    """Show both services before any conflict can prompt or cancel startup."""
    print("Checking development ports...", flush=True)
    for label, port in (("Backend", 8000), ("Frontend", 5173)):
        if wait_for_port(port, 0):
            print(f"{label}: {port} - available", flush=True)
            continue
        owner = port_owner(port)
        if owner:
            description = ('this project development server' if is_project_server(owner)
                           else 'other/unverified application')
            print(f"{label}: {port} - occupied; PID: {owner['pid']}; "
                  f"process: {owner['name']}; owner: {description}", flush=True)
        else:
            print(f"{label}: {port} - unavailable; owner could not be identified", flush=True)


def check_prerequisites(interactive: bool = False) -> str:
    node = shutil.which("node")
    if not node or not (ROOT / "frontend/node_modules/vite/bin/vite.js").is_file():
        raise ValueError("Install frontend dependencies with npm ci in frontend first.")
    for module in ("uvicorn", "fastapi"):
        if importlib.util.find_spec(module) is None:
            raise ValueError("Install Python dependencies from root requirements.txt first.")
    show_port_summary()
    stopped_server = False
    for port in (8000, 5173):
        if wait_for_port(port, 10 if stopped_server else 0):
            continue
        if resolve_port_conflict(port, interactive):
            stopped_server = True
            if not wait_for_port(port, 10):
                raise ValueError(f"Port {port} is still unavailable after stopping the server.")
            continue
        # Inspection itself can overlap a listener disappearing. Recheck before
        # failing, without granting permission to stop any additional process.
        if wait_for_port(port, 2):
            continue
        raise ValueError(
            f"Cannot bind development port {port}. An existing server may still be running; "
            "stop that project's server before restarting scripts/dev.py."
        )
    return node


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        import signal
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--persistence", action="store_true",
                        help="Use explicitly configured storage; startup can initialize schema/bucket.")
    modes.add_argument("--compose-storage", action="store_true",
                        help="Use authorized existing Compose storage via loopback ports (default).")
    modes.add_argument("--no-storage", action="store_true",
                        help="Explicitly disable persistence; Save/Open returns 503.")
    parser.add_argument("--check", action="store_true", help="Check prerequisites without starting servers.")
    args = parser.parse_args(argv)
    args.compose_storage = not (args.persistence or args.no_storage)
    return args


def main() -> int:
    args = parse_arguments()
    try:
        persistence = args.persistence or args.compose_storage
        storage = load_compose_storage() if args.compose_storage else None
        environment = prepare_environment(persistence, storage)
        node = check_prerequisites(interactive=not args.check)
    except (ValueError, OSError) as error:
        print(f"Development startup blocked: {error}", file=sys.stderr)
        return 1
    if args.check:
        print("Development prerequisites OK; no servers started.")
        return 0
    try:
        protect_windows_process_tree()
    except OSError as error:
        print(f"Development startup blocked: {error}", file=sys.stderr)
        return 1
    process_options = {"start_new_session": os.name != "nt"}
    if os.name == "nt":
        # Only the launcher receives terminal Ctrl+C. It owns ordered cleanup.
        process_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    processes = []
    try:
        processes.append(subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
             "--port", "8000", "--reload", "--reload-dir", str(ROOT / "backend/app"),
             "--no-access-log", "--no-proxy-headers", "--no-server-header"],
            cwd=ROOT, env=environment, **process_options))
        processes.append(subprocess.Popen(
            [node, str(ROOT / "frontend/node_modules/vite/bin/vite.js")],
            cwd=ROOT / "frontend", env=environment,
            **process_options))
        print("Studio: http://127.0.0.1:5173/studio | API: http://127.0.0.1:8000", flush=True)
        print("Ctrl+C stops both servers. Persistence: " + ("enabled" if persistence else "disabled"), flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
        return next((process.returncode for process in processes if process.returncode), 1)
    except KeyboardInterrupt:
        return 0
    finally:
        for process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    sys.exit(main())
