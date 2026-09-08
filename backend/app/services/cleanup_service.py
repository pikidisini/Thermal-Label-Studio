"""
Background Storage & Cache TTL Cleanup Service.
Periodically purges expired render job output directories to prevent disk space exhaustion.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
from pathlib import Path
from typing import Optional

from ..config import STORAGE_OUT_DIR

logger = logging.getLogger("label_engine.cleanup")


def cleanup_expired_storage(
    max_age_seconds: int = 7200,
    storage_dir: Optional[Path] = None,
) -> int:
    """
    Scans the storage directory and removes job subdirectories older than max_age_seconds.
    Default max_age_seconds: 7200s (2 hours).
    Returns count of removed directories.
    """
    target_dir = storage_dir or STORAGE_OUT_DIR
    if not target_dir.exists():
        return 0

    now = time.time()
    deleted_count = 0

    try:
        for job_folder in target_dir.iterdir():
            if job_folder.is_dir():
                try:
                    folder_mtime = job_folder.stat().st_mtime
                    if now - folder_mtime > max_age_seconds:
                        shutil.rmtree(job_folder, ignore_errors=True)
                        deleted_count += 1
                        logger.info(f"Cleaned expired render job directory: {job_folder.name}")
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
