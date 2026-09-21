# Pilot Deployment Runbook — Linux Intranet Server

Dokumen ini adalah panduan operasional resmi untuk menyebarkan (*deploy*), mengonfigurasi, dan mengoperasikan **Thermal Label Studio** pada server Linux intranet pabrik untuk skenario **Pilot 1 Lini Produksi, 1 PC Operator, dan 1 Printer IP Jaringan**.

---

## 1. Topologi Arsitektur Pilot

```
                         [ LAN Pabrik / Intranet ]
                                     |
              +----------------------+----------------------+
              |                                             |
   [ PC Operator / Browser ]                        [ Printer IP Pabrik ]
       (HTTP Port 8000)                             (Raw TCP Port 9100)
              |                                             ^
              v                                             |
+-----------------------------------------------------------|-------------+
| Linux Application Server (Docker Compose)                 |             |
|                                                           |             |
|  +---------------------------+             +--------------+----------+  |
|  | Service 'app'             |             | Service 'dispatcher'    |  |
|  | - FastAPI Control Plane   |             | - CentralPrintDispatcher|  |
|  | - React Web UI SPA        |             | - Worker Loop (2.0s)    |  |
|  | - Healthcheck: /health    |             | - Graceful SIGTERM      |  |
|  +-------------+-------------+             +--------------+----------+  |
|                |                                          |             |
|                +-------------------+   +------------------+             |
|                                    v   v                                |
|                        +---------------------------+                    |
|                        | Volume 'artifact_data'    |                    |
|                        | - Durable Linux Storage   |                    |
|                        | - Retention: 7 Hari       |                    |
|                        | - Atomic Publish & Fsync  |                    |
|                        +---------------------------+                    |
|                                    ^                                    |
|  +---------------------------+     |                                    |
|  | Service 'db'              |     |                                    |
|  | - PostgreSQL 15 Bullseye  |<----+                                    |
|  | - Volume 'postgres_data'  |                                          |
|  | - Zero Auto-Migration     |                                          |
|  +---------------------------+                                          |
+-------------------------------------------------------------------------+
```

### Karakteristik Desain Utama
1. **Zero Auto-Migration (ADR-024)**: Kontainer aplikasi (`app`) dan worker (`dispatcher`) **tidak pernah** menjalankan migrasi database otomatis saat boot. Validasi skema (*fail-closed*) mematikan kontainer jika migrasi belum diterapkan secara eksplisit oleh operator.
2. **Zero DB Lock during Socket I/O (ADR-015, ADR-021)**: Worker Central Dispatcher hanya memegang transaksi singkat untuk klaim (*fencing token*), melepaskan koneksi DB sebelum membuka socket TCP 9100, dan mencatat hasil cetak dalam transaksi singkat terpisah.
3. **Penyimpanan Artefak Durable (ADR-011, B2B2D)**: Berkas biner label (`.ipl` / `.zpl`) dan manifest integritas disimpan pada volume lokal `artifact_data` dengan masa retensi default 7 hari.
4. **Safety & Zero Secret Leak**: Kredensial database dan IP printer dikonfigurasi melalui berkas `.env` lokal di server dan tidak pernah di-commit ke Git.

---

## 2. Prasyarat Server & Jaringan

- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9 atau setara).
- **Runtime**: Docker Engine versi 24.0+ dan Docker Compose v2/v5 (`docker compose`).
- **Akses Jaringan**:
  - Inbound Port `8000`: Dapat diakses dari subnet workstation operator pabrik.
  - Outbound Port `9100`: Server Linux **wajib** memiliki rute jaringan dan izin firewall (iptables/ufw) untuk menghubungi IP printer (misal `192.168.1.50:9100`).
  - Port Database `5432`: Hanya diekspos ke localhost server untuk keperluan maintenance, tidak dibuka ke LAN publik.

---

## 3. Langkah Penyebaran Bertahap

### Langkah 1: Kloning & Persiapan Konfigurasi Environment

Masuk ke server Linux melalui SSH, lalu kloning repository dan siapkan berkas environment:

```bash
cd /opt
git clone https://github.com/pikidisini/JSON_LABEL_THERMAL_PRINTER_PARSER.git thermal-label-studio
cd thermal-label-studio/web_app

# Salin template konfigurasi pilot
cp .env.pilot.example .env
chmod 600 .env
```

Buka berkas `.env` menggunakan editor teks (misal `nano .env`), lalu sesuaikan nilai-nilai berikut:
- `POSTGRES_PASSWORD`: Ganti placeholder dengan password acak yang kuat.
- `PRINT_AGENT_DATABASE_URL`: Sesuaikan password pada connection string agar cocok dengan `POSTGRES_PASSWORD`.
- `PILOT_PRINTER_HOST`: Masukkan alamat IP riil printer di lini 1 (misal `192.168.1.50`).
- `PILOT_PRINTER_PORT`: Port printer jaringan (default `9100`).
- `PILOT_PRINTER_BRAND`: `HONEYWELL`, `INTERMEC`, atau `ZEBRA`.
- `PILOT_PRINTER_LANGUAGE`: `ipl` atau `zpl`.

### Langkah 2: Build Image Kontainer

Jalankan perintah build untuk menghasilkan image Docker lokal:

```bash
docker compose -f docker-compose.pilot.yml build
```

Perintah ini akan membangun image `thermal-label-studio:pilot` yang mencakup frontend React build dan backend Python dengan dependensi `resvg` serta font pencetakan.

### Langkah 3: Menjalankan Database & Migrasi Skema Eksplisit (ADR-024)

Jalankan service database PostgreSQL dan tunggu hingga status container *healthy*:

```bash
docker compose -f docker-compose.pilot.yml up -d db
```

Periksa status database:
```bash
docker compose -f docker-compose.pilot.yml ps db
```

Setelah status `db` menjadi `healthy`, jalankan migrasi eksplisit menggunakan kontainer `app`:

```bash
docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.migrations apply
```

Verifikasi bahwa migrasi baseline telah terpasang dengan benar:

```bash
docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.migrations verify
# Output yang diharapkan: "baseline verified"
```

### Langkah 4: Seeding Profil Media & Registrasi Printer Pilot

Jalankan skrip inisialisasi printer pilot untuk mendaftarkan printer IP lini 1 ke dalam database PostgreSQL:

```bash
docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.seed_pilot
```

*Catatan: Skrip ini bersifat idempoten (`ON CONFLICT DO UPDATE`), aman dijalankan berulang kali.*

Sebagai alternatif ringkas untuk Langkah 3 & 4, Anda dapat menggunakan skrip otomatis:
```bash
chmod +x scripts/pilot_init.sh
./scripts/pilot_init.sh docker-compose.pilot.yml
```

### Langkah 5: Menjalankan Seluruh Layanan

Jalankan Control Plane Web Service dan Central Dispatcher worker:

```bash
docker compose -f docker-compose.pilot.yml up -d app dispatcher
```

Periksa seluruh kontainer yang aktif:
```bash
docker compose -f docker-compose.pilot.yml ps
```

Semua 3 service (`pilot_postgres`, `pilot_app`, `pilot_dispatcher`) harus berstatus `Up (healthy)` atau `Up`.

---

## 4. Verifikasi Operasional & Uji Asap (*Smoke Test*)

### 1. Healthcheck Control Plane Web Service
Lakukan uji probe kesehatan HTTP dari server atau PC operator:

```bash
curl -i http://localhost:8000/api/v1/health
```
Respons yang diharapkan:
```json
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"healthy"}
```

### 2. Memantau Log Central Dispatcher
Pantau log worker Central Dispatcher untuk memastikan worker loop berjalan normal:

```bash
docker compose -f docker-compose.pilot.yml logs -f dispatcher
```
Log yang diharapkan:
```text
[INFO] central_dispatcher_runner: Database schema verified successfully against PostgreSQL baseline.
[INFO] central_dispatcher_runner: Central Print Dispatcher running [site_id=pilot-site, dispatcher_id=central-dispatcher-1, poll=2.0s, lease=30.0s]
```

### 3. Simulasi Pengiriman Batch Cetak
Kirim batch cetak uji coba menggunakan endpoint ingestion API:

```bash
curl -X POST http://localhost:8000/api/v1/print/batch \
  -H "Content-Type: application/json" \
  -d '{
    "producer_namespace": "operator_test",
    "request_id": "manual-test-001",
    "printer_id": "PRN-PILOT-01",
    "items": [
      {
        "template_version_id": "d0000000-0000-0000-0000-000000000001",
        "canonical_item_data": {"barcode": "TEST12345", "desc": "Pilot Test Item"},
        "copies": 1
      }
    ]
  }'
```

Amati log dispatcher: worker akan segera mengklaim tugas, merender artefak ke volume durable, mengirim byte ke printer via Port 9100, dan memperbarui status menjadi `sent_to_printer`.

---

## 5. Prosedur Pemeliharaan & Operasi Lanjutan

### Menghentikan Layanan (*Graceful Shutdown*)
Untuk mematikan sistem tanpa memutus proses cetak yang sedang berlangsung:

```bash
docker compose -f docker-compose.pilot.yml stop
```
Worker Central Dispatcher akan menangkap sinyal `SIGTERM`, menyelesaikan siklus aktif saat ini, dan keluar secara bersih.

### Menghidupkan Kembali Layanan
```bash
docker compose -f docker-compose.pilot.yml up -d
```
Seluruh data database pada volume `pilot_postgres_data` dan artefak pada `pilot_artifact_data` tetap utuh.

### Backup Data Pilot
Untuk mencadangkan database PostgreSQL secara berkala:

```bash
docker compose -f docker-compose.pilot.yml exec -T db pg_dump -U pilot_user thermal_label_pilot > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Prosedur Rollback Skema (Emergency Only)
Jika skema baseline perlu di-rollback:

```bash
docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.migrations rollback
```

---

## 6. Panduan Troubleshooting (*Pemecahan Masalah*)

| Gejala Masalah | Kemungkinan Penyebab | Langkah Solusi |
|---|---|---|
| Kontainer `app` atau `dispatcher` langsung *crash* saat startup dengan error `PostgreSQL print pipeline baseline is not installed`. | Pelanggaran aturan ADR-024: migrasi belum dijalankan secara eksplisit. | Jalankan `docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.migrations apply`. |
| Dispatcher log menampilkan `invalid_or_disabled_printer_endpoint`. | Printer belum terdaftar di `printer_registry` atau status `is_enabled=FALSE`. | Jalankan skrip seeding: `docker compose -f docker-compose.pilot.yml run --rm app python -m backend.app.print_jobs.seed_pilot`. |
| Dispatcher log menampilkan status `delivery_unknown` dan batch berstatus `paused`. | Koneksi socket ke printer terputus di tengah pengiriman data (timeout/kabel terlepas). | Sistem otomatis mem-pause batch untuk mencegah double-print. Periksa fisik printer & kabel jaringan, verifikasi apakah label tercetak fisik, lalu lanjutkan via aksi resume operator. |
| Port 8000 tidak dapat diakses dari browser PC Operator. | Firewall pada server host (UFW/Firewalld) memblokir port 8000. | Buka port pada server host: `sudo ufw allow 8000/tcp` atau `sudo firewall-cmd --add-port=8000/tcp --permanent && sudo firewall-cmd --reload`. |
