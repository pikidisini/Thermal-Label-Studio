# F3.19 — SVG `data-placeholder` binding

## Hasil

Template SVG baru menyimpan identitas binding pada atribut `data-placeholder` dan mempertahankan teks literal yang terlihat di editor/viewer. Renderer mengganti isi elemen `<text>` saat runtime, mempertahankan atribut layout dan struktur `<tspan>`. Binding lama berbentuk `{{token}}` tetap kompatibel.

Binding yang datanya absent tetap gagal secara strict melalui `OrphanTokenError`; nilai `null` mengikuti kontrak renderer dan menjadi string kosong. Nilai XML di-escape sebelum disisipkan.

## Verifikasi

- `npm run typecheck:core` — PASS.
- `pytest -q backend/tests/test_data_placeholder_renderer.py` — targeted coverage untuk escaping, multiline `<tspan>`, missing strict, null, dan legacy token.
- `git diff --check` — PASS (line-ending warnings dari working tree tidak memengaruhi hasil).

Tidak ada commit, push, printer, atau deployment yang dilakukan.
