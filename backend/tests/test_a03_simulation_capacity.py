"""A03 bounded single-process simulation execution checks."""
import asyncio
from pathlib import Path
import threading
from app.services.sap_shadow_service import SapShadowService

def test_process_batch_uses_bounded_render_gate(tmp_path: Path):
    async def run():
        service = SapShadowService(storage_base_dir=tmp_path / "simulation")
        service._render_slots = asyncio.Semaphore(1)
        active = peak = 0
        entered, release = threading.Event(), threading.Event()
        def stub(_batch_id: str) -> None:
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            entered.set()
            release.wait(timeout=2)
            active -= 1
        service._process_batch_blocking = stub  # type: ignore[method-assign]
        first = asyncio.create_task(service.process_batch("one"))
        second = None
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            second = asyncio.create_task(service.process_batch("two"))
            await asyncio.sleep(0.05)
            assert peak == 1
            assert not second.done()
        finally:
            release.set()
            if second is not None:
                await asyncio.gather(first, second)
            else:
                await first
        assert peak == 1
    asyncio.run(run())

def test_process_batch_keeps_event_loop_responsive_while_blocking_work_runs(tmp_path: Path):
    async def run():
        service = SapShadowService(storage_base_dir=tmp_path / "simulation")
        started, release = threading.Event(), threading.Event()
        def stub(_batch_id: str) -> None:
            started.set()
            release.wait(timeout=2)
        service._process_batch_blocking = stub  # type: ignore[method-assign]
        task = asyncio.create_task(service.process_batch("one"))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            marker = asyncio.Event()
            asyncio.get_running_loop().call_soon(marker.set)
            await asyncio.wait_for(marker.wait(), timeout=0.5)
        finally:
            release.set()
            await task
    asyncio.run(run())

def test_status_query_remains_prompt_while_render_worker_is_blocked(tmp_path: Path):
    async def run():
        service = SapShadowService(storage_base_dir=tmp_path / "simulation")
        service._batches["one"] = {"batch_id": "one", "status": "processing"}
        started, release = threading.Event(), threading.Event()
        def stub(_batch_id: str) -> None:
            started.set()
            release.wait(timeout=2)
        service._process_batch_blocking = stub  # type: ignore[method-assign]
        task = asyncio.create_task(service.process_batch("one"))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            status = await asyncio.wait_for(asyncio.to_thread(service.get_batch, "one"), timeout=0.5)
            assert status == {"batch_id": "one", "status": "processing"}
        finally:
            release.set()
            await task
    asyncio.run(run())
