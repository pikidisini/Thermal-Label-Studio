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
