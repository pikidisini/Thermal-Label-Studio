# AI Handoff — Thermal Label Studio

Gunakan dokumen ini untuk memulihkan konteks ketika melanjutkan pekerjaan dari laptop, task, atau sesi AI lain.

## Snapshot sesi saat ini

- Tanggal: 2026-09-19
- Repository: `Thermal-Label-Studio`
- Remote baseline fase: `origin/main` pada `e40f95c` (`e40f95c567acad5717ebe256a5987e9db9e5485c`)
- Branch aktif: `codex/b2b2c-postgresql-persistence`
- Status B2B2C: implementasi selesai dan terverifikasi pada PostgreSQL disposable; siap untuk review Codex; belum merge ke main.
- Provider/model/perangkat sesi: Gemini 3.8 Flash (High) via Antigravity pada Windows lokal.
- Writer branch: Gemini Flash via Antigravity sebagai satu-satunya writer aktif; berhenti untuk review Codex.
- Batas keras: tidak ada database production, credential perusahaan, printer fisik, TCP 9100, atau Windows Spooler.
- Target berhenti: Pull Request siap direview, tepat sebelum merge ke `main`.
- Workflow: `docs/AI_WORKFLOW.md`; contract/result/review B2B2C berada di `docs/tasks/B2B2C/`.

## Safe checkpoint B2B2C

- Baseline commit: `5186c4d` (`feat: complete b2b2c postgresql persistence acceptance criteria`), sudah dipush ke `origin/codex/b2b2c-postgresql-persistence`.
- Corrective commit review: asymmetric batch priority & deadlock-free anti-interleaving pada `claim_next()`.
- Status: safe checkpoint kandidat review; **bukan** kesiapan merge atau production-ready.
- Quality gate aktual:
  - Backend: `174 passed, 0 skipped`.
  - PostgreSQL disposable integration: `5 passed` pada container `postgres:15-bullseye` (`test_postgres_repository_atomic_lifecycle_and_concurrent_claim`, `test_postgres_atomic_ingestion_and_idempotency`, `test_postgres_process_restart_preserves_persisted_state`, `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`, `test_postgres_asymmetric_batch_priority_and_deadlock_freedom`).
  - Targeted regression: `127 passed`.
  - Frontend unit test: `45 passed` (534ms).
  - Frontend typecheck: `npx tsc --noEmit` lulus (0 errors).
  - Python compile check: `python -m py_compile` lulus.
  - Whitespace check: `git diff --check` lulus (0 whitespace errors).
  - Secret scan: lulus (0 credentials).
  - Build frontend: `npm run build` berhasil mengompilasi 100% bundle Vite (`✓ built in 8.06s`); exit code 1 pada Windows karena bug assertion libuv Node v24 (`src\win\async.c:94`).
- Review independen: Menunggu Codex Sol High / Terra.
- Batas keras tetap berlaku: tidak ada database production, credential perusahaan, printer fisik, TCP 9100, atau Windows Spooler.

Perubahan aktif pada corrective commit ini:

- `backend/app/print_jobs/postgres_repository.py` (enforce asymmetric total order `(other_b.created_at, other_b.batch_id) < (b.created_at, b.batch_id)` in `claim_next()` preventing deadlock while preserving anti-interleaving)
- `backend/tests/test_postgres_print_agent_repository.py` (add `test_postgres_asymmetric_batch_priority_and_deadlock_freedom` proving active batch finishes before reprint without mutual blocking)
- `docs/tasks/B2B2C/RESULT.md` (updated with asymmetric priority and deadlock-free verification)
- `docs/AI_HANDOFF.md` (handoff snapshot updated)

## Handoff Pre-Checkpoint B2B1.4–B2B2B.2.4

Tanggal verifikasi: 2026-09-18
Provider AI/perangkat: Codex Desktop pada Windows lokal
Repository aktif: `web_app/` (`Thermal-Label-Studio`)
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (`38a0de2`), ahead 1 terhadap `origin/main`
Branch/status: `main`; working tree dirty, seluruh perubahan pengguna dipertahankan.

Scope review: perubahan B2B1.4 sampai B2B2B.2.4. Review dihentikan sebelum B2B2C. Tidak ada commit, push, reset, checkout, clean, printer fisik, TCP port 9100, Windows Spooler, Docker, atau PostgreSQL execution.

Temuan focused review:
- Pencarian repository menemukan tidak ada caller `allow_attempt_increment`; hanya definisi compatibility parameter yang ditemukan di `runner.py`.
- Compatibility parameter `allow_attempt_increment: bool | None = None` dihapus.
- `require_attempt_increment` dipertahankan. Semantik recovery tidak diubah: callback recovery yang valid wajib menghasilkan `claimed attempt_count + 1`; unchanged atau increment lebih dari satu menjadi `UNCERTAIN`.
- Test recovery memverifikasi callback satu kali, `begin_delivery` satu kali, transport tidak dipanggil pada ambiguous begin, dan tidak ada payload resend.

Quality gate aktual:
- `python -m pytest backend/tests/test_local_print_agent.py -q -p no:cacheprovider`: PASS — `72 passed`, 2 deprecation warnings.
- `python -m pytest backend/tests -q -p no:cacheprovider`: PASS — `166 passed`, 2 deprecation warnings, 47.80s.
- `npm.cmd test` (cwd `frontend/`): PASS — `45 passed`.
- `npm.cmd exec tsc -- --noEmit` (cwd `frontend/`): PASS.
- `npm.cmd run build` (cwd `frontend/`): PASS — Vite build selesai; output `frontend/dist/` tetap ignored/generated.
- `npm.cmd run test:e2e` (cwd `frontend/`): PASS — `23 passed (1.9m)`; hanya localhost `127.0.0.1:8000` dan `127.0.0.1:5173`.
- `git diff --check`: PASS — 0 whitespace errors; Git hanya menampilkan warning normal LF/CRLF.
- Direct trailing-whitespace scan pada seluruh file untracked di `docs/database/` dan `docs/architecture/production_architecture_options.md`: PASS — 0 temuan.
- Secret scan pada seluruh kandidat checkpoint: PASS — tidak ada high-signal secret pattern.

Hash SHA-256 aktual dan cocok dengan catatan sebelumnya:
- `docs/database/print_pipeline_v1.sql`: `A595654C04B8CC3189BFA87B7E2ED8EA6AF1AD0D8BC02D656A86BCE8320E77F0`
- `docs/database/print_pipeline_v1_rollback.sql`: `6A409CB823823D88DE863DBB1AFD3E458F5D956AAA22EE678BD0D1DAA92FBA0E`
- `docs/database/print_pipeline_v1_validation.sql`: `261413AD673EEEA1FE407D7FF8CE2B74EF418580E3C8592F5941D02B475FF776`
- `assets/templates/label_roll_80x200.svg`: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577`

Kandidat file yang layak di-stage pada checkpoint berikutnya setelah review pengguna:
- `backend/app/local_print_agent/runner.py`
- `backend/tests/test_local_print_agent.py`
- `docs/AI_HANDOFF.md`
- `docs/architecture/print_job_and_local_agent.md`
- `docs/architecture/production_architecture_options.md`
- `docs/database/print_pipeline_persistence.md`
- `docs/database/print_pipeline_v1.sql`
- `docs/database/print_pipeline_v1_rollback.sql`
- `docs/database/print_pipeline_v1_validation.sql`

Tidak layak di-stage: `frontend/dist/`, `playwright-report/`, `test-results/`, `.last-run.json`, recordings, `.env`, credential, temporary files, serta report/screenshot generated lain yang telah di-ignore. Belum ada `git add`, commit, atau push.

## Instruksi pembuka

Sebelum mengubah file:

1. Baca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/DECISIONS.md`.
2. Periksa `git status --short --branch`.
3. Baca diff yang sudah ada dan jangan menimpa perubahan pengguna.
4. Jelaskan pemahaman task, scope, file kandidat, risiko, dan acceptance criteria.
5. Jika membutuhkan POC desktop, baca repository root sebagai referensi saja dan jangan mengubahnya.

## Tujuan aktif

Pertahankan dan kembangkan Thermal Label Studio sebagai web application yang dapat mendesain template, memvalidasi kontrak SAP JSON, merender preview, dan menyiapkan print job secara aman serta dapat diuji.

## Pekerjaan terakhir

- Tanggal: 2026-09-18
- Ringkasan: Fase B2B2B.2.4 — Evidence Hygiene and Checkpoint Readiness.
- Perubahan penting:
  1. Lokasi ADR: Mengoreksi seluruh pernyataan terkait ADR dengan menegaskan bahwa `DECISIONS.md` saat ini hanya memuat ADR-001 sampai ADR-009, sedangkan ADR-010 sampai ADR-023 masih merupakan kandidat PROPOSED yang didokumentasikan di `production_architecture_options.md` dan belum dipromosikan ke `DECISIONS.md`.
  2. Scope Evidence: Mengganti seluruh klaim "100% valid secara sintaksis dan semantik" atau "100% verified" menjadi formulasi akurat: "seluruh kasus pada validation harness saat ini lulus pada PostgreSQL 15.13 disposable (`postgres:15-bullseye`)". Menegaskan secara eksplisit bahwa concurrency repository, privilege role, migration upgrade, backup/restore, dan production deployment belum diuji.
  3. Git Evidence & Whitespace Hygiene: Menjelaskan bahwa `git diff --check` hanya memeriksa tracked diff. Melakukan direct trailing whitespace scan langsung terhadap file-file untracked (`docs/database/*` dan `docs/architecture/production_architecture_options.md`), membersihkan seluruh trailing whitespace non-semantik (menghasilkan 0 temuan), dan melaporkan secara jujur file yang masih berstatus untracked.
  4. Historical Handoff Integrity: Mempertahankan snapshot historis B2B2B.2.2 dan B2B2B.2.1 sebagai kondisi pada waktunya dengan keterangan tambahan "superseded by B2B2B.2 runtime verification" tanpa menghapus riwayat fakta lapangan.
  5. Perlindungan SQL & Template: Memverifikasi hash SHA-256 ketiga file SQL (`print_pipeline_v1.sql`, `print_pipeline_v1_rollback.sql`, `print_pipeline_v1_validation.sql`) sebelum dan sesudah adalah identik (tidak ada modifikasi file SQL). Hash template canonical `assets/templates/label_roll_80x200.svg` tetap cocok sempurna (`4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577`).
- Verifikasi aktual:
  - Direct whitespace scan pada seluruh file untracked target (`docs/database/*`, `production_architecture_options.md`): 0 temuan.
  - `git diff --check` pada tracked diff: lulus (0 whitespace errors; hanya Git CRLF warning).
  - SHA-256 ketiga file SQL sebelum dan sesudah: identik 100%.
  - Hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577`.
  - Zero secret / token pada working tree.
  - Pelaporan jujur file untracked: `docs/architecture/production_architecture_options.md` dan folder `docs/database/` (`print_pipeline_persistence.md`, `print_pipeline_v1.sql`, `print_pipeline_v1_rollback.sql`, `print_pipeline_v1_validation.sql`).
- Batas: Tetap berhenti sebelum Fase B2B2C. Tidak ada perubahan statement DDL executable, tidak ada modifikasi kode aplikasi backend/frontend, tidak ada instalasi dependency baru, tidak ada koneksi printer fisik, tidak ada git commit atau push.

## Handoff B2B2B.2.4

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty; perubahan uncommitted pada runner, test, print_job_and_local_agent.md, dan docs handoff; file `docs/architecture/production_architecture_options.md` dan folder `docs/database/` berstatus untracked (dilaporkan secara jujur).
Task: Fase 2.3B2B2B.2.4 — Evidence Hygiene and Checkpoint Readiness
Status: verified (hygiene clean, scope evidence calibrated, ADR locations reconciled, SQL hashes preserved)
Scope:
- docs/architecture/production_architecture_options.md
- docs/database/print_pipeline_persistence.md
- docs/AI_HANDOFF.md
Tanpa perubahan pada file SQL, kode runtime backend/frontend, dependency, kontrak JSON, Docker, database, atau printer. Tanpa commit/push.
File diubah:
- `docs/architecture/production_architecture_options.md` (ADR location reconciled, scope evidence calibrated, trailing whitespace cleaned)
- `docs/database/print_pipeline_persistence.md` (ADR location reconciled, scope evidence calibrated, trailing whitespace cleaned)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi aktual:
- Direct trailing whitespace scan (PowerShell pada seluruh file untracked target):
  - `docs/database/print_pipeline_persistence.md`: 0 trailing lines
  - `docs/database/print_pipeline_v1.sql`: 0 trailing lines
  - `docs/database/print_pipeline_v1_rollback.sql`: 0 trailing lines
  - `docs/database/print_pipeline_v1_validation.sql`: 0 trailing lines
  - `docs/architecture/production_architecture_options.md`: 0 trailing lines
- `git diff --check`: Lulus untuk tracked diff (0 whitespace errors; hanya Git CRLF warning).
- Pelaporan status Git jujur:
  - Tracked modified: `backend/app/local_print_agent/runner.py`, `backend/tests/test_local_print_agent.py`, `docs/AI_HANDOFF.md`, `docs/architecture/print_job_and_local_agent.md`.
  - Untracked: `docs/architecture/production_architecture_options.md`, `docs/database/` (`print_pipeline_persistence.md`, `print_pipeline_v1.sql`, `print_pipeline_v1_rollback.sql`, `print_pipeline_v1_validation.sql`).
- SHA-256 verifikasi SQL (sebelum vs sesudah identik):
  - `print_pipeline_v1.sql`: `A595654C04B8CC3189BFA87B7E2ED8EA6AF1AD0D8BC02D656A86BCE8320E77F0`
  - `print_pipeline_v1_rollback.sql`: `6A409CB823823D88DE863DBB1AFD3E458F5D956AAA22EE678BD0D1DAA92FBA0E`
  - `print_pipeline_v1_validation.sql`: `261413AD673EEEA1FE407D7FF8CE2B74EF418580E3C8592F5941D02B475FF776`
- Validasi hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (cocok sempurna).
- Secret scan pada `docs/`: 0 temuan.
- Status keputusan arsitektur: `DECISIONS.md` saat ini hanya memuat ADR-001 sampai ADR-009. ADR-010 sampai ADR-023 masih merupakan kandidat PROPOSED yang didokumentasikan di `production_architecture_options.md` dan belum dipromosikan ke `DECISIONS.md`.
Keputusan baru / Usulan:
- Tidak ada klaim 100% semantic correctness; ditegaskan seluruh kasus pada validation harness saat ini lulus pada PostgreSQL 15.13 disposable, sedangkan concurrency repository, privilege role, migration upgrade, backup/restore, dan production deployment belum diuji.
- Integritas snapshot historis dijaga dengan anotasi superseded by B2B2B.2 runtime verification.
Risiko / blocker:
- Tidak ada blocker pada level dokumentasi dan skema DDL.
Langkah berikutnya:
- Berhenti pada B2B2B.2.4 sesuai instruksi. Jangan lanjut ke B2B2C tanpa arahan pengguna.
- Tidak membuat git commit atau push.

## Handoff B2B2B.2.3

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1-4, B2B2B, B2B2B.2.1, B2B2B.2.2, B2B2B.2, dan B2B2B.2.3 dipertahankan)
Task: Fase 2.3B2B2B.2.3 — PostgreSQL Runtime Evidence and Terminology Reconciliation
Status: verified (documentation reconciled with PostgreSQL 15.13 runtime validation results)
Scope: Penyelarasan seluruh dokumentasi teknis dengan bukti runtime eksekusi PostgreSQL 15.13 disposable container tanpa mengubah statement DDL executable. Koreksi terminologi ke "33 negative test cases", penegasan "repeatability pada database bersih vs bukan idempotensi migrasi forward", pembersihan klaim status terdahulu yang tidak lagi relevan setelah pengujian disposable berhasil, pencatatan status container disposable yang telah dihapus (image tetap di cache lokal, tanpa klaim docker ps -a kosong), dan penegasan ADR tetap PROPOSED. Stop sebelum B2B2C; tanpa commit atau push.
File diubah:
- `docs/database/print_pipeline_v1.sql` (comment header diperbarui; DDL statements tidak disentuh)
- `docs/database/print_pipeline_v1_rollback.sql` (comment header diperbarui; SQL statements tidak disentuh)
- `docs/architecture/production_architecture_options.md` (Batasan Fase, Roadmap L, dan Section O diselaraskan dengan hasil runtime PASS)
- `docs/database/print_pipeline_persistence.md` (Section 12, 13, dan 14 diselaraskan, terminologi 33 negative test cases ditegakkan, klaim idempotensi dikoreksi ke repeatability dan rollback completeness)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi aktual:
- `git diff --check`: Lulus (0 whitespace errors)
- `git status --short --branch`: Terverifikasi `## main...origin/main [ahead 1]`
- Validasi hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (cocok sempurna)
- Verifikasi status Docker & container:
  - Container disposable `pg-disposable-b2b2b` telah di-stop dan di-remove (`docker stop pg-disposable-b2b2b; docker rm pg-disposable-b2b2b`).
  - Tidak ada container disposable yang tersisa.
  - Image `postgres:15-bullseye` (Image ID `4ce70bcb2c05`, 599MB) tetap tersimpan di Docker cache lokal.
  - Tidak mengklaim seluruh `docker ps -a` kosong (container sistem/user lain dalam status exited tetap dipertahankan).
- Verifikasi bebas frasa usang via ripgrep (0 temuan).
- Secret scan pada `docs/`: 0 temuan.
- Status keputusan arsitektur: `DECISIONS.md` saat ini hanya memuat ADR-001 sampai ADR-009. ADR-010 sampai ADR-023 masih merupakan kandidat PROPOSED yang didokumentasikan di `production_architecture_options.md` dan belum dipromosikan ke `DECISIONS.md`.
Keputusan baru / Usulan:
- Seluruh kasus pada validation harness saat ini lulus pada PostgreSQL 15.13 disposable (`postgres:15-bullseye`). Concurrency repository, privilege role, migration upgrade, backup/restore, dan production deployment belum diuji.
- Clean re-apply membuktikan repeatability pada database bersih dan kelengkapan skrip rollback (bukan idempotensi forward DDL karena menggunakan fail-fast CREATE TABLE tanpa IF NOT EXISTS).
- Status terverifikasi runtime pada disposable PostgreSQL 15.13 ini bukan berarti production-deployed atau production-ready.
Risiko / blocker:
- Tidak ada blocker pada level skema DDL PostgreSQL.
- Langkah selanjutnya (Fase 2.3B2B2C) memerlukan perencanaan implementasi repository PostgreSQL yang selaras dengan kontrak JSON v1 dan transaksi ACID.
Langkah berikutnya:
- Berhenti pada B2B2B.2.3 sesuai instruksi. Jangan lanjut ke B2B2C tanpa instruksi pengguna.
- Tidak membuat git commit atau push.

## Handoff B2B2B.2

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1-4, B2B2B, B2B2B.2.1, B2B2B.2.2, dan B2B2B.2 dipertahankan)
Task: Fase B2B2B.2 — PostgreSQL 15 Disposable Validation & Lifecycle Verification
Status: verified (Forward DDL, Validation SQL with 33 Sentinels, Rollback without CASCADE, and Clean Re-apply all pass on PostgreSQL 15.13)
Scope: Eksekusi lengkap forward DDL, validation SQL, rollback DDL, dan clean re-apply pada PostgreSQL 15 disposable container (`postgres:15-bullseye`, PostgreSQL 15.13). Pembaruan `docs/database/print_pipeline_persistence.md` dan `docs/AI_HANDOFF.md`. Stop sebelum B2B2C; tanpa migrasi Alembic, tanpa modifikasi kode runtime backend/frontend, tanpa koneksi printer fisik, tanpa commit atau push.
File diubah:
- `docs/database/print_pipeline_persistence.md` (status eksekusi diperbarui ke VERIFIED)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi aktual:
- Docker Desktop version: Engine 29.7.2, API 1.55
- Container disposable: `pg-disposable-b2b2b` (`postgres:15-bullseye`, Debian PostgreSQL 15.13)
- Forward DDL 1: `Get-Content docs/database/print_pipeline_v1.sql -Raw | docker exec -i pg-disposable-b2b2b psql -v ON_ERROR_STOP=1 -U postgres -d label_studio_test` (Exit Code: 0, 11 tabel, functions, triggers, indexes berhasil dibuat)
- List Tables 1: `docker exec -i pg-disposable-b2b2b psql -U postgres -d label_studio_test -c "\dt"` (11 rows terverifikasi)
- Validation SQL 1: `Get-Content docs/database/print_pipeline_v1_validation.sql -Raw | docker exec -i pg-disposable-b2b2b psql -v ON_ERROR_STOP=1 -U postgres -d label_studio_test` (Exit Code: 0, seluruh 33 negative test cases ber-sentinel PASS, output: `VALIDATION_PASS_IF_NO_ERROR`)
- Rollback DDL: `Get-Content docs/database/print_pipeline_v1_rollback.sql -Raw | docker exec -i pg-disposable-b2b2b psql -v ON_ERROR_STOP=1 -U postgres -d label_studio_test` (Exit Code: 0, 11 tabel, constraints, function di-drop tanpa CASCADE)
- List Tables 2: `docker exec -i pg-disposable-b2b2b psql -U postgres -d label_studio_test -c "\dt"` (Output: `Did not find any relations.`)
- Clean Re-apply Forward DDL 2: `Get-Content docs/database/print_pipeline_v1.sql -Raw | docker exec -i pg-disposable-b2b2b psql -v ON_ERROR_STOP=1 -U postgres -d label_studio_test` (Exit Code: 0, 11 tabel terbuat ulang)
- Clean Re-apply Validation SQL 2: `Get-Content docs/database/print_pipeline_v1_validation.sql -Raw | docker exec -i pg-disposable-b2b2b psql -v ON_ERROR_STOP=1 -U postgres -d label_studio_test` (Exit Code: 0, output: `VALIDATION_PASS_IF_NO_ERROR`, membuktikan repeatability pada database bersih dan kelengkapan rollback; forward DDL fail-fast)
- Container Cleanup: `docker stop pg-disposable-b2b2b; docker rm pg-disposable-b2b2b` (Exit Code: 0, container disposable dihapus, tidak ada container disposable tersisa; image postgres:15-bullseye tetap di local cache)
- `git diff --check`: Lulus untuk tracked diff (0 whitespace errors)
- `git status --short --branch`: Terverifikasi `## main...origin/main [ahead 1]`
- Validasi hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (cocok sempurna)
- Secret scan pada `docs/database/`: 0 temuan.
Keputusan baru / Usulan:
- Seluruh kasus pada validation harness saat ini lulus pada PostgreSQL 15.13 disposable (`postgres:15-bullseye`). Concurrency repository, privilege role, migration upgrade, backup/restore, dan production deployment belum diuji. DECISIONS.md saat ini hanya memuat ADR-001 sampai ADR-009. ADR-010 sampai ADR-023 masih merupakan kandidat PROPOSED yang didokumentasikan di production_architecture_options.md dan belum dipromosikan ke DECISIONS.md.
- Pola rollback tanpa CASCADE terbukti aman dan tuntas membersihkan seluruh dependensi relasional.
- Harness validation dengan expected-failure sentinels terbukti berhasil memverifikasi seluruh 13 invarian relasional dan 33 negative test cases pada database riil.
Risiko / blocker:
- Tidak ada blocker pada level skema DDL PostgreSQL.
- Langkah selanjutnya (Fase 2.3B2B2C) memerlukan perencanaan migrasi SQLAlchemy / Alembic yang selaras dengan kontrak JSON v1.
Langkah berikutnya:
- Berhenti pada B2B2B.2 sesuai instruksi. Tidak lanjut ke B2B2C tanpa arahan pengguna.

## Handoff B2B2B.2.2

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1-4, B2B2B, B2B2B.2.1, dan B2B2B.2.2 dipertahankan)
Task: Fase B2B2B.2.2 — Expected-Failure Sentinel
Status: verified (harness static analysis & assertion suite passed; PostgreSQL runtime execution BLOCKED/NOT RUN saat fase ini — superseded by B2B2B.2 runtime verification)
Scope: Pemasangan expected-failure sentinel P0001 pada seluruh 33 negative test cases di `docs/database/print_pipeline_v1_validation.sql`, pembaruan `docs/database/print_pipeline_persistence.md`, dan pembaruan `docs/AI_HANDOFF.md`. Tanpa eksekusi PostgreSQL/Docker pada fase ini (superseded by B2B2B.2 runtime verification), tanpa perubahan DDL runtime, tanpa koneksi printer, commit, atau push.
File diubah:
- `docs/database/print_pipeline_v1_validation.sql` (diperbarui)
- `docs/database/print_pipeline_persistence.md` (diperbarui)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git diff --check` (lulus untuk tracked diff; 0 whitespace errors)
- `git status --short --branch` (terverifikasi)
- validasi hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (cocok)
- static assertion harness: tepat 33 negative test cases, tepat 33 sentinel P0001, tepat 33 `GET STACKED DIAGNOSTICS`, tepat 33 exact `CONSTRAINT_NAME` check, 0 `WHEN OTHERS`, 0 handler `P0001`/`raise_exception`, `\set ON_ERROR_STOP on` aktif, final `ROLLBACK;` ada, dan PASS marker hanya tercapai setelah seluruh blok sukses melempar exception yang sesuai.
- secret scan pada `docs/database/`: 0 temuan.
- PostgreSQL parser/runtime: `BLOCKED/NOT RUN` (tidak ada instance database / Docker daemon tidak aktif saat fase ini — superseded by B2B2B.2 runtime verification).
Keputusan baru / Usulan:
- Setiap negative test case wajib memiliki fail-fast sentinel `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'expected violation was not raised: ...';` langsung setelah statement invalid di dalam inner BEGIN.
- Exception handler hanya menangkap exception class spesifik (`check_violation`, `foreign_key_violation`, `unique_violation`, `restrict_violation`). Sentinel P0001 tidak boleh ditangkap agar statement invalid yang diterima database langsung menghentikan script psql via ON_ERROR_STOP.
- Penegasan status validasi runtime database saat itu BLOCKED/NOT RUN (diselesaikan pada B2B2B.2).
Risiko / blocker:
- Docker daemon lokal belum berjalan saat fase ini; pengujian aktual dengan psql terhadap PostgreSQL disposable ditangguhkan (diselesaikan pada B2B2B.2).
Langkah berikutnya:
- Berhenti pada B2B2B.2.2. Tidak menyalakan Docker saat itu, tidak membuat commit/push, dan menunggu instruksi pengguna selanjutnya.

## Handoff B2B2B.2.1

Tanggal: 2026-09-18
Provider AI: Codex Desktop — Luna Medium diminta pengguna
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (perubahan lokal sebelumnya dipertahankan; perubahan fase ini terbatas pada docs)
Task: Fase 2.3B2B2B.2.1 — Validation Harness Isolation and False-Positive Elimination
Status: blocked (PostgreSQL disposable unavailable saat fase ini — superseded by B2B2B.2 runtime verification; harness manual/static review selesai)
Scope: isolasi validation harness dan final constraint naming. Tanpa eksekusi database karena Docker daemon tidak aktif dan psql tidak tersedia saat fase ini (superseded by B2B2B.2 runtime verification); tanpa migrasi Alembic/SQLAlchemy, Docker container, perubahan kode runtime, atau koneksi printer fisik.
File diubah / dibuat:
- `docs/database/print_pipeline_v1.sql` (dikoreksi)
- `docs/database/print_pipeline_v1_rollback.sql` (dikoreksi)
- `docs/database/print_pipeline_v1_validation.sql` (baru)
- `docs/database/print_pipeline_persistence.md` (dikoreksi)
- `docs/architecture/production_architecture_options.md` (dikoreksi)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git fetch origin` (lulus)
- `git diff --check` (lulus untuk tracked diff; hanya warning line-ending Git)
- `git status --short --branch`, HEAD, dan origin/main (terverifikasi)
- hash template canonical: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (cocok)
- secret/endpoint scan dan targeted structural assertions file database (lulus)
- PostgreSQL parser/psql (BLOCKED/NOT RUN saat fase ini — superseded by B2B2B.2 runtime verification; tidak tersedia)
- Docker daemon (BLOCKED/NOT RUN saat fase ini — superseded by B2B2B.2 runtime verification; tidak aktif, tidak dinyalakan)
Keputusan baru / Usulan:
- DDL PostgreSQL 15+ dirancang formal untuk 11 entitas: `media_profiles`, `media_profile_versions`, `template_versions`, `printer_registry`, `printer_dispatch_state`, `print_batches`, `print_batch_items`, `print_jobs`, `print_artifacts`, `print_job_outbox`, `print_audit_events`.
- DDL tetap **PROPOSED** dan fail-fast; tidak diklaim executable atau parser-verified.
- Composite FK mengikat batch/item/job/dispatch ke printer yang sama; partial unique index berarti at-most-one original.
- Tipe data IP jaringan native: `network_host INET`, `network_port INTEGER` (1–65535) pada `printer_registry`.
- Zero cascade delete pada seluruh relasi inti operasional (`ON DELETE RESTRICT`) demi compliance audit manufaktur.
- Outbox pattern pada `print_job_outbox` untuk mendiskonseptualisasi commit batch/job dari proses dispatch I/O.
- Trigger pelindung integritas `trg_protect_audit_events` untuk mencegah modifikasi/penghapusan baris pada `print_audit_events`.
- Transaction boundary dipisahkan dari network I/O; durasi tidak diberi angka jaminan dan wajib diukur.
- Penegasan status `sending` dilarang auto-requeue saat lease timeout (harus dialihkan ke `delivery_unknown` atau rekonsiliasi manual karena keterbatasan RAW TCP Port 9100).
- Kontrak JSON v1 tidak diubah; mapping `executor_id` ke `claim.agent_id` memerlukan adapter, dan central dispatcher belum terwakili langsung.
- Validation SQL disposable menangkap expected SQLSTATE untuk cross-printer, lifecycle claim, artifact, outbox, dan audit mutation.
- Setiap negative case membaca `CONSTRAINT_NAME` melalui `GET STACKED DIAGNOSTICS` dan me-re-raise jika constraint berbeda.
- Static harness count: 33 negative cases, 33 expected SQLSTATE comments, 33 diagnostics reads, dan 33 exception handlers; tidak ada broad exception handler atau fixture reprint tanpa parent.
Risiko / blocker:
- Verifikasi aktual konektivitas Port 9100 dari server Linux ke printer pabrik (open question infrastruktur).
- Skema DDL belum diuji coba pada instance PostgreSQL riil (direncanakan pada Fase B2B2C / migrasi Alembic jika disetujui).
- Kebijakan retensi dan pembersihan tabel outbox & artifacts membutuhkan persetujuan formal tim operasional.
Langkah berikutnya:
- Berhenti pada B2B2B.2.1. PostgreSQL validation harus dijalankan pada disposable instance setelah Docker/psql tersedia; jangan lanjut ke B2B2C otomatis.
- Tidak membuat commit/push.
- Tidak melanjutkan ke Fase 2.3B2B2C sebelum ada instruksi pengguna.

## Handoff B2B2A.4

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1, B2B2A.2, B2B2A.3, dan B2B2A.4)
Task: Fase 2.3B2B2A.4 — Persistence Semantics Freeze
Status: verified
Scope: Pembekuan semantik persistensi arsitektur, pemisahan 4 pilar (Media Profile, Printer Profile, Template Version, Renderer), klarifikasi batas fencing token pada RAW TCP dan larangan auto-requeue status `sending`, koreksi configured media vs physical media, pembagian kolom `network_host` & `network_port`, penetapan 13 invarian DDL B2B2B, dan pembaruan AI_HANDOFF.md. Tanpa implementasi database, DDL, storage, broker, container, kode aplikasi, atau koneksi printer.
File diubah:
- `backend/app/local_print_agent/runner.py` (dari B2B1.4)
- `backend/tests/test_local_print_agent.py` (dari B2B1.4)
- `docs/architecture/print_job_and_local_agent.md` (dari B2B1.4)
- `docs/architecture/production_architecture_options.md` (diperbarui)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git diff --check` (lulus / 0 whitespace errors)
- `git status --short --branch` (terverifikasi)
- validasi hash template canonical: 4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577 (cocok)
- validasi sintaksis Mermaid: manual syntax review (bukan parser-verified)
- verifikasi isolasi boundary & status proposed (lulus)
- Backend & Frontend test: `not run` (perubahan dokumentasi murni; baseline test suite 166 backend, 72 agent, 45 frontend, 23 Playwright telah diverifikasi 100% lulus pada Fase B2B1.4 tanpa perubahan kode aplikasi baru)
Keputusan baru / Usulan:
- Pemisahan 4 Pilar: Media Profile (murni fisik: width, height, `material_type`, `sensor_mode`, orientation, is_active tanpa DPI/bahasa), Printer Profile, Template Version, dan Renderer.
- Istilah `configured_media_profile_version_id` / `expected_media_profile_version_id` digunakan karena sistem tidak memiliki sensor pembuktian roll fisik.
- Deterministic re-render membutuhkan 7 dependensi lengkap (template, SAP data, assets/fonts, media snapshot, printer snapshot, renderer config, render parameters).
- Keterbatasan Fencing Token pada RAW TCP: printer pasif tidak paham token; status `sending` dilarang auto-requeue saat lease expired; status `sending` ambigu dialihkan ke `delivery_unknown` atau rekonsiliasi manual; durasi lease memperhitungkan timeout socket maksimum; network I/O tetap di luar DB lock.
- Kolom endpoint printer registry dipisahkan menjadi `network_host` dan `network_port` (Admin-Only RBAC, zero SAP input).
- Pembekuan 13 invarian relasional sebagai kontrak boundary sebelum DDL B2B2B.
- Seluruh ADR-010 hingga ADR-022 tetap berstatus `PROPOSED`.
Risiko / blocker: Verifikasi aktual konektivitas Port 9100 dari server Linux ke printer pabrik (open question), proporsi printer IP vs USB, dan kebijakan retensi resmi manajemen.
Langkah berikutnya: Berhenti pada B2B2A.4. Menunggu persetujuan pemangku kepentingan atas pembekuan semantik arsitektur. Tidak membuat commit/push, dan tidak melanjutkan ke implementasi B2B2B tanpa konfirmasi pengguna.

## Handoff B2B2A.3

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1, B2B2A.2, dan B2B2A.3)
Task: Fase 2.3B2B2A.3 — Media Compatibility, Batch Routing, and Per-Printer Scheduling Review
Status: verified
Scope: Dokumentasi arsitektur model kompatibilitas media, per-printer scheduling, mitigasi kegagalan batch terisolasi, abstraksi delivery executor, koreksi klaim throughput & risiko XP, serta pembaruan AI_HANDOFF.md. Tanpa implementasi database, storage, broker, container, kode aplikasi, atau koneksi printer.
File diubah:
- `backend/app/local_print_agent/runner.py` (dari B2B1.4)
- `backend/tests/test_local_print_agent.py` (dari B2B1.4)
- `docs/architecture/print_job_and_local_agent.md` (dari B2B1.4)
- `docs/architecture/production_architecture_options.md` (diperbarui)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git diff --check` (lulus / 0 whitespace errors)
- `git status --short --branch` (terverifikasi)
- validasi hash template canonical: 4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577 (cocok)
- validasi sintaksis Mermaid: manual syntax review (bukan parser-verified)
- verifikasi isolasi boundary & status proposed (lulus)
- Backend & Frontend test: `not run` (perubahan dokumentasi murni; baseline test suite 166 backend, 72 agent, 45 frontend, 23 Playwright telah diverifikasi 100% lulus pada Fase B2B1.4 tanpa perubahan kode aplikasi baru)
Keputusan baru / Usulan:
- Media Compatibility Model: pembedaan tegas Template, Media Profile, Printer Profile, dan Artifact; skema `media_profiles`; single-printer & single-media per batch; validasi all-or-nothing atomik; larangan keras auto-scale diam-diam.
- Per-Printer Scheduling: 1 active delivery owner per printer, anti-interleaving antar-batch, urutan `item_sequence ASC`, lease dengan fencing token, dan larangan mutlak menahan DB lock selama network I/O Port 9100.
- Mitigasi Kegagalan Batch: jeda tertarget pada sisa item pada printer tersebut, dilarang auto-retry item ambigu, preservasi metadata executor, dan tindakan operator berotorisasi (inspect, resume, reprint dengan `reprint_of_job_id`, cancel).
- Abstraksi Delivery Executor: model netral `executor_type` dan `executor_id` untuk menyatukan Central Dispatcher dan Gateway/Local Agent.
- Koreksi Klaim Performa: ~1 job/detik estimated throughput jendela sibuk wajib dibuktikan dengan load test empiris.
- Target Latensi Pilot: API acceptance <1s, first item sent <5s (P95), per-item head-of-line <5s (P95), total batch completion tergantung kecepatan mekanis printer. Status `sent_to_printer` tidak sama dengan `printed`.
- Seluruh ADR-010 hingga ADR-019 tetap berstatus `PROPOSED`.
Risiko / blocker: Verifikasi aktual konektivitas Port 9100 dari server Linux ke printer pabrik (open question), proporsi printer IP vs USB, dan kebijakan retensi resmi manajemen.
Langkah berikutnya: Berhenti pada B2B2A.3. Menunggu persetujuan pemangku kepentingan atas proposal arsitektur media dan scheduling. Tidak membuat commit/push, dan tidak melanjutkan ke implementasi B2B2B tanpa konfirmasi pengguna.

## Handoff B2B2A.2

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, B2B2A.1, dan B2B2A.2)
Task: Fase 2.3B2B2A.2 — Print Delivery Topology Decision
Status: verified
Scope: Dokumentasi arsitektur topologi pengiriman cetak (Central Print Dispatcher vs Gateway Agent vs Hybrid), perumusan hierarki Print Batch vs Copies, pembaruan skema registry printer dengan delivery_mode & network_endpoint, serta pembaruan AI_HANDOFF.md. Tanpa implementasi database, storage, broker, container, kode aplikasi, atau koneksi printer.
File diubah:
- `backend/app/local_print_agent/runner.py` (dari B2B1.4)
- `backend/tests/test_local_print_agent.py` (dari B2B1.4)
- `docs/architecture/print_job_and_local_agent.md` (dari B2B1.4)
- `docs/architecture/production_architecture_options.md` (diperbarui)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git diff --check` (lulus / 0 whitespace errors)
- `git status --short --branch` (terverifikasi)
- validasi hash template canonical: 4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577 (cocok)
- validasi sintaksis Mermaid: manual syntax review (bukan parser-verified)
- verifikasi isolasi boundary & status proposed (lulus)
- Backend & Frontend test: `not run` (perubahan dokumentasi murni; baseline test suite 166 backend, 72 agent, 45 frontend, 23 Playwright telah diverifikasi 100% lulus pada Fase B2B1.4 tanpa perubahan kode aplikasi baru)
Keputusan baru / Usulan:
- Central Print Dispatcher pada server Linux ditetapkan sebagai prioritas utama pilot lean (1 lini, 1 PC operator, 1 printer IP jaringan).
- Workstation Windows XP di lantai pabrik diposisikan strictly sebagai terminal SAP GUI murni; zero new software di XP.
- Hierarki data batch dirumuskan: `print_batches` (1) -> `print_batch_items` (N) -> `print_jobs` (N) dengan eksekusi serial per printer dan auto-pause pada item error.
- Tabel `printer_registry` diperbarui dengan atribut `delivery_mode` (ENUM: central_tcp, gateway_agent, legacy_bridge) dan `network_endpoint` (admin-only RBAC, tidak pernah diterima dari payload SAP).
- Seluruh ADR-010 hingga ADR-016 tetap berstatus `PROPOSED`.
Risiko / blocker: Konfirmasi firewall port 9100 dari server Linux ke subnet printer pabrik dan SOP darurat operasional manual jika server down di tengah batch.
Langkah berikutnya: Berhenti pada B2B2A.2. Menunggu persetujuan pemangku kepentingan atas proposal arsitektur topologi dan model batch. Tidak membuat commit/push, dan tidak melanjutkan ke implementasi B2B2B tanpa konfirmasi pengguna.

## Handoff B2B2A.1

Tanggal: 2026-09-18
Provider AI: Gemini 3.8 Flash (High) via Antigravity
Perangkat: Windows lokal
Repository: `Thermal-Label-Studio`
Remote: `origin/main` (`8025353056614be126a537075abcc25a2b9acc69`)
Local HEAD: `38a0de23238418a10dbc0fea856f55c5d9f24547` (ahead 1 terhadap origin/main)
Branch: `main` [ahead 1]
Status working tree: dirty (uncommitted changes dari B2B1.4, B2B2A, dan B2B2A.1)
Task: Fase 2.3B2B2A.1 — Production Architecture Accuracy Review
Status: verified
Scope: Koreksi akurasi dokumen arsitektur produksi (`docs/architecture/production_architecture_options.md`) dan pembaruan AI_HANDOFF.md. Tanpa implementasi database, storage, broker, container, perubahan kode aplikasi, atau printer transport.
File diubah:
- `backend/app/local_print_agent/runner.py` (dari B2B1.4)
- `backend/tests/test_local_print_agent.py` (dari B2B1.4)
- `docs/architecture/print_job_and_local_agent.md` (dari B2B1.4)
- `docs/architecture/production_architecture_options.md` (diperbarui)
- `docs/AI_HANDOFF.md` (diperbarui)
Perintah verifikasi:
- `git diff --check` (lulus / 0 whitespace errors)
- `git status --short --branch` (terverifikasi)
- validasi sintaksis Mermaid: manual syntax review (bukan parser-verified)
- verifikasi isolasi boundary & status proposed (lulus)
- Backend & Frontend test: `not run` (perubahan dokumentasi murni; baseline test suite 166 backend, 72 agent, 45 frontend, 23 Playwright telah diverifikasi 100% lulus pada Fase B2B1.4 tanpa perubahan kode aplikasi baru)
Keputusan baru / Usulan:
- Opsi Lean Pilot (FastAPI + PostgreSQL + Worker + Durable Filesystem Volume) diprioritaskan untuk 1 orang operator aplikasi.
- Model Print Gateway Agent diusulkan untuk melayani 200–300 printer jaringan per VLAN/area dan mengisolasi PC legacy Windows XP.
- Record claim diverifikasi tetap dipertahankan pada status final untuk jejak audit.
- Klasifikasi data diperjelas: Asset (versioned/abadi), Artifact (7–30 hari assumption), Audit (1–3 tahun assumption), Log (30–90 hari assumption).
- RPO (5–15 menit) dan RTO (30–60 menit) dicatat sebagai candidate target diskusi, bukan accepted decision.
- Seluruh ADR-010 hingga ADR-014 tetap berstatus `PROPOSED`.
Risiko / blocker: Menunggu konfirmasi atas 5 open questions (proporsi printer IP vs USB/COM, volume label harian & peak, segmentasi VLAN pabrik, ketersediaan gateway OS modern, dukungan operasional IT) sebelum memulai implementasi skema B2B2B.
Langkah berikutnya: Berhenti pada B2B2A.1 setelah quality gate dokumentasi. Menunggu persetujuan pemangku kepentingan atas proposal arsitektur. Tidak membuat commit/push, dan tidak melanjutkan ke implementasi B2B2B atau Fase 3.

## Pekerjaan berikutnya

- [ ] Perbarui bagian ini setelah setiap milestone implementasi.
- [ ] Catat acceptance criteria dan test yang benar-benar dijalankan.
- [ ] Catat blocker, asumsi, dan keputusan baru di `DECISIONS.md`.
- [ ] Pastikan perubahan yang siap dibagikan sudah di-commit dan di-push ke repository aktif.

## Format update handoff

```text
Tanggal:
Provider AI:
Perangkat:
Repository:
Remote:
Branch:
Commit baseline:
Status working tree:
Task:
Status: planned | in-progress | verified | blocked
Scope:
File diubah:
Perintah test:
Hasil aktual:
Keputusan baru:
Risiko / blocker:
Langkah berikutnya:
```

## Prompt lanjutan yang direkomendasikan

> Lanjutkan dari `docs/AI_HANDOFF.md`. Baca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/DECISIONS.md`; periksa git status, branch, dan commit baseline; jangan mengubah repository POC desktop. Kerjakan hanya scope berikut: [isi task]. Jangan menimpa perubahan lokal. Sebelum selesai, jalankan verifikasi yang relevan dan perbarui handoff dengan provider, perangkat, file yang diubah, serta hasil aktual.
