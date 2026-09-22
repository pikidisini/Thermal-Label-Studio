# Task Contract — B2B2H: Safe Demo Mode & Batch Monitoring

## Identitas

- Status: `PLANNED`
- Risk level: `2` — integrasi frontend/backend lokal, tanpa printer fisik,
  TCP kantor, database perusahaan, atau credential perusahaan.
- Proposed branch: `codex/b2b2h-safe-demo-mode`
- Baseline: `main` pada commit `43abb3f` setelah B2B2G merged.
- Planner: `Codex / Principal AI Engineer & Staff Systems Architect`
- Intended executor: `Gemini Flash via Antigravity`
- Reviewer: `Codex`
- Active writer: `None` sampai executor ditugaskan.

---

## Tujuan untuk Pengguna

Membuat pengalaman **Safe Demo Mode** yang dapat dicoba dari laptop melalui
browser, agar pengguna dapat melihat alur label dari awal sampai akhir tanpa
SAP perusahaan, printer fisik, alamat IP printer, TCP Port 9100 kantor, atau
database intranet.

Demo harus memperlihatkan secara visual bahwa satu permintaan batch berisi
beberapa label **berbeda**. Setiap item membawa data sendiri dan nilai default
`copies=1`; `copies` hanya berarti duplikat fisik identik, bukan jumlah item
berdata berbeda.

Target demo yang dapat dilihat pengguna:

```text
Pilih contoh batch
  → lihat tiga item label yang datanya berbeda
  → jalankan simulasi aman
  → lihat status tiap item dan urutannya
  → lihat hasil “sent to simulator”, bukan “printed physically”
```

---

## Keputusan Desain yang Dikunci

### 1. Batas keselamatan

- `SAFE_DEMO_MODE` harus **default `false`** pada backend.
- Safe Demo UI/API hanya aktif bila backend secara eksplisit diaktifkan untuk
  lingkungan lokal/demo.
- Frontend flag atau kontrol browser bukan batas keamanan. Backend tetap wajib
  memaksa simulator dan tidak boleh memilih `RawTcpSocketTransport`.
- Tidak ada input browser yang boleh menerima atau mengubah `host`, `port`,
  `printer_id` fisik, `PRINT_DISPATCH_ENABLED`, atau mode TCP.
- Tidak ada akses ke printer fisik, Windows Spooler, socket TCP ke jaringan
  kantor, database production/staging, SAP perusahaan, atau credential nyata.

### 2. Data demo

- Data demo adalah fixture statis lokal yang diberi label jelas sebagai
  `Demo data / not SAP production data`.
- Minimal ada satu batch dengan **tiga item berurutan**, setiap item memiliki
  data label yang berbeda (contoh material, batch/lot, dan nomor roll).
- Semua item demo memakai `copies=1` kecuali test secara khusus ingin
  menunjukkan duplikat identik.
- Fixture tidak boleh mengandung nama karyawan, nomor material perusahaan,
  hostname, IP internal, token, password, atau data SAP nyata.

### 3. Lifecycle simulasi

- Backend menyediakan boundary demo khusus, misalnya endpoint di bawah
  `/api/v1/safe-demo/`; nama akhir boleh disesuaikan executor bila konsisten
  dengan aplikasi.
- Demo menjalankan state yang mudah diamati: `accepted`, `rendered`, `queued`,
  `claimed`, `sending`, dan `sent_to_simulator` atau representasi yang
  eksplisit menjelaskan bahwa hasil itu **bukan** cetak fisik.
- Jika lifecycle domain yang ada tetap memakai `sent_to_printer`, UI wajib
  menampilkan teks manusia: `Terkirim ke simulator — tidak dicetak fisik`.
- Simulator hanya boleh menggunakan `SimulatorSocketTransport` atau mock
  in-memory; tidak boleh membuat socket.
- Reset demo hanya mereset state demo lokal/memory. Ia tidak boleh menghapus
  data pengguna, storage durable, PostgreSQL, atau file di luar area demo.

### 4. Antarmuka pengguna

Tambahkan entry point yang mudah ditemukan dari aplikasi lokal, misalnya tombol
`Safe Demo` atau route `/demo`, dengan tiga panel minimum:

1. **Contoh batch** — nama batch, jumlah item, dan informasi bahwa item
   berbeda, bukan 30 salinan yang sama.
2. **Progress / timeline** — status batch dan status setiap item dalam urutan
   `item_sequence`.
3. **Preview hasil** — ringkasan data label, checksum/byte count bila tersedia,
   serta pesan besar: `Simulator only — tidak ada printer fisik diakses`.

UI harus menyediakan:

- tombol `Jalankan demo aman`;
- tombol `Reset demo`;
- keadaan loading, empty/error, dan sukses;
- penjelasan singkat berbahasa Indonesia yang ramah pengguna awam.

Safe Demo tidak boleh mengubah atau memperluas modal Direct TCP, Spooler, atau
fitur cetak fisik yang sudah ada.

### 5. Penyimpanan dan deployment

- Implementasi pertama menggunakan state in-memory yang terisolasi untuk
  memudahkan demo di laptop dan menghindari kebutuhan Docker/PostgreSQL.
- Data demo hilang saat backend restart; UI harus menjelaskan bahwa ini normal
  untuk mode demo.
- Docker Compose, PostgreSQL durable storage, dan dispatcher production tidak
  menjadi syarat menjalankan demo pertama.
- Fase berikutnya dapat menambahkan demo Compose simulator, tetapi bukan scope
  B2B2H tanpa kontrak baru.

---

## Scope Implementasi

### Termasuk

- Backend Safe Demo API yang default-off dan fail-closed.
- Fixture batch demonstrasi lokal dengan sedikitnya tiga label berdata berbeda.
- Orkestrasi simulator/memory yang tidak membuka socket.
- UI React untuk menjalankan, mereset, dan memantau batch demo.
- Status/timeline setiap item yang mudah dibaca.
- Backend unit tests, frontend unit tests, dan Playwright E2E yang memverifikasi
  simulator tanpa cetak fisik.
- Pembaruan dokumentasi penggunaan demo dan `RESULT.md`.

### Tidak Termasuk

- SAP/ERP perusahaan, SAP credential, atau endpoint SAP production.
- Printer fisik, IP/hostname printer internal, Port 9100 kantor, raw TCP,
  Windows Spooler, PowerShell print, atau batch legacy.
- PostgreSQL production/staging, MinIO production, RabbitMQ, server intranet,
  certificate perusahaan, atau secret.
- Mengubah template canonical, kontrak SAP JSON v1, skema DDL, atau lifecycle
  safety production kecuali diperlukan untuk menjaga demo benar-benar aman.
- Mengklaim demo sebagai bukti hardware, network, throughput, atau
  production-readiness.
- Commit, push, Pull Request, atau merge tanpa instruksi pengguna berikutnya.

---

## Acceptance Criteria

- [ ] **AC 1 — Default-off:** backend Safe Demo API tidak tersedia atau
  fail-closed ketika `SAFE_DEMO_MODE` tidak bernilai `true`.
- [ ] **AC 2 — No physical route:** Safe Demo tidak dapat mengaktifkan TCP,
  mengubah printer endpoint, atau membuat `RawTcpSocketTransport`; test
  membuktikan simulator/mock digunakan.
- [ ] **AC 3 — Visible batch:** pengguna dapat melihat satu batch berisi
  minimal tiga item berurutan dengan data label berbeda dan `copies=1`.
- [ ] **AC 4 — Visible lifecycle:** setelah `Jalankan demo aman`, UI
  menampilkan progress/status tiap item dan hasil eksplisit
  `Terkirim ke simulator — tidak dicetak fisik`.
- [ ] **AC 5 — Safe reset:** `Reset demo` hanya mereset state in-memory demo;
  tidak menghapus data/storage di luar boundary demo.
- [ ] **AC 6 — User clarity:** UI menampilkan peringatan yang jelas bahwa demo
  memakai data sintetis, state hilang saat restart, dan tidak mengakses
  printer fisik.
- [ ] **AC 7 — Error resilience:** kegagalan demo ditampilkan sebagai pesan
  aman yang dapat dimengerti tanpa token, stack trace, payload lengkap, atau
  detail internal.
- [ ] **AC 8 — Evidence:** backend/frontend/E2E yang relevan lulus; test
  physical printer diberi status `NOT RUN`; `git diff --check` lulus; tidak ada
  secret atau generated artifact dalam kandidat commit.

---

## Test Plan

### Backend

1. Default `SAFE_DEMO_MODE=false` menolak endpoint demo.
2. `SAFE_DEMO_MODE=true` membuat batch fixture dengan tiga item berbeda.
3. Simulator menerima payload secara in-memory tanpa pemanggilan `socket`.
4. Lifecycle item menjaga urutan `item_sequence`.
5. Reset menghapus hanya state demo.
6. Error response generik dan tidak membocorkan secret/payload internal.

### Frontend

1. Route/entry Safe Demo tampil hanya bila aplikasi demo diaktifkan.
2. Pengguna dapat melihat tiga item dan perbedaan datanya.
3. Tombol run menampilkan loading lalu status simulator.
4. Tombol reset mengembalikan halaman ke keadaan awal demo.
5. Teks keselamatan berbahasa Indonesia tampil jelas.

### End-to-end

1. Jalankan aplikasi dengan konfigurasi demo eksplisit dan aman.
2. Buka Safe Demo di browser.
3. Jalankan batch demo dan verifikasi ketiga item selesai di simulator.
4. Verifikasi tidak ada UI/control yang menawarkan TCP fisik.
5. Verifikasi reset.

### Evidence boundary

| Evidence | Expected status |
| --- | --- |
| Unit / mock / simulator | `PASS` setelah executor menjalankan test |
| Frontend / Playwright local | `PASS` atau `NOT RUN` dengan alasan aktual |
| Docker / PostgreSQL | `NOT REQUIRED` untuk B2B2H pertama |
| Physical printer / TCP 9100 | `NOT RUN` — dilarang |
| SAP perusahaan / intranet | `NOT RUN` — di luar scope |

---

## Handoff untuk Executor

1. Buat branch `codex/b2b2h-safe-demo-mode` dari `main` terbaru.
2. Baca kontrak ini dan gunakan **Gemini Flash** sebagai executor Level 2.
3. Implementasikan hanya scope B2B2H; jangan mengganti arsitektur persistence
   atau dispatch production.
4. Buat/update `docs/tasks/B2B2H/RESULT.md` dengan daftar file, perintah test,
   hasil aktual `PASS`/`FAIL`/`BLOCKED`/`NOT RUN`, dan batas bukti demo.
5. Berhenti sebelum commit/push/PR/merge kecuali pengguna memberi instruksi
   eksplisit untuk delivery Git.

## Keputusan Pengguna yang Tidak Diperlukan Saat Ini

B2B2H sengaja tidak membutuhkan keputusan printer, host, port, SAP, Docker,
atau database perusahaan. Keputusan tersebut baru diperlukan untuk pilot fisik
di fase lain.
