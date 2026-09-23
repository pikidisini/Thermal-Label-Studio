# Project Status — Thermal Label Studio

Dokumen ini adalah ringkasan kondisi proyek aktif untuk manusia dan AI.

## Status proyek

Snapshot terkini (2026-09-23): B2B2K sudah merged ke `main` melalui PR #22
(`3984469`). B2B2L sedang direncanakan pada branch
`codex/b2b2l-profile-composition-engine`; lihat
`docs/tasks/B2B2L/TASK_CONTRACT.md`. Rincian fase lama di bawah adalah
snapshot historis dan bukan status Git terkini.

- Repository aktif: `Thermal-Label-Studio`
- Lokasi kerja lokal: `web_app/`
- Repository referensi: `JSON_LABEL_THERMAL_PRINTER_PARSER`
- Status: aktif dikembangkan; belum boleh dianggap production-ready tanpa verifikasi test, security, observability, backup, dan rollback.
- Tanggal snapshot dokumen: 2026-09-21
- Baseline: `main` pada commit `837552e` setelah B2B2F di-merge.
- Branch aktif: `main`.
- Status B2B2C: merged ke `main`; lifecycle delivery PostgreSQL opt-in dan disposable-verified.
- Status B2B2D: merged ke `main`; DurableFilesystemArtifactStorage terverifikasi penuh (manifest integrity v1.0, 7-day retention, P1/P2 resolved).
- Status B2B2E: merged ke `main`; Central Print Dispatcher (RAW TCP socket port 9100) dan Batch Ingestion Pipeline terverifikasi penuh.
- Status B2B2F: merged ke `main`; Docker Compose Pilot Linux (`docker-compose.pilot.yml`), runner dispatcher, runbook operasional, dan simulasi pilot terverifikasi penuh.
- Workflow AI: `docs/AI_WORKFLOW.md`.

## Tujuan produk

Thermal Label Studio adalah web application untuk mendesain, memvalidasi, merender, dan menyiapkan pencetakan label thermal berbasis template SVG dan kontrak data SAP JSON.

## Area utama

- Frontend: React/Vite/TypeScript dengan antarmuka studio/canvas.
- Backend: FastAPI dan Python.
- Core engine: renderer, rasterizer, barcode/QR generator, serta encoder printer.
- Kontrak: template SVG dan print job contract terdokumentasi di `docs/contracts/`.
- Test: backend pytest dan frontend/E2E test sesuai konfigurasi yang tersedia.

## Batas repository

Repository root di luar `web_app/` adalah POC desktop dan arsip pengetahuan. Jangan mengubahnya ketika mengerjakan fitur web kecuali pengguna secara eksplisit meminta perubahan pada repository tersebut.

Kode atau konsep dari POC boleh digunakan sebagai referensi, tetapi harus dibandingkan dengan kebutuhan, kontrak, dan test `web_app` sebelum dipindahkan.

## Pekerjaan aktif

- Fondasi backend dan paket kontainerisasi pilot (B2B2B, B2B2C, B2B2D, B2B2E, dan B2B2F) telah selesai 100% dan terintegrasi di `main`.
- Tahap berikutnya adalah **Fase Pengerasan Lapangan & Kesiapan Uji Coba Pilot Riil**: persiapan penyebaran ke server intranet Linux pabrik, verifikasi konektivitas IP printer Port 9100 di lapangan, integrasi SAP batch endpoint v1/v2, atau Safe Demo Mode / UI monitoring batch di frontend.

## Workflow lintas perangkat dan provider AI

1. Gunakan GitHub sebagai source of truth, bukan folder lokal atau riwayat chat.
2. Mulai task dengan `git fetch`, pemeriksaan branch/status, dan pembacaan seluruh dokumen konteks.
3. Gunakan satu branch untuk satu pekerjaan aktif; jangan menjalankan dua AI sebagai penulis pada branch yang sama.
4. Sebelum berpindah perangkat/provider, update `AI_HANDOFF.md` dan commit/push jika pekerjaan sudah berada pada checkpoint aman.
5. Setelah berpindah, provider berikutnya harus membaca handoff dan memverifikasi ulang kondisi working tree.

## Cara memulai task AI

1. Baca `AGENTS.md` pada root `web_app`.
2. Baca dokumen ini, `DECISIONS.md`, dan `AI_HANDOFF.md`.
3. Periksa `git status`, branch, dan diff sebelum mengubah file.
4. Identifikasi apakah task menyentuh frontend, backend, engine, kontrak, printer, atau dokumentasi.
5. Buat implementation plan kecil dan sebutkan acceptance criteria.

## Catatan verifikasi

Status test, deployment, keamanan, dan production readiness harus selalu diverifikasi dari kondisi aktual. Jangan menggunakan badge, dokumentasi lama, atau pernyataan sebelumnya sebagai bukti eksekusi terbaru.
