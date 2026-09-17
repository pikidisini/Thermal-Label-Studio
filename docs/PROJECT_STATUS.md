# Project Status — Thermal Label Studio

Dokumen ini adalah ringkasan kondisi proyek aktif untuk manusia dan AI.

## Status proyek

- Repository aktif: `Thermal-Label-Studio`
- Lokasi kerja lokal: `web_app/`
- Repository referensi: `JSON_LABEL_THERMAL_PRINTER_PARSER`
- Status: aktif dikembangkan; belum boleh dianggap production-ready tanpa verifikasi test, security, observability, backup, dan rollback.
- Tanggal snapshot dokumen: 2026-09-17

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

## Cara memulai task AI

1. Baca `AGENTS.md` pada root `web_app`.
2. Baca dokumen ini, `DECISIONS.md`, dan `AI_HANDOFF.md`.
3. Periksa `git status`, branch, dan diff sebelum mengubah file.
4. Identifikasi apakah task menyentuh frontend, backend, engine, kontrak, printer, atau dokumentasi.
5. Buat implementation plan kecil dan sebutkan acceptance criteria.

## Catatan verifikasi

Status test, deployment, keamanan, dan production readiness harus selalu diverifikasi dari kondisi aktual. Jangan menggunakan badge, dokumentasi lama, atau pernyataan sebelumnya sebagai bukti eksekusi terbaru.
