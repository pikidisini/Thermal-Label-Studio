"""
Tests for Storage TTL Cleanup Service.
"""

import os
import stat
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import cleanup_service


def test_cleanup_expired_storage(tmp_path: Path):
    """Verifies that expired folders are removed while recent ones are preserved."""
    # Create expired folder (mtime = 3 hours ago)
    expired_folder = tmp_path / "abcdef123456"
    expired_folder.mkdir()
    (expired_folder / "label.png").write_text("dummy")
    expired_time = time.time() - 10800  # 3 hours ago
    os.utime(expired_folder, (expired_time, expired_time))

    # Create fresh folder (mtime = now)
    fresh_folder = tmp_path / "fedcba654321"
    fresh_folder.mkdir()
    (fresh_folder / "label.png").write_text("fresh")

    # Run cleanup with 2 hours TTL (7200 seconds)
    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 1
    assert not expired_folder.exists()
    assert fresh_folder.exists()


def test_cleanup_preserves_durable_and_unknown_directories(tmp_path: Path):
    """Only recognized ephemeral jobs are eligible for TTL cleanup."""
    expired_time = time.time() - 10800
    preserved = (
        "simulation_batches",
        "simulation_artifacts",
        "simulation_idempotency",
        "unknown-directory",
    )
    for name in preserved:
        folder = tmp_path / name
        folder.mkdir()
        (folder / "record.json").write_text("durable")
        os.utime(folder, (expired_time, expired_time))

    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 0
    assert all((tmp_path / name).exists() for name in preserved)


def test_cleanup_skips_symlink_to_directory_outside_root(tmp_path: Path):
    """A recognized-name symlink must not make cleanup delete its target."""
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir()
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    (external_dir / "keep.txt").write_text("keep")
    link = storage_dir / "abcdef123456"
    try:
        link.symlink_to(external_dir, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"directory symlink unavailable on this platform: {exc}")

    old = time.time() - 10800
    os.utime(external_dir, (old, old))
    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=storage_dir)

    assert removed_count == 0
    assert link.is_symlink()
    assert external_dir.exists()
    assert (external_dir / "keep.txt").exists()


def test_cleanup_skips_reparse_point_guard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """The link/reparse guard protects the job even when a platform cannot create links."""
    expired_folder = tmp_path / "abcdef123456"
    expired_folder.mkdir()
    old = time.time() - 10800
    os.utime(expired_folder, (old, old))

    original_lstat = cleanup_service.os.lstat

    def fake_lstat(path: Path):
        if Path(path) == expired_folder:
            return SimpleNamespace(
                st_mode=stat.S_IFDIR,
                st_file_attributes=getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400),
            )
        return original_lstat(path)

    monkeypatch.setattr(cleanup_service.os, "lstat", fake_lstat)

    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 0
    assert expired_folder.exists()


def test_cleanup_skips_path_outside_resolved_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """A containment failure keeps an otherwise eligible job untouched."""
    expired_folder = tmp_path / "abcdef123456"
    expired_folder.mkdir()
    old = time.time() - 10800
    os.utime(expired_folder, (old, old))
    outside_root = tmp_path.parent / f"{tmp_path.name}-outside"
    outside_root.mkdir()
    original_resolve = Path.resolve

    def resolve_outside(path: Path, *args, **kwargs) -> Path:
        if path == expired_folder:
            return outside_root
        return original_resolve(path, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", resolve_outside)

    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 0
    assert expired_folder.exists()


def test_cleanup_does_not_count_failed_rmtree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """A failed deletion is not reported as a successful cleanup."""
    expired_folder = tmp_path / "abcdef123456"
    expired_folder.mkdir()
    old = time.time() - 10800
    os.utime(expired_folder, (old, old))

    def fail_rmtree(_path: Path) -> None:
        raise OSError("simulated deletion failure")

    monkeypatch.setattr(cleanup_service.shutil, "rmtree", fail_rmtree)

    removed_count = cleanup_service.cleanup_expired_storage(max_age_seconds=7200, storage_dir=tmp_path)

    assert removed_count == 0
    assert expired_folder.exists()
