# Project Status — Thermal Label Studio

Dokumen ini adalah ringkasan kondisi proyek aktif untuk manusia dan AI.

## Status proyek

- Repository aktif: `Thermal-Label-Studio`
- Lokasi kerja lokal: `web_app/`
- Repository referensi: `JSON_LABEL_THERMAL_PRINTER_PARSER`
- Status: aktif dikembangkan; belum boleh dianggap production-ready tanpa verifikasi test, security, observability, backup, dan rollback.
- Tanggal snapshot dokumen: 2026-09-18
- Remote baseline terakhir: `origin/main` pada commit `8025353`
- Branch aktif: `codex/local-print-agent-b2b1-b2b2b-checkpoint`
- Upstream: `origin/codex/local-print-agent-b2b1-b2b2b-checkpoint`
- Checkpoint awal branch: `5a2289d` sudah dipush; koreksi B2B2B.2.5 sedang menunggu review/commit.
- Working tree: dirty karena koreksi B2B2B.2.5 masih menunggu review/commit; belum boleh dianggap committed atau pushed.

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

- `backend/app/local_print_agent/`: implementasi local print agent masih dalam pengembangan.
- `backend/tests/test_local_print_agent.py`: test untuk local print agent masih dalam pengembangan.
- `docs/architecture/print_job_and_local_agent.md`: dokumentasi arsitektur terkait print job/local agent memiliki perubahan lokal yang harus direview.
- Status fitur, test, dan security review: belum boleh dianggap verified hanya berdasarkan keberadaan file.

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
