# Review — B2B2C

- Reviewer: `Antigravity (pengambilalihan peran GPT Sol/Terra High)`
- Verdict: `CHANGES_REQUESTED`

## Temuan

1. **Urutan Item & Batch FIFO**:
   - `ORDER BY b.created_at, b.batch_id, bi.item_sequence, j.created_at, j.job_id` berhasil memecahkan masalah pengacakan urutan item berbasis UUID acak. Item dalam batch yang sama terbukti diproses sesuai urutan `item_sequence ASC` (1, 2, 3).
2. **Kritis: Mutual Exclusion Deadlock pada Anti-Interleaving (`claim_next`)**:
   - Klausul `NOT EXISTS` pada query `claim_next` mengecualikan kandidat batch jika terdapat batch lain pada printer yang sama yang sudah pernah dimulai (`started_j` dengan status `claimed`, `sending`, `sent_to_printer`, `failed`, `delivery_unknown`) dan masih memiliki item `queued`.
   - Karena predikat ini bersifat **simetris** (`other_j.batch_id != j.batch_id`), jika terdapat lebih dari satu batch yang keduanya memiliki riwayat `started_j` sekaligus memiliki item `queued` (misalnya skenario *reprint* untuk batch sebelumnya saat batch aktif sedang berjalan, atau requeue item pada batch gagal), kedua batch tersebut akan saling mendiskualifikasi satu sama lain.
   - **Dampak aktual**: `claim_next()` mengembalikan `None`. Printer mengalami stall/deadlock total dan tidak dapat memproses antrean cetak yang valid sampai salah satu batch kedaluwarsa (`expires_at`).
   - Telah dibuktikan dan diverifikasi secara empiris melalui skrip pengujian replikasi deadlock.

## Verifikasi reviewer

- `PASS`: 4 integration test PostgreSQL disposable (`test_postgres_repository_atomic_lifecycle_and_concurrent_claim`, `test_postgres_atomic_ingestion_and_idempotency`, `test_postgres_process_restart_preserves_persisted_state`, `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`) pada `postgres:15-bullseye` (port 55432).
- `PASS`: 127 targeted backend regression test (`test_print_agent_api.py`, `test_local_print_agent.py`, `test_print_job_v1.py`).
- `VERIFIED FLAW`: Pengujian skenario concurrent reprint/started batches menghasilkan `CLAIMED RESULT: None` (deadlock antrean).

## Risiko tersisa

- Tanpa perbaikan predikat anti-interleaving menjadi *asymmetric precedence / strict total order*, operasi produksi yang melibatkan fitur *reprint* atau requeue akan memicu penghentian pemrosesan antrean printer.
- Belum ada index komposit pada `print_jobs (printer_id, batch_id, status)` untuk mengoptimasi correlated subquery `started_j` pada volume data historis besar.

## Langkah berikutnya

- Jangan merge ke `main`.
- Revisi logika anti-interleaving pada `PostgresPrintAgentRepository.claim_next`:
  - Ubah predikat diskualifikasi menjadi asimetris (misalnya hanya batch dengan prioritas lebih rendah yang didiskualifikasi oleh batch dengan prioritas lebih tinggi), atau
  - Andalkan ranking order deterministik `ORDER BY` dengan predikat filter satu arah agar antrean tertua yang telah dimulai dapat dituntaskan tanpa memicu saling kunci (*mutual lock*).
- Tambahkan regression test khusus skenario concurrent reprint/multi-started batches ke dalam test suite integration.
