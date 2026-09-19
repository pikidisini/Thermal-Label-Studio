# Result — B2B2C

- Status: `READY_FOR_REVIEW`
- Active writer: `Gemini Flash via Antigravity`
- Branch: `codex/b2b2c-postgresql-persistence`
- Safe checkpoint baseline: `5186c4d` (sudah dipush ke origin) + corrective commit P1 + corrective commit review (asymmetric priority & deadlock-free anti-interleaving) + corrective commit P1 batch safety (pause on delivery_unknown)

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
          AND other_b.status NOT IN ('paused', 'cancelled', 'partially_failed')
          AND (other_b.created_at, other_b.batch_id) < (b.created_at, b.batch_id)
    )
    ```
- P1 Batch Safety & Isolation on Ambiguous Delivery (`report_result`, `_reconcile_locked`, `claim_next`):
  - Saat `report_result` atau rekonsiliasi lease mengubah job `sending` menjadi `delivery_unknown`:
    - Dalam transaksi PostgreSQL yang sama, parent `print_batches.status` diubah menjadi `'paused'`.
    - Menyimpan audit event `print_batch_paused` pada `print_audit_events` dengan `reason_code = 'delivery_unknown'` dan metadata menyertakan `job_id` serta alasan kegagalan.
  - `claim_next()` mengecualikan job queued dari batch berstatus `'paused'`, `'cancelled'`, atau `'partially_failed'` (`b.status NOT IN ('paused', 'cancelled', 'partially_failed')`).
  - Batch yang di-pause tidak memblokir batch aman lainnya pada printer yang sama (`other_b.status NOT IN ('paused', 'cancelled', 'partially_failed')`).
  - Job `queued` sisa pada batch yang di-pause tidak diubah dan tidak dihapus; dipertahankan sebagai item tertahan (held items) agar nantinya hanya dapat dilanjutkan melalui aksi operator resume yang terotorisasi.
- Acceptance Criteria 1 (Atomic ingestion & idempotency): Terverifikasi melalui `test_postgres_atomic_ingestion_and_idempotency`.
- Acceptance Criteria 2 (Concurrent claim & fencing token): Terverifikasi melalui `test_postgres_repository_atomic_lifecycle_and_concurrent_claim`.
- Acceptance Criteria 3 (Lifecycle, lease expiry, callback, outbox): Terverifikasi melalui state machine transition, lease expiration reconciliation, transactional outbox deduplication, dan immutable audit trail.
- Acceptance Criteria 4 (Durable artifact verification): Terverifikasi melalui SHA-256 checksum, byte length, immutability, dan sidecar metadata persistence.
- Acceptance Criteria 5 (Restart proses tidak menghilangkan state): Terverifikasi melalui `test_postgres_process_restart_preserves_persisted_state`.
- Acceptance Criteria 6 (Test suite & quality gate): Seluruh backend unit test, targeted regression, dan PostgreSQL integration test lulus 100%.

## Verifikasi aktual

- `PASS`: test repository PostgreSQL disposable `6 passed` (`test_postgres_repository_atomic_lifecycle_and_concurrent_claim`, `test_postgres_atomic_ingestion_and_idempotency`, `test_postgres_process_restart_preserves_persisted_state`, `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`, `test_postgres_asymmetric_batch_priority_and_deadlock_freedom`, `test_postgres_batch_safety_pause_on_delivery_unknown_and_isolation`) pada container `postgres:15-bullseye` (`127.0.0.1:55432/thermal_label_test`).
- `PASS`: targeted backend regression `127 passed` (`test_print_agent_api.py`, `test_local_print_agent.py`, `test_print_job_v1.py`).
- `PASS`: full backend suite `175 passed, 0 skipped`.
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
