# Task Contract — B2B2M: Safe Demo PDF Visual & Placeholder Hardening

## Status dan pelaksana

- Status: `PLANNED`; implementasi belum dijalankan.
- Executor tunggal: Gemini Flash 3.8 High via Antigravity. Reviewer akhir: Codex Level 3.
- Buat branch baru `codex/b2b2m-safe-demo-pdf-hardening` dari `origin/main` terbaru setelah merge B2B2L. Verifikasi baseline dan status Git lebih dahulu; jangan menulis di branch B2B2L yang sudah di-merge.
- Kontrak ini dibuat secara lokal ketika checkout masih di branch B2B2L. Pindahkan kontrak ini ke branch baru tanpa menghapus perubahan/file pengguna. Jangan gunakan `git clean`, `reset --hard`, atau force-push.

## Tujuan dalam bahasa bisnis

PDF Safe Demo harus dapat dipakai pengguna untuk memeriksa urutan dan isi label tanpa keliru menganggapnya sebagai bukti cetak fisik. Uji coba sintetis menghasilkan PDF empat halaman (sampul + tiga label) dan memperlihatkan tiga cacat: judul/status sampul bertumpuk, pita peringatan menutupi bagian atas layout label, serta token `{{...}}` yang belum terisi tercetak pada label. Perbaiki ketiganya tanpa mengubah template kanonikal atau mengarang data SAP.

## Referensi wajib

- `AGENTS.md`, `docs/QUALITY_GATE.md`, `docs/AI_WORKFLOW.md`.
- `docs/tasks/B2B2I/TASK_CONTRACT.md`, terutama aturan PDF evidence: urutan `item_sequence`, watermark pada sampul dan/atau label, dimensi fisik, dan larangan auto-scale.
- `docs/tasks/B2B2L/TASK_CONTRACT.md`, `RESULT.md`, `REVIEW.md`.
- `backend/app/services/pdf_evidence_service.py`, `backend/app/services/sap_shadow_service.py`, `engine/renderer.py`, dan test terkait.
- Fixture sintetis `docs/tasks/B2B2K/fixtures/raw_sap_snapshot_v2_n001_synthetic.json` hanya untuk reproduksi lokal. PDF diagnostik lokal di `output/pdf/safe-demo-n001-synthetic-batch.pdf` bukan source of truth dan **jangan di-stage**.

## Scope dan aturan desain

1. Tata letak sampul harus memisahkan judul dan status secara jelas pada ukuran halaman aktual; uji teks panjang agar tidak bertumpuk atau terpotong.
2. Halaman label tetap berukuran/orientasi fisik yang sama dan gambar label tidak di-auto-scale. Peringatan simulasi harus tetap jelas, tetapi jangan memakai pita opak yang menutupi konten label. Pilih penempatan pada sampul dan/atau penanda halaman yang tidak mengaburkan barcode, teks, atau area penting. Jangan menghilangkan sifat Safe Demo.
3. Definisikan penanganan token template sebelum PDF sukses. Field opsional yang **dikenal oleh schema/profile** dan bernilai absent/null/kosong boleh dirender kosong hanya menurut policy eksplisit yang teruji; jangan mengganti dengan fakta lain atau nilai palsu. Field wajib atau token tidak dikenal/tidak terdaftar harus gagal tertutup dengan error tersanitasi. Jangan melakukan penghapusan global semua pola `{{...}}`.
4. Pastikan validasi token dilakukan setelah seluruh tahap injeksi teks dan barcode/QR. PDF berhasil tidak boleh memuat placeholder mentah. Kegagalan satu item tidak boleh menghasilkan PDF batch sukses/parsial yang tampak final.
5. Pertahankan autentikasi, idempotency/replay, urutan item, hash/evidence, serta batas Safe Demo default-off. Jangan ubah `assets/templates/label_roll_80x200.svg`, aturan bisnis N001 yang belum disetujui PPIC, data SAP, atau kontrak API tanpa alasan dan test eksplisit.

## Acceptance criteria

1. Test reproduksi PDF sintetis membuktikan sampul tanpa overlap judul/status dan tiga halaman label sesuai urutan item.
2. Inspeksi visual hasil render PDF (semua halaman, bukan hanya page count) membuktikan peringatan simulasi terbaca, tidak menutupi layout label, dan ukuran/orientasi label tidak berubah. Catat metode/bukti inspeksi di `RESULT.md`; jangan commit PDF/PNG hasil uji.
3. Test integrasi memastikan field opsional dikenal yang kosong tidak tampil sebagai `{{so_item}}`, `{{splice_1_m}}`, `{{splice_1_feet}}`, `{{splice_2_m}}`, atau `{{splice_2_feet}}`; tidak ada nilai SAP yang difabrikasi.
4. Token asing atau field wajib yang hilang gagal tertutup sebelum PDF dinyatakan sukses, dengan error publik/log yang tidak memuat raw/customer text atau payload barcode/QR.
5. Regression Safe Demo B2B2I/B2B2K/B2B2L tetap lulus; auth, no-physical-route, item order, replay, dan PDF evidence tidak mundur.
6. Template kanonikal tidak berubah; tidak ada akses SAP nyata, printer fisik, TCP 9100, Windows Spooler, database production, atau credential.
7. `RESULT.md` mencatat perintah dan hasil aktual sebagai `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN`; `REVIEW.md` disiapkan untuk temuan reviewer, bukan diisi seolah review independen sudah dilakukan.

## Verifikasi dan handoff

- Jalankan test terarah PDF evidence/Safe Demo, regression B2B2I/B2B2K/B2B2L yang relevan, lalu full backend suite bila lingkungan memungkinkan. Frontend hanya bila disentuh; selain itu laporkan `NOT RUN`.
- Gunakan temporary storage terisolasi. Render PDF sintetis menjadi gambar untuk pemeriksaan visual. Jangan gunakan data SAP nyata dalam fixture, PDF, screenshot, log, atau Git.
- Periksa `git diff --check`, whitespace file baru, secret/generated-artifact scan, hash template kanonikal, dan status Git. `git diff --check` tidak mencakup file untracked.
- Hanya Gemini yang menulis implementasi di branch ini. Isi `RESULT.md` dan laporkan diff, test, serta risiko tersisa. **Berhenti sebelum git add, commit, push, PR, atau merge** agar Codex dapat melakukan review Level 3 lebih dulu.
- Jika solusi membutuhkan keputusan PPIC tentang field wajib/opsional atau layout produksi, tandai `BLOCKED` dan minta keputusan; jangan menebak.
