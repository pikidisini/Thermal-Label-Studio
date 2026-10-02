# F3.36 — Hasil Frontend Layering and Overlay System

Status: DONE — siap untuk independent review.

## Perubahan

- Menambahkan kontrak `UI_LAYER` di `frontend/src/shared/ui/layers/` dan CSS custom properties dengan enam tier: canvas, chrome, flyout, tooltip, modal, dan toast.
- Menambahkan `AnchoredOverlay`, portal React ke `document.body` yang menghitung ulang posisi saat resize dan scroll capture.
- Memindahkan menu font dari positioning absolut di dalam Property Ribbon ke `AnchoredOverlay`; menu kini tidak lagi dipotong atau dikalahkan stacking context ribbon/toolbox.
- Mengganti layer chrome, menu topbar, tooltip toolbox, modal, Template Explorer, dan toast yang diaudit untuk memakai tier kontrak.
- Menambahkan test unit untuk urutan kontrak dan posisi overlay di bawah trigger.
- Koreksi review: outside-click font sekarang menganggap trigger dan elemen menu portal sebagai bagian interaksi agar klik kedua benar-benar menutupnya; table grid picker dan menu topbar juga dipindahkan ke root overlay/flyout sehingga tidak kalah oleh sibling chrome. Overlay internal canvas tabel sengaja tidak diubah.

## Validasi

- PASS — `npm.cmd exec tsc -- --noEmit`.
- PASS — `npm.cmd run typecheck:core`.
- PASS — `npm.cmd test` di luar sandbox Windows: seluruh 129 test lulus, termasuk 3 test F3.36. Percobaan di sandbox diblokir `spawn EPERM`.
- PASS — `npm.cmd run build` di luar sandbox Windows: Vite berhasil membangun 1.868 modul. Percobaan di sandbox diblokir `spawn EPERM`.
- PASS — `git diff --check`.
- PASS — focused Playwright `chromium-no-auth` (2/2): menu File membuka/menutup root overlay dan font picker membuka/menutup root overlay pada browser nyata. Test memakai respons auth/status/templates termock dan tidak memakai sesi pengguna.
- BLOCKED — `git fetch origin` tidak dapat membuka `.git/FETCH_HEAD` karena permission sandbox.

## Batas dan UAT manual

- Portal diterapkan pada font picker, topbar menu, dan table grid picker yang perlu menembus stacking context chrome. Flyout toolbox tetap berada dalam shell layout karena tidak keluar dari boundary panelnya.
- UAT browser masih perlu membuktikan font picker berada di atas Data Tokens/Industrial Symbols/Design Tools dan tetap selaras setelah resize atau scroll.
- Tidak ada perubahan canvas/Fabric, backend, SAP, printer, database, commit, push, atau deployment.
