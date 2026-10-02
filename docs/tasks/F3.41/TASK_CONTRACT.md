# F3.41 — Feature ownership Barcode dan QR

## Tujuan

Menetapkan Barcode dan QR sebagai feature owner mandiri agar generator, resolusi payload, aksi canvas, dan kontrol properti tidak lagi tersebar di `utils`, `hooks/canvas`, atau ribbon layout.

## Scope

- Pindahkan generator Barcode, resolver payload komposit, dan preview/validasi ke `frontend/src/features/barcode/model`.
- Pisahkan generator dan aksi penambahan QR ke `frontend/src/features/qr`.
- Pindahkan aksi penambahan Barcode, QR, dan token SAP ke hook feature; `useCanvasActions` hanya mengagregasi public API.
- Pindahkan kontrol properti Barcode/QR pada ribbon ke UI Barcode dan gunakan public barrel `index.ts` dari setiap feature.
- Perbarui import dan test yang terdampak serta tambahkan structural test boundary.

## Batas eksplisit

- Tidak mengubah perilaku Barcode tanpa human-readable text, payload literal/komposit, multi-payload, QR multiline, dynamic binding, API, SVG export/import, validasi, atau test ID.
- Tidak menyentuh Text, Graphics, Images, Line, Snapping, Table, Templates, Data Tokens, atau backend selain import caller yang diperlukan untuk boundary Barcode/QR.
- Tidak commit, push, deploy, restart/stop service, atau mengubah konfigurasi runtime.

## Acceptance criteria

1. `features/barcode/index.ts` dan `features/qr/index.ts` adalah public API untuk caller lintas-feature.
2. Generator QR dan canvas action QR dimiliki feature QR; Barcode tidak lagi memiliki generator atau action QR.
3. `useCanvasActions` mengagregasi action Barcode, QR, dan token tanpa deep import implementation.
4. File Barcode legacy di `frontend/src/utils` dan `hooks/canvas/useBarcodeActions.ts` tidak ada lagi.
5. TypeScript penuh, test frontend penuh, Vite build, dan `git diff --check` lulus.
