# F3.19 — SVG data-placeholder contract

## Scope

Gunakan atribut XML `data-placeholder="token"` sebagai identitas binding template. Teks SVG yang disimpan tetap literal dan dapat dibaca langsung; renderer mengganti isi saat runtime. Format lama `{{token}}` tetap didukung.

## Acceptance criteria

1. Export bound text tidak menyimpan `{{token}}` sebagai teks visual, termasuk object lama yang belum memiliki display text literal.
2. Export/import mempertahankan binding dan atribut layout `<tspan>`.
3. Renderer melakukan XML escaping, menangani null sebagai string kosong, dan gagal strict untuk token absent.
4. Atribut dengan nama seperti `foo-data-placeholder` tidak dianggap sebagai binding.
5. Frontend typecheck/build dan targeted backend tests dicatat dengan bukti aktual.
