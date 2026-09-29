# F3.19 — Review advisor

## Keputusan

Implementasi diterima untuk template teks yang diekspor oleh editor. Identitas binding tersimpan pada `data-placeholder`, sedangkan isi `<text>` tetap berupa teks visual. Saat render, nilai JSON mengganti teks visual tersebut. Template lama dengan `{{token}}` masih diproses.

## Bukti

- Frontend `npm run typecheck:core`: PASS.
- Frontend `npm test`: 96/96 PASS.
- Frontend `npm run build`: PASS.
- Backend `test_data_placeholder_renderer.py`, `test_routes_inspect.py`, `test_routes_render.py`, dan `test_safe_demo_pdf_hardening.py`: 34/34 PASS.
- Browser lokal: pada tab uji terpisah, Add Text → bind `material_number` → Download template SVG menghasilkan `data-placeholder="material_number"`, `data-field="material_number"`, dan teks visual `SR01PFO3000810` di `<tspan>` tanpa `{{material_number}}`. File uji: `thermal-template (5).svg` di Downloads. Tab uji telah ditutup; tab pengguna tidak diubah.
- `git diff --check`: PASS; Git hanya memberi peringatan konversi LF/CRLF.

## Batas review

- Belum ada uji browser end-to-end untuk impor lalu render ulang format baru. Verifikasi browser mencakup ekspor, sementara penggantian saat render dan deteksi token hilang diuji melalui backend.
- Penggantian `data-placeholder` pada renderer memakai pola yang ditujukan untuk elemen `<text>` dari exporter Fabric. Struktur SVG teks lain yang kompleks, misalnya `<textPath>`, perlu pengujian tersendiri sebelum dinyatakan didukung.
- Tidak ada commit, push, deployment, atau akses printer.
