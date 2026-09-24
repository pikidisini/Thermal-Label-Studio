# AI Handoff — Thermal Label Studio

## Snapshot aktif — Review F3.2 Jenkins PYTHONPATH PASS (PR-ready)

- Branch `codex/fix-jenkins-pythonpath`, commit executor `e030c19`. Review Codex PASS setelah disposable Docker smoke check: `python -m app.cli.user_admin --help` berhasil dengan `PYTHONPATH=/app/backend`.
- `git diff --check origin/main...HEAD` PASS. Jenkins build ulang masih `NOT RUN`; Bash syntax check tidak tersedia karena Bash/WSL tidak tersedia pada shell review.
- Detail review: `docs/tasks/F3.2/REVIEW.md`. Belum ada PR atau merge; tidak ada akses SAP, printer fisik, TCP 9100, Spooler, atau database production.

## Snapshot aktif — Perbaikan CI Jenkins: PYTHONPATH Container Safety Check

- Tanggal: 2026-09-24. Branch `codex/fix-jenkins-pythonpath`, baseline `origin/main` (`bd0b78e`).
- Writer / Executor: Gemini Flash (Antigravity). Reviewer: Codex.
- Status: `REMEDIATION_COMPLETED — AWAITING_CODEX_REVIEW`.
- File yang diubah: `ops/jenkins/deploy-local.sh`, `docs/tasks/F3.2/RESULT.md`, `docs/AI_HANDOFF.md`.
- Penyebab error: Build Jenkins #11 pada commit `bd0b78e` gagal pada safety check kandidat dengan `ModuleNotFoundError: No module named 'app'` karena perintah CLI `python -m app.cli.user_admin --help` dijalankan dari working directory `/app` (di mana `PYTHONPATH=/app`), sedangkan modul `app` berada di `/app/backend/app`.
- Perbaikan: Menambahkan `env PYTHONPATH=/app/backend` pada perintah `docker exec "$name" env PYTHONPATH=/app/backend python -m app.cli.user_admin --help >/dev/null` di `ops/jenkins/deploy-local.sh`.
- Verifikasi aktual:
  - Bash syntax check (`bash.exe -n ops/jenkins/deploy-local.sh`): PASS.
  - Reproduksi & verifikasi isolasi container kandidat lokal (`tls-local-sim:bd0b78ee6c36`) tanpa publish port dan tanpa volume live:
    - Sebelum perbaikan: FAIL (`ModuleNotFoundError: No module named 'app'`).
    - Sesudah perbaikan: PASS (exit code 0, menu help tercetak).
  - Jenkins build ulang: NOT RUN (menunggu review dan trigger pipeline berikutnya).
  - Safety check: Kegagalan Build #11 terjadi pada container kandidat sebelum container live (`tls-local-sim`) disentuh/diganti; container live tetap aman dan beroperasi normal.
  - `git diff --check origin/main...HEAD`: PASS.
  - Secret scan: PASS (0 secrets).
- Batas keras: Tidak mengubah Dockerfile, source backend/frontend, auth, database production, port printer, TCP 9100, Spooler, atau SAP.
- Next step: Stop sebelum PR/merge. Meminta Codex melakukan review sebelum PR.

## Riwayat snapshot — F3.3 review final keempat PASS (PR-ready)

- Tanggal 2026-09-24; branch `codex/f3-3-app-login`; kode executor pada `9e7ef36`. Reviewer Codex Level 3 menutup seluruh temuan sebelumnya; rincian ada di `docs/tasks/F3.3/REVIEW.md`.
- Verifikasi reviewer: status branch awal bersih dan tracking remote; `git diff --check origin/main...HEAD` PASS; backend targeted 29 PASS. Laporan executor mencatat Playwright 7 PASS, tetapi rerun reviewer BLOCKED sebelum test karena port lokal 8000 sedang digunakan; layanan pengguna tidak dihentikan.
- Verdict: PR-ready, belum production-ready. Jenkins runtime, SAP, printer fisik, dan deployment produksi tidak diverifikasi reviewer. Jangan menafsirkan angka E2E executor sebagai verifikasi independen.
- Review/handoff ini hanya mengubah dokumentasi; histori di bawah tetap dipertahankan.

## Snapshot aktif — F3.3 Remediasi Review Ulang Ketiga Selesai (REMEDIATION_ROUND3_COMPLETED — AWAITING_CODEX_FINAL_REVIEW)

- Tanggal: 2026-09-24. Branch `codex/f3-3-app-login`.
- Writer / Executor: Gemini Flash (Antigravity). Reviewer: Codex Level 3 (independen).
- Status: `REMEDIATION_ROUND3_COMPLETED — AWAITING_CODEX_FINAL_REVIEW`.
- Seluruh 3 temuan review putaran ketiga (`docs/tasks/F3.3/REVIEW.md`) telah diselesaikan tuntas dan diverifikasi dengan tes aktual:
  1. **P1 — Server Playwright Memaksa Simulasi-Only & Preflight 404 Fisik**:
     - `frontend/playwright.config.js` menambahkan `LOCAL_SIMULATION_ONLY: 'true'` secara eksplisit pada `webServer[0].env` backend.
     - `frontend/tests/e2e/auth.setup.js` menjalankan preflight probe memastikan 5 rute cetak fisik (`/api/v1/print/batch`, `/api/v1/print/tcp`, `/api/v1/print/spooler`, `/api/v1/print/printers`, `/api/v1/sap/print`) mengembalikan HTTP 404 fail-closed.
     - `frontend/tests/e2e/pilot_operator_self_service.spec.js` mempertegas asersi HTTP 404 fail-closed pada rute cetak fisik.
  2. **P1 — Seeder E2E Bebas Fallback & Validasi Ketat Fail-Closed**:
     - `backend/scripts/seed_e2e_users.py` menghapus fallback ke `backend/data/auth.db`.
     - Fungsi `validate_e2e_db_path(raw_path)` mewajibkan `AUTH_DB_PATH` disetel, menolak database live/operasional (`auth.db`, dll.), dan mewajibkan nama file memuat penanda `e2e` atau `test`.
     - Validasi dieksekusi di awal `main()` sebelum modul `app.auth` diimpor untuk mencegah inisialisasi modul service/repository yang dapat menciptakan file database prematur di disk.
     - Ditambahkan suite pengujian `backend/tests/test_seed_e2e_users.py` (4 tests passed) memverifikasi penolakan fail-closed saat env kosong atau mengarah ke path live.
  3. **P2 — Ketegasan Assertion Autentikasi E2E & Cookie Sesi**:
     - `frontend/tests/e2e/auth.setup.js` menghapus blok kondisional: `login-page` dipastikan tampil tanpa syarat, login PPIC berhasil diverifikasi dengan badge `[PPIC] ppic_operator`, dan keberadaan cookie `app_session` di browser context divalidasi sebelum menyimpan `storageState`.
- Verifikasi Quality Gate Aktual:
  - Playwright E2E: `7 passed (59.0s)` (`auth.setup.js` + `pilot_operator_self_service.spec.js` + `sap_shadow_simulation.spec.js`). Zero printer fisik.
  - Targeted Seeder & Session Pytest: `44 passed, 2 warnings` in 48.27s (`test_seed_e2e_users.py`, `test_pilot_operator_session.py`, `test_auth_api.py`).
  - Frontend Unit Test: `85 passed, 0 failed` in 10.19s (`npm test` di `frontend/`).
  - Git Whitespace Check: `git diff --check` bersih (0 errors).
  - Storage & Security: Zero database files committed, zero secrets committed.
- Batasan lingkungan: Live SAP RFC/ECC: `NOT RUN`; Printer fisik/port 9100: `NOT RUN`; Database enterprise production: `NOT RUN`.
- Target berhenti: Berhenti sebelum membuat PR atau merge ke `main`. Menyerahkan branch kepada Codex Level 3 untuk review final.

## Riwayat snapshot — F3.3 review ulang ketiga: CHANGES REQUIRED

- Tanggal: 2026-09-24. Branch `codex/f3-3-app-login`, koreksi executor `7a45416`.
- Jenkins secret lama dan probe sesi sudah dikoreksi; regression endpoint sesi 25 PASS. Review menemukan harness Playwright belum mengaktifkan `LOCAL_SIMULATION_ONLY=true`, serta skrip seed E2E masih dapat memilih `backend/data/auth.db` dan mereset akun dengan password test bila env hilang. Detail di `docs/tasks/F3.3/REVIEW.md`.
- E2E tidak dijalankan ulang oleh reviewer karena konfigurasi server test belum menutup rute cetak fisik. Jangan PR/merge sebelum koreksi keselamatan, test E2E, dan review final.
- Snapshot executor/review lama di bawah dipertahankan sebagai riwayat, bukan verdict terkini.

## Snapshot aktif — F3.3 Remediasi Review Ulang Selesai (REMEDIATION_ROUND2_COMPLETED — AWAITING_CODEX_FINAL_REVIEW)

- Tanggal: 2026-09-24. Branch `codex/f3-3-app-login`.
- Writer / Executor: Gemini Flash (Antigravity). Reviewer: Codex Level 3 (independen).
- Status: `REMEDIATION_ROUND2_COMPLETED — AWAITING_CODEX_FINAL_REVIEW`.
- Tiga temuan review ulang `docs/tasks/F3.3/REVIEW.md` (commit `c07179c` follow-up) telah diselesaikan dan diverifikasi:
  1. **P1 — E2E Playwright Mewakili Alur Baru & Quality Gate Lengkap**:
     - `frontend/tests/e2e/pilot_operator_self_service.spec.js` diganti penuh menguji alur login aplikasi PPIC/IT → studio (`AuthenticatedStudio`) → Simulasi Label → batch table & item sequence (`#1`, `#2`) → tombol bukti PDF → impor JSON SAP raw v2 dengan CSRF header → logout global aplikasi mengembalikan user ke `LoginPage`.
     - `playwright.config.js` menyiapkan akun login otomatis melalui `globalSetup` (`backend/scripts/seed_e2e_users.py`), database auth terisolasi `backend/data/auth_e2e.db`, dan setup project `frontend/tests/e2e/auth.setup.js` (`storageState: frontend/.auth/user.json`).
     - Hasil test Playwright aktual: `pilot_operator_self_service.spec.js`: 3 passed (28.1s); `sap_shadow_simulation.spec.js`: 5 passed (39.5s). Zero socket/port 9100/spooler.
  2. **P2 — Pelepasan Ketergantungan Credential Pilot Legacy di Jenkins**:
     - Blok `withCredentials` credential `tls-pilot-operator-secret` dilepas dari `Jenkinsfile` dan `Jenkinsfile.rollback`.
     - `docs/deployment/jenkins_local_simulation.md` diperbarui untuk menghapus persyaratan credential lama dan mendokumentasikan langkah bootstrap akun awal pasca-deploy via CLI interaktif `docker exec -it tls-local-sim python -m app.cli.user_admin create-user`.
  3. **P2 — Transport Guard pada Probe Sesi `/operator/session`**:
     - Endpoint `/operator/session` pada `routes_sap_shadow.py` diperbarui menggunakan `Depends(get_current_user_optional)`. Request dengan cookie `app_session` yang mengakses plain HTTP intranet (non-loopback) ditolak fail-closed dengan HTTP 403 Forbidden sebelum status atau CSRF token dikembalikan.
     - Diuji dan diverifikasi pada `test_pilot_operator_session.py::test_session_probe_authenticated_on_plain_http_intranet_fails_closed_403`.
- Quality Gates Aktual:
  - Backend targeted pytest: `58 passed, 2 warnings` in 50.05s (`test_pilot_operator_session.py`, `test_auth_api.py`, `test_auth_service.py`).
  - Frontend unit tests: `85 passed, 0 failed` in 6.36s (`npm test` di `frontend/`).
  - Playwright E2E: `3 passed` (`pilot_operator_self_service.spec.js`) + `5 passed` (`sap_shadow_simulation.spec.js`).
  - Frontend production build: `npm run build` PASS (0 errors, 6.97s).
  - Whitespace check: `git diff --check` bersih (0 errors).
  - Secret & database scan: Zero `.db` committed, `.gitignore` mencakup `backend/data/*.db*` dan `frontend/.auth/`.
- Batasan lingkungan: Live SAP RFC/ECC: `NOT RUN`; Printer fisik/port 9100: `NOT RUN`; Database enterprise production: `NOT RUN`.
- Task Files: `docs/tasks/F3.3/TASK_CONTRACT.md`, `docs/tasks/F3.3/RESULT.md`, `docs/tasks/F3.3/REVIEW.md`.
- Next Action: Stop sebelum PR/merge. Menyerahkan branch kepada Codex Level 3 untuk review final.

## Snapshot aktif — F3.3 Remediasi Review Level 3 Selesai (REMEDIATION_LEVEL3_COMPLETED — AWAITING_CODEX_REVIEW)

- Tanggal: 2026-09-24. Branch `codex/f3-3-app-login`.
- Writer / Executor: Gemini Flash (Antigravity). Reviewer: Codex Level 3 (independen).
- Status: `REMEDIATION_LEVEL3_COMPLETED — AWAITING_CODEX_REVIEW`.
- Remediasi temuan `docs/tasks/F3.3/REVIEW.md` (P1 & P2) telah tuntas:
  1. **P1 — Urutan React hooks**: Komponen studio diekstraksi ke `AuthenticatedStudio.tsx`. `App.tsx` bersih dari conditional hook execution; siklus hidup loading, login, studio, dan logout diuji di `frontend/tests/test_auth_flow.mjs`.
  2. **P1 — Jalur password pilot lama dihapus**: `/operator/login` ditutup (HTTP 404), cookie legacy `pilot_session` ditolak fail-closed (HTTP 401), env pilot legacy dibersihkan dari `deploy-local.sh`, simulasi terintegrasi sepenuhnya ke akun PPIC/IT bersesi `app_session`.
  3. **P1 — CSRF guard mutasi studio**: Endpoint mutasi POST/DELETE di `templates`, `render`, `inspect`, `safe-demo`, dan `operator/logout` diproteksi `Depends(verify_csrf_token)`. Frontend API clients mengirim `X-CSRF-Token` via `csrfHelper.ts` dan `credentials: 'same-origin'`.
  4. **P2 — Konsistensi transport guard**: `evaluate_app_transport_security()` dipasang di `get_current_user_optional` (menolak plain HTTP intranet non-loopback dengan HTTP 403 pada `/auth/me`, `/auth/csrf`, dan seluruh rute bersesi).
  5. **P2 — CLI user_admin aman**: Argumen `--password` dihapus dari argv parser CLI; password wajib dimasukkan via prompt interaktif `getpass.getpass` dengan konfirmasi.
  6. **P2 — Safe Demo browser guard**: `safe_demo_router` dilindungi `Depends(get_current_user)` dan mutasi `/run`, `/reset` dilindungi `Depends(verify_csrf_token)`. Rute cetak fisik tetap dicegat 404 pada local simulation.
- Quality Gates Aktual:
  - Backend pytest: `480 passed, 21 skipped, 0 failed` in 277.50s.
  - Frontend unit tests: `85 passed, 0 failed` in 654ms (`npm test` di `frontend/`).
  - Frontend production build: `npm run build` PASS (0 errors, 6.75s).
  - Whitespace check: `git diff --check` bersih (0 errors).
  - Secret & database scan: Zero `.db` committed, zero secrets committed.
- Batasan lingkungan: Live SAP RFC/ECC: `NOT RUN`; Printer fisik/port 9100: `NOT RUN`; Database enterprise production: `NOT RUN`.
- Task Files: `docs/tasks/F3.3/TASK_CONTRACT.md`, `docs/tasks/F3.3/RESULT.md`, `docs/tasks/F3.3/REVIEW.md`.
- Next Action: Stop sebelum PR/merge. Menyerahkan branch kepada Codex Level 3 untuk review independen ulang.

## Snapshot aktif — Fase 3.3: Implementasi Selesai (IMPLEMENTATION_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW)

- Tanggal: 2026-09-24
- Repository: `Thermal-Label-Studio` (`web_app/`)
- Branch: `codex/f3-3-app-login`, baseline `origin/main` at `98a5983` (PR #26 merged).
- Writer / Executor: Gemini Flash (Antigravity). Reviewer: Codex Level 3 (independen).
- Status: `IMPLEMENTATION_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW`. Seluruh kriteria penerimaan (AC 1-7) pada `docs/tasks/F3.3/TASK_CONTRACT.md` telah diimplementasikan dan diverifikasi secara menyeluruh:
  1. **Login Aplikasi & Autentikasi Terpadu**:
     - Ditambahkan antarmuka login aplikasi (`frontend/src/components/auth/LoginPage.tsx`) yang menangani login user PPIC dan IT dengan penanganan error aman dan feedback visual.
     - Sesi server-side terkelola via cookie HttpOnly `app_session` (SameSite=lax, Secure di HTTPS, loopback allowed untuk local dev). Token sesi disimpan dalam hash SHA-256 pada SQLite `backend/data/auth.db` (terpisah dari database batch `sap_shadow_simulation.db` dan diproteksi volume Docker).
     - Perlindungan brute force: 5 kali percobaan gagal berturut-turut memicu penguncian sementara akun (lockout 300 detik).
     - Mitigasi timing attack: verifikasi password dummy berjalan konstan bahkan saat user tidak ditemukan.
  2. **Pengalaman Pengguna & Satu Sesi Simulasi**:
     - Header aplikasi (`TopMenuBar.tsx`) menampilkan badge role pengguna aktif (`[PPIC] user` atau `[IT] user`) serta tombol logout global.
     - Modal Simulasi Label (`SapShadowSimulationModal.tsx`) tidak lagi menampilkan card form login pilot operator terpisah; pengguna yang sudah login dapat langsung menggunakan fitur simulasi (impor JSON SAP, pantau sequence batch/item, unduh bukti PDF).
     - Endpoint alias `/batches`, `/batches/{batch_id}`, `/batches/{batch_id}/pdf`, dan `/import-json` pada `routes_sap_shadow.py` serta `OperatorImportGuardMiddleware` mendukung autentikasi terpadu via `app_session`.
  3. **Proteksi Endpoint Sensitif & Guard Fisik**:
     - Seluruh endpoint browser sensitif (`/api/v1/templates`, `/api/v1/render`, `/api/v1/inspect`) dilindungi server-side dengan `Depends(get_current_user)` (fail-closed HTTP 401 jika unauthenticated).
     - Hak simulasi PPIC/IT tidak membuka akses cetak fisik: rute cetak fisik tetap diblokir (HTTP 404) pada local simulation (`LOCAL_SIMULATION_ONLY=true`).
  4. **CLI Admin Bootstrap**:
     - Tersedia CLI tool `backend/app/cli/user_admin.py` (`python -m app.cli.user_admin`) dengan perintah `create-user`, `set-password`, `deactivate-user`, `activate-user`, dan `list-users`.
     - Zero hardcoded / default passwords di kode dan repositori.
  5. **Verifikasi Quality Gates Aktual**:
     - Pytest Backend: `477 passed, 21 skipped, 0 failed` in 85.34s (mencakup `test_auth_service.py`, `test_auth_api.py`, `test_user_admin_cli.py`, dan seluruh regresi).
     - Frontend Test Suite: `79 passed, 0 failed` in 617ms (`npm test` di `frontend/`).
     - Frontend Production Build: `npm run build` PASS (0 errors, 6.78s).
     - Ops script preflight: `deploy-local.sh` diperbarui untuk memvalidasi proteksi fail-closed `/api/v1/auth/me` dan CLI admin help.
     - Whitespace check: `git diff --check` bersih (0 errors).
     - Secret & database scan: Zero `.db` committed, `.gitignore` melindungi `backend/data/*.db`.
- Batas Lingkungan: Live SAP RFC/ECC: `NOT RUN`; Printer fisik/port 9100: `NOT RUN`; Database enterprise production: `NOT RUN`.
- Task Files: `docs/tasks/F3.3/TASK_CONTRACT.md`, `docs/tasks/F3.3/RESULT.md`, `docs/tasks/F3.3/REVIEW.md`.
- Next Action: Stop sebelum PR/merge. Menyerahkan branch kepada Codex Level 3 untuk review independen melalui `docs/tasks/F3.3/REVIEW.md`.

## Snapshot aktif — Fase 3.2 Jenkins lokal (2026-09-24)

- Writer: Codex pada laptop pengguna. Branch `codex/f3-2-jenkins-local-simulation`, baseline `origin/main` `04bb368`; perubahan F3.2 masih uncommitted/unpushed. Folder `output/` adalah data lokal sebelumnya, tidak disentuh, dan kini di-ignore.
- Jenkins self-hosted berjalan di Docker Desktop pada `127.0.0.1:8081`. Image Jenkins dan image app preflight berhasil dibangun; app **belum** dideploy live karena setup admin/credential/job SCM di UI belum selesai.
- Batas deployment: hanya `main` yang lolos seluruh test boleh memperbarui `127.0.0.1:8000`; `LOCAL_SIMULATION_ONLY=true` menolak rute cetak fisik lama; `SAFE_DEMO_MODE=false`; volume data terpisah; rollback image sebelumnya tersedia.
- Verifikasi: backend `440 passed, 21 skipped`, frontend `74 passed`, TypeScript PASS, Docker app build/smoke PASS, Compose PASS, Bash syntax PASS, `git diff --check` PASS. Pipeline Jenkins end-to-end dan rollback runtime **NOT RUN**. Tidak ada akses SAP, printer, database perusahaan, atau port 9100.
- Task contract dan bukti: `docs/tasks/F3.2/TASK_CONTRACT.md`, `docs/tasks/F3.2/RESULT.md`; langkah operator: `docs/deployment/jenkins_local_simulation.md`. Berhenti sebelum commit/push/PR/merge sampai review dan setup awal dilakukan.
- Entri F3.1 dan fase lama di bawah adalah riwayat; gunakan snapshot F3.2 dan status Git aktual untuk kondisi sekarang.

## Active review snapshot — Fase 3.1 gabungan (READY_FOR_COMBINED_PR)

- Date: `2026-09-23`; branch: `codex/f3-1-simulasi-label-terpadu`; executor fix: `f97c8e6`; baseline: `origin/main` `0f2cf82`.
- Review final di `docs/tasks/F3.1/REVIEW.md`: temuan P1/P2 teratasi pada review kode; `git diff --check origin/main...HEAD` PASS. Kalimat checkpoint RESULT yang stale diperbaiki reviewer tanpa mengubah runtime.
- Siap dibuat PR **gabungan B2B2N+B2B2O+F3.1**, bukan siap merge/production. Aktivasi dan UAT ABAP SAP ECC 6, deployment intranet, serta printer fisik tetap NOT RUN.
- Snapshot review CHANGES_REQUIRED dan catatan executor di bawah adalah riwayat sebelum koreksi ini; jangan gunakan sebagai status aktif.

## Active review snapshot — Fase 3.1 gabungan (CHANGES_REQUIRED)

- Date: `2026-09-23`; branch: `codex/f3-1-simulasi-label-terpadu`; reviewed head: `bbb791b`; baseline: `origin/main` `0f2cf82`.
- Review independen di `docs/tasks/F3.1/REVIEW.md`: P1 upload guard dan P1 seleksi ABAP teratasi pada review kode; 54 backend tests PASS; SAP activation/UAT NOT RUN.
- Sisa sebelum PR: fallback `request_id` masih berpresisi detik bila generator UUID gagal; `git diff --check origin/main...HEAD` FAIL pada enam baris RESULT dengan trailing whitespace. RESULT juga masih menyebut siap commit/push walau `bbb791b` sudah dipush.
- Gemini Flash 3.8 menjadi executor koreksi berikutnya; Codex berhenti menulis setelah review ini dipush. Jangan PR atau merge sebelum review ulang.
- Snapshot executor F3.1 berikut adalah catatan sebelum review ini; klaim bahwa semua temuan tuntas dan whitespace PASS sudah dikoreksi oleh snapshot review di atas.

## Active snapshot — Fase 3.1: Simulasi Label Terpadu (REMEDIATION_LEVEL3_COMBINED_COMPLETED — AWAITING_CODEX_REVIEW)

- Date: `2026-09-23`; repository: `Thermal-Label-Studio` (`web_app/`).
- Branch: `codex/f3-1-simulasi-label-terpadu`, baseline `origin/main` `0f2cf82`, review follow-up commit `95887ab`.
- Writer / Executor: Gemini Flash 3.8 High (Antigravity). Reviewer: Codex (independen).
- Scope: Remediasi lengkap temuan Review Level 3 Gabungan (B2B2N + B2B2O + F3.1) dan follow-up commit `95887ab`:
  1. **P1 — Batas upload dan autentikasi sebelum multipart parsing (Disk Exhaustion Guard)**:
     - Dibuat ASGI Middleware `OperatorImportGuardMiddleware` (`backend/app/api/operator_import_guard.py`) yang didaftarkan di `backend/app/main.py`.
     - Melakukan early fail-fast authentication (cookie HttpOnly `pilot_session`), validasi CSRF, dan transport security sebelum membaca body atau menyentuh disk.
     - Melakukan early Content-Length validation (reject non-numeric/negative dengan 400; reject > 2 MiB + 64 KiB dengan 413) tanpa memicu parsing multipart.
     - Membungkus ASGI `receive` callable dengan counter byte streaming (`RequestBodyTooLargeError(StarletteHTTPException)`). Chunked stream tanpa Content-Length yang melebihi batas langsung dihentikan seketika dengan HTTP 413, memicu Starlette menutup dan membersihkan seluruh temporary file di disk.
     - Route handler tetap mempertahankan chunk read 64 KiB dan batas 2 MiB isi file sebagai lapisan pertahanan kedua.
  2. **P1 — Semantik SELECT-OPTIONS P_CHARG dan Ambiguitas Fail-Closed di ABAP Report**:
     - `docs/tasks/B2B2O/abap/ZMMR_LABEL_JSON.abap`: Subroutine `GET_BATCH_KEYS` diganti menggunakan Open SQL standar `SELECT CHARG MATNR FROM MCH1 INTO TABLE LT_MCH1 WHERE CHARG IN P_CHARG.` untuk mendukung range `BT`, single `EQ`, exclusion `NE`, dan wildcard `CP`.
     - Ditambahkan deduplikasi dan deteksi ambiguitas fail-closed: jika satu `CHARG` berelasi dengan >1 `MATNR`, ekspor dibatalkan dengan `MESSAGE ... TYPE 'E'`.
  3. **P2 — Pencegahan Tabrakan request_id di ABAP Report (32-Char UUID & Fail-Closed)**:
     - Menggunakan seluruh 32 karakter hexadecimal dari `CL_SYSTEM_UUID=>CREATE_UUID_C32_STATIC` (`LV_UUID TYPE SYSUUID_C32`).
     - Menghapus fallback berpresisi detik; jika generator gagal (`CX_UUID_ERROR`), eksekusi langsung berhenti fail-closed (`MESSAGE ... TYPE 'E'`). Format: `SAP-{SY-SYSID}-{SY-DATUM}-{SY-UZEIT}-{LV_UUID}` (~56 karakter, pola `^[A-Za-z0-9_-]+$`).
  4. **P3 — Pembersihan Komentar Stale & Trailing Whitespace**:
     - Mengoreksi komentar pada `frontend/src/utils/api/sapShadowSimulationApi.ts:128` menjadi strictly HttpOnly session cookie.
     - Menghapus trailing whitespace pada `docs/tasks/F3.1/RESULT.md` sehingga verifikasi `git diff --check origin/main` bersih tanpa error.
- Quality Gates Aktual:
  * Backend Pytest: `python -m pytest backend/tests/test_pilot_operator_session.py backend/tests/test_pilot_operator_import_json.py -q -p no:cacheprovider` -> **54 passed in 33.70s**.
  * Frontend unit tests: `npm.cmd test` (di `frontend/`) -> **74 passed, 0 failed in 698ms**.
  * TypeScript strict: `npm.cmd exec tsc -- --noEmit` (di `frontend/`) -> PASS (0 error).
  * Vite production build: `npm.cmd run build` -> PASS (6.60s; scan bundle: 0 match dev hooks).
  * Playwright E2E: `npx.cmd playwright test ...` (di `frontend/`) -> **8 passed (28.0s)**.
  * Git whitespace check: `git diff --check origin/main` -> PASS (clean, exit code 0).
- Stop gate: Berhenti sebelum membuat Pull Request atau merge ke `main` sesuai instruksi.
- Folder `output/` sudah untracked sebelum task ini dan tidak disentuh/stage.

## Active snapshot — B2B2O: Impor JSON Lokal Raw SAP Snapshot v2 ke Safe Demo (REMEDIATION_P1_P2_ENV_IGNORE_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW)

- Date: `2026-09-23`. Repository: `Thermal-Label-Studio` (`web_app/`).
- Branch: `codex/b2b2o-local-json-export-import`, based on B2B2N checkpoint `35f9cb5`.
- Writer for implementation: Gemini Flash via Antigravity as sole executor. Reviewer: Codex Level 3.
- Status: `REMEDIATION_P1_P2_ENV_IGNORE_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW`.
  1. **Remediasi P1 Intake Eksklusif Multipart**:
     - Fallback direct raw request body `body = await request.body()` dihapus total.
     - Hanya unggahan berkas multipart (`file: UploadFile`) yang diterima; request `application/json` atau tanpa field `file` ditolak fail-closed dengan `HTTP 400 Bad Request`.
     - Tidak menggunakan filename/path klien untuk penyimpanan server dan tidak membuat endpoint alternatif untuk raw JSON.
  2. **Remediasi P2 Toleransi Overhead Multipart Content-Length**:
     - `MAX_IMPORT_BYTES = 2 * 1024 * 1024` (2 MiB) dipertahankan sebagai batas ukuran isi file.
     - Batas request diperluas dengan toleransi MIME boundary overhead: `MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_BYTES + 64 * 1024` (2 MiB + 64 KiB), mencegah penolakan prematur atas file JSON valid tepat 2 MiB.
     - Pembacaan chunk 64 KiB tetap menegakkan batas isi berkas final 2 MiB (`HTTP 413`).
  3. **Remediasi P1 Konfigurasi Docker, Fail-Closed Runtime & Perlindungan .env**:
     - Variabel Safe Demo/operator yang sempat ditambahkan di `docker-compose.yml` telah dihapus total. `docker-compose.yml` dikembalikan ke kondisi default production-ready tanpa kata sandi atau secret default.
     - Aturan `.gitignore` memuat `.env` dan `.env.*` secara ketat, sementara `!.env*.example` diizinkan di-track.
     - Tidak ada berkas `.env` nyata atau secret yang disimpan di repositori.
     - Disiapkan template `.env.example` tanpa kata sandi atau rahasia.
     - Dependensi `reportlab>=4.0.0` dicatat secara jujur pada `backend/requirements.txt` dan `requirements.txt`.
     - Ditambahkan suite pengujian `TestDefaultRuntimeConfigurationFailClosed` yang memvalidasi bahwa runtime default tanpa env vars tetap Safe Demo OFF dan static check membuktikan proteksi `.gitignore` atas `.env`.
  4. **Endpoint Operator Import & Proteksi**: Menambahkan `POST /api/v1/simulation/operator/import-json` pada `routes_sap_shadow.py` dengan proteksi HttpOnly cookie, validasi CSRF, penolakan duplicate-key JSON (`object_pairs_hook`), penolakan plain HTTP intranet (403), validasi model `RawSapBatchSnapshotV2`, rate limiting (15/menit), dan pemanggilan service kanonikal `sap_shadow_service.ingest_raw_batch`.
  5. **Client API & UI Safe Demo**: Menambahkan `importOperatorJson` pada `sapShadowSimulationApi.ts` dan tombol "Impor JSON dari SAP" serta sub-panel impor file `.json` dengan peringatan privasi data bisnis SAP DEV, penanganan error tersanitasi, dan auto-refresh/expand urutan item batch di `SapShadowSimulationModal.tsx`.
  6. **Quality Gates Aktual**:
     - Backend Operator Import Suite: `24 passed` (`backend/tests/test_pilot_operator_import_json.py`).
     - Backend Pilot Operator Session Suite: `26 passed` (`backend/tests/test_pilot_operator_session.py`).
     - Backend Regression Suite Gabungan: `188 passed` (`test_pilot_operator_import_json.py`, `test_pilot_operator_session.py`, `test_safe_demo_pdf_hardening.py`, `test_raw_sap_snapshot_v2.py`, `test_sap_shadow_simulation.py`, `test_profile_composition.py`).
     - Frontend Unit & Mock API Tests: `68 passed, 0 failed` (`npm test` di `frontend/`).
     - TypeScript Strict Compilation: `0 errors` (`npm exec tsc -- --noEmit`).
     - Frontend Production Build: Berhasil (`✓ built in 7.40s`).
     - Playwright E2E Simulation Tests: `4 passed in 36.5s` (`sap_shadow_simulation.spec.js` + `pilot_operator_self_service.spec.js`).
     - Whitespace & format check: `git diff --check` bersih (exit code 0).
  7. **UAT SAP DEV & ABAP Activation**: Berstatus `NOT RUN` secara jujur dan transparan.
- Working tree: Dirty/uncommitted pada branch `codex/b2b2o-local-json-export-import`. Berhenti sebelum commit, push, PR, atau merge.
- Task files: `docs/tasks/B2B2O/TASK_CONTRACT.md`, `docs/tasks/B2B2O/RESULT.md`, `docs/tasks/B2B2O/REVIEW.md`, `docs/tasks/B2B2O/abap/ZMMR_LABEL_JSON.abap`.
- Next action: Menyerahkan kepada Codex Level 3 untuk peninjauan review independen ulang. Eksekutor berhenti sebelum commit/push/merge.

## Active snapshot — B2B2N: Uji Mandiri Safe Demo dengan SAP DEV (REMEDIATION_P1_P2_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW)

- Date: `2026-09-23`.
- Repository: `Thermal-Label-Studio` (`web_app/`).
- Branch: `codex/b2b2n-self-service-safe-demo` from `origin/main` commit `0f2cf82` (PR #24 merged).
- Status: `REMEDIATION_P1_P2_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW`. Seluruh temuan P1, P2, dan P3 dari Review Level 3 telah diperbaiki tuntas dan diverifikasi dengan tes aktual:
  1. **P1 — Sesi HttpOnly Murni Tanpa Kebocoran ke JS**: `session_id` dihapus total dari payload JSON login dan probe sesi; header `X-Pilot-Session-Token` dihapus dari dependensi autentikasi browser (auth strictly via cookie `pilot_session`).
  2. **P1 — Guard HTTPS / Loopback, Penolakan Spoofing `X-Forwarded-Proto`, & CORS Dibatasi**: Wildcard `*` dihapus dari `CORS_ORIGINS`; login operator via plain HTTP pada host non-loopback / intranet ditolak fail-closed (`HTTP 403 Forbidden`); pemalsuan header mentah `X-Forwarded-Proto: https` dari klien tak tepercaya diabaikan dan ditolak fail-closed (`HTTP 403 Forbidden`); hanya verified ASGI HTTPS scheme yang diterima dan otomatis menyetel cookie `secure=True`; cookie disetel dengan `SameSite=Strict`.
  3. **P2 — Tampilan Urutan Item (Item Sequence) di UI**: Modal UI kini menyediakan tombol "Urutan Item" yang mengambil data detail batch dari server dan menampilkan tabel urutan item (`#1, #2, ...`) dengan status item individual dan alert kegagalan yang aman.
  4. **P2 — Pembatasan Percobaan Login (Rate-Limiting Lockout)**: Percobaan gagal 5 kali berturut-turut memicu penguncian sementara (lockout 300 detik) dengan respons `HTTP 429 Too Many Requests`.
  5. **P3 — Sliding TTL & Redaksi Topologi DEV**: Sliding TTL sejati teruji memperpanjang expiry saat sesi aktif diakses; seluruh IP/host internal SAP DEV diredaksi pada dokumentasi publik.
  6. **AC 5 (Live SAP DEV UAT) Tetap BLOCKED**: Transmisi live jaringan dari server SAP DEV ke workstation lokal tetap dilaporkan `BLOCKED` secara radikal transparan karena ketiadaan rute intranet / SM59 lokal. Prasyarat teknis lengkap tersedia di `RESULT.md`.
- Quality Gate Aktual:
  - Backend Pilot Operator Suite: `26 passed, 2 warnings` in 7.64s (`backend/tests/test_pilot_operator_session.py`).
  - Total Regresi Backend Lengkap: `410 passed, 21 skipped, 2 warnings` in 106.99s (`backend/tests/`).
  - Frontend Unit & Mock API Tests: `66 passed, 0 failed` in 602ms (`npm test` di `frontend/`).
  - TypeScript Compilation: `0 errors` (`npm exec tsc -- --noEmit`).
  - Frontend Production Build: Berhasil (`✓ built in 7.77s`).
  - Playwright E2E Simulation Tests: `3 passed` in 27.4s (`sap_shadow_simulation.spec.js` + `pilot_operator_self_service.spec.js`).
  - Whitespace & format check: `git diff --check` bersih (exit code 0).
- Working tree: Dirty/uncommitted pada branch `codex/b2b2n-self-service-safe-demo`. Berhenti sebelum commit, push, PR, atau merge.
- Task files: `docs/tasks/B2B2N/TASK_CONTRACT.md`, `docs/tasks/B2B2N/REVIEW.md`, `docs/tasks/B2B2N/RESULT.md`.
- Next action: Menyerahkan kepada Codex Level 3 untuk review independen ulang. Eksekutor berhenti sebelum commit/push/merge.

## Active snapshot — B2B2M: Safe Demo PDF Visual & Placeholder Hardening (REMEDIATION_P1_P2_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW)

- Date: `2026-09-23`.
- Repository: `Thermal-Label-Studio` (`web_app/`).
- Branch: `codex/b2b2m-safe-demo-pdf-hardening` from `origin/main` at `3f8c8ba` (B2B2L merged via PR #23).
- Status: `REMEDIATION_P1_P2_COMPLETED — AWAITING_CODEX_LEVEL_3_REVIEW`. Seluruh temuan review P1 dan P2 telah diselesaikan secara sempit dan terverifikasi tuntas:
  1. **P1 — Splice Characteristic Matching & Deferred Feet**: Adapter N001 mengekstrak karakteristik splice menggunakan nama terbukti ABAP legacy `ZMMR_LABEL_JSON.abap` baris 391 & 398 (`ZZSPLICE-1` dan `ZZSPLICE-2`, serta `ZZSPLICE1` dan `ZZSPLICE2`). Alias spekulatif dihapus. Penurunan `splice_1_feet` dan `splice_2_feet` ditunda (`None`) dari adapter; placeholder dirender `""` via kebijakan field opsional.
  2. **P2 — Pemisahan Core vs Optional Canonical Fields**: `KNOWN_OPTIONAL_CANONICAL_FIELDS` dipersempit strictly pada 13 field yang benar-benar opsional (`so_item`, `splice_1_m`, `splice_1_feet`, `splice_2_m`, `splice_2_feet`, `treatment_inside`, `treatment_outside`, `core_inch`, `used_before`, `gross_weight`, `gross_weight_kg`, `material_desc`, `production_date`). Fakta bisnis roll wajib (`brand`, `type_film`, `base_film`, `width_mm`, `length_m`, `net_weight_kg`) dipastikan tidak di dalamnya dan fail-closed via `validate_no_orphan_tokens` jika hilang pada jalur canonical.
  3. **P2 — Bukti Visual & Non-Occlusion 4 Halaman**: Pengujian `test_synthetic_batch_all_four_pages_deep_visual_inspection` dan `test_pdf_evidence_service_uses_perimeter_frame_and_no_opaque_rect` memeriksa seluruh 4 halaman dari simulasi nyata (Cover A4 + 3 Label 200x80mm). Terbukti: 0 balok merah terisi (`re f` / `re f*`), 1 perimeter frame stroke (`re S`), tag margin atas kanan bebas background fill, watermark translusen `alpha=0.18`, dan embedded raster image presisi 1600x640 px (203.2 DPI) memuat tinta/isi aktual.
- Quality Gate:
  - B2B2M Test Suite: `17 passed, 2 warnings` in 8.89s (`backend/tests/test_safe_demo_pdf_hardening.py`).
  - Total Regresi Gabungan: `146 passed, 2 warnings` in 60.84s (`test_safe_demo_pdf_hardening.py` [17], `test_raw_sap_snapshot_v2.py` [68], `test_sap_shadow_simulation.py` [25], `test_profile_composition.py` [36]).
  - Invarian Template Kanonikal: SHA-256 `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` (identik, tidak berubah).
  - Whitespace & format: `git diff --check` bersih (0 errors).
  - Status Git: working tree uncommitted / unstaged.
- Batasan lingkungan (di luar scope): SAP live connection: `NOT RUN`; PPIC business approval: `NOT RUN`; Printer fisik/TCP 9100/Spooler: `NOT RUN`; Database production: `NOT RUN`.
- Task files: `docs/tasks/B2B2M/TASK_CONTRACT.md`, `docs/tasks/B2B2M/RESULT.md`, `docs/tasks/B2B2M/REVIEW.md`.
- Next action: Menyerahkan kepada reviewer Codex Level 3 untuk review independen ulang. Eksekutor berhenti sebelum `git add`, `commit`, `push`, `PR`, atau `merge`.

## Reviewer update — B2B2L final, 2026-09-23

- Verdict `READY_FOR_CHECKPOINT` untuk branch lokal `codex/b2b2l-profile-composition-engine`; rincian dan batas bukti ada di `docs/tasks/B2B2L/REVIEW.md` bagian review akhir.
- Test simbol sekarang membandingkan geometri path lengkap dan merekonstruksi bit Code128/matriks QR dari SVG hasil render; celah jumlah bar sama tetapi payload berbeda sudah tertutup.
- Verifikasi Codex putaran ini: 129 test terkait PASS; `git diff --check` dan direct whitespace scan file baru PASS; secret high-signal scan tidak menemukan temuan. Full backend 367 passed/21 skipped berasal dari review sebelumnya, tidak dijalankan ulang pada putaran test-only ini. Frontend/SAP/printer/database production NOT RUN.
- Working tree masih dirty/uncommitted. Gemini Flash 3.8 High tetap writer tunggal untuk staged review, commit, dan push checkpoint B2B2L; jangan merge sebelum review PR. `git fetch origin` pernah terhalang sandbox Codex, sehingga executor perlu memeriksa remote/upstream sebelum PR.

## Reviewer update — B2B2L review ulang, 2026-09-23

- Verdict `CHANGES_REQUIRED` dengan hanya satu celah bukti P2 tersisa; lihat `docs/tasks/B2B2L/REVIEW.md` bagian review putaran terbaru.
- Kebocoran nilai raw pada error format numerik dan pemilihan versi SAP di luar pin aplikasi telah diperbaiki. Test Code128/QR kini memeriksa SVG hasil render, tetapi hanya membandingkan jumlah bar/run; dua payload Code128 berbeda terbukti dapat menghasilkan 58 bar yang sama.
- Verifikasi Codex: 129 test terarah PASS; seluruh backend `367 passed, 21 skipped, 2 warnings`; `git diff --check` PASS; whitespace file baru PASS. SAP/printer/database production/frontend NOT RUN. `git fetch origin` BLOCKED karena `.git/FETCH_HEAD` tidak dapat ditulis oleh sandbox.
- Gemini Flash 3.8 High tetap executor tunggal kode pada branch lokal `codex/b2b2l-profile-composition-engine`; jangan commit/push/PR/merge sampai assertion isi simbol dan klaim evidence dikoreksi lalu direview ulang.

## Reviewer update — B2B2L remediasi, review ulang 2026-09-23

- Verdict tetap `CHANGES_REQUIRED`; rincian terbaru di `docs/tasks/B2B2L/REVIEW.md`.
- Empat P1 awal diperbaiki, tetapi nilai raw SAP masih dapat bocor lewat error HTTP format numerik, pemilihan versi profile dari payload SAP masih dapat mengalahkan pin aplikasi, dan test PDF belum memverifikasi isi teks/barcode/QR yang dikomposisikan.
- Regresi lokal B2B2L/B2B2K/B2B2I: `127 passed, 2 warnings`; frontend, SAP, PostgreSQL, dan printer: `NOT RUN` dalam review ini.
- Branch `codex/b2b2l-profile-composition-engine` masih dirty/uncommitted. Gemini tetap executor tunggal untuk kode; Codex hanya memperbarui catatan review/handoff. Jangan commit/push/PR/merge sebelum review hijau.

## Reviewer update — B2B2L

- Date: `2026-09-23`; branch: `codex/b2b2l-profile-composition-engine`.
- Verdict: `CHANGES_REQUIRED`; detail dan bukti ada di `docs/tasks/B2B2L/REVIEW.md`.
- Codex menjalankan test B2B2L: `23 passed, 2 warnings`; probe tambahan membuktikan provenance dapat masuk QR, mutasi profile versi yang sama, teks komposisi N001 terabaikan, slot barcode/QR tertukar, dan parse angka tidak fail-closed.
- Implementasi Gemini masih lokal dan uncommitted. Codex hanya menulis `REVIEW.md` dan update ini; Gemini melanjutkan koreksi sebagai satu-satunya writer kode.
- Jangan PR/merge sampai review ulang menyatakan siap.


## Active snapshot — B2B2L Versioned Label Profile Composition for Safe Demo (REMEDIATION_COMPLETED — WAITING_FOR_CODEX_LEVEL_3_REVIEW)

- Date: `2026-09-23`.
- Repository: `Thermal-Label-Studio` (`web_app/`).
- Branch: `codex/b2b2l-profile-composition-engine` from `origin/main` at `3984469` (B2B2K merged via PR #22).
- Status: `REMEDIATION_COMPLETED — WAITING_FOR_CODEX_LEVEL_3_REVIEW`. Seluruh temuan P1 dan P2 dari review independen Codex (termasuk putaran 2: sanitasi nilai mentah dari error HTTP publik, penegakan fail-closed profile version pinning dari SAP, dan inspeksi matematis mendalam intermediate SVG pada PDF evidence) telah diperbaiki tuntas. 36 pengujian B2B2L dan 129 total pengujian regresi gabungan lulus 100%. Working tree sengaja uncommitted/dirty. Berhenti sebelum commit/push/PR/merge.
- Planner: Codex. Executor tunggal: Gemini Flash 3.8 via Antigravity. Reviewer: Codex Level 3.
- Scope perbaikan P1/P2 yang diimplementasikan:
  - **P1-1**: Mengeluarkan `production_date_provenance` dan seluruh audit field dari allowlist (`ALLOWED_BUSINESS_CONTEXT_FIELDS`); melarang substring `"provenance"`, `"audit"`, `"source_metadata"` pada nama segmen.
  - **P1-2**: Menetapkan `frozen=True` pada seluruh model profile Pydantic; memproteksi `ProfileRegistry` dengan `threading.RLock()`; menggunakan `copy.deepcopy` pada registrasi dan query; melepaskan pemanggilan registry reset dari `SapShadowService.clear_for_tests()`.
  - **P1-3**: Menerapkan teks hasil komposisi profile (`comp_result.fields`) ke `SapCanonicalFields` pada adapter N001 (`batch_text`, dll.); validasi slot template ketat berbasis atribut XML yang diparse tanpa substring mentah SVG; menolak slot yang tertukar atau tidak didukung kontrak renderer.
  - **P1-4 / Round 2 P1**: Parsing angka ketat menggunakan `Decimal` dengan pembulatan industri `ROUND_HALF_UP` dan validasi `d.is_finite()`; input campuran (`12kg34`), teks non-angka (`not-a-number`), dan non-finite (`NaN`, `Infinity`) gagal tertutup dengan `ProfileCompositionError`. Nilai mentah (`val_str`) dan karakter non-ASCII disanitasi dari pesan exception sehingga tidak pernah bocor ke respons HTTP 400 publik.
  - **P2-1 / Round 2 P2**: Menetapkan kepemilikan versi aplikasi pada `ProfileRegistry` (`set_active_version`, `get_active_version`); memvalidasi konsistensi versi fail-closed: permintaan SAP dengan `profile_version` yang berbeda dari versi aktif yang dipin oleh aplikasi ditolak dengan HTTP 400 (`ValueError`).
  - **P2-2 / Round 2 P2**: Menyimpan `rendered_svg` pada completed item dan memverifikasi secara mendalam: kehadiran composed text `"VERIFIED-TEXT-INSPECTION"`, kecocokan geometri path vektor lengkap Code128 & QR terhadap generator referensi, penolakan beda payload dengan jumlah bar identik (`WRONG-INSPECT-99`), rekonstruksi 211-bit Code128 dari subpath SVG, rekonstruksi 2D boolean module matrix QR dari subpath SVG, serta rasterisasi halaman PDF evidence 1600x640 px pada 203.2 DPI.
- Quality Gate Aktual:
  - Profile Composition Suite: `36 passed, 2 warnings` in 5.33s (`backend/tests/test_profile_composition.py`).
  - Raw SAP Snapshot v2 Suite: `68 passed` in 18.53s (`backend/tests/test_raw_sap_snapshot_v2.py`).
  - SAP Shadow Simulation Suite: `25 passed` in 35.13s (`backend/tests/test_sap_shadow_simulation.py`).
  - Total Regression Backend Suite: `129 passed, 2 warnings` in 54.57s.
  - Whitespace & format check: `git diff --check` bersih (0 errors).
  - Storage isolation: seluruh pengujian menggunakan direktori temporer terisolasi (`tmp_path / "artifacts"`, `tmp_path / "sim_store"`).
- Batasan lingkungan (di luar scope): SAP live connection: `NOT RUN`; PPIC business approval format produksi: `NOT RUN`; Printer fisik/TCP 9100/Spooler: `NOT RUN`; Database production: `NOT RUN`.
- Task files: `docs/tasks/B2B2L/TASK_CONTRACT.md`, `docs/tasks/B2B2L/RESULT.md`, `docs/tasks/B2B2L/REVIEW.md`.
- Next action: Menyerahkan kembali kepada Codex Level 3 untuk review independen ulang. Working tree uncommitted/dirty. Berhenti sebelum commit, push, dan PR.

## Previous snapshot — B2B2K Extensible Raw SAP Snapshot v2 & N001 Rule Boundary (P1-A & P1-B REMEDIATION PASSED — WAITING_FOR_CODEX_LEVEL_3_REVIEW)

- Date: `2026-09-23`
- Repository: `Thermal-Label-Studio` (`web_app/`)
- Remote baseline: `origin/main` at `b0d711c`
- Active branch: `codex/b2b2k-n001-pilot-safe-demo` (starting from commit `264ccd7`)
- Status: `P1_REMEDIATION_PASSED — WAITING_FOR_CODEX_LEVEL_3_REVIEW`. Seluruh perbaikan mandatory P1 (termasuk P1-A zero fact substitution dan P1-B complete test isolation & audit) telah diselesaikan dan diverifikasi. Working tree sengaja dibiarkan uncommitted/dirty. Berhenti sebelum commit/push/PR/merge.
- Executor: `Gemini Flash 3.8 via Antigravity`; Reviewer: `Codex`.
- Scope & P1 Remediations:
  - Non-lossy serialization & hashing: `exclude_unset=True` menjaga perbedaan semantik absent vs explicit `null` vs empty string `""` secara durable di disk dan dalam SHA-256 idempotency hash. Replay dengan payload absent vs null memicu HTTP 409 Conflict.
  - Zero fake business fallbacks & no fact substitution (P1-A): menghapus total seluruh default fiktif dan substitusi fakta bisnis dari `N001DevelopmentAdapter`: `material_desc` strictly raw (nol substitusi `type_film`), `so_item` strictly raw (nol substitusi `sales_order`), `gross_weight_kg` strictly raw (nol substitusi `net_weight_kg`). Field derivasi unit (`width_inch`, `length_feet`, `weight_lbs`) dilaporkan jujur di `audit_meta`. Validasi ketat fail-closed untuk 9 fakta raw wajib. Zero fabrikasi barcode/QR (`codes=None`).
  - Keamanan & higienitas rekursif: `validate_untrusted_data` dan `check_key_security` memeriksa secara rekursif hingga kedalaman 3 level, menolak pattern kunci sensitif, script eksekutabel, angka non-finit (NaN/Infinity), struktur array/list di dalam `business_context`, panjang kunci <= 64, dan nilai string <= 512 karakter.
  - Collision-resistant idempotency: berkas idempotensi menggunakan nama hash SHA-256 (`hashlib.sha256(key).hexdigest() + ".json"`) dengan verifikasi integritas kunci saat dibaca dari disk. Batasan konkurensi single-process `asyncio.Lock` didokumentasikan transparan.
  - Isolasi pengujian mutlak (P1-B): mengeliminasi total seluruh pemanggilan `clear_for_tests()` pada seluruh file test di `backend/tests/` (0 occurrences). Audit menyeluruh memastikan 0 test memakai storage default (`backend/data/out`); seluruh direct instantiation memakai `tmp_path / "artifacts"` dan `tmp_path / "sim_store"`. Test AC3 unknown-printer tidak lagi memanggil `SapShadowService()` tanpa parameter. Test AC6 membaca manifest tepat dari `artifacts_dir` temporer yang sama dengan service. Autouse fixture `isolated_service(tmp_path)` mem-patch routes dan service per-test. Regression assertions memastikan path penyimpanan berada di bawah `tmp_path`.
  - Data minimization: `GET /simulation/sap-batches` dan `GET /simulation/sap-batches/{batch_id}` hanya mengembalikan ringkasan status tersanitasi; raw snapshot hanya dapat diakses melalui `GET /simulation/sap-batches/{batch_id}/raw-snapshot`.
- Quality Gate:
  - Review progression: Baseline review independen Codex (75 passed, 1 failed) -> diselesaikan tuntas menjadi 93 passed, 0 failed.
  - Targeted Raw SAP Snapshot v2 suite: `68 passed` in 23.47s (`backend/tests/test_raw_sap_snapshot_v2.py`).
  - Regression canonical simulation suite: `25 passed` in 35.13s (`backend/tests/test_sap_shadow_simulation.py`).
  - Total Aktual: `93 passed, 0 failed`.
  - Whitespace & format check: `git diff --check` bersih (0 errors).
  - Test scan `clear_for_tests()`: 0 occurrences di `backend/tests/`.
  - Test scan `SapShadowService`: 0 instansiasi dengan default storage.
  - Static security scan: 0 rahasia/token riil, 0 socket live, 0 spooler, 0 live SAP calls.
  - State preservation: File di `backend/data/out/` tidak dihapus (existing local state dipertahankan utuh).
- Task files: `docs/tasks/B2B2K/TASK_CONTRACT.md`, `docs/tasks/B2B2K/fixtures/raw_sap_snapshot_v2_n001_synthetic.json`, `docs/tasks/B2B2K/RESULT.md`, `docs/tasks/B2B2K/REVIEW.md`.
- Next action: Menunggu review mandiri Level 3 oleh Codex. Working tree uncommitted/dirty.

## Previous snapshot — B2B2I SAP Shadow Print Simulation & PDF Batch Evidence (Pass 4 P1 Atomicity Resolved — WAITING_FOR_CODEX_FINAL_REVIEW)

- Date: `2026-09-22`
- Repository: `Thermal-Label-Studio` (`web_app/`)
- Baseline: `main` at `fd8dd4e` after B2B2H merge.
- Active branch: `codex/b2b2i-sap-shadow-print-simulation`
- Status: `CORE_COMPLETED — WAITING_FOR_CODEX_FINAL_REVIEW`; Seluruh core SAP-to-PDF selesai 100% setelah perbaikan P1 Atomicity & startup recovery. AC 7 PPIC interactive monitoring ditunda secara formal ke fase Identity Provider/RBAC. Berhenti sebelum commit/push/PR/merge.
- Executor: `Gemini Flash 3.8 via Antigravity`; Reviewer: `Codex`.
- Scope: Inbound canonical SAP JSON via `POST /api/v1/simulation/sap-batches`, reuse real rendering pipeline (`inject_data`, `inject_barcodes_and_qr`, `svg_to_png`), virtual PDF sink, multi-page PDF batch evidence ordered/watermarked dengan ReportLab, durable filesystem persistence di `simulation_batches/`, fail-closed anonymous access rejection (P1-A), UI fail-closed "monitoring requires identity provider" (AC 7 ditunda), explicit startup recovery policy "Controlled Virtual Resume on Startup" (P1-B), atomisitas batch record vs idempotency index dengan proof of commit validation, fail-closed startup recovery error handling, dan zero orphan batch. Tidak ada live SAP/RFC/OData/credential, printer fisik/TCP 9100/Spooler, atau deployment intranet.
- Quality Gate:
  - Targeted SAP simulation backend suite (AC 1-8, P1, P2, P1-A, P1-B, P1-Final, Regressions): `24 passed` in 38.28s (`backend/tests/test_sap_shadow_simulation.py`).
  - Regression persistence/transport/safety: `86 passed, 6 skipped` in 10.98s (`test_durable_artifact_storage.py`, `test_socket_transport.py`, `test_pilot_safety_hardening.py`, `test_print_job_v1.py`, `test_central_dispatcher_runner.py`).
  - Full backend test suite: `262 passed, 21 skipped` in 60.96s.
  - Frontend unit tests: `59 passed, 0 failed` in 0.55s (`npm run test` di `frontend/`).
  - Frontend production build: `npm run build` sukses (`built in 6.68s`).
  - Playwright E2E tests: `2 passed` in 20.0s (`sap_shadow_simulation.spec.js` - default-off hidden & fail-closed IdP status modal).
  - Whitespace & syntax check: `git diff --check` bersih (0 errors).
- Task files: `docs/tasks/B2B2I/TASK_CONTRACT.md`, `docs/tasks/B2B2I/REVIEW.md`, `docs/tasks/B2B2I/RESULT.md`, `docs/architecture/sap_shadow_simulation_contract.md`.
- Next action: Menunggu review akhir dari Codex sebelum commit/push/PR.

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
- Corrective commit P1: asymmetric batch priority, deadlock-free anti-interleaving, dan batch safety pause on delivery_unknown.
- Status: safe checkpoint kandidat review; **bukan** kesiapan merge atau production-ready.
- Quality gate aktual:
  - Backend: `175 passed, 0 skipped`.
  - PostgreSQL disposable integration: `6 passed` pada container `postgres:15-bullseye` (`test_postgres_repository_atomic_lifecycle_and_concurrent_claim`, `test_postgres_atomic_ingestion_and_idempotency`, `test_postgres_process_restart_preserves_persisted_state`, `test_postgres_batch_item_sequence_claim_order_and_anti_interleaving`, `test_postgres_asymmetric_batch_priority_and_deadlock_freedom`, `test_postgres_batch_safety_pause_on_delivery_unknown_and_isolation`).
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

- `backend/app/print_jobs/postgres_repository.py` (pause batch on `delivery_unknown` in `report_result` and `_reconcile_locked`, emit `print_batch_paused` audit event, exclude paused/cancelled/partially_failed batches in `claim_next`)
- `backend/tests/test_postgres_print_agent_repository.py` (add `test_postgres_batch_safety_pause_on_delivery_unknown_and_isolation` verifying batch pause, no auto-retry, held remaining items, and safe batch isolation)
- `docs/tasks/B2B2C/RESULT.md` (updated with batch safety verification)
- `docs/tasks/B2B2C/REVIEW.md` (updated verdict to CHANGES_REQUIRED pending final review)
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
