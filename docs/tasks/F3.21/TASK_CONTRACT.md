# F3.21 — Barcode dan QR payload komposit

## Tujuan
Memungkinkan editor menyusun payload dari literal dan token data, QR multiline, serta menghilangkan human-readable caption barcode 1D.

## Batasan
- Satu format deklaratif terbatas: teks literal dan placeholder `{{field_name}}`; tidak ada kode/expression/URL execution.
- Metadata template disimpan sebagai `data-payload-spec` base64 JSON agar tidak ikut diganti oleh `inject_data`.
- Jalur production tetap strict/fail-closed; simulasi lokal tidak membuat payload dari fallback palsu.
- Tidak menyentuh printer fisik atau deployment.

## Acceptance criteria
1. Preview Code128/EAN13/Code39 hanya menampilkan bar.
2. Input payload menerima beberapa token dan literal; QR menerima newline.
3. Export/import SVG dan draft Fabric mempertahankan template.
4. Backend menyelesaikan token pada render dan menolak payload komposit yang kehilangan field.
