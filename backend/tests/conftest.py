import os
from pathlib import Path

import pytest


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
