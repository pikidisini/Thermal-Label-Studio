# Result — B2B2C

- Status: `READY_FOR_REVIEW`
- Active writer: `Gemini Flash via Antigravity`
- Branch: `codex/b2b2c-postgresql-persistence`
- Safe checkpoint baseline: `5186c4d` (sudah dipush ke origin) + corrective commit P1 + corrective commit review (asymmetric priority & deadlock-free anti-interleaving)

## Hasil implementasi

- Persistence delivery, migration runner dengan rollback support (`rollback_baseline` dan CLI `rollback`), repository PostgreSQL, artifact storage, wiring API, dan test terkait sudah selesai diimplementasikan.
- P1 Batch Ordering & Asymmetric Anti-Interleaving (`PostgresPrintAgentRepository.claim_next`):
  - Men-join `print_batches` dan `print_batch_items`.
  - Menjamin batch yang dibuat lebih dahulu diproses terlebih dahulu (`b.created_at, b.batch_id`).
  - Menjamin item dalam batch yang sama selalu berurutan `bi.item_sequence ASC` (independen dari UUID `job_id`).
  - Mengganti klausul simetris yang rawan deadlock dengan aturan prioritas asimetris (strict total order):
    ```sql
    AND NOT EXISTS (
        SELECT 1
        FROM print_jobs AS other_j
        JOIN print_batches AS other_b ON other_b.batch_id = other_j.batch_id
        WHERE other_j.printer_id = j.printer_id
          AND other_j.batch_id != j.batch_id
          AND other_j.status = 'queued'
          AND other_j.expires_at > %s
          AND (other_b.created_at, other_b.batch_id) < (b.created_at, b.batch_id)
    )
    ```
    Kandidat job `j` hanya diblokir oleh `other_j` jika `other_j` berstatus `queued` dan berasal dari batch yang lebih awal `(other_b.created_at, other_b.batch_id) < (b.created_at, b.batch_id)`. Batch yang lebih tua tidak pernah diblokir oleh batch yang lebih baru, sehingga deadlock antar-batch dicegah secara mutlak.
  - Terverifikasi melalui integration test:
    - `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`: batch 3 item dengan UUID sengaja diinversi (`ffff...`, `8888...`, `0000...`) yang diklaim terbukti berurutan 1, 2, 3 tanpa disela batch kedua.
    - `test_postgres_asymmetric_batch_priority_and_deadlock_freedom`: skenario riil di mana Batch B (aktif) dan Batch A (reprint) sama-sama memiliki riwayat `sent_to_printer`, membuktikan `claim_next()` tidak mengalami deadlock (mengembalikan Batch B item 2 terlebih dahulu hingga tuntas, baru kemudian Batch A reprint).
- Acceptance Criteria 1 (Atomic ingestion & idempotency): Terverifikasi melalui `test_postgres_atomic_ingestion_and_idempotency` (rollback atomik saat kegagalan, idempotency `(producer_namespace, request_id)` via unique constraint, single original job constraint).
- Acceptance Criteria 2 (Concurrent claim & fencing token): Terverifikasi melalui `test_postgres_repository_atomic_lifecycle_and_concurrent_claim` (2 worker concurrent, 1 pemenang, stale fencing token ditolak).
- Acceptance Criteria 3 (Lifecycle, lease expiry, callback, outbox): Terverifikasi melalui state machine transition, lease expiration reconciliation, transactional outbox deduplication, dan immutable audit trail.
- Acceptance Criteria 4 (Durable artifact verification): Terverifikasi melalui SHA-256 checksum, byte length, immutability, dan sidecar metadata persistence.
- Acceptance Criteria 5 (Restart proses tidak menghilangkan state): Terverifikasi melalui `test_postgres_process_restart_preserves_persisted_state` (menutup connection pool dan membuka instance baru pada DB & filesystem yang sama mempertahankan job, claim, artifact payload, outbox, dan audit events).
- Acceptance Criteria 6 (Test suite & quality gate): Seluruh backend unit test, targeted regression, dan PostgreSQL integration test lulus 100%.

## Verifikasi aktual

- `PASS`: test repository PostgreSQL disposable `5 passed` (`test_postgres_repository_atomic_lifecycle_and_concurrent_claim`, `test_postgres_atomic_ingestion_and_idempotency`, `test_postgres_process_restart_preserves_persisted_state`, `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`, `test_postgres_asymmetric_batch_priority_and_deadlock_freedom`) pada container `postgres:15-bullseye` (`127.0.0.1:55432/thermal_label_test`).
- `PASS`: targeted backend regression `127 passed` (`test_print_agent_api.py`, `test_local_print_agent.py`, `test_print_job_v1.py`).
- `PASS`: full backend suite `174 passed, 0 skipped`.
- `PASS`: frontend unit test `45 passed` (534ms).
- `PASS`: frontend typecheck `npx tsc --noEmit` (0 errors).
- `PASS`: Python compile check `python -m py_compile` pada seluruh file backend yang diubah.
- `PASS`: `git diff --check` (0 whitespace errors).
- `PASS`: secret scan pada seluruh file yang diubah (0 secrets/credentials).
- `NOT VERIFIED`: `npm run build` process exit code pada Windows lokal karena known assertion bug di Node v24 libuv (`src\win\async.c:94`) setelah seluruh bundle Vite selesai dikompilasi 100% (`✓ built in 8.06s`).

## Risiko atau keputusan yang dibutuhkan

- Container disposable PostgreSQL `pg-b2b2c-codex` tetap berjalan di `127.0.0.1:55432` untuk verifikasi reviewer; dapat dihentikan/dihapus kapan saja.
- Jangan merge ke `main` tanpa persetujuan pengguna dan review formal dari Codex.

## Langkah berikutnya

- Push branch `codex/b2b2c-postgresql-persistence` ke origin, lalu berhenti untuk review Codex.
