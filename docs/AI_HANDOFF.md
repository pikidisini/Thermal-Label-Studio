# AI Handoff — Thermal Label Studio

Gunakan dokumen ini untuk memulihkan konteks ketika melanjutkan pekerjaan dari laptop, task, atau sesi AI lain.

## Snapshot sesi saat ini

- Tanggal: 2026-09-18
- Repository: `Thermal-Label-Studio`
- Remote: `origin/main`
- Commit baseline remote: `8025353`
- Branch: `main`
- Status working tree: dirty; terdapat pekerjaan local print agent yang belum di-commit.
- Provider/perangkat sesi: isi saat handoff dilakukan.

Perubahan aplikasi yang terdeteksi saat snapshot ini:

- `backend/app/local_print_agent/`
- `backend/tests/test_local_print_agent.py`
- `docs/architecture/print_job_and_local_agent.md`

Dokumentasi handoff ini juga berubah pada sesi ini. Jangan menganggap test atau implementasi local print agent sudah verified sebelum menjalankan perintah verifikasi dan mencatat hasil aktual.

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

- Tanggal: 2026-09-18
- Ringkasan: koreksi B2B1.2 pada Local Print Agent offline.
- Perubahan penting: klasifikasi definitive versus ambiguous `begin_delivery`, recovery callback tunggal, strict Content-Disposition, bounded artifact streaming, dan forwarding Authorization pada integration bridge.
- Verifikasi aktual: backend 140 passed, agent 56 passed pada verifikasi terfokus terakhir, frontend 45 passed, TypeScript check lulus, production build lulus, Playwright 23 passed, dan `git diff --check` lulus.
- Batas: belum ada polling, executable, Windows Service, TCP transport, atau printer fisik.

## Pekerjaan berikutnya

- [ ] Perbarui bagian ini setelah setiap milestone implementasi.
- [ ] Catat acceptance criteria dan test yang benar-benar dijalankan.
- [ ] Catat blocker, asumsi, dan keputusan baru di `DECISIONS.md`.
- [ ] Pastikan perubahan yang siap dibagikan sudah di-commit dan di-push ke repository aktif.

## Format update handoff

```text
Tanggal:
Provider AI:
Perangkat:
Repository:
Remote:
Branch:
Commit baseline:
Status working tree:
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

> Lanjutkan dari `docs/AI_HANDOFF.md`. Baca `AGENTS.md`, `docs/PROJECT_STATUS.md`, dan `docs/DECISIONS.md`; periksa git status, branch, dan commit baseline; jangan mengubah repository POC desktop. Kerjakan hanya scope berikut: [isi task]. Jangan menimpa perubahan lokal. Sebelum selesai, jalankan verifikasi yang relevan dan perbarui handoff dengan provider, perangkat, file yang diubah, serta hasil aktual.
