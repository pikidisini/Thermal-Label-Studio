# B2B2O — Ekspor Raw SAP Snapshot v2 dan impor JSON lokal ke Safe Demo

## Tujuan dan batas

Pengguna dapat menjalankan `ZMMR_LABEL_JSON` di SAP DEV, menyimpan **satu berkas JSON Raw SAP Snapshot v2** ke komputer sendiri, lalu memilih berkas itu di Safe Demo untuk memperoleh batch, urutan item, dan PDF simulasi. Jalur ini tidak membutuhkan SAP DEV menghubungi server aplikasi, SM59, atau token mesin di browser. Ini jalur uji lokal, bukan pengganti arsitektur integrasi SAP produksi.

Status awal: `PLANNED`; Level 3 (data SAP, upload, autentikasi, kontrak). Branch kerja: `codex/b2b2o-local-json-export-import`, dari checkpoint B2B2N `35f9cb5`. Codex adalah penulis tunggal saat penyusunan task dan draft ABAP. Gemini Flash 3.8 High boleh menjadi executor UI/API setelah checkpoint dan handoff eksplisit; jangan ada dua penulis pada branch yang sama.

## Yang sudah disiapkan dalam task ini

- Pertahankan `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON.abap` sebagai arsip alur lama. Penulisan ulang lengkap berada di `docs/tasks/B2B2O/abap/ZMMR_LABEL_JSON.abap`: report **ekspor lokal** tanpa HTTP, printer, atau perhitungan label. File baru adalah kandidat source untuk aktivasi/review ABAP, bukan bukti bahwa objek sudah ada atau aktif di SAP DEV.
- Report membaca pasangan material+batch dari MCH1, seluruh karakteristik dari `QC01_BATCH_VALUES_READ`, `ZZLABEL=N001`, status mapping di `ZMAP_LABEL`, deskripsi MAKT, kandidat fakta SO dari MSKA/VBAP/VBAK, customer item text via `READ_TEXT` jika SO tunggal, serta tanggal produksi melalui `Z_GET_PRODUCTION_DATE`. Data SAP yang tidak ditemukan tetap kosong; tidak dibuat-buat. Aturan tampilan, unit conversion, expiry, barcode, QR, dan layout tetap milik aplikasi.
- Report mengikuti pola `ZMMR_LABELROL_WINDOWS`: input selection screen hanya range batch `P_CHARG` dan `V_COPIES`. Untuk setiap batch yang dipilih, material dicari dari `MCH1`. Tidak ada pilihan material, plant, request ID, printer, jaringan, atau path pada selection screen.
- Report menghasilkan satu envelope `contract_schema_version=2.0-raw` dengan `item_sequence` eksplisit dan `copies=1`. Karena Safe Demo v2 hanya menerima `copies=1`, nilai `V_COPIES` diekspansi menjadi sejumlah item identik yang berurutan untuk setiap batch terpilih. `request_id` dibuat oleh report dari konteks eksekusi dan `printer_id` memakai target pilot logis. File disimpan lewat Save dialog SAP GUI ke PC lokal; tidak dikirim ke jaringan.

## Slice impor JSON lokal yang harus diimplementasikan executor

1. Tambahkan tombol **Impor JSON dari SAP** pada layar Safe Demo setelah login pilot. Tampilkan pemilih `.json`, nama file, ukuran, konfirmasi bahwa data SAP DEV mungkin sensitif, status loading, hasil batch/PDF, serta pesan error yang tidak membeberkan isi payload.
2. Tambahkan endpoint upload operator yang terpisah dari endpoint token mesin `POST /simulation/raw-batches`. Hanya sesi operator pilot yang valid, CSRF untuk mutasi, mode simulasi aktif, origin/HTTPS guard yang sama, pembatasan ukuran sebelum/selama baca (misalnya maksimum 2 MiB), pembatasan JSON UTF-8 dan jumlah item sesuai model, rate limit, dan tidak ada path/filename client yang dipakai untuk menulis file server. Jangan meletakkan token SAP di frontend. Endpoint harus memanggil service Raw SAP Snapshot v2 yang **sama**, bukan engine/dispatcher alternatif.
3. Tolak non-JSON, malformed/duplicate-key JSON, versi salah, field tak dikenal/terlarang, terlalu besar, identitas/otorisasi tidak valid, serta replay `request_id` dengan isi berbeda. Jangan log body atau customer text; tidak ada konten SAP nyata masuk Git/fixture/report.
4. Setelah sukses, tampilkan batch, urutan item, status, dan PDF existing. Seluruh aksi hanya menghasilkan simulasi; akses printer fisik/TCP 9100/Spooler harus tetap mustahil pada path ini. Batasi penyimpanan lokal sesuai retensi Safe Demo existing.
5. Gunakan fixture sintetis hanya untuk test. UAT nyata: pengguna ekspor dari SAP DEV, impor melalui browser yang berjalan lokal, lalu periksa PDF manusia. Jangan menyebut UAT selesai sebelum dilakukan.

## Acceptance criteria

1. ABAP menerima range `P_CHARG` dan `V_COPIES` mengikuti pola `ZMMR_LABELROL_WINDOWS`, menghasilkan struktur Raw SAP Snapshot v2, dan menyediakan seluruh karakteristik tanpa whitelist nama; tidak menghitung nilai label, tidak print, tidak HTTP, tidak membuat file otomatis pada path tetap.
2. `ZZLABEL` harus `N001` dan mapping `ZMAP_LABEL` harus ada pada pilot; kode legacy tidak dialihkan diam-diam. Batch/material ambigu atau karakteristik gagal dibaca harus fail-closed.
3. Hanya operator pilot terautentikasi yang dapat mengimpor; CSRF, ukuran, tipe, JSON, rate limit, dan idempotency diuji termasuk kasus negatif.
4. Upload memakai service validasi/pipeline Safe Demo yang sama dengan ingress SAP, tetapi tidak pernah mengekspos token ingress di browser.
5. PDF memperlihatkan urutan dan watermark simulasi; tidak ada raw placeholder dan tidak ada pengiriman printer.
6. Test backend/frontend/typecheck/build/E2E terkait dan security scan lulus; UAT SAP DEV/ABAP activation diberi `NOT RUN` hingga benar-benar diuji. Data nyata tidak disimpan di repo.

## Bukti, risiko, dan stop gate

- Executor menulis `RESULT.md` dengan hasil faktual dan reviewer Codex mengisi `REVIEW.md`.
- Sebelum aktivasi ABAP, verifikasi keberadaan `/UI2/CL_JSON`, signature `QC01_BATCH_VALUES_READ`, `Z_GET_PRODUCTION_DATE`, struktur `ZMAP_LABEL`, DDIC `API_VALI`, dan syntax pada SAP DEV. Report repo tidak boleh dianggap compile-verified. Jangan menjalankan report di PRD tanpa keputusan pengguna.
- Local JSON adalah data SAP di PC; ikuti kebijakan perusahaan, jangan sinkronkan ke cloud pribadi, jangan commit/push berkas tersebut.
- Tidak mengubah SAP DEV melalui MCP, database production, printer, atau integrasi jaringan fisik. Berhenti sebelum PR/merge; minta keputusan bisnis jika pemetaan data faktual berbeda dari asumsi kode.
