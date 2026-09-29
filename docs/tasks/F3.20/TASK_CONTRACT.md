# F3.20 — Pemulihan draft editor saat refresh

## Tujuan

Pertahankan sesi edit aktif per pengguna pada `sessionStorage` agar refresh halaman tidak menghilangkan perubahan yang belum disimpan.

## Batas

- Draft hanya memuat Fabric canvas JSON, identitas template, dimensi, dan mode tampilan.
- Kunci penyimpanan dibatasi ke `user.id`; raw SAP JSON, token autentikasi, dan kredensial tidak disimpan.
- Tidak mengubah backend, printer, atau template tersimpan.

## Acceptance criteria

1. Perubahan canvas disimpan dengan debounce dan di-flush saat `pagehide`.
2. Draft yang valid dipulihkan satu kali sebelum alur template awal menimpa canvas.
3. Payload rusak, milik user lain, atau quota storage gagal ditangani tanpa crash.
4. Logout menghapus draft user aktif.
5. Typecheck dan test utilitas draft dicatat di `RESULT.md`.
