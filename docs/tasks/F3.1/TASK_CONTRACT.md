# Fase 3.1 — Simulasi Label Terpadu

Status: `PLANNED`

Level: 2 (UI lintas komponen dan regression test; eskalasi ke Level 3 jika menyentuh auth, upload, kontrak, atau dispatch)

Branch: `codex/f3-1-simulasi-label-terpadu`

Baseline: checkpoint B2B2O lokal `8d895a9`

Executor setelah handoff: Gemini Flash 3.8 High (Antigravity), satu-satunya writer branch

Reviewer: Codex, independen dari executor

## Tujuan untuk pengguna

Di antarmuka studio, pengguna melihat satu tombol **Simulasi Label**, bukan dua tombol **Safe Demo** dan **SAP Simulation** yang maknanya membingungkan. Tombol ini membuka alur uji mandiri yang sudah ada: login operator pilot, impor berkas JSON hasil ekspor SAP, melihat batch dan urutan item, lalu membuka PDF simulasi. Simulasi tidak pernah mengirim data ke printer. Ini penyatuan *pintu masuk dan bahasa UI*, bukan klaim bahwa kedua backend/engine sudah sama.

## Kondisi awal yang harus diverifikasi executor

- `frontend/src/components/layout/topbar/TopBarActions.tsx` saat ini menampilkan dua tombol saat kedua flag aktif: `btn-safe-demo` dan `btn-sap-simulation`.
- `frontend/src/App.tsx` mengelola dua modal; alur impor JSON/operator berada di `SapShadowSimulationModal.tsx`, sedangkan `SafeDemoModal.tsx` adalah fasilitas lama yang terpisah.
- Backend Safe Demo dan SAP shadow simulation memiliki boundary berbeda. Jangan menggabungkan service, mengubah endpoint, atau mengasumsikan otorisasi sama hanya karena UI disederhanakan.
- Verifikasi kondisi Git dan diff terkini sebelum menulis; folder `output/` sudah untracked sebelum task ini dan tidak boleh disentuh/stage.

## Scope implementasi

1. Ganti dua entry topbar menjadi **satu** tombol `Simulasi Label` dengan test ID stabil baru, misalnya `btn-label-simulation`. Tombol membuka modal alur operator SAP JSON yang ada, bukan modal Safe Demo lama.
2. Tombol hanya tampil jika capability SAP shadow simulation dari backend aktif. `SAFE_DEMO_MODE` saja tidak boleh membuka jalur operator baru. Pertahankan semua guard server-side, login operator, CSRF, rate limit, batas unggahan, dan kebijakan HTTPS yang sudah ada. Menyembunyikan tombol bukan pengganti otorisasi.
3. Rapikan judul, badge, petunjuk, dan empty/loading/error/success copy yang terlihat pengguna di modal operator agar konsisten dengan istilah **Simulasi Label**. Boleh tetap menjelaskan sumber SAP dan hasil PDF. Tegaskan “simulasi, tidak mencetak fisik.” Jangan menjanjikan bahwa data hanya diproses di browser jika unggahan sebenarnya dikirim ke backend.
4. Pertahankan jalur Safe Demo lama untuk developer/test dan regression backend. Ia tidak tampil sebagai tombol pengguna utama. Jangan hapus modal/API/test lama tanpa alasan dan pengganti test yang jelas.
5. Perbarui test frontend/E2E agar memeriksa satu tombol pada kombinasi flag: keduanya mati; Safe Demo saja aktif; SAP simulation saja aktif; keduanya aktif. Pastikan tombol lama tidak muncul, login/impor JSON/urutan/PDF tetap dapat diakses dari tombol baru, dan tidak ada jalur printer fisik.
6. Perbarui dokumentasi UI/handoff yang terdampak. Simpan bukti implementasi dalam `RESULT.md`; reviewer mengisi `REVIEW.md`.

## Di luar scope

- Tidak menulis ulang engine, renderer, dispatcher, layanan Safe Demo/SAP shadow, atau kontrak Raw SAP Snapshot v2.
- Tidak menambah login umum aplikasi, migrasi database, integrasi SAP jaringan langsung, atau transport printer.
- Tidak memakai data SAP nyata dalam fixture, screenshot, report, commit, atau log. UAT SAP DEV nyata tetap terpisah dan harus dilaporkan `NOT RUN` jika belum dilakukan.
- Tidak menyentuh SAP PRD, printer fisik, TCP 9100, Windows Spooler, database production, atau credential. Jika perubahan ini ternyata memerlukan keputusan bisnis/otorisasi baru, berhenti dan laporkan.

## Acceptance criteria

1. Pada seluruh kombinasi capability yang relevan, topbar menampilkan paling banyak satu tombol simulasi; `SAFE_DEMO_MODE` saja tidak menampilkan tombol operator.
2. Klik `Simulasi Label` membuka alur login operator -> impor JSON -> batch/item berurutan -> PDF existing, tanpa mengubah kontrak backend.
3. UI tidak menyebut dua mode setara, tidak membuat klaim privasi yang keliru, dan jelas menyatakan PDF adalah simulasi tanpa print fisik.
4. Guard autentikasi/otorisasi tetap di server; semua test security/import yang relevan tetap lulus. Tidak ada network printer yang dipanggil oleh alur ini.
5. Frontend unit test, TypeScript strict check, production build, dan E2E terkait lulus. Backend regression relevan dijalankan jika file/backend behavior disentuh; selain itu ditandai `NOT RUN` dengan alasan. Catat hasil aktual, bukan angka lama.
6. Diff hanya memuat perubahan task; data nyata, `output/`, build/report generated, secret, dan screenshot UAT tidak masuk checkpoint.

## Rencana verifikasi dan stop gate

- Periksa diff dan status Git, lalu jalankan `npm test`, `npm exec tsc -- --noEmit`, `npm run build`, dan E2E simulasi terkait dari `frontend/` bila environment tersedia. Jalankan `git diff --check` serta direct whitespace/secret scan pada file baru.
- Perbarui `docs/AI_HANDOFF.md` dan `docs/tasks/F3.1/RESULT.md` dengan `PASS`/`FAIL`/`BLOCKED`/`NOT RUN` dan bukti ringkas. Jangan mengklaim UAT pengguna, SAP, atau printer telah terjadi tanpa bukti.
- Executor boleh membuat commit dan push ke branch fitur setelah gate lulus, lalu berhenti **sebelum PR/merge** untuk review Codex. Jika ada temuan review, perbaiki di task yang sama, bukan subfase berkode baru.
