# F3.36 — Frontend Layering and Overlay System

## Tujuan

Menetapkan urutan layer UI tunggal dan memperbaiki popup font yang tertindih flyout toolbox, tanpa mengubah perilaku editor/canvas.

## Ruang lingkup

- Kontrak layer bersama untuk canvas, chrome, flyout, tooltip, modal, dan toast.
- Portal berjangkar untuk menu font agar lepas dari `overflow` dan stacking context ribbon.
- Migrasi layer pada toolbox, top menu, tooltip, modal, Template Explorer, dan toast yang telah diaudit.
- Test unit murni untuk urutan layer dan kalkulasi posisi portal.

## Di luar ruang lingkup

- Perubahan model canvas, tool Fabric, data SAP, backend, printer, dan deployment.
- Penggantian seluruh popup menjadi portal; hanya menu yang keluar dari boundary lokal membutuhkan primitive ini saat ini.

## Acceptance criteria

1. Tidak ada angka layer baru yang tersebar pada komponen UI yang dimigrasikan.
2. Font menu dirender ke `document.body`, dengan posisi viewport yang mengikuti tombol font.
3. Flyout/tooltip/modal/toast memakai tier kontrak yang konsisten.
4. TypeScript penuh, frontend test, production build, dan `git diff --check` lulus.

## Risiko dan verifikasi manual

Browser UAT tetap diperlukan untuk memastikan menu font terbuka di atas Data Tokens dan tetap mengikuti ribbon ketika window di-scroll atau di-resize.
