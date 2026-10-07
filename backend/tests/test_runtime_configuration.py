import builtins
from dataclasses import replace
import json
import logging
from pathlib import Path
import socket
import subprocess

from fastapi import FastAPI
import pytest

from app.config import Settings, get_settings
from app.runtime import configure_fixture_serving, readiness_response


def test_default_settings_keep_existing_local_renderer():
    settings = get_settings({})
    assert settings.renderer_path.name == "resvg.exe"
    assert settings.renderer_path.parent.parent.name == "engine"
    assert settings.fixture_font_family == "Arial"
    assert settings.frontend_dist is None


def test_configuration_reads_only_explicit_server_values_without_effects(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Configuration attempted a filesystem/network/process effect")
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(Path, "mkdir", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    root = Path(__file__).resolve().parents[2]
    settings = get_settings({
        "TLS_RENDERER_PATH": str(root / "fixture-renderer"),
        "TLS_FIXTURE_FONT_PATH": str(root / "fixture-font.ttf"),
        "TLS_FIXTURE_FONT_FAMILY": "Liberation Sans",
        "TLS_FRONTEND_DIST": str(root / "fixture-dist"),
        "SAP_SHADOW_SIMULATION_ENABLED": "true",
        "LEGACY_DIRECT_PRINT_ENABLED": "true",
    })
    assert settings.fixture_font_family == "Liberation Sans"
    assert settings.renderer_path == root / "fixture-renderer"
    assert settings.frontend_dist == root / "fixture-dist"


@pytest.mark.parametrize("key", ["TLS_RENDERER_PATH", "TLS_FIXTURE_FONT_PATH", "TLS_FRONTEND_DIST"])
@pytest.mark.parametrize("value", ["", "relative/file", " ../private", "https://example.com/asset", "./resvg"])
def test_invalid_runtime_paths_fail_closed(key, value):
    with pytest.raises(ValueError, match="Runtime paths"):
        get_settings({key: value})


def test_absolute_parent_traversal_rejected():
    root = Path(__file__).resolve().parents[2]
    with pytest.raises(ValueError):
        get_settings({"TLS_FRONTEND_DIST": str(root / ".." / "private")})


@pytest.mark.parametrize("family", ["", "Arial;cmd", "Comic Sans", " Arial", "arial"])
def test_unapproved_fixture_font_rejected(family):
    with pytest.raises(ValueError, match="font family"):
        get_settings({"TLS_FIXTURE_FONT_FAMILY": family})


def runtime_settings():
    root = Path(__file__).resolve().parents[2]
    return Settings(renderer_path=root / "fixture-renderer", fixture_font_path=root / "fixture.ttf",
                    frontend_dist=root / "fixture-dist")


@pytest.mark.parametrize("missing", ["fixture-renderer", "fixture.ttf", "index.html", "assets"])
def test_readiness_missing_dependencies_is_safe_503(monkeypatch, missing):
    monkeypatch.setattr(Path, "is_file", lambda path: path.name != missing)
    monkeypatch.setattr(Path, "is_dir", lambda path: path.name != missing)
    response = readiness_response(runtime_settings())
    assert response.status_code == 503
    assert json.loads(response.body) == {"status": "not_ready"}
    assert "fixture" not in response.body.decode()


def test_readiness_never_renders_or_contacts_external_services(monkeypatch):
    monkeypatch.setattr(Path, "is_file", lambda path: True)
    monkeypatch.setattr(Path, "is_dir", lambda path: True)
    monkeypatch.setattr(socket, "create_connection", lambda *a, **k: pytest.fail("Network"))
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: pytest.fail("Process"))
    response = readiness_response(runtime_settings())
    assert response.status_code == 200
    assert json.loads(response.body) == {"status": "ready"}


def test_api_only_configuration_does_not_add_frontend_routes():
    app = FastAPI()
    configure_fixture_serving(app, get_settings({}))
    assert not any(route.path in {"/", "/studio", "/fixture-simulation", "/assets"} for route in app.routes)


def test_fixture_serving_has_only_explicit_page_and_static_asset_routes(monkeypatch):
    monkeypatch.setattr(Path, "is_file", lambda path: True)
    monkeypatch.setattr(Path, "is_dir", lambda path: True)
    # StaticFiles checks the directory with os.stat; inspect constructor inputs
    # through an ASGI callable fake instead of creating runtime directories.
    calls = []
    class FakeStatic:
        def __init__(self, **kwargs):
            calls.append(kwargs)
        async def __call__(self, scope, receive, send):
            raise AssertionError("Static IO is outside this direct-route test")
    monkeypatch.setattr("app.runtime.StaticFiles", FakeStatic)
    app = FastAPI()
    settings = runtime_settings()
    configure_fixture_serving(app, settings)
    routes = {route.path: route for route in app.routes}
    assert routes["/"].endpoint().headers["location"] == "/studio"
    studio = routes["/studio"].endpoint()
    assert studio.path == settings.frontend_dist / "index.html"
    page = routes["/fixture-simulation"].endpoint()
    assert page.path == settings.frontend_dist / "index.html"
    assert calls == [{"directory": settings.frontend_dist / "assets", "follow_symlink": False}]
    assert not any("path:" in path for path in routes)
    assert "/api" not in routes and "/login" not in routes


def test_configured_frontend_missing_dependencies_rejects_startup(monkeypatch):
    monkeypatch.setattr(Path, "is_file", lambda path: False)
    with pytest.raises(ValueError, match="dependencies are unavailable"):
        configure_fixture_serving(FastAPI(), runtime_settings())


def test_renderer_uses_server_configured_paths_and_font(monkeypatch):
    from io import BytesIO
    from PIL import Image
    from app.engine.raster import render_label_item
    from app.simulation.http import FIXTURE_LAYOUTS
    settings = replace(runtime_settings(), fixture_font_family="Liberation Sans")
    monkeypatch.setattr("app.engine.raster.get_settings", lambda: settings)
    monkeypatch.setattr(Path, "is_file", lambda path: True)
    png = BytesIO()
    Image.new("RGB", (640, 1600), "white").save(png, format="PNG")
    calls = []
    def render(command, **kwargs):
        calls.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, png.getvalue(), b"")
    monkeypatch.setattr(subprocess, "run", render)
    result = render_label_item("roll_80x200", {"batch": "BATCH", "material": "MATERIAL"}, FIXTURE_LAYOUTS)
    assert result.width_px == 640
    assert len(calls) == 1
    command, kwargs = calls[0]
    assert command[0] == str(settings.renderer_path)
    assert command[command.index("--use-font-file") + 1] == str(settings.fixture_font_path)
    assert command[command.index("--font-family") + 1] == "Liberation Sans"
    assert b'font-family="Liberation Sans"' in kwargs["input"]
    assert b'font-family="Arial"' not in kwargs["input"]


def test_runtime_entry_is_bounded_and_logging_is_stdout_only(monkeypatch):
    from app import run
    monkeypatch.delenv("TLS_BIND_HOST", raising=False)
    from io import StringIO
    output = StringIO()
    monkeypatch.setattr(run.sys, "stdout", output)
    logger = logging.getLogger("thermal_label_studio.events")
    monkeypatch.setattr(logger, "handlers", [])
    monkeypatch.setattr(logger, "level", logger.level)
    monkeypatch.setattr(logger, "propagate", logger.propagate)
    calls = []
    monkeypatch.setattr(run.uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    run.main()
    logger.info('{"event":"REQUEST_RECEIVED"}')
    assert output.getvalue() == '{"event":"REQUEST_RECEIVED"}\n'
    assert calls == [(('app.main:app',), {"host": "127.0.0.1", "port": 8000, "workers": 1,
                                         "access_log": False, "proxy_headers": False, "server_header": False})]


def test_fixture_image_does_not_copy_prototype_runtime_or_persistent_data():
    root = Path(__file__).resolve().parents[2]
    dockerfile = (root / "Dockerfile").read_text()
    compose = (root / "docker-compose.yml").read_text()
    copied = [line for line in dockerfile.splitlines() if line.startswith("COPY ")]
    assert all(not any(legacy in line for legacy in ["backend/data", "COPY engine/", "COPY assets/", "docs/database", "run_server.py", ".archive"]) for line in copied)
    assert 'sha256sum -c -' in dockerfile and 'ARG RESVG_SHA256' in dockerfile
    assert 'app.run' in dockerfile and '/ready' in dockerfile
    assert '127.0.0.1:${TLS_APP_PORT:-8002}:8000' in compose
    assert 'container_name:' not in compose and 'linux/amd64' in compose
    requirements = (root / "requirements.txt").read_text()
    assert 'psycopg[binary]==3.3.2' in requirements and 'minio==7.2.20' in requirements
    assert 'pytest' in requirements and 'httpx' in requirements
    assert 'pywin32' not in requirements
    assert 'COPY requirements.txt /app/requirements.txt' in dockerfile
    assert '-r /app/requirements.txt' in dockerfile
    assert not any(line.strip().startswith('-r ') for line in requirements.splitlines())


def test_runtime_container_bind_requires_explicit_configuration(monkeypatch):
    from app import run
    calls = []
    monkeypatch.setenv("TLS_BIND_HOST", "0.0.0.0")
    monkeypatch.setattr(run.uvicorn, "run", lambda *args, **kwargs: calls.append(kwargs))
    run.main()
    assert calls[0]["host"] == "0.0.0.0"
