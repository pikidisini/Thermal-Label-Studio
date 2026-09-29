# F3.5 / A03 — hasil increment

Status: **PARTIAL / READY FOR REVIEW**

Implementasi A03 membatasi pekerjaan render simulasi pada satu semaphore per proses, default `SIMULATION_MAX_CONCURRENCY=1` (sengaja dikunci satu sampai unique claim durable tersedia). Pemrosesan sinkron rasterizer, file I/O, dan PDF dipindahkan ke worker thread melalui `asyncio.to_thread`, sehingga event loop API tetap dapat melayani pekerjaan ringan saat render berjalan. Batas semaphore menjaga pekerjaan berat tetap bounded dalam satu proses.

Status/query tidak dikunci selama seluruh render, sehingga endpoint tetap dapat merespons saat worker raster/PDF sedang berjalan. Worker merender deep-copy record dan mempublikasikan cache terminal setelah persistensi; status in-progress tetap berasal dari snapshot terakhir. Unique claim untuk mencegah dua worker memproses batch yang sama, serta publication lintas proses, tetap harus diselesaikan bersama durable worker repository sebelum multi-worker dipakai.

Perubahan berada di `backend/app/config.py` dan `backend/app/services/sap_shadow_service.py`; tes fokus berada di `backend/tests/test_a03_simulation_capacity.py`. Jalur submit canonical/raw dan startup recovery tetap memakai `process_batch`, sehingga gate yang sama diterapkan pada semua pemanggil yang sudah ada.

Batas yang sengaja belum diklaim: semaphore hanya berlaku dalam satu proses. Filesystem atomic replace dan idempotency index belum menjadi unique constraint lintas worker. Belum ada durable queue, lease/fencing, bounded pending admission, atau rekonsiliasi crash lintas proses. `list_batches` masih memindai dan mengurutkan seluruh record sebelum limit, sehingga tetap menjadi pekerjaan lanjutan.

## Verifikasi

- PASS: targeted A03 tests, 3 passed, using `pytest -q --basetemp=<short writable path> backend/tests/test_a03_simulation_capacity.py` under elevated test permissions.
- BLOCKED initially: the default temp root could not be scanned (`WinError 5: Access is denied`); the successful run used the explicit short basetemp above.
- REQUIRED FOLLOW-UP: existing SAP simulation and raw snapshot regression should be run by reviewer after the execution-context change.
- NOT RUN: PostgreSQL concurrency, multi-process race, load test, printer, SAP, deployment.
