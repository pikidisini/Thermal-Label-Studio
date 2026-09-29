# F3.22 Review

Status: IMPLEMENTED IN WORKTREE; backend lokal port 8765 sudah dimulai ulang atas permintaan pengguna.

Reviewer memeriksa alur dropdown menjadi dialog explorer, daftar template server, pencarian, pemilihan folder bertingkat, preview SVG sebelum Open, pembuatan folder, pemindahan template custom, dan identitas template yang tetap stabil setelah dipindah. Built-in tetap read-only. Endpoint mutasi memakai autentikasi dan CSRF. Validasi path membatasi kedalaman folder, traversal, symlink yang keluar dari root, nama terlarang Windows, dan duplikasi ID antar-folder.

Verifikasi: `python -m pytest -q backend/tests/test_template_explorer.py backend/tests/test_routes_templates.py` PASS (15); `npm test` PASS (102); TypeScript typecheck dan Vite build PASS; `git diff --check` PASS (peringatan line ending saja). Browser pada `127.0.0.1:8765` memperlihatkan popup dan preview tanpa mengubah canvas. Setelah restart proses backend 8765, OpenAPI runtime memuat `/api/v1/templates/folders` dan `/{template_id}/move`. Sesi login browser lama tidak lagi lolos pemeriksaan server; browser membutuhkan login ulang sebelum daftar folder dapat diuji secara visual. Tidak ada pengujian printer, SAP, atau deployment production.

Catatan lanjutan: tombol Open masih memakai loader template lama yang menangkap error dan memiliki fallback lokal; kegagalan fetch setelah preview belum ditampilkan kembali di popup. Perbaiki pada increment berikutnya sebelum menganggap alur buka template fail-closed. Modal juga belum menerapkan focus trap keyboard penuh. Jangan menganggap fitur ini production-ready hanya dari tes lokal.
