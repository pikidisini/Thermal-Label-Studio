# AGENTS — Thermal Label Studio

Instruksi ini berlaku untuk pekerjaan di `web_app/`. Gunakan Bahasa Indonesia yang ringkas dan mudah dipahami pengguna. Kerjakan berdasarkan kondisi repository saat ini; jangan menganggap catatan fase lama sebagai status terkini.

## 1. Produk dan batas kerja

- Thermal Label Studio adalah aplikasi web untuk desain template SVG, pengolahan data SAP, preview, simulasi PDF, dan pipeline cetak label termal.
- Stack: React/Vite/TypeScript strict, Tailwind CSS, FastAPI/Python, pytest, Node test, dan Playwright.
- Folder di luar `web_app/` berisi POC/reference. Jangan mengubahnya tanpa permintaan eksplisit.
- GitHub dan file proyek adalah sumber konteks lintas perangkat/provider. Satu branch hanya memiliki satu penulis aktif.

Baca seperlunya sebelum bekerja: `README.md` (penggunaan), `docs/PROJECT_STATUS.md` (status), `docs/DECISIONS.md` (keputusan), `docs/AI_HANDOFF.md` (handoff), `docs/QUALITY_GATE.md` (verifikasi), dan `docs/AI_WORKFLOW.md` (pembagian tugas/model). Periksa Git dan kode aktual bila dokumen status tampak usang.

## 2. Fakta arsitektur yang harus dijaga

- Aplikasi memakai login dan sesi akun `PPIC`/`IT`. Otorisasi serta pemeriksaan kepemilikan harus dilakukan di server, bukan hanya dengan menyembunyikan tombol.
- Alur **Simulasi Label** menerima file JSON raw dari SAP DEV/SANDBOX, menyimpan snapshot aslinya, memproses item sesuai urutan, dan membuat bukti PDF tanpa printer fisik.
- Hanya impor JSON lokal melalui UI simulasi yang boleh toleran terhadap nilai absent/null/kosong/tidak valid: tampilkan warning per item/field dan `--` pada teks label. Jangan membuat nilai turunan palsu atau barcode/QR dari `--`.
- Jalur machine-to-machine dan production tetap strict/fail-closed. Perubahan aturan simulasi tidak boleh diam-diam melonggarkan jalur tersebut.
- Data raw SAP dapat memuat seluruh characteristic dan konteks bisnis lain. Aplikasi menentukan field yang digunakan template, aturan transformasi, serta komposisi barcode/QR melalui profile/rules yang terversi dan dapat diaudit; jangan membuat logika khusus per kode label tanpa kebutuhan terbukti.
- `docs/architecture/` memuat rancangan fitur; `docs/tasks/` memuat kontrak dan bukti pekerjaan; `docs/database/` memuat desain serta skrip database. Keberadaan dokumen atau test disposable tidak berarti deployment production selesai.
- Jenkins lokal membangun dan menerapkan simulasi dari `main` pada laptop. Runbook: `docs/deployment/jenkins_local_simulation.md`. Pilot PostgreSQL/dispatcher dan pencetakan fisik adalah jalur terpisah.

## 3. Sebelum dan saat mengerjakan

1. Baca instruksi dan file yang relevan; periksa `git status --short --branch`, baseline, dan diff yang sudah ada. Coba `git fetch origin`; jika akses terhalang, laporkan sebagai `BLOCKED` dan jangan menebak status remote.
2. Tentukan perubahan terkecil yang memenuhi tujuan pengguna, risiko, acceptance criteria, dan test yang relevan. Pertahankan seluruh perubahan pengguna yang sudah ada.
3. Untuk integrasi lintas modul, pekerjaan multi-sesi/provider, atau risiko tinggi, gunakan `docs/tasks/<TASK_ID>/TASK_CONTRACT.md` → `RESULT.md` → `REVIEW.md`. Perbaikan kecil cukup dijelaskan dalam commit/PR.
4. Bangun dan uji alur vertikal yang relevan: UI, validasi, autentikasi/otorisasi, aturan bisnis, penyimpanan, serta respons error.
5. Validasi semua input eksternal pada server. Pisahkan aturan domain dari UI dan transport. Gunakan TypeScript strict; hindari `any` baru tanpa alasan.
6. Jalankan test yang diperlukan untuk perubahan, lalu periksa diff, whitespace, secret, dan file generated. Catat hasil `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN` sesuai bukti aktual.
7. Perbarui `docs/AI_HANDOFF.md` untuk pekerjaan multi-sesi atau perpindahan writer. Untuk edit dokumentasi kecil, commit/PR yang jelas sudah cukup.

## 4. Batas keamanan dan otorisasi

- Akses SAP melalui MCP boleh dilakukan **read-only** pada DEV atau SANDBOX untuk mencari konteks. Jangan mengubah objek SAP atau mengakses PRD tanpa instruksi eksplisit.
- Jangan mengakses printer fisik, Windows Spooler, atau TCP port 9100 tanpa instruksi eksplisit pengguna. Jangan mengarahkan test/migration ke database production.
- Jangan menyimpan password, token, private key, connection string, atau isi data bisnis sensitif di source, client bundle, log, screenshot, atau dokumentasi publik.
- Perubahan yang dapat menghapus data memerlukan target yang jelas, backup/rollback yang layak, dan otorisasi pengguna.
- Untuk endpoint baru atau perubahan mutasi, periksa authentication, authorization, CSRF bila relevan, validasi input, batas ukuran/rate, dan kebocoran data pada error.
- Jangan masukkan `.env`, `frontend/dist/`, `playwright-report/`, `test-results/`, `.last-run.json`, recording, atau artefak sementara ke commit.

## 5. Penamaan fase dan model AI

- Kode lama seperti `B2B2O` tetap sebagai arsip. Fitur baru memakai `Fase 3.x` berikutnya; revisi kecil tetap di fase terkait, tanpa membuat rantai subfase baru.
- Pilih model berdasarkan risiko dan biaya, bukan kebiasaan. Pekerjaan rutin dapat dikerjakan Gemini Flash/Luna; perencanaan atau review integrasi dapat memakai Terra; Sol High dipakai untuk keputusan/review berisiko tinggi. Detail ada di `docs/AI_WORKFLOW.md`.
- Handoff ke Antigravity dilakukan melalui branch, task contract, result, dan review. Jangan mengklaim perpindahan provider otomatis. Nilai hasil dari acceptance criteria dan test, bukan nama model.

## 6. Pelaporan kepada pengguna

Jawaban default singkat:

1. **Hasil:** apa yang berubah dan statusnya.
2. **Yang perlu Anda lakukan:** satu tindakan berikutnya, atau “Anda tidak perlu melakukan apa pun.”

Tambahkan rincian verifikasi atau risiko hanya bila membantu keputusan. Bedakan fakta yang diuji dari asumsi. Simpan log panjang dan daftar file lengkap di task folder atau PR. Jangan menyebut fitur production-ready hanya karena unit test atau simulasi lokal lulus.
