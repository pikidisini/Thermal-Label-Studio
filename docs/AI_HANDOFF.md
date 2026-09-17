# AI Handoff — Thermal Label Studio

Gunakan dokumen ini untuk memulihkan konteks ketika melanjutkan pekerjaan dari laptop, task, atau sesi AI lain.

## Instruksi pembuka

Sebelum mengubah file:

1. Baca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/DECISIONS.md`.
2. Periksa `git status --short --branch`.
3. Baca diff yang sudah ada dan jangan menimpa perubahan pengguna.
4. Jelaskan pemahaman task, scope, file kandidat, risiko, dan acceptance criteria.
5. Jika membutuhkan POC desktop, baca repository root sebagai referensi saja dan jangan mengubahnya.

## Tujuan aktif

Pertahankan dan kembangkan Thermal Label Studio sebagai web application yang dapat mendesain template, memvalidasi kontrak SAP JSON, merender preview, dan menyiapkan print job secara aman serta dapat diuji.

## Pekerjaan terakhir

- Tanggal: 2026-09-17
- Ringkasan: memisahkan secara eksplisit konteks repository web aktif dari repository POC desktop.
- Perubahan penting: menambahkan status proyek, keputusan arsitektur, dan instruksi handoff yang portable.
- Verifikasi: dokumentasi diperbarui; test aplikasi belum dijalankan dalam task dokumentasi ini.

## Pekerjaan berikutnya

- [ ] Perbarui bagian ini setelah setiap milestone implementasi.
- [ ] Catat acceptance criteria dan test yang benar-benar dijalankan.
- [ ] Catat blocker, asumsi, dan keputusan baru di `DECISIONS.md`.
- [ ] Pastikan perubahan yang siap dibagikan sudah di-commit dan di-push ke repository aktif.

## Format update handoff

```text
Tanggal:
Task:
Status: planned | in-progress | verified | blocked
Scope:
File diubah:
Perintah test:
Hasil aktual:
Keputusan baru:
Risiko / blocker:
Langkah berikutnya:
```

## Prompt lanjutan yang direkomendasikan

> Lanjutkan dari `docs/AI_HANDOFF.md`. Baca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/DECISIONS.md`; periksa git status dan diff; jangan mengubah repository POC desktop. Kerjakan hanya scope berikut: [isi task]. Sebelum selesai, jalankan verifikasi yang relevan dan perbarui handoff dengan hasil aktual.
