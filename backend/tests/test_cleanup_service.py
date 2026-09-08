"""
Tests for Storage TTL Cleanup Service.
"""

import os
import time
from pathlib import Path
from app.services.cleanup_service import cleanup_expired_storage


def test_cleanup_expired_storage(tmp_path: Path):
    """Verifies that expired folders are removed while recent ones are preserved."""
    # Create expired folder (mtime = 3 hours ago)
    expired_folder = tmp_path / "job_expired"
    expired_folder.mkdir()
    (expired_folder / "label.png").write_text("dummy")
    expired_time = time.time() - 10800  # 3 hours ago
    os.utime(expired_folder, (expired_time, expired_time))

    # Create fresh folder (mtime = now)
    fresh_folder = tmp_path / "job_fresh"
    fresh_folder.mkdir()
    (fresh_folder / "label.png").write_text("fresh")

    # Run cleanup with 2 hours TTL (7200 seconds)
    removed_count = cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 1
    assert not expired_folder.exists()
    assert fresh_folder.exists()
