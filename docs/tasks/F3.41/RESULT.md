# F3.41 Result — Feature ownership Barcode dan QR

## Implementasi

- Barcode sekarang memiliki `model` untuk generator/payload/preview, `hooks` untuk penambahan Barcode serta resolusi token SAP, dan `ui/BarcodePropertyControls.tsx`.
- QR memiliki generator dan `useQrActions` sendiri. Aksi token hanya mendelegasikan pembuatan QR ke hook QR, sehingga metadata `barcodeType: 'qrcode'`, `barcodeValue`, dan `payloadTemplate` tetap sama.
- `useCanvasActions` mengagregasi public API Barcode dan QR. Property ribbon, preview, simulator, dan test memakai public barrel bila menjadi caller lintas-feature.
- Tidak ada perubahan pada exporter/importer SVG atau kontrak backend. Barcode tetap tanpa caption manusia; payload Barcode satu dimensi tetap menolak newline, sedangkan QR tetap menerima nilai multiline.

## Validasi

| Pemeriksaan | Status | Bukti |
| --- | --- | --- |
| `npm.cmd exec tsc -- --noEmit` | PASS | Tidak ada diagnostic TypeScript. |
| `npm.cmd test` | PASS | 132/132 test lulus, termasuk payload Barcode/QR dan structural boundary F3.41. |
| `npm.cmd run build` | PASS | Vite build lulus; 1.883 modul ditransformasi. |
| `git diff --check` | PASS | Tidak ada error whitespace; hanya warning CRLF dari worktree lama. |

Tidak ada commit, push, deploy, restart/stop service, atau perubahan backend dalam F3.41.
