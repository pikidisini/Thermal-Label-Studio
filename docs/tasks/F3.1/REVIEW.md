# Fase 3.1 — Review Independen Codex

Tanggal: 2026-09-23

Commit ditinjau: `bcf3556` pada `codex/f3-1-simulasi-label-terpadu`

Verdict: `CHANGES_REQUIRED` sebelum PR/merge.

## Yang sesuai

- Dokumen rancangan `docs/architecture/simulation_experience_plan.md` sudah masuk commit dan tertaut dari kontrak task.
- Satu tombol `btn-label-simulation` menggantikan dua tombol lama. Matriks empat kombinasi capability diuji; tombol mengarah ke modal operator yang memiliki alur impor JSON, batch/item, dan PDF.
- Backend Safe Demo lama tidak dihapus. Tidak ada perubahan backend, kontrak JSON, atau transport printer pada diff F3.1.
- Bukti ulang reviewer: `npm.cmd test` menghasilkan 74 passed; `npm.cmd exec tsc -- --noEmit` exit 0. Percobaan unit test pertama terhalang `spawn EPERM` sandbox sebelum test berjalan, lalu lulus dengan akses environment yang diperlukan. Playwright/backend/build dilaporkan lulus oleh executor di `RESULT.md`, tetapi tidak dijalankan ulang oleh reviewer ini.

## Temuan yang perlu diperbaiki

1. **P2 — Jalur developer-only terbuka pada bundle pengguna.** `frontend/src/App.tsx` menambahkan `?dev_safe_demo=true` dan `window.__openSafeDemoModal` tanpa pembatasan environment. Setiap pengguna browser dapat membuka modal lama dengan URL atau console. Ini tidak menjadikan API lebih terbuka daripada flag backend yang sudah ada, tetapi bertentangan dengan tujuan F3.1 bahwa Safe Demo lama tidak menjadi pintu pengguna. Jangan mengandalkan tombol yang disembunyikan sebagai authorization. Hapus hook publik dari build biasa; regression test lama sebaiknya menguji komponen/API melalui harness test atau akses yang benar-benar dibatasi ke development. Hindari `as any` baru pada jalur ini.
2. **P2 — Klaim lokasi pemrosesan terlalu pasti.** `frontend/src/components/modals/SapShadowSimulationModal.tsx` menyebut berkas diproses oleh “server lokal” dan tidak dibagikan ke jaringan publik. Aplikasi juga dapat di-host di server intranet Linux, sehingga “lokal” dapat dipahami sebagai komputer pengguna dan tidak selalu benar. Ubah menjadi kalimat yang akurat untuk deployment lokal maupun intranet: berkas diunggah ke server aplikasi yang sedang digunakan untuk simulasi/PDF; tidak dikirim ke printer fisik. Jangan menjanjikan batas jaringan yang tidak dibuktikan UI.
3. **P3 — Bukti handoff stale sesudah commit.** `docs/tasks/F3.1/RESULT.md` masih mengatakan “Siap untuk di-commit dan di-push”, padahal `bcf3556` sudah menjadi HEAD dan sama dengan upstream saat review. Perbarui status checkpoint dengan hash aktual. `docs/AI_HANDOFF.md` perlu memastikan snapshot teratas konsisten setelah koreksi.

## Verifikasi sesudah koreksi

- Jalankan ulang unit test, TypeScript check, build, dan E2E simulasi/legacy Safe Demo terkait. Jika mengubah jalur keamanan/backend, jalankan backend regression relevan.
- Pastikan tidak ada `dev_safe_demo` atau `__openSafeDemoModal` yang dapat dipakai pada bundle biasa; test tetap bisa memverifikasi fasilitas legacy tanpa pintu pengguna baru.
- Periksa `git diff --check`, diff final, dan status Git. `output/` yang sudah ada sebelum fase ini jangan ikut commit.
- Executor mencatat bukti baru di `RESULT.md`, commit/push perbaikan di branch yang sama, lalu berhenti sebelum PR/merge untuk review ulang Codex.

## Review ulang commit `f32334d` — 2026-09-23

Verdict: `READY_FOR_PR` dengan satu catatan dokumentasi P3 non-blocking. Belum berarti siap merge atau production-ready; PR tetap perlu ditinjau terhadap target branch yang benar.

- P2 akses modal lama: **teratasi untuk production bundle**. Hook global dan `as any` baru dihapus. Parameter `dev_safe_demo` dibatasi oleh `import.meta.env.DEV` dan capability Safe Demo. Reviewer membangun ulang frontend dan memindai `dist/assets/`; tidak ada string `dev_safe_demo` atau `__openSafeDemoModal`. Pada Vite development server, parameter itu memang tetap dapat dipakai bila Safe Demo aktif; jangan jalankan dev server dengan flag tersebut untuk pengguna bersama. Endpoint Safe Demo lama sendiri tetap hanya dijaga oleh `SAFE_DEMO_MODE` (risiko existing di luar perubahan UI ini), sehingga flag tersebut harus OFF pada deployment yang bukan lingkungan developer/test.
- P2 klaim privasi: **teratasi**. Teks kini menyatakan berkas diunggah ke server aplikasi yang sedang digunakan, tanpa klaim bahwa server selalu berada di komputer pengguna atau janji perimeter jaringan publik.
- P3 status checkpoint: **masih stale, non-blocking**. `RESULT.md` bagian akhir masih berbunyi “Siap di-commit dan di-push” walau commit `f32334d` sudah menjadi HEAD dan sama dengan upstream saat review ini. Rapikan sebelum/di PR, tetapi tidak perlu mengulang implementasi atau test karena hanya metadata dokumentasi.
- Verifikasi ulang reviewer setelah koreksi: `npm.cmd test` **74 passed**, `npm.cmd exec tsc -- --noEmit` **PASS**, `npm.cmd run build` **PASS**, scan bundle dev hook **0 matches**, `git diff --check 0b3de08..HEAD` **PASS**. Playwright E2E (8 test) dan backend regression (24 test) adalah bukti dari executor di `RESULT.md`; reviewer tidak menjalankannya ulang. UAT SAP DEV/printer **NOT RUN**.
- Folder `output/` tetap untracked dan tidak masuk commit. Jangan stage artefak itu.

## Koreksi putusan setelah refresh baseline Git — 2026-09-23

Status final: `F3.1_CODE_REVIEW_PASS; PR_TO_MAIN_NOT_YET_CLEARED`. Bagian `READY_FOR_PR` di atas hanya berlaku untuk kualitas perubahan F3.1 dan **tidak** berarti branch ini siap diajukan sebagai PR F3.1 tunggal ke `main`.

Setelah `git fetch origin`, `origin/main` tetap `0f2cf82` (PR #24). Branch ini membawa checkpoint B2B2N `35f9cb5` dan B2B2O `8d895a9` **selain** commit F3.1. `git diff origin/main...HEAD` mencakup 34 file, termasuk backend auth/upload dan ABAP; area itu tidak dicakup oleh review F3.1 ini. Membuat PR ke `main` dengan judul F3.1 saja akan menyamarkan scope dan bukti review.

Sebelum PR/merge, pilih salah satu jalur yang jelas: (a) review dan merge dependency B2B2N/B2B2O lebih dulu, lalu perbarui F3.1 terhadap `main`; atau (b) ajukan satu PR gabungan dengan judul/scope B2B2N+B2B2O+F3.1 dan lakukan review seluruh 34 file. Jangan menganggap review ini sebagai persetujuan atas dependency tersebut. Tidak ada rebase, reset, merge, atau perubahan dependency yang dilakukan dalam review ini.
