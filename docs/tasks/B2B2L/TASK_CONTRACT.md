# Task Contract — B2B2L: Versioned Label Profile Composition for Safe Demo

## Status dan pelaksana

- Status: `PLANNED`; implementasi dan review belum dijalankan.
- Level risiko: 3 (data SAP, aturan label, payload barcode/QR, dan PDF evidence).
- Branch: `codex/b2b2l-profile-composition-engine`.
- Baseline: `origin/main` setelah merge B2B2K, commit `3984469`.
- Planner dan reviewer akhir: Codex. Executor tunggal berikutnya: Gemini Flash 3.8 via Antigravity.
- Setelah checkpoint perencanaan dipush, Codex berhenti menulis pada branch ini sampai Gemini menyerahkan hasil.

## Tujuan dalam bahasa bisnis

B2B2K sudah menerima dan menyimpan raw snapshot SAP, tetapi profile N001 masih
menghasilkan `codes=None`. B2B2L membuat **mesin komposisi umum** agar sebuah
konfigurasi profile dapat memilih field raw, menggabungkannya dengan teks tetap,
dan menghasilkan nilai yang dipakai elemen teks, barcode, atau QR di Safe Demo
PDF. Contoh bentuk payload `Batch : <nomor batch>\nPanjang : <panjang> Meter`
adalah ilustrasi sintetis, bukan format produksi N001 yang disetujui PPIC.

Fase ini membuktikan jalur data dan validasi. PPIC belum mengelola konfigurasi
melalui UI; konfigurasi pengujian bersifat development-only, terversi, dan
disimpan sebagai data terstruktur. N001 tetap gagal tertutup untuk aktivasi
produksi sampai layout, media, barcode/QR, dan kewenangan persetujuan diputuskan.

## Referensi wajib

- `AGENTS.md`, `docs/QUALITY_GATE.md`, dan `docs/AI_WORKFLOW.md`.
- `docs/tasks/B2B2K/TASK_CONTRACT.md`, `RESULT.md`, dan `REVIEW.md`.
- `docs/architecture/label_profile_rule_engine_plan.md`.
- `docs/tasks/B2B2J/LABEL_RULE_MIGRATION_MATRIX.md` sebagai analisis legacy,
  bukan persetujuan otomatis untuk aturan N001.
- Runtime Raw SAP Snapshot v2, N001 adapter, Safe Demo service, dan generator
  barcode/QR yang saat ini ada. Pertahankan kontrak endpoint B2B2I/B2B2K.

## Batas desain

1. Buat registry dan schema profile yang generik: lookup berdasarkan
   `label_code` dan versi immutable, dengan status minimal `development` dan
   `approved`. Jangan membuat satu Python adapter baru untuk setiap kode label.
   N001 adalah contoh profile development; kode lain tanpa profile ditolak.
2. Setiap elemen output mempunyai ID/slot template, jenis (`text`, `barcode`,
   atau `qr`), symbology jika relevan, daftar segmen berurutan, dan policy
   field kosong. Segmen hanya `literal` atau referensi field raw yang diizinkan.
   Resolver membaca `business_context` atau `characteristics` dari snapshot
   tervalidasi. Nama field dan path tidak boleh dievaluasi sebagai expression.
3. Batasi format pada operasi eksplisit yang diperlukan untuk slice ini,
   misalnya string, angka desimal dengan presisi tetap, separator/newline,
   dan unit literal. Implementasikan hanya operasi yang dapat dibuktikan
   dengan test. Jangan memasukkan bahasa ekspresi bebas.
4. Definisikan policy untuk field `absent`, `null`, dan string kosong secara
   terpisah: `block`, `omit`, atau marker literal yang dibatasi. Default aman
   adalah `block`. Tidak boleh mengambil nilai dari field lain secara diam-diam
   atau mengubah angka/tanggal berdasarkan asumsi bisnis.
5. Validasi ukuran konfigurasi, banyak segmen, nama field, panjang hasil,
   karakter/symbology, dan kecocokan slot template sebelum render. Barcode
   1D dan QR boleh memiliki batas berbeda. Payload invalid harus gagal
   sebelum PDF dinyatakan berhasil; tidak boleh menghasilkan barcode kosong
   yang seolah valid.
6. Sambungkan hasil komposisi ke jalur render Safe Demo yang sudah ada,
   termasuk elemen barcode/QR yang didukung template. Bila template development
   N001 belum menyediakan slot yang cocok, buat template sintetis khusus test
   atau fail-closed secara eksplisit. Jangan menandai template tersebut sebagai
   layout produksi PPIC.
7. Simpan identitas profile, versi aturan/konfigurasi, versi template,
   hash snapshot raw, dan hash hasil komposisi di evidence/audit. Jangan
   memaparkan customer text, raw snapshot, atau payload barcode/QR di log,
   error publik, dan daftar batch biasa. Akses evidence tetap memakai batas
   autentikasi yang sudah ada.
8. Batch yang sudah diterima harus memakai versi profile yang dipilih saat
   penerimaan; perubahan konfigurasi berikutnya tidak boleh mengubah hasil
   replay/preview historis. Penanganan versi hilang atau mismatch harus jelas
   dan gagal tertutup.

## Acceptance criteria

1. Schema konfigurasi menolak field tambahan, expression/code/URL, referensi
   field tidak sah, konfigurasi berlebihan, dan symbology yang tidak didukung.
2. Satu profile development N001 dapat merakit payload sintetis dari minimal
   satu `business_context` fact, satu characteristic, literal, dan newline;
   urutannya persis sesuai konfigurasi. Uji juga sumber yang belum dikenal
   profile saat snapshot diterima tetapi dipilih oleh konfigurasi baru.
3. Test membedakan absent/null/empty pada masing-masing sumber dan membuktikan
   `block`, `omit`, serta marker yang valid tanpa substitusi fakta bisnis.
4. Safe Demo PDF menampilkan atau mengodekan nilai hasil komposisi melalui
   renderer nyata; test memeriksa hasil ter-render/evidence, bukan hanya
   fungsi composer. Urutan item batch dan watermark tetap benar.
5. Kode label yang tidak terdaftar, slot template hilang, field yang tidak
   diizinkan, payload terlalu panjang, atau data tidak sesuai symbology
   gagal tertutup tanpa PDF sukses atau rute printer.
6. Replay dengan snapshot dan versi profile yang sama stabil; perubahan
   profile baru tidak menulis ulang hasil batch lama. Metadata audit dapat
   menunjukkan versi dan hash tanpa membocorkan raw/customer text.
7. Endpoint B2B2I/B2B2K, autentikasi service token, idempotency, dan profil
   N001 `DEVELOPMENT_SAFE_DEMO_ONLY` tidak mengalami regresi. Production
   activation gate tetap tertutup.
8. `RESULT.md` melaporkan hasil aktual untuk test dan batasan. SAP runtime,
   persetujuan PPIC, database production, serta cetak fisik dilabeli `NOT RUN`.

## Dalam scope

- Backend schema profile, registry/resolver, composer terstruktur, integrasi
  Safe Demo, synthetic development fixture/template bila diperlukan, test,
  dokumentasi kontrak, `RESULT.md`, dan `AI_HANDOFF.md`.
- Perubahan kecil pada adapter N001 untuk memakai mesin umum tanpa memalsukan
  fakta bisnis. Profile N001 dapat tetap memakai aturan derivasi development
  lama jika provenance dan regresinya dipertahankan.

## Di luar scope dan stop condition

- UI editor PPIC, persetujuan role/SSO/RBAC, aktivasi production N001,
  keputusan final format barcode/QR, perubahan SAP/ZMAP_LABEL/ABAP,
  credential, dan data SAP nyata dalam Git.
- Printer fisik, port TCP 9100, Windows Spooler, Docker, atau database
  production/staging. Akses SAP DEV/SANDBOX melalui MCP boleh hanya untuk
  membaca context; jangan menjalankan transaksi atau menulis SAP.
- Tidak mengubah aturan expiry, gross weight, dan mapping layout bisnis
  yang belum disetujui PPIC.
- Berhenti dan minta keputusan pengguna jika implementasi memerlukan format
  bisnis N001 yang final, role persetujuan, data nyata, atau akses production.

## Verifikasi dan handoff

1. Jalankan test unit schema/resolver/composer; API + PDF integration test
   sintetis; regression B2B2K dan B2B2I; backend suite yang relevan.
2. Frontend test/build hanya jika frontend berubah; selain itu `NOT RUN`.
3. Periksa negative cases, auth, idempotency/replay, metadata leakage,
   no-printer boundary, secret scan, serta `git diff --check` dan whitespace
   file baru. Test harus memakai temporary storage terisolasi.
4. Catat command dan hasil aktual di `RESULT.md`, lalu berhenti untuk review
   Codex Level 3. Jangan merge. Commit/push checkpoint hanya setelah diff
   dan test diperiksa, sesuai workflow satu penulis per branch.

Instruksi executor: baca `AGENTS.md` dan kontrak ini, kerjakan acceptance
criteria dalam branch yang disebut di atas, isi `RESULT.md`, lalu laporkan
commit dan hasil verifikasi. Jika suatu acceptance criterion membutuhkan
keputusan bisnis, tulis `BLOCKED` dan berhenti pada titik tersebut.
