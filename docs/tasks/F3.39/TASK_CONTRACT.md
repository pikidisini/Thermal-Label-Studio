# F3.39 — Feature ownership Line dan Snapping

## Tujuan

Melanjutkan fondasi feature-first dengan memastikan kepemilikan Line dan Snapping diakses melalui public API masing-masing tanpa mengubah perilaku editor.

## Scope

- Menambahkan public barrel untuk `features/line` dan `features/snapping`.
- Memindahkan aksi pembuatan garis awal dari hook canvas umum ke `features/line/hooks/useLineActions.ts`.
- Memindahkan penerapan properti garis spesifik ke `features/line/canvas/linePropertyUpdate.ts`.
- Memperbarui shell canvas, inspector, gesture adapter, dan object action agar tidak mengimpor implementation Line/Snapping lewat subpath internal.
- Menambah test struktur serta dokumentasi handoff.

## Batasan

- Tidak mengubah lifecycle gambar garis, anchor, snap/grid/guides, DOM test id, ekspor SVG, metadata, atau desain UI.
- `useDrawingTools` tidak dipindahkan karena juga memiliki lifecycle Text, Barcode, dan Table; ia tetap menjadi adapter canvas dan hanya menggunakan public API Line/Snapping.
- Tidak menyentuh Table, Text, Graphics, Images, Barcode/QR, backend, Docker, atau deployment.

## Kriteria penerimaan

1. Line dan Snapping masing-masing memiliki `index.ts` sebagai public API.
2. Tidak ada source import dari subfolder internal `features/line/*` atau `features/snapping/*` di luar feature pemiliknya.
3. Pembuatan garis dan pembaruan properti garis menggunakan ownership Line; snapping tetap dimiliki feature Snapping.
4. TypeScript, test frontend, build, dan diff check memiliki hasil tercatat.
