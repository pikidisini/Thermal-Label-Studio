"""Explicit fixture runtime serving and dependency-presence readiness."""

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings


def runtime_ready(settings: Settings) -> bool:
    """Presence only; successful rendering and external services are not implied."""
    if not settings.renderer_path.is_file() or not settings.fixture_font_path.is_file():
        return False
    directory = settings.frontend_dist
    return directory is None or (
        (directory / "index.html").is_file() and (directory / "assets").is_dir()
    )


def configure_fixture_serving(app: FastAPI, settings: Settings) -> None:
    """Serve the local Phase 7 Studio and its explicit fixture diagnostic route."""
    directory = settings.frontend_dist
    if directory is None:
        return
    if not runtime_ready(settings):
        raise ValueError("Fixture runtime dependencies are unavailable.")
    app.mount("/assets", StaticFiles(directory=directory / "assets", follow_symlink=False), name="fixture-assets")

    @app.get("/", include_in_schema=False)
    def fixture_home():
        return RedirectResponse("/studio", status_code=307)

    @app.get("/studio", include_in_schema=False)
    def studio_page():
        return FileResponse(directory / "index.html", media_type="text/html")

    @app.get("/fixture-simulation", include_in_schema=False)
    def fixture_page():
        return FileResponse(directory / "index.html", media_type="text/html")


def readiness_response(settings: Settings) -> JSONResponse:
    ready = runtime_ready(settings)
    return JSONResponse(status_code=200 if ready else 503, content={"status": "ready" if ready else "not_ready"})
