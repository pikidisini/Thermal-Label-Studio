"""
Background Storage & Cache TTL Cleanup Service.
Periodically purges expired render job output directories to prevent disk space exhaustion.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import stat
import time
from pathlib import Path
from typing import Optional

from ..config import STORAGE_OUT_DIR

logger = logging.getLogger("label_engine.cleanup")

_EPHEMERAL_JOB_NAME = re.compile(r"^[0-9a-f]{12}$")


def _is_link_or_reparse_point(path: Path) -> bool:
    """Return whether *path* is a link or a Windows reparse point.

    ``Path.is_dir()`` follows links, so checking the entry itself is required
    before deciding whether it is safe to remove.
    """
    if path.is_symlink():
        return True

    try:
        entry_stat = os.lstat(path)
    except OSError:
        return True

    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return bool(getattr(entry_stat, "st_file_attributes", 0) & reparse_flag)


def _is_contained_path(path: Path, root: Path) -> bool:
    """Return whether a path resolves beneath the configured storage root."""
    try:
        path.resolve(strict=True).relative_to(root)
    except (OSError, RuntimeError, ValueError):
        return False
    return True


def cleanup_expired_storage(
    max_age_seconds: int = 7200,
    storage_dir: Optional[Path] = None,
) -> int:
    """
    Scans the storage directory and removes recognized ephemeral job
    subdirectories older than max_age_seconds.
    Default max_age_seconds: 7200s (2 hours).
    Returns count of removed directories.
    """
    target_dir = storage_dir or STORAGE_OUT_DIR
    # Never resolve or scan a configured storage root that is itself a link or
    # Windows reparse point; doing so could traverse outside the intended root.
    if _is_link_or_reparse_point(target_dir):
        logger.warning("Skipping link or reparse-point storage root: %s", target_dir)
        return 0
    try:
        target_root = target_dir.resolve(strict=True)
    except (OSError, RuntimeError):
        return 0
    if not target_root.is_dir():
        return 0

    now = time.time()
    deleted_count = 0

    try:
        for job_folder in target_dir.iterdir():
            if not job_folder.is_dir() or not _EPHEMERAL_JOB_NAME.fullmatch(job_folder.name):
                continue
            try:
                if _is_link_or_reparse_point(job_folder):
                    logger.warning("Skipping link or reparse point in storage cleanup: %s", job_folder)
                    continue
                if not _is_contained_path(job_folder, target_root):
                    logger.warning("Skipping storage cleanup path outside root: %s", job_folder)
                    continue

                folder_mtime = job_folder.stat().st_mtime
                if now - folder_mtime > max_age_seconds:
                    shutil.rmtree(job_folder)
                    if job_folder.exists():
                        logger.warning("Storage cleanup did not remove %s", job_folder)
                        continue
                    deleted_count += 1
                    logger.info("Cleaned expired render job directory: %s", job_folder.name)
            except Exception as e:
                logger.warning(f"Failed to inspect or delete {job_folder}: {e}")
    except Exception as e:
        logger.error(f"Error during storage cleanup scan: {e}")

    return deleted_count


async def storage_cleanup_worker(
    interval_seconds: int = 1800,
    max_age_seconds: int = 7200,
) -> None:
    """
    Asynchronous loop that periodically executes cleanup_expired_storage.
    Default: checks every 30 minutes (1800s), purges directories older than 2 hours (7200s).
    """
    logger.info("Storage TTL cleanup worker started.")
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            deleted = cleanup_expired_storage(max_age_seconds=max_age_seconds)
            if deleted > 0:
                logger.info(f"Purged {deleted} expired render job directories.")
        except asyncio.CancelledError:
            logger.info("Storage cleanup worker received cancellation signal.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in storage cleanup loop: {e}")
            await asyncio.sleep(60)
