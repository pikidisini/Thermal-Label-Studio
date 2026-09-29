# Hasil implementasi Fase 3.4

Tanggal: 2026-09-24. Status: A01 dan A02 selesai dalam working tree, belum di-commit atau di-deploy. Implementasi dikerjakan agen Luna, review read-only oleh Sol 6 High dan Codex utama.

## A01 — Cleanup storage

- Cleanup hanya menerima direktori anak langsung dengan nama 12 karakter hexadecimal lowercase, sesuai ID job render/SAP yang ada.
- Direktori simulasi yang durable, nama tidak dikenal, symlink/reparse point, dan path yang resolve di luar root dipertahankan. Root yang merupakan link/reparse point tidak dipindai.
- Kegagalan `rmtree` tidak dihitung sebagai penghapusan sukses. Tidak ada migrasi atau pembersihan data existing.
- Regression mencakup job kedaluwarsa/segar, nama durable/tidak dikenal, kegagalan penghapusan, serta simulasi reparse dan containment. Tes symlink Windows nyata di-skip karena hak membuat symlink tidak tersedia.

## A02 — Batas legacy direct print

- `LEGACY_DIRECT_PRINT_ENABLED` default `false`; semua route legacy direct print menghasilkan 404 ketika flag mati atau `LOCAL_SIMULATION_ONLY=true`. Penolakan pada mode ini terjadi di middleware sebelum pemrosesan body, dengan guard tambahan pada route.
- Opt-in legacy memerlukan sesi IT untuk daftar printer dan sesi IT plus CSRF untuk POST TCP, Spooler, batch, dan SAP print. Token simulasi tidak menjadi fallback. SAP legacy hanya jalur kompatibilitas administratif.
- Compose lokal bind ke loopback dan menetapkan simulation-only serta legacy-print disabled. `/api/status` dan `/api/v1/status` mengumumkan boolean kapabilitas yang efektif.
- Modal frontend membuka tab Export; opsi hardware hanya tampak bagi IT ketika kapabilitas server true. Saat modal dibuka ulang, kapabilitas diambil ulang dan respons lama diabaikan. Klien print mengirim kredensial same-origin dan CSRF; daftar printer palsu saat server gagal telah dihapus.
- Matriks keamanan memakai JSON valid untuk menguji anonymous 401, PPIC 403, IT dengan CSRF salah atau hilang 403, default-off/simulation-only 404, dan query parameter SAP yang tidak dapat melewati guard. Mock TCP/Spooler/SAP tidak terpanggil pada penolakan. Positive opt-in IT telah dicakup tes route yang ada.

## Gate aktual

- Targeted backend A01/A02 terkait: 25 passed, 1 skipped sebelum perbaikan akhir matriks. Perbaikan akhir ikut lulus dalam suite penuh.
- Suite backend `python -m pytest backend/tests -q -rs -p no:cacheprovider` dengan `TEST_POSTGRES_DSN=''` dan auth DB tes terisolasi: **497 passed, 22 skipped**, 2 dependency deprecation warnings, 238.15 detik. Skip meliputi PostgreSQL yang tidak dikonfigurasi dan symlink yang tidak tersedia di Windows.
- Frontend `npm.cmd test`: **85 passed**. `npm.cmd exec tsc -- --noEmit`: **PASS**. `npm.cmd run build`: **PASS**. TypeScript project masih `strict=false`; gate ini bukan bukti tidak ada bug runtime.
- `git diff --check`: **PASS**. Tidak ada printer fisik, SAP, TCP 9100, Spooler nyata, database production, migration, atau deployment yang dijalankan.

## Batas verifikasi

Pada opt-in legacy, FastAPI dapat mem-parse body sebelum dependency sesi/CSRF dijalankan. Ini dapat menghasilkan 422 untuk JSON invalid dan memakai resource parsing sebelum penolakan, tetapi tidak membuka dispatch transport; kontrak milestone mensyaratkan penolakan sebelum service/transport. Jalur legacy tetap default-off dan tidak dipakai Compose lokal. PostgreSQL runtime, Windows symlink nyata, E2E browser, dan hardware belum diverifikasi dalam milestone ini. Target “zero bug” tidak dapat dibuktikan dari gate ini.

`git status` masih memberi peringatan izin saat membaca direktori `.tmp-test/` di root repo; direktori itu tidak dihapus, sehingga inventaris untracked di dalamnya belum dapat diverifikasi.
