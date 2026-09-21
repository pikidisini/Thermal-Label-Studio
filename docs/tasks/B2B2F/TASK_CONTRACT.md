# Task Contract — B2B2F

## Identitas

- Status: `APPROVED`
- Risk level: `3`
- Branch: `codex/b2b2f-docker-compose-pilot`
- Baseline: `main` pada `cabd0f0` (B2B2E merged)
- Planner: `Gemini Flash via Antigravity`
- Intended executor: `Agen Executor (Ruang Chat Sebelah)`
- Reviewer: `Gemini Flash via Antigravity (Principal AI Engineer & Staff Systems Architect)`
- Active writer saat ini: `Gemini Flash via Antigravity`

## Tujuan

Menyediakan paket penyebaran (*deployment*) Docker Compose pilot yang terintegrasi untuk server intranet Linux perusahaan (mencakup Control Plane Web Service FastAPI, UI React, database PostgreSQL 15, volume persistensi berkas artefak durable, dan Central Print Dispatcher Port 9100) untuk skenario uji coba 1 lini produksi, 1 PC operator, dan 1 printer IP jaringan.

## Keputusan rancangan awal

1. **Topologi Layanan Docker Compose (ADR-014, ADR-015)**:
   - File konfigurasi pilot: `docker-compose.pilot.yml` (atau pembaruan `docker-compose.yml` yang kompatibel).
   - Layanan minimal:
     - `db`: PostgreSQL 15 (`postgres:15-bullseye`) dengan persistent volume `postgres_data`.
     - `app`: Control Plane Web Service (FastAPI + bundle React frontend) mengekspos Port 8000.
     - `dispatcher`: Central Print Dispatcher worker (menggunakan image aplikasi yang sama dengan perintah menjalankan loop dispatcher, atau opsi background task terkelola).
   - Jaringan terisolasi (*internal bridge network*) antar kontainer aplikasi dan database.

2. **Isolasi Volume & Persistensi Data (ADR-011, B2B2D)**:
   - Volume khusus untuk database: `postgres_data:/var/lib/postgresql/data`.
   - Volume khusus untuk penyimpanan artefak label biner: `artifact_data:/app/artifacts`.
   - Path artefak dikonfigurasi melalui environment variable `PRINT_AGENT_ARTIFACT_ROOT=/app/artifacts` dan divalidasi absolut.

3. **Prinsip Migrasi Eksplisit (ADR-024)**:
   - Sesuai ADR-024, aplikasi **dilarang keras** menjalankan migrasi database otomatis saat container boot / startup FastAPI.
   - Operator menjalankan migrasi secara eksplisit via perintah:
     `docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.migrations apply`
     atau script helper pendukung (misal `scripts/pilot_migration.sh` / `pilot_init.py`).

4. **Keamanan Konfigurasi & Bebas Rahasia (*Zero Secret Leak*)**:
   - Sediakan berkas template `.env.pilot.example` yang mendokumentasikan seluruh parameter environment yang diperlukan.
   - Tidak ada password, bearer token, atau IP intranet produksi yang di-commit ke Git. Nilai default pada example harus berupa placeholder yang aman untuk development/pilot lokal.

5. **Model Eksekusi Central Dispatcher Worker (B2B2E)**:
   - Sediakan entrypoint/perintah CLI untuk menjalankan Central Print Dispatcher secara berkelanjutan (misalnya `python -m backend.app.print_jobs.central_dispatcher_runner` atau flag worker).
   - Worker harus menangani sinyal terminasi OS (`SIGTERM`, `SIGINT`) secara anggun (*graceful shutdown*): menyelesaikan siklus aktif atau melepas claim sebelum keluar.

6. **Registrasi Printer Pilot 1 Lini (ADR-010, ADR-020)**:
   - Menyediakan skrip inisialisasi / seeding data pilot untuk mendaftarkan 1 profil media (`media_profiles` & `media_profile_versions`), 1 template versi (`template_versions`), dan 1 printer IP (`printer_registry`) bertipe `delivery_mode = 'central_tcp'` agar lingkungan pilot langsung siap menerima batch cetak dari SAP.

## Scope

### Termasuk

- **Docker Compose Pilot**:
  - Konfigurasi `docker-compose.pilot.yml` (dan/atau penyesuaian `Dockerfile` bila diperlukan) yang menggabungkan web service, postgres, volume persistensi, dan dispatcher worker.
  - Pemeriksaan kesehatan (*healthcheck*) pada container database dan app.
- **Konfigurasi Environment**:
  - Berkas `.env.pilot.example` dengan dokumentasi variabel environment lengkap.
- **Worker Entrypoint & Graceful Shutdown**:
  - Script/runner untuk menjalankan Central Print Dispatcher sebagai layanan kontainer berkelanjutan dengan penanganan `SIGTERM`/`SIGINT`.
- **Inisialisasi Data Pilot (Seed Script)**:
  - Script helper untuk menjalankan migrasi dan menginisialisasi registry printer 1 lini untuk kebutuhan pilot.
- **Uji Verifikasi & Smoke Test Otomatis**:
  - Automated smoke test / script verifikasi yang memvalidasi:
    1. Validitas sintaks Docker Compose (`docker compose config`).
    2. Eksekusi migrasi eksplisit via kontainer.
    3. Health check kontainer berjalan.
    4. Simulasi injeksi batch cetak dan pengambilan tugas oleh dispatcher worker.
- **Dokumentasi Operasional Pilot**:
  - Petunjuk langkah demi langkah (*runbook*) penyebaran di server intranet Linux: cara clone, copy `.env`, jalankan compose, terapkan migrasi, dan pantau log.

### Tidak termasuk

- Akses ke server produksi nyata atau instalasi langsung ke hardware server pabrik.
- Koneksi ke printer fisik di lantai pabrik (pengujian menggunakan mock socket atau dummy TCP server).
- Broker antrean eksternal (RabbitMQ/Kafka) atau object storage MinIO (tetap menggunakan Durable Linux Volume sesuai B2B2D).
- Windows Service / Local Print Agent installer untuk workstation Windows XP.
- Merge ke branch `main` tanpa persetujuan pengguna.

## Batas keamanan & batas sistem

1. **Zero Secret Leak**: Tidak ada password PostgreSQL nyata atau kredensial perusahaan yang disimpan di Git.
2. **Zero Auto-Migration**: Container web service tidak boleh mengeksekusi `migrations.py apply` saat boot.
3. **Fail-Closed on Unset Variables**: Jika variabel wajib seperti `PRINT_AGENT_DATABASE_URL` atau `PRINT_AGENT_ARTIFACT_ROOT` kosong saat mode PostgreSQL aktif, kontainer harus gagal dengan pesan kesalahan yang jelas.
4. **Volume Persistence**: Data PostgreSQL dan file artefak harus tetap utuh saat kontainer di-stop (`down`) dan dijalankan ulang (`up`).
5. **Single Writer**: Branch `codex/b2b2f-docker-compose-pilot` hanya diubah oleh agen executor yang ditugaskan.

## Acceptance criteria

1. **AC 1 (Docker Compose Configuration)**: Berkas `docker-compose.pilot.yml` terdefinisi dengan benar, lulus validasi `docker compose -f docker-compose.pilot.yml config`, mendefinisikan service `db` (PostgreSQL 15), `app` (FastAPI Control Plane), dan `dispatcher` (Central Dispatcher), beserta persistent volumes dan network internal.
2. **AC 2 (Explicit Migration Enforcement)**: Container `app` tidak melakukan migrasi database otomatis saat startup. Perintah migrasi eksplisit disediakan dan terbukti berhasil menerapkan skema DDL v1 ke database kontainer.
3. **AC 3 (Durable Storage Volume Isolation)**: Volume persistensi artefak termounting dengan benar pada `PRINT_AGENT_ARTIFACT_ROOT` di dalam kontainer, dan berkas biner/manifest tersimpan secara persisten melintasi restart kontainer.
4. **AC 4 (Environment Template & Secret Hygiene)**: Berkas `.env.pilot.example` memuat seluruh variabel operasional yang dibutuhkan, bersih dari secret/kredensial nyata, dan divalidasi oleh secret scan.
5. **AC 5 (Central Dispatcher Worker Packaging & Graceful Shutdown)**: Runner dispatcher terkemas sebagai layanan kontainer yang dapat dijalankan berkelanjutan, mengambil antrean secara teratur, dan merespons sinyal `SIGTERM`/`SIGINT` dengan aman.
6. **AC 6 (End-to-End Pilot Simulation Test)**: Tersedia pengujian/skrip verifikasi yang membuktikan alur pilot end-to-end dalam kontainer: migrasi skema -> seeding printer pilot -> pengiriman batch via API -> perenderan ke durable volume -> dispatching via TCP mock -> status `sent_to_printer`.
7. **AC 7 (Runbook & Quality Gate)**: Dokumentasi panduan operasional pilot (`docs/deployment/pilot_runbook.md` atau setara) tersedia; seluruh pengujian backend dan integrasi lulus; `git diff --check` bersih; 0 secrets.

## Test plan

- **Sintaks & Konfigurasi**:
  - `docker compose -f docker-compose.pilot.yml config` lulus tanpa error validasi.
- **Unit & Integrasi Runner**:
  - Pengujian unit untuk `central_dispatcher_runner` (loop cycle, poll interval, graceful exit on SIGTERM/SIGINT).
- **Simulasi Kontainer / Smoke Test**:
  - Pengujian siklus hidup kontainer (startup, explicit migration apply, seeding data, batch ingestion, dispatching, dan shutdown).
- **Regression**:
  - Seluruh rangkaian test backend pytest (212+ tests) tetap lulus 100%.

## Handoff

Dokumen ini disusun untuk mengunci scope, batasan keamanan, dan acceptance criteria Fase B2B2F. Agen executor di ruang chat sebelah membaca kontrak ini, mengimplementasikan seluruh Acceptance Criteria pada branch `codex/b2b2f-docker-compose-pilot`, memperbarui `RESULT.md`, dan melakukan push safe checkpoint sebelum ditinjau ulang oleh reviewer.
