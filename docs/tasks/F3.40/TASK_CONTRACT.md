# F3.40 — Text feature ownership

## Tujuan

Merapikan kepemilikan Text menjadi feature-first lengkap tanpa mengubah perilaku penulisan, font picker, dynamic binding, atau ekspor SVG.

## Scope

- Menempatkan hook aksi Text di `features/text/hooks`.
- Memindahkan daftar dan tipe font yang dimiliki Text ke `features/text/model`.
- Menghapus compatibility wrapper toolbar lama setelah seluruh caller memakai public API `features/text`.
- Mempertahankan `TextFormatControls` pada feature Text dan `AnchoredOverlay` pada shared UI.
- Menambah test struktur, dokumentasi hasil, dan handoff.

## Di luar scope

- Tidak mengubah Font list, preview/dropdown, test id, Text behavior, dynamic binding, SVG exporter, Canvas, Line, Snapping, Images, Graphics, Barcode/QR, Templates, backend, atau UI desain.
- Tidak commit, push, deploy, atau restart service.

## Kriteria penerimaan

1. `features/text` memiliki public `index.ts`, `hooks`, `model`, dan `ui` sebagai owner Text.
2. Tidak ada caller aktif yang mengimpor wrapper toolbar Text lama atau `features/text/editor`.
3. Daftar font tetap sama dan UI tetap mendapat font option dari feature Text.
4. TypeScript, full frontend test, build, dan diff check selesai dengan hasil terdokumentasi.
