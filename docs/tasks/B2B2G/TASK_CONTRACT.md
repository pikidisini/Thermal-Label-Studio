# Task Contract — B2B2G: Pilot Safety & Network Hardening

## Identitas

- Status: `IMPLEMENTED`
- Risk level: `3` (Menyentuh network binding, password safety gate, physical print fail-safe, dan registry persistence)
- Branch: `codex/b2b2g-pilot-safety-network-hardening`
- Baseline: `main` pada `e5aeec7` (B2B2F merged)
- Planner / Author: `Gemini Flash via Antigravity`
- Intended executor: `Gemini Flash via Antigravity` / `Agen Executor`
- Reviewer: `Codex / Principal AI Engineer & Staff Systems Architect`
- Active writer saat ini: `Gemini Flash via Antigravity`

---

## Tujuan

Memperkuat keamanan dan pencegahan insiden jaringan/fisik (*Pilot Safety & Network Hardening*) pada paket penyebaran Docker Compose pilot:
1. Mencegah eksposur database PostgreSQL ke LAN intranet pabrik secara default (bind `127.0.0.1` atau unbound host port).
2. Menegakkan penolakan password placeholder/default secara *fail-closed* agar lingkungan pilot tidak dapat dijalankan dengan kredensial default yang rentan.
3. Memasang *physical print dispatch safety gate* (`PRINT_DISPATCH_ENABLED=false` sebagai default) dan menyediakan mode transport `simulator` sebagai default aman untuk demonstrasi dan evaluasi tanpa perangkat fisik.
4. Mensanitasi `.env.pilot.example` agar bebas dari IP printer routable aktif di subnet kantor/pabrik.
5. Menjamin perlindungan registry printer di mana `seed_pilot` menolak menimpa data konfigurasi printer yang sudah ada (*overwrite protection*), kecuali menggunakan flag eksplisit `--force-update` dengan alasan audit trail.
6. Menyajikan hierarki evidensi pengujian yang transparan (memisahkan pengujian unit/mock, disposable PostgreSQL, dan printer fisik yang berstatus `NOT RUN` / `BLOCKED`).

---

## Keputusan Rancangan Awal

### 1. PostgreSQL Network Isolation (ADR-014)
- Pada `docker-compose.pilot.yml`, port host `db` diubah dari port terbuka `"${POSTGRES_PORT:-5432}:5432"` (yang secara default Docker mengikat ke `0.0.0.0`) menjadi hanya terikat pada loopback interface host:
  `"127.0.0.1:${POSTGRES_PORT:-5432}:5432"`.
- Kontainer aplikasi (`app`) dan worker (`dispatcher`) tetap berkomunikasi secara internal via bridge network `pilot_net` (`db:5432`) tanpa memerlukan publikasi port database ke jaringan LAN.

### 2. Runtime Validation: Penolakan Password Placeholder (Fail-Closed)
- Ditambahkan fungsi validasi keamanan kredensial pada `DispatcherRunnerConfig`, startup aplikasi FastAPI (`PrintAgentSettings`), dan skrip migrasi/seeding.
- Sistem menolak berjalan (*fail-closed*) jika `POSTGRES_PASSWORD` atau connection string memuat pola placeholder terlarang, seperti:
  - `pilot_password_replace_in_production`
  - `change_me`
  - `password`
  - `postgres`
  - `admin`
  - Panjang password < 12 karakter.
- Pesan kesalahan eksplisit:
  `CRITICAL SECURITY ERROR: Default/insecure placeholder password detected in POSTGRES_PASSWORD. You must configure a secure, unique password in .env before running pilot.`
- Pengecualian otomatis: Pengujian otomatis yang memakai container disposable terisolasi diizinkan melewati check ini hanya jika flag eksplisit `ALLOW_INSECURE_TEST_CREDENTIALS=true` disetel.

### 3. Physical Print Dispatch Safety Gate & Simulator Transport
- Environment variable baru: `PRINT_DISPATCH_ENABLED` dengan nilai default `false`.
- Environment variable baru: `DISPATCHER_TRANSPORT_MODE` dengan nilai default `simulator` (pilihan: `simulator`, `mock`, `tcp`).
- Aturan *Fail-Closed*:
  - Jika `DISPATCHER_TRANSPORT_MODE=tcp` (menggunakan `RawTcpSocketTransport` ke IP jaringan riil) TETAPI `PRINT_DISPATCH_ENABLED` bernilai `false` (atau tidak bernilai `true`), worker Central Dispatcher wajib menolak inisialisasi / menolak pengiriman dan keluar dengan error:
    `PhysicalPrintDisabledError: Physical printer dispatch is disabled (PRINT_DISPATCH_ENABLED=false). Direct TCP socket connection to <host>:<port> is blocked.`
- Mode `simulator` (Default):
  - Dibuat `SimulatorSocketTransport` yang mengimplementasikan `SocketTransport`.
  - Mode ini mensimulasikan transmisi socket sukses (atau mencatat ke file staging simulator / memory log) tanpa menyentuh soket TCP jaringan riil, sehingga demo, pengujian alur, dan evaluasi dapat dilakukan 100% aman di lingkungan lokal/laptop/kantor.

### 4. Sanitasi Template `.env.pilot.example`
- Menghapus IP printer subnet riil `192.168.1.50` dari `.env.pilot.example`.
- Menggantinya dengan IP loopback dummy `127.0.0.1` dan menyetel `PRINT_DISPATCH_ENABLED=false` serta `DISPATCHER_TRANSPORT_MODE=simulator`.
- Menambahkan dokumentasi peringatan keras pada berkas agar operator memahami bahwa pengiriman fisik memerlukan otorisasi dan penggantian konfigurasi eksplisit.

### 5. Registry Seed Safety & Audit Trail
- Skrip `seed_pilot.py` diubah untuk memeriksa keberadaan data printer pada `printer_registry` sebelum melakukan mutasi:
  - Jika `printer_id` belum ada: Lakukan registrasi printer baru.
  - Jika `printer_id` sudah ada dan konfigurasinya identik: No-op idempoten (sukses tanpa perubahan).
  - Jika `printer_id` sudah ada tetapi terdapat perbedaan nilai konfigurasi (misal host, port, brand, model, DPI, language):
    - Jika flag `--force-update` **TIDAK** diberikan: Tolak (*fail-closed*) dan tampilkan ringkasan perbedaan field, melempar `PrinterConflictError`.
    - Jika flag `--force-update` diberikan bersama `--reason <alasan>`: Izinkan update, dan catat event audit ke tabel `print_agent_events` dengan `event_type = 'printer_registry_updated'` serta menyertakan snapshot perubahan dan alasan operator.

### 6. Transparansi Evidensi Pengujian
- Klasifikasi pengujian dipisahkan secara tegas:
  - **Level 1 (Unit & Mock)**: Menjalankan test in-memory atau mock tanpa Docker dan tanpa DB.
  - **Level 2 (Disposable Container Runtime)**: Menjalankan test pada container disposable PostgreSQL 15 (port 55432) dengan database khusus test.
  - **Level 3 (Compose Simulator Runtime)**: Menjalankan test alur Docker Compose dengan transport simulator.
  - **Level 4 (Physical Hardware TCP 9100)**: Ditetapkan **`NOT RUN` / `BLOCKED`** karena dilarang menyentuh jaringan kantor atau printer fisik.
- Menolak mengklaim "End-to-End Hardware Verified" jika verifikasi hanya menggunakan `MockSocketTransport` atau `SimulatorSocketTransport`.

---

## Scope

### Termasuk
- Modifikasi `docker-compose.pilot.yml` untuk membatasi port PostgreSQL ke loopback host `127.0.0.1`.
- Penambahan validasi runtime fail-closed terhadap password placeholder di `central_dispatcher_runner.py`, `seed_pilot.py`, `migrations.py`, dan `routes_print_agent.py` / config.
- Penambahan gate `PRINT_DISPATCH_ENABLED=false` dan implementasi `SimulatorSocketTransport` sebagai default mode.
- Pembaruan `.env.pilot.example` dengan default aman (simulator, disabled dispatch, dummy IP).
- Pembaruan `seed_pilot.py` dengan overwrite protection, flag `--force-update`, `--reason`, dan pencatatan audit trail ke `print_agent_events`.
- Penambahan rangkaian pengujian regresi keamanan `backend/tests/test_pilot_safety_hardening.py`.
- Pembaruan dokumentasi operasional di `docs/deployment/pilot_runbook.md`.

### Tidak Termasuk
- Menjalankan printer fisik atau mengirim paket TCP Port 9100 ke jaringan kantor/pabrik.
- Menghubungkan ke database produksi atau server intranet nyata.
- Mengubah skema database DDL dasar (audit trail menggunakan tabel `print_agent_events` yang sudah ada di DDL v1).
- Commit/push/merge sebelum contract dan plan disetujui.

---

## Batas Keamanan & Batas Sistem

1. **Zero LAN Exposure for DB**: Port PostgreSQL tidak boleh diakses oleh host lain di LAN.
2. **Zero Physical Print Without Explicit Flag**: `RawTcpSocketTransport` dilarang membuka koneksi jaringan bila `PRINT_DISPATCH_ENABLED` tidak bernilai `true`.
3. **Fail-Closed on Default Passwords**: Tidak boleh ada kontainer pilot yang berjalan normal dengan password placeholder default.
4. **Registry Protection**: Konfigurasi printer di database tidak boleh tertimpa secara tidak sengaja oleh skrip seeding.
5. **Single Writer**: Branch `codex/b2b2g-pilot-safety-network-hardening` adalah satu-satunya branch kerja untuk fase ini.

---

## Acceptance Criteria (AC 1 s/d AC 7)

- [x] **AC 1 (PostgreSQL Network Isolation)**: `docker-compose.pilot.yml` mengikat port database secara ketat ke `127.0.0.1` (`127.0.0.1:${POSTGRES_PORT:-5432}:5432`) atau meniadakan port host mapping, mencegah paparan ke LAN.
- [x] **AC 2 (Placeholder Password Rejection)**: Sistem memvalidasi `POSTGRES_PASSWORD` dan connection URL; menolak berjalan (*fail-closed*) jika masih memakai placeholder default (misal `pilot_password_replace_in_production`).
- [x] **AC 3 (Physical Dispatch Safety Gate)**: Variable `PRINT_DISPATCH_ENABLED` bernilai `false` sebagai default; jika socket TCP fisik dicoba dijalankan tanpa flag `true`, dispatcher menolak dan melempar exception `PhysicalPrintDisabledError`.
- [x] **AC 4 (Simulator Transport as Default)**: Tersedia transport `SimulatorSocketTransport` yang menjadi mode default (`DISPATCHER_TRANSPORT_MODE=simulator`) untuk demo dan test aman tanpa printer fisik.
- [x] **AC 5 (Safe Environment Template)**: `.env.pilot.example` memuat default `PRINT_DISPATCH_ENABLED=false`, `DISPATCHER_TRANSPORT_MODE=simulator`, `PILOT_PRINTER_HOST=127.0.0.1`, dan petunjuk hardening password.
- [x] **AC 6 (Printer Registry Overwrite Protection & Audit Trail)**: `seed_pilot.py` mendeteksi perbedaan konfigurasi pada printer yang sudah ada, menolak update tanpa `--force-update` dan `--reason`, serta mencatat audit trail ke `print_agent_events` jika update dipaksakan.
- [x] **AC 7 (Transparent Evidence & Regression Test Suite)**: Seluruh safety gate memiliki automated test di `backend/tests/test_pilot_safety_hardening.py`; test suite 228+ lulus; physical print diberi label jujur `NOT RUN` / `BLOCKED`.

---

## Test Plan

1. **Test Isolasi Jaringan**:
   - Parse `docker-compose.pilot.yml` dan buktikan tidak ada port binding `0.0.0.0` atau unbounded port untuk service `db`.
2. **Test Validasi Password Placeholder**:
   - Eksekusi runner / config dengan password placeholder -> Buktikan melempar error `ValueError` / `CriticalSecurityError`.
   - Eksekusi dengan password kuat -> Berhasil.
3. **Test Safety Gate Physical Dispatch**:
   - Inisialisasi dispatcher dengan `DISPATCHER_TRANSPORT_MODE=tcp` dan `PRINT_DISPATCH_ENABLED=false` -> Buktikan gagal closed (`PhysicalPrintDisabledError`).
   - Inisialisasi dengan `DISPATCHER_TRANSPORT_MODE=simulator` -> Berhasil claim dan proses tanpa membuka TCP socket.
4. **Test Seed Overwrite Protection**:
   - Seed printer dengan konfigurasi A.
   - Jalankan seed ulang dengan konfigurasi A (identik) -> Sukses idempoten.
   - Jalankan seed ulang dengan konfigurasi B (misal beda DPI/port) tanpa `--force-update` -> Gagal closed (`PrinterConflictError`).
   - Jalankan seed ulang dengan konfigurasi B dengan `--force-update` dan `--reason "Perubahan port"` -> Sukses dan event tercatat di `print_agent_events`.
5. **Full Regression Test**:
   - Rangkaian backend pytest eksisting tetap lulus 100%.

---

## Handoff

Dokumen ini disusun untuk mengunci spesifikasi Fase B2B2G. Sesuai instruksi pengguna, pekerjaan dihentikan sebelum commit/push/merge, dan status pengujian awal dicatat secara akurat pada `RESULT.md`.
