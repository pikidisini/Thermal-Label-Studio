# Task Contract — B2B2D

## Identitas

- Status: `PLANNED`
- Risk level: `3`
- Branch: `codex/b2b2d-durable-storage-planning`
- Baseline: `origin/main` pada `a50a142` (B2B2C merged)
- Planner dan final reviewer: `Codex`
- Intended executor: `Gemini Flash via Antigravity`
- Active writer saat ini: `Codex` — hanya perencanaan dan checkpoint dokumen

## Tujuan

Menyediakan durable artifact-storage adapter yang aman untuk lean pilot pada
server Linux intranet. Adapter menyimpan biner label hasil render (`.ipl` atau
`.zpl`) dan manifest integritasnya di trusted filesystem volume, agar lifecycle
delivery B2B2C tidak bergantung pada temporary directory proses.

## Keputusan rancangan awal

1. Implementasi pilot memakai **durable filesystem volume**. MinIO/S3 tidak
   dipasang atau dihubungkan pada B2B2D; interface harus memungkinkan adapter
   object storage ditambahkan di fase lain.
2. `payload_ref` tetap opaque identifier dari server. Ia bukan path, URL,
   nama file yang dipasok SAP, maupun host storage.
3. Payload dan manifest versioned harus ditulis atomik melalui staging file
   unik, flush/fsync yang relevan, dan publish atomik. Pembaca hanya boleh
   menerima pasangan payload-manifest yang lengkap dan checksum-valid.
4. Penulisan ulang dengan `payload_ref` yang sama hanya idempotent jika
   filename, checksum, ukuran, dan bytes sama persis. Perbedaan apa pun adalah
   conflict; overwrite tidak diizinkan.
5. Manifest minimal memuat schema version, `payload_ref`, filename,
   media type, byte length, SHA-256 lowercase, waktu pembuatan UTC, dan waktu
   retensi UTC. Ia tidak boleh menyimpan token, database URL, alamat printer,
   atau payload SAP mentah.
6. Tidak ada pembersihan otomatis pada fase ini sebelum referensi artifact dan
   aturan retensi telah diputuskan. Orphan/corrupt artifact harus terdeteksi dan
   dilaporkan, bukan dihapus diam-diam.

## Scope

### Termasuk pada implementasi setelah kontrak disetujui

- Protocol/abstraction artifact storage dan adapter filesystem durable.
- Validasi root trusted, opaque ref, filename, media type, metadata, checksum,
  ukuran, dan path traversal.
- Atomic publish, idempotency, conflict handling, restart verification, serta
  fail-closed untuk payload/manifest yang tidak lengkap atau rusak.
- Integrasi opt-in dengan mode PostgreSQL B2B2C tanpa mengubah kontrak JSON
  Print Job v1.
- Unit/integration test filesystem temporary dan PostgreSQL disposable bila
  perlu untuk membuktikan referensi artifact yang persisted.
- Dokumentasi operasi volume, permissions, backup scope, retensi, dan handoff.

### Tidak termasuk

- MinIO, S3 cloud, RabbitMQ, Kubernetes, Docker Compose production, atau
  dependency object-storage baru.
- Batch ingestion dari SAP, render worker/polling, retention daemon,
  admin UI, Safe Demo Mode, dan endpoint baru yang menerima path/URL storage.
- Database production, secret/credential perusahaan, backup nyata, printer
  fisik, TCP port 9100, Windows Spooler, atau transport printer nyata.

## Acceptance criteria

1. Storage contract memisahkan adapter filesystem durable dari storage test
   sementara tanpa mengubah public Print Job v1.
2. Semua path berasal dari root trusted dan opaque `payload_ref`; traversal,
   URL-like ref, symlink escape, dan invalid metadata ditolak.
3. Publish payload + manifest bersifat atomic/fail-closed untuk restart serta
   dua writer lokal; pembaca tidak pernah menerima artifact parsial.
4. Immutability/idempotency diuji: same content dapat diulang, content atau
   metadata berbeda menghasilkan typed conflict.
5. `read_verified()` memeriksa manifest, media type, byte length, dan
   SHA-256 sebelum payload dapat dikirimkan.
6. Mode PostgreSQL hanya memakai durable root yang dikonfigurasi; default
   memory/test tetap tidak berubah dan startup gagal tertutup bila konfigurasi
   durable tidak aman.
7. Test relevan, security review, `git diff --check`, secret scan, dan
   dokumentasi/handoff mencatat bukti aktual serta keterbatasan.

## Pertanyaan bisnis yang wajib dijawab sebelum implementasi

1. Berapa lama artifact biner hasil render boleh disimpan pada pilot?
   Pilihan rekomendasi awal: **7 hari**; alternatif bila kebutuhan reprint dan
   audit lebih panjang: **30 hari**. Ini bukan logo atau template SVG; artifact
   adalah instruksi cetak spesifik untuk satu label/data dan dapat mengandung
   barcode, nomor batch, atau data operasional.
2. Siapa yang memiliki volume Linux dan backup-nya: IT Infrastruktur, atau
   aplikasi hanya menyimpan data sementara yang boleh hilang setelah retensi?
   Rekomendasi: IT Infrastruktur memiliki volume dan backup server; aplikasi
   hanya mengelola manifest serta expiry metadata.

## Test plan

- Unit: ref/path/manifest validation, checksum, size, filename, media type,
  conflict, corruption, restart, and missing pair.
- Concurrency: dua process/thread menulis ref identik dan ref konflik tanpa
  payload parsial atau overwrite.
- Integration: repository PostgreSQL disposable membaca artifact durable yang
  valid dan menolak referensi/file yang tidak cocok.
- Regression: Print Agent API, Local Print Agent, print-job state machine, dan
  full backend suite sesuai dampak perubahan.
- Frontend: `NOT RUN` kecuali kontrak atau UI berubah.

## Handoff

Sebelum Gemini mulai, Codex akan membuat safe checkpoint perencanaan ini dan
push branch. Gemini harus membaca `AGENTS.md` dan kontrak ini, mengisi
`RESULT.md`, lalu berhenti sebelum commit final/merge jika ditemukan keputusan
retensi, credential, database production, atau printer fisik yang dibutuhkan.
