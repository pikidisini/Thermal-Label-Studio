# Task Contract — B2B2I: SAP Shadow Print Simulation & PDF Batch Evidence

## Identitas

- Status: `CORE_COMPLETED — READY_FOR_CODEX_FINAL_REVIEW`
- Risk level: `3` — menerima payload operasional berbentuk kontrak SAP dan
  menghasilkan artefak PDF durable, tetapi tetap tanpa printer fisik,
  SAP credential, atau koneksi intranet pada fase ini.
- Branch: `codex/b2b2i-sap-shadow-print-simulation`
- Baseline: `main` pada commit `fd8dd4e` setelah B2B2H merged.
- Planner: `Codex / Principal AI Engineer & Staff Systems Architect`
- Intended executor: `Gemini Flash 3.8 via Antigravity`
- Reviewer: `Codex`
- Active writer: `Gemini Flash 3.8 via Antigravity` (berhenti untuk review akhir).

---

## Tujuan bisnis

Menyediakan jalur simulasi yang **meniru alur nyata SAP sampai hasil label**:

```text
ZLABEL
  -> ZMM_LABEL_JSON membentuk canonical SAP JSON
  -> Label Application menerima batch simulasi
  -> validasi + ingestion + render engine yang sama
  -> virtual PDF dispatcher, urut per item_sequence
  -> PDF batch evidence untuk PPIC/produksi
  -> tidak ada printer fisik
```

Pada operasi PPIC nanti, sumber data bukan form manual atau fixture Safe Demo,
melainkan canonical JSON yang dikirim SAP. B2B2H tetap dipertahankan sebagai
demo offline berbasis fixture untuk pembelajaran dan test otomatis.

Hasil yang ingin dilihat pengguna adalah PDF berurutan yang memungkinkan
verifikasi material, lot, nomor roll, berat, template, urutan label, dan
perubahan layout sebelum satu byte pun dikirim ke printer fisik.

---

## Keputusan desain yang dikunci

### 1. SAP mendorong data; aplikasi tidak mem-poll SAP

- SAP `ZLABEL` / `ZMM_LABEL_JSON` bertindak sebagai pengirim HTTP JSON.
- Label Application bertindak sebagai API server yang menerima request.
- Aplikasi Label tidak menyimpan SAP username/password dan tidak membuka
  koneksi baca/tulis langsung ke SAP dalam fase ini.
- Respons awal harus cepat (`accepted` + `batch_id`); render/PDF berjalan
  asynchronous agar SAP GUI tidak menunggu semua halaman selesai.

### 2. Jalur simulasi dipisahkan dari jalur cetak fisik

- Gunakan endpoint khusus, misalnya
  `POST /api/v1/simulation/sap-batches`; nama akhir boleh berubah bila
  konsisten dan terdokumentasi.
- Endpoint khusus dan identity service SAP menentukan simulation mode.
  Field JSON dari SAP **tidak boleh** dapat mengubah execution mode menjadi
  physical print.
- Mode simulasi tidak boleh menginstansiasi atau memanggil raw TCP, Windows
  Spooler, `RawTcpSocketTransport`, host, atau port printer.
- Input SAP hanya boleh membawa `printer_id` logis; pemetaan ke profile virtual
  ditentukan server-side dari registry yang diizinkan.

### 3. Reuse pipeline nyata, hanya adapter terakhir yang berbeda

- Gunakan canonical contract, batch ingestion, validasi template/media/profile,
  lifecycle, ordering, checksum, dan renderer yang sama dengan pipeline label.
- Ganti hanya adapter delivery terakhir dengan PDF simulation sink.
- Satu batch pilot menargetkan satu logical printer dan satu configured media
  profile; item diproses serial menurut `item_sequence ASC`.
- Tidak ada auto-retry pada hasil ambigu; state/error tetap dapat diaudit.

### 4. PDF batch evidence

- Satu batch menghasilkan satu PDF evidence dengan:
  - halaman manifest/cover;
  - satu halaman label per item dalam `item_sequence ASC`;
  - template version, logical printer/profile virtual, DPI, batch ID, waktu,
    dan checksum/manifest yang relevan;
  - watermark jelas `SIMULASI — BUKAN UNTUK CETAK FISIK` pada cover dan/atau
    setiap halaman label.
- PDF label harus memakai dimensi/orientasi label dari media/template yang
  disetujui, bukan auto-scale diam-diam ke ukuran lain.
- Artifact disimpan melalui boundary durable storage yang sudah ada, dengan
  manifest integrity dan retensi default existing 7 hari. Tidak ada MinIO/S3
  baru pada B2B2I.

### 5. Data dan akses

- Runtime PPIC menggunakan payload canonical dari SAP, bukan manual form data.
- Test otomatis memakai fixture non-production/redacted yang sesuai kontrak;
  ini bukan pengganti alur operasi SAP, melainkan bukti lokal yang dapat
  direproduksi tanpa SAP perusahaan.
- Tidak boleh ada nama karyawan, credential, hostname/IP internal, data SAP
  production, atau PDF nyata dalam repository/test fixture.
- Identity pengirim SAP harus fail-closed dan berasal dari konfigurasi
  environment/secret manager, bukan payload. Mekanisme akhir (mTLS atau
  credential service-to-service) harus didokumentasikan tanpa hardcoded secret.
- Download/status PDF tidak boleh terbuka secara anonim untuk payload yang
  berasal dari SAP nyata; desain authorization harus eksplisit.

---

## Scope B2B2I

### Termasuk

- Boundary API simulasi khusus untuk canonical SAP JSON.
- Model request/response strict dan idempotency `request_id`/batch yang aman.
- Reuse batch ingestion/render/lifecycle yang relevan dengan virtual PDF sink.
- Pembuatan PDF batch ordered beserta manifest/watermark simulasi.
- Penyimpanan artifact PDF pada durable filesystem storage existing dan download
  yang dibatasi sesuai desain authorization.
- Status/monitoring batch di UI untuk PPIC/developer, termasuk link PDF ketika
  selesai.
- Dokumentasi kontrak integrasi yang dapat dipakai pengembang ABAP untuk
  `ZMM_LABEL_JSON`.
- Unit, integration, dan browser E2E memakai fixture canonical non-production.

### Tidak termasuk

- Koneksi ke SAP QAS/UAT/production, credential SAP, RFC, OData, atau perubahan
  kode ABAP `ZLABEL`/`ZMM_LABEL_JSON`.
- Printer fisik, TCP 9100, Windows Spooler, IP/hostname printer, atau raw
  printer command delivery.
- Menggunakan PDF sebagai bukti label benar-benar tercetak secara fisik.
- MinIO/S3/RabbitMQ baru, perubahan DDL, atau perubahan template canonical
  kecuali ditemukan blocker yang harus mendapat kontrak baru.
- Production deployment, firewall intranet, certificate perusahaan, atau
  retention policy perusahaan di luar default existing 7 hari.
- Commit, push, PR, atau merge tanpa instruksi pengguna berikutnya.

---

## Acceptance criteria

- [x] **AC 1 — Dedicated fail-closed boundary:** endpoint simulasi default-off
  tanpa konfigurasi identity SAP simulation yang lengkap; endpoint physical
  print tidak digunakan.
- [x] **AC 2 — Canonical SAP contract:** request harus mematuhi contract SAP
  canonical, menolak field ekstra/bentuk tidak valid, atomik antara batch record
  dan idempotency index, dan memakai idempotency key agar retry SAP tidak
  menghasilkan dua batch/PDF.
- [x] **AC 3 — No physical route:** input tidak dapat memilih host, port,
  transport, atau mode cetak fisik; test membuktikan tidak ada socket/Spooler
  dipanggil.
- [x] **AC 4 — Pipeline fidelity:** batch melalui validasi, ingestion, render
  pipeline nyata (inject data, barcode/QR, rasterizer), dan lifecycle berurutan
  menurut `item_sequence`, dengan profile virtual server-side.
- [x] **AC 5 — Ordered PDF evidence:** PDF memiliki cover/manifest, halaman
  per item dalam urutan benar, watermark simulasi, dan tidak auto-scale label.
- [x] **AC 6 — Durable artifact integrity:** PDF/manifests memakai storage
  existing, checksum, filename/path safety, dan retensi default 7 hari.
- [ ] **AC 7 — PPIC monitoring (DITUNDA):** Monitoring interaktif UI PPIC ditunda
  sampai fase Identity Provider / Enterprise RBAC. Saat ini UI dialihkan ke
  status fail-closed (*"Monitoring Membutuhkan Identity Provider"*), tidak meminta
  atau menyimpan token SAP di browser, dan menolak akses browser anonim pada endpoint
  data SAP (HTTP 401). PPIC monitoring tidak aktif saat ini.
- [x] **AC 8 — Error and data hygiene:** error tidak membocorkan token,
  payload lengkap, filesystem path, atau traceback; fixture/repository tidak
  mengandung data SAP production atau credential.
- [x] **AC 9 — Evidence:** backend (260 passed), targeted persistence/artifact
  (22 passed), frontend (59 passed), and E2E tests (2 passed) lulus; `git diff --check`
  bersih. SAP nyata, intranet, printer fisik, dan TCP 9100 berstatus `NOT RUN`.

---

## Verifikasi wajib

1. Unit/integration API dengan payload canonical non-production:
   - default-off;
   - auth/identity fail-closed;
   - input invalid/extra field;
   - idempotent replay;
   - ordering 3+ item;
   - no socket/Spooler;
   - PDF manifest/watermark/page ordering;
   - artifact checksum/retention.
2. Browser E2E:
   - submit/replay canonical batch fixture;
   - monitor lifecycle;
   - download PDF simulation;
   - verify no physical printer controls are exposed.
3. Regression yang relevan untuk batch ingestion, durable artifacts, central
   dispatcher, Safe Demo, frontend, dan TypeScript.
4. Static checks:
   - `git diff --check`;
   - secret scan kandidat commit;
   - scan forbidden physical transport symbols pada modul simulation.

---

## Evidence boundary

| Evidence | Status yang diharapkan |
| --- | --- |
| Canonical JSON replay, PDF, simulator, durable artifact test | `PASS` |
| Frontend/Playwright loopback | `PASS` atau `NOT RUN` dengan alasan aktual |
| Live SAP QAS/UAT/production | `NOT RUN` pada B2B2I |
| SAP credential / RFC / OData | `NOT RUN` pada B2B2I |
| Physical printer / TCP 9100 / Spooler | `NOT RUN` — dilarang |
| MinIO/S3/RabbitMQ baru | `NOT RUN` — di luar scope |

---

## Handoff untuk executor

1. Gunakan **Gemini Flash 3.8** sebagai executor Level 2 pada branch ini.
2. Baca kontrak ini, B2B2C–B2B2H task docs, dan state `main` terlebih dahulu.
3. Jangan membuat koneksi SAP nyata. Implementasikan boundary replay yang
   kompatibel dengan canonical SAP JSON dan dokumentasikan mapping ABAP.
4. Jangan memperluas jalur physical print atau mengganti aturan `delivery_unknown`.
5. Isi `docs/tasks/B2B2I/RESULT.md` dengan file, perintah, hasil aktual
   `PASS`/`FAIL`/`BLOCKED`/`NOT RUN`, dan daftar batas bukti.
6. Buat checkpoint lokal lalu berhenti sebelum commit/push/PR/merge kecuali
   pengguna memberikan instruksi delivery berikutnya.

## Keputusan bisnis yang ditunda, bukan blocker desain

- Apakah integrasi pertama memakai SAP QAS/UAT atau SAP production dengan
  permission read/send yang terkontrol.
- Pilihan identity service-to-service final: mTLS direkomendasikan untuk
  production; credential pilot hanya sementara dan tidak boleh hardcoded.
- Siapa yang boleh membuka/mengunduh PDF berisi data SAP dan apakah 7 hari
  retensi cukup untuk PPIC/audit.
- Apakah SAP memerlukan callback completion, atau tahap pertama cukup memakai
  batch ID/status UI/download PDF.
