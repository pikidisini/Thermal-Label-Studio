# Task Contract — B2B2E

## Identitas

- Status: `PLANNED`
- Risk level: `3`
- Branch: `codex/b2b2e-worker-central-dispatcher`
- Baseline: `main` pada `40e67cd` (B2B2D merged)
- Planner: `Gemini Flash via Antigravity`
- Intended executor: `Gemini Flash via Antigravity`
- Reviewer: `Codex / Claude Opus via Antigravity`
- Active writer saat ini: `Gemini Flash via Antigravity`

## Tujuan

Menyediakan Central Print Dispatcher dan integrasi pipeline render untuk memproses batch print jobs dari PostgreSQL dan mengirimkan biner label (`.ipl` / `.zpl`) langsung ke printer IP via RAW TCP socket (Port 9100) secara aman, berurutan per-printer, dengan proteksi timeout ketat di luar database transaction lock.

## Keputusan rancangan awal

1. **Topologi Central Dispatcher (ADR-015, ADR-018)**:
   - Dispatcher berjalan sebagai layanan latar belakang (*background worker*) pada server Linux intranet.
   - Mengambil tugas melalui repository PostgreSQL (`claim_next`) dengan identitas `executor_type = 'central_dispatcher'`.
   - Mengikuti aturan *single active delivery owner* per printer fisik, anti-interleaving batch, dan fencing token generasi monotonik (`X-Print-Claim-Token` / `fencing_token`).

2. **Isolasi Database Lock & Network Socket I/O (ADR-018, ADR-021)**:
   - Koneksi dan pengiriman RAW TCP socket ke printer fisik **WAJIB** dilakukan sepenuhnya di luar transaksi atau row lock database.
   - Database lock hanya diambil sesaat pada: (1) claim, (2) `begin_delivery` (`claimed -> sending`), dan (3) `report_result` (`sending -> sent_to_printer | failed | delivery_unknown`).

3. **Keamanan Endpoint Printer (ADR-010, ADR-020)**:
   - Alamat target (`network_host`, `network_port`) hanya diambil dari tabel `printer_registry` yang terpercaya (`delivery_mode = 'central_tcp'`).
   - Sistem **dilarang keras** menerima IP/port printer dari payload SAP atau input pengguna eksternal.

4. **Kontrol Batas Waktu Socket (Timeout & Circuit Safety)**:
   - Menerapkan *connect timeout* (default: 3.0 detik) dan *write timeout* (default: 10.0 detik) eksplisit pada setiap pengiriman socket.
   - Socket wajib ditutup secara bersih (*fail-closed*) pada setiap kegagalan atau timeout.

5. **Semantik Status Hasil & Penanganan Error Ambigu (ADR-021)**:
   - `SUCCESS`: Seluruh bytes berhasil ditulis ke buffer socket -> transisi ke `sent_to_printer`.
   - `FAILURE_BEFORE_SEND`: Koneksi gagal dibuka atau ditolak sebelum ada byte yang terkirim -> transisi ke `failed`.
   - `DELIVERY_UNKNOWN`: Terputus atau timeout di tengah transmisi biner -> transisi ke `delivery_unknown`, batch otomatis di-pause (`print_batch_paused`), dan **dilarang auto-requeue**.

6. **Integrasi Pipeline Render ke Storage Durable (B2B2D)**:
   - Menghubungkan proses render biner label (`RenderService` / core engine) ke `DurableFilesystemArtifactStorage`.
   - Menyimpan payload dan manifest integritas, lalu merekam metadata `print_artifacts` ke database sebelum job masuk status `queued`.

## Scope

### Termasuk

- **Transport Abstraction**:
  - Interface `SocketTransport` dan implementasi `RawTcpSocketTransport` dengan konfigurasi timeout terkontrol (connect timeout, socket/write timeout).
  - Abstraksi double untuk testing: `MockSocketTransport` / loopback disposable test server tanpa koneksi internet atau printer fisik.
- **Central Print Dispatcher Service**:
  - Runner/loop dispatcher yang dapat dijalankan secara terkelola (`run_once()` untuk deterministik test, dan loop asinkron/background untuk worker).
  - Integrasi dengan `PostgresPrintAgentRepository` dan `DurableFilesystemArtifactStorage`.
  - Resolusi endpoint printer terpercaya dari `printer_registry`.
  - Verifikasi payload biner via `read_verified()` sebelum transmisi.
  - Alur state machine transaksional: `claimed` -> `begin_delivery` (`sending`) -> socket write -> `report_result` (`sent_to_printer` / `failed` / `delivery_unknown`).
- **Pipeline Render Batch Ingestion (Service Layer)**:
  - Layanan transaksi pembuatan batch dari kontrak: validasi kompatibilitas ukuran media vs template, perenderan label ke biner (`.ipl` / `.zpl`), penyimpanan artefak ke `DurableFilesystemArtifactStorage`, dan pembuatan baris relasional lengkap (`print_batches`, `print_batch_items`, `print_jobs`, `print_artifacts`).
- **Unit, Concurrency, & Integration Tests**:
  - Test unit soket (connect timeout, write timeout, partial drop mid-stream).
  - Test siklus dispatcher terhadap PostgreSQL disposable dan Durable storage.
  - Test anti-interleaving dan batch pause saat `delivery_unknown`.

### Tidak termasuk

- Koneksi ke printer fisik di lantai pabrik atau pengujian jaringan kabel/Wi-Fi nyata.
- Perubahan kredensial atau database production perusahaan.
- Windows Service installer / MSI packaging untuk workstation lokal.
- Broker pesan eksternal (RabbitMQ, Kafka, Celery, Redis).
- Safe Demo Mode atau perubahan antarmuka UI canvas frontend.
- Merge ke branch `main` tanpa persetujuan eksplisit pengguna.

## Batas keamanan & batas sistem

1. **Larangan Printer Fisik**: Pengujian otomatis hanya menggunakan mock transport, socket loopback lokal (127.0.0.1) sementara, atau mock in-memory.
2. **Tanpa Long-Held DB Lock**: Operasi jaringan socket tidak boleh menahan transaksi database PostgreSQL.
3. **Fail-Closed on Unknown**: Kegagalan socket mid-stream tidak boleh melakukan requeue otomatis yang berisiko mencetak label ganda secara fisik.
4. **Isolasi Alamat**: Hanya `network_host` dan `network_port` dari `printer_registry` yang boleh dibuka koneksinya.
5. **Single Writer**: Branch `codex/b2b2e-worker-central-dispatcher` hanya ditulis oleh active writer yang ditetapkan.

## Acceptance criteria

1. **AC 1 (Socket Transport & Timeouts)**: Implementasi `RawTcpSocketTransport` mendukung kontrol timeout eksplisit (`connect_timeout`, `write_timeout`) dan mengembalikan `TransportResult` yang akurat (`SUCCESS`, `FAILURE_BEFORE_SEND`, `DELIVERY_UNKNOWN`) beserta jumlah `bytes_sent`.
2. **AC 2 (Zero Long-Held Lock)**: Dispatcher memverifikasi bahwa socket I/O dilakukan setelah transaksi claim/begin_delivery selesai dan sebelum transaksi report_result dimulai.
3. **AC 3 (State Machine & Fencing Token)**: Dispatcher mematuhi alur transisi `claimed -> sending -> sent_to_printer | failed | delivery_unknown` dengan validasi fencing token generation di setiap tahap.
4. **AC 4 (Delivery Unknown Safety)**: Saat socket terputus di tengah pengiriman (`DELIVERY_UNKNOWN`), status job menjadi `delivery_unknown`, batch menjadi `paused`, sisa antrean batch ditahan, dan tidak ada auto-retry.
5. **AC 5 (Registry Endpoint Resolution)**: Dispatcher me-resolve endpoint hanya dari `printer_registry`. Printer non-TCP atau tanpa endpoint valid ditolak fail-closed dengan status `failure_before_send`.
6. **AC 6 (Render Ingestion & Durable Storage)**: Layanan ingestion memvalidasi kompatibilitas template vs media profile secara atomik (all-or-nothing), merender biner, menyimpannya ke `DurableFilesystemArtifactStorage`, dan mencatat `print_artifacts` di PostgreSQL.
7. **AC 7 (Quality Gate & Handoff)**: Seluruh test unit socket, integration dispatcher pada PostgreSQL disposable, dan full backend suite lulus; `git diff --check` bersih; 0 secrets.

## Test plan

- **Unit**:
  - `RawTcpSocketTransport` dengan server loopback dummy: sukses kirim, connect timeout, connection refused, disconnect mid-stream.
- **Integration (Central Dispatcher)**:
  - Dispatcher mengambil job dari PostgreSQL disposable, membaca payload dari `DurableFilesystemArtifactStorage`, mengirim ke mock socket, dan memperbarui status job menjadi `sent_to_printer`.
  - Dispatcher menangani kegagalan socket sebelum kirim (`FAILURE_BEFORE_SEND`) -> status job `failed`.
  - Dispatcher menangani kegagalan socket saat kirim (`DELIVERY_UNKNOWN`) -> status job `delivery_unknown` dan batch `paused`.
- **Concurrency & Anti-Interleaving**:
  - Dua dispatcher atau multi-printer berjalan konkuren: membuktikan single active owner per printer, tidak ada interleaving antar-batch, dan claim sekuensial sesuai `item_sequence`.
- **Regression**:
  - Print Agent API, Local Print Agent, Durable Artifact Storage, dan full backend suite.

## Handoff

Dokumen ini disusun untuk mengunci scope dan acceptance criteria sebelum implementasi dimulai. Setelah disetujui, implementasi dapat dijalankan sesuai scope di atas.
