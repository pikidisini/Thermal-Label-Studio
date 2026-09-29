# Fase 3.4 — Fondasi keamanan hasil audit arsitektur

- Tanggal: 2026-09-24.
- Baseline: `b30e7a6`, branch `codex/f3-4-architecture-safety-foundation`.
- Target produk: satu server perusahaan, banyak printer, beberapa designer.
- Otorisasi: pengguna meminta implementasi memakai agen murah Luna; Codex utama menjadi review advisor.
- Scope milestone: perbaikan A01 (cleanup durable data) dan A02 (legacy print boundary/default deployment) dari `docs/tasks/ARCHITECTURE_AUDIT_20260924/RESULT.md`.
- Status awal: IN_PROGRESS. Refaktor modular monolith penuh tetap roadmap lanjutan; milestone ini menutup dua defect prioritas terlebih dahulu.
- Existing changes: audit task folder dan tambahan audit di AI_HANDOFF dipertahankan.

## Workflow

Luna menjadi satu writer implementasi. Codex utama menyusun kontrak, meninjau kode dan test, lalu mengembalikan koreksi ke Luna. Handoff writer eksplisit; tidak ada dua penulis bersamaan. Pekerjaan A01 dan A02 berurutan. Tidak commit/push/PR/merge/deploy pada milestone ini.

## A01 — Cleanup

Cleanup hanya boleh menghapus expired ephemeral render jobs yang dikenali. Format existing job ID adalah 12 karakter hexadecimal lowercase. Direktori durable simulasi, unknown names, symlink/junction dan target di luar storage root harus dipertahankan. Kegagalan penghapusan tidak boleh dihitung sebagai sukses. Perubahan tidak boleh memigrasi atau membersihkan data existing.

Regression menggunakan temporary directory sintetis: expired/fresh job, durable records/artifacts/idempotency, unknown folder, containment/link safety jika platform mendukung, dan deletion failure. Pemisahan root penuh menjadi langkah lanjutan; patch ini menjaga path/download yang sudah ada.

## A02 — Legacy print boundary

Tutup celah anonymous direct dispatch dan pastikan local simulation deployment tidak menyediakan akses physical transport. Gunakan guard server-side, bukan UI-only. Jalur legacy yang belum memenuhi registry/lifecycle production dinonaktifkan secara default; perubahan kompatibilitas dan opt-in yang diperbolehkan harus didokumentasikan secara eksplisit setelah review desain.

Desain guard final ditentukan setelah pemeriksaan router/auth/test aktual. Jangan membuat fallback machine credential ke browser session atau memakai simulation token untuk otorisasi cetak. Pertahankan health, authenticated render/download, dan production print-agent/dispatcher lifecycle yang sudah ada.

### Keputusan implementasi A02 setelah review

- `LEGACY_DIRECT_PRINT_ENABLED` default false. Disabled atau `LOCAL_SIMULATION_ONLY=true` menghasilkan 404 sebelum dispatch, bahkan bila flag legacy true bersamaan dengan simulation-only.
- Bila explicitly enabled, `/print/printers` memerlukan sesi IT, dan semua POST `/print/tcp`, `/print/spooler`, `/print/batch`, serta `/sap/print` memerlukan sesi IT dan CSRF. Token mesin/simulasi tidak memberikan fallback akses. SAP legacy menjadi compatibility endpoint administratif; anonymous headless integration tidak lagi didukung. Ini tidak mengganti machine-to-machine production API dengan browser login.
- Pasang guard pada route juga, sehingga protection tidak hanya bergantung pada middleware path match. Early middleware mempertahankan 404 untuk deployment disabled sebelum body processing.
- Compose lokal bind `127.0.0.1:8000:8000`, explicit simulation-only, legacy false, dan flag simulasi yang sesuai. Tidak mengubah deployment live/pilot dispatcher.
- UI membuka modal pada Export; kontrol hardware hanya ditampilkan bila role IT dan kapabilitas server mengizinkan. Unknown/error capability fail closed. Tidak menyediakan daftar printer palsu ketika server menolak/gagal. POST client menyertakan same-origin credentials dan CSRF.
- Endpoint status boleh mengembalikan boolean kapabilitas legacy yang efektif, tanpa credential. UI capability bukan pengganti server auth.
- Existing positive route tests memakai fixture IT + explicit opt-in secara lokal per test module; jangan melemahkan default fixture autentikasi global demi membuat test lulus.
- README/.env.example menjelaskan perubahan kompatibilitas dan default-off; opt-in bukan production approval atau registry-based production route.

Gate: matriks mode × endpoint × principal; rejection terjadi sebelum service/transport; session mutation membutuhkan CSRF apabila legacy browser path tetap tersedia; Compose lokal loopback dan simulation-only. Semua transport dalam test harus mock/virtual.

## Batas dan acceptance

- Tidak ada SAP, printer fisik, Windows Spooler, TCP 9100, migration, database production atau deployment live.
- Preserve no-resend, fencing, lease/attempt-count, strict production versus tolerant local simulation, dan raw snapshot.
- Targeted tests setiap patch, kemudian regression backend; frontend tests/typecheck/build bila frontend berubah. Gunakan temporary path Windows pendek dan auth DB test terisolasi; kosongkan TEST_POSTGRES_DSN.
- Review actual diff, auth bypass/ordering, containment, compatibility, dan generated/secret/whitespace. Catat PASS/FAIL/BLOCKED/NOT RUN secara jujur.
- RESULT berisi hasil executor dan gate aktual; REVIEW berisi keputusan advisor. AI_HANDOFF diperbarui setelah writer kembali ke advisor.
