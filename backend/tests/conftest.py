import os
from pathlib import Path

import pytest


def test_font_path() -> Path:
    """Return the platform font selected for native rendering tests."""
    configured = os.environ.get("TLS_FIXTURE_FONT_PATH") or os.environ.get("CI_FONT_PATH")
    if configured:
        return Path(configured)
    candidates = (
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
    )
    return next((path for path in candidates if path.is_file()), candidates[0])


def test_renderer_path() -> Path:
    """Return the platform renderer selected for native rendering tests."""
    configured = os.environ.get("TLS_RENDERER_PATH") or os.environ.get("CI_RENDERER_PATH")
    if configured:
        return Path(configured).resolve()
    candidates = (Path("engine/bin/resvg.exe"), Path("/usr/local/bin/resvg"))
    return next((path.resolve() for path in candidates if path.is_file()), candidates[0].resolve())


@pytest.fixture
def real_renderer_settings(monkeypatch):
    """Select the real renderer only for raster-output regressions.

    Windows retains the repository's default renderer/font. Linux CI must pass
    both explicit paths, so these tests exercise a real native Linux renderer
    without changing configuration tests that assert Windows defaults.
    """
    from app.config import Settings
    from app.engine import raster

    renderer = os.environ.get("CI_RENDERER_PATH")
    font = os.environ.get("CI_FONT_PATH")
    if renderer or font:
        if not renderer or not font:
            pytest.fail("CI_RENDERER_PATH and CI_FONT_PATH must be supplied together.")
        settings = Settings(renderer_path=Path(renderer), fixture_font_path=Path(font), fixture_font_family="Liberation Sans")
        monkeypatch.setattr(raster, "get_settings", lambda: settings)
        return settings
    return raster.get_settings()


@pytest.fixture(autouse=True)
def feature_test_auth_environment(request, monkeypatch):
    """Feature tests explicitly use synthetic authenticated clients; auth tests set their own policy."""
    from .auth_test_support import reset_feature_clients
    reset_feature_clients()
    if request.module.__name__.endswith('test_auth'):
        return
    monkeypatch.setenv('TLS_AUTH_ORIGINS', 'http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8000,http://127.0.0.1:8002')
    monkeypatch.setenv('TLS_AUTH_LOCAL_HTTP', 'true')
    # These feature tests run the real text binder even when raster output is
    # synthetic. Select the explicit Linux CI font for binding as well; the
    # native renderer fixture only patches the raster module's settings.
    # Keep configuration/default-path tests outside this feature-only scope.
    if (os.environ.get('CI_FONT_PATH') and request.module.__name__.rsplit('.', 1)[-1] in {
        'test_dataset_edit_preview', 'test_label_print', 'test_label_print_activity',
        'test_label_print_package', 'test_label_print_sap',
    }):
        monkeypatch.setenv('TLS_FIXTURE_FONT_PATH', str(test_font_path()))
        monkeypatch.setenv('TLS_FIXTURE_FONT_FAMILY', 'Liberation Sans')
