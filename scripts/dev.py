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


def check_prerequisites() -> str:
    node = shutil.which("node")
    if not node or not (ROOT / "frontend/node_modules/vite/bin/vite.js").is_file():
        raise ValueError("Install frontend dependencies with npm ci in frontend first.")
    for module in ("uvicorn", "fastapi"):
        if importlib.util.find_spec(module) is None:
            raise ValueError("Install Python dependencies from root requirements.txt first.")
    for port in (8000, 5173):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
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
        node = check_prerequisites()
    except (ValueError, OSError) as error:
        print(f"Development startup blocked: {error}", file=sys.stderr)
        return 1
    if args.check:
        print("Development prerequisites OK; no servers started.")
        return 0
    processes = []
    try:
        processes.append(subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
             "--port", "8000", "--reload", "--reload-dir", str(ROOT / "backend/app"),
             "--no-access-log", "--no-proxy-headers", "--no-server-header"],
            cwd=ROOT, env=environment, start_new_session=os.name != "nt"))
        processes.append(subprocess.Popen(
            [node, str(ROOT / "frontend/node_modules/vite/bin/vite.js")],
            cwd=ROOT / "frontend", env=environment,
            start_new_session=os.name != "nt"))
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
