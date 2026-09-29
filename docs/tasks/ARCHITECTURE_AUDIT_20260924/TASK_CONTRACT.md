# Audit arsitektur Thermal Label Studio

- Tanggal: 2026-09-24.
- Permintaan: analisis skalabilitas, struktur folder, maintainability, testability, kualitas frontend, dan pilihan Clean/Hexagonal Architecture.
- Baseline: `web_app`, branch `main`, commit `b30e7a6670a4e281362e180f251e5e7250d362ca`; working tree awal bersih. `git fetch origin` berhasil setelah penyesuaian izin sandbox; baseline sama dengan `origin/main` saat audit.
- Status: audit dan rekomendasi; tidak mengimplementasikan refaktor.
- Target yang dikonfirmasi pengguna: satu aplikasi di server perusahaan, banyak printer, dan beberapa pengguna desain. Multi-tenant/SaaS bukan kebutuhan saat ini.
- Writer: Codex utama. Pendamping read-only: GPT-6 Sol High untuk backend dan frontend; GPT-5.6 Luna Medium untuk inventaris quality/deployment. Sebagian run Sol berhenti karena batas penggunaan; temuan yang dipakai diperiksa kembali oleh writer utama.

## Scope dan batas

Analisis kode aktif backend, engine, frontend, test, deployment, dan dokumen terkait. Boleh menjalankan test lokal, build, pemeriksaan browser read-only, serta diagnostic mock pada data sintetis. Hasil berupa dokumen di task ini dan penunjuk handoff.

Tidak mengubah source/config aplikasi, POC di luar `web_app`, database aktif, SAP, printer fisik, Windows Spooler, atau TCP 9100. Tidak melakukan deployment, migration, commit, push, PR, atau merge. Database PostgreSQL eksternal dinonaktifkan pada regression run. Test socket yang sudah ada memakai loopback dengan port sementara.

## Acceptance criteria

1. Temuan memiliki bukti kode dan membedakan reproduksi, static finding, risiko skalabilitas, dan area belum diuji.
2. Rekomendasi arsitektur menjelaskan dependency direction, batas modul, struktur folder, dan migrasi bertahap.
3. Invariant fail-closed, no-resend, fencing, audit, serta perbedaan simulasi toleran/production strict tetap dijaga.
4. Hasil test aktual dan keterbatasan lingkungan dilaporkan; tidak menjanjikan zero bug atau kapasitas tanpa load test.
5. Rekomendasi UI konkret; inspeksi visual terbatas pada layar yang benar-benar dilihat.

## Deliverables

- `RESULT.md`: temuan, target arsitektur, UX direction, roadmap, dan bukti verifikasi.
- `REVIEW.md`: validasi silang dan keterbatasan audit; bukan persetujuan refaktor/production.
