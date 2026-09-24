# Thermal Label Studio

Thermal Label Studio adalah aplikasi web untuk mendesain template label SVG, mengisi data dari SAP, menampilkan preview, membuat bukti PDF simulasi, dan menyiapkan pipeline pencetakan thermal label.

> Status saat ini: aplikasi dapat digunakan untuk pengembangan dan simulasi lokal. Jalur printer fisik, deployment production, HTTPS intranet, backup, observability, dan prosedur operasional pabrik masih memerlukan verifikasi tersendiri.

## Yang dapat dilakukan sekarang

- Mendesain dan mengedit template label SVG melalui studio web.
- Menggunakan placeholder seperti `{{batch_text}}` pada template.
- Memuat data raw SAP dalam format JSON v2 melalui menu **Simulasi Label**.
- Melanjutkan simulasi walaupun sebagian field SAP tidak tersedia; nilai yang hilang ditampilkan sebagai `--` dan warning ditampilkan per item/field.
- Membuat bukti hasil simulasi berupa PDF ber-watermark tanpa mengirim data ke printer fisik.
- Menguji rendering, barcode/QR, validasi template, serta lifecycle print job menggunakan transport virtual/mock.
- Menggunakan akun aplikasi berperan `PPIC` atau `IT` untuk akses UI dan endpoint yang dilindungi.
- Menjalankan deployment simulasi lokal secara otomatis melalui Jenkins self-hosted.

## Batas keamanan penting

Mode simulasi lokal bukan jalur produksi. Pada deployment simulasi:

- JSON SAP lokal hanya diproses untuk simulasi dan pembuatan PDF.
- Barcode/QR yang tidak memiliki sumber data tidak dibuat.
- Jalur machine-to-machine dan production tetap memvalidasi field secara strict/fail-closed.
- Jangan mengaktifkan akses LAN, TCP port 9100, Windows Spooler, atau printer fisik sebelum desain deployment dan verifikasi keamanan disetujui.
- Jangan menyimpan password, token, credential, atau file `.env` ke Git.

## Struktur utama

```text
web_app/
├── backend/                 # FastAPI, service domain, auth, dan test pytest
├── frontend/                # React + Vite + TypeScript strict
├── engine/                  # Renderer SVG, rasterizer, barcode/QR, encoder
├── assets/templates/        # Template SVG kanonikal dan aset label
├── docs/architecture/       # Rancangan fitur dan arsitektur
├── docs/contracts/          # Kontrak data dan print job
├── docs/database/           # DDL/proposal persistence PostgreSQL
├── docs/deployment/         # Runbook Docker, Jenkins, dan deployment pilot
├── docs/tasks/              # Task contract, result, dan review per fase
├── docker-compose.yml       # Aplikasi lokal sederhana
├── docker-compose.pilot.yml # App + PostgreSQL + dispatcher pilot
├── Dockerfile               # Build frontend dan runtime FastAPI
└── Jenkinsfile              # Gate test dan deployment simulasi lokal
```

Dokumen konteks yang perlu dibaca sebelum mengubah proyek:

- `AGENTS.md` — aturan kerja dan quality gate.
- `docs/PROJECT_STATUS.md` — status proyek terbaru.
- `docs/DECISIONS.md` — keputusan arsitektur yang sudah disetujui.
- `docs/AI_HANDOFF.md` — handoff lintas perangkat/provider.
- `docs/QUALITY_GATE.md` — test, security, dan Definition of Done.
- `docs/architecture/` — rencana dan rancangan fitur.

## Menjalankan aplikasi dengan Docker

Pastikan Docker Desktop sudah berjalan, lalu dari folder `web_app/` jalankan:

```bash
docker compose up -d --build
```

Buka:

- UI: <http://127.0.0.1:8000>
- Health check: <http://127.0.0.1:8000/api/v1/health>
- Swagger API: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>

Untuk melihat log dan menghentikan aplikasi:

```bash
docker compose logs -f label-thermal-studio
docker compose stop
```

Data aplikasi lokal berada pada bind mount `backend/data`. Jangan menghapus data atau volume tanpa backup dan persetujuan.

## Login aplikasi lokal

Login aplikasi menggunakan akun `PPIC` atau `IT`; tidak ada password universal yang disimpan di README.

Jika akun awal belum ada, buat akun melalui CLI di dalam container yang sedang berjalan. Contoh:

```bash
docker exec -it label-thermal-studio python -m app.cli.user_admin create-user --username ppic_operator --role PPIC
```

CLI akan meminta password secara interaktif. Jangan menaruh password pada command history, source code, atau file yang di-commit.

## Alur simulasi SAP lokal

1. Login ke aplikasi.
2. Buka **Simulasi Label**.
3. Pilih **Impor JSON dari SAP**.
4. Pilih file JSON hasil ekspor `ZMMR_LABEL_JSON` dari SAP DEV/SANDBOX.
5. Aplikasi memvalidasi struktur JSON, menyimpan raw snapshot, menjalankan aturan layout, dan membuat bukti PDF.
6. Jika ada data kosong, simulasi tetap selesai; warning menampilkan field yang hilang dan label menggunakan `--`.
7. Periksa urutan item, warning, preview, serta PDF sebelum menyimpulkan layout sudah sesuai.

Data JSON simulasi tetap dianggap data bisnis. Jangan mengunggah data produksi ke laptop atau environment yang belum disetujui.

## Endpoint API utama

Semua endpoint berada di bawah `/api/v1` kecuali health check.

| Area | Endpoint utama | Keterangan |
|---|---|---|
| Auth | `/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/auth/logout` | Login dan sesi aplikasi |
| Health | `/api/v1/health`, `/health` | Probe kesehatan aplikasi |
| Template | `/api/v1/templates` | Daftar, simpan, upload, dan hapus template |
| Render | `/api/v1/render`, `/api/v1/render/preview` | Render label dan preview |
| Inspect | `/api/v1/inspect/validate` | Validasi JSON terhadap template |
| Simulasi | `/api/v1/simulation/operator/import-json` | Impor JSON SAP lokal untuk simulasi |
| Simulasi | `/api/v1/simulation/sap-batches` | Daftar batch simulasi |
| Simulasi | `/api/v1/simulation/sap-batches/{batch_id}` | Detail batch dan warning |
| Safe Demo | `/api/v1/safe-demo/batch` | Jalur simulasi virtual/regression |
| Print | `/api/v1/print/*` | Jalur printer; jangan gunakan pada deployment simulasi |
| Print Agent | `/api/v1/print-agent/*` | Lifecycle agent dan delivery job |

Swagger di `/docs` adalah referensi endpoint aktual; authorization dan CSRF tetap berlaku pada endpoint mutasi.

## Menjalankan test

Dari folder `web_app/`:

```bash
# Backend
python -m pytest backend/tests -q -p no:cacheprovider

# Frontend unit test
cd frontend
npm.cmd test

# TypeScript dan production build
npm.cmd exec tsc -- --noEmit
npm.cmd run build

# Playwright E2E
npm.cmd run test:e2e
```

Jika pytest Windows gagal mengakses folder temporary, jalankan dari terminal dengan izin temporary yang sesuai atau gunakan environment/container test yang terisolasi. Catat status tersebut sebagai `NOT RUN` bila belum berhasil diverifikasi.

## Jenkins lokal

Jenkins self-hosted digunakan untuk menguji dan menerapkan perubahan `main` ke aplikasi simulasi lokal; GitHub Actions tidak digunakan.

Runbook lengkap: `docs/deployment/jenkins_local_simulation.md`.

Ringkasan:

```bash
docker compose -f ops/jenkins/compose.yml up -d --build
```

Buka Jenkins di <http://127.0.0.1:8081>. Job utama membaca branch `main`, menjalankan gate backend/frontend/build image, lalu mengganti container simulasi hanya jika semua gate lulus. Deployment Jenkins tetap lokal pada laptop dan tidak sama dengan deployment pilot pabrik.

Untuk status container:

```bash
docker ps
docker logs --tail 100 thermal-label-jenkins-local
```

## Pilot dan production

`docker-compose.pilot.yml` adalah rancangan deployment pilot yang memisahkan aplikasi, PostgreSQL, dan central dispatcher. Konfigurasi tersebut bukan alasan untuk langsung mengirim ke printer. Sebelum pilot nyata diperlukan setidaknya:

- persetujuan IT/infrastruktur dan keamanan jaringan;
- verifikasi endpoint dari server Linux ke printer;
- konfigurasi media/printer dan SOP operator;
- backup, retention, monitoring, rollback, dan load test;
- keputusan eksplisit untuk mengaktifkan transport fisik.

Dokumen DDL PostgreSQL masih menjadi desain yang harus dikelola melalui migration/repository layer sebelum dianggap production-ready.

## Workflow pengembangan

- Gunakan GitHub sebagai source of truth.
- Satu branch hanya memiliki satu writer aktif.
- Gunakan branch `codex/...` untuk perubahan fitur.
- Untuk pekerjaan integrasi, simpan `TASK_CONTRACT.md`, `RESULT.md`, dan `REVIEW.md` di `docs/tasks/<TASK_ID>/`.
- Jalankan test relevan sebelum commit.
- Jangan commit `.env`, credential, screenshot, report generated, `frontend/dist/`, `test-results/`, atau file sementara.
- Jangan mengubah repository POC di luar `web_app/` kecuali diminta secara eksplisit.

## Status klaim

Kelulusan test lokal atau disposable PostgreSQL hanya membuktikan cakupan yang diuji. Itu tidak otomatis berarti aplikasi sudah production-ready, sudah terhubung SAP, atau sudah aman mengirim ke printer fisik.
