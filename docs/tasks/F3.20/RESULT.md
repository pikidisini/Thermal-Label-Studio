# F3.20 — Hasil pemulihan draft editor

## Hasil

Ditambahkan pemulihan sesi edit berbasis `sessionStorage` dengan kunci per `user.id`. Fabric JSON menggunakan `CANVAS_SERIALIZE_PROPS`, bersama identitas template, ukuran label, dan mode design/preview. Penyimpanan dijadwalkan 350 ms setelah event canvas dan dipaksa saat `pagehide`. Payload divalidasi berdasarkan versi, kepemilikan, dimensi, mode, dan bentuk canvas; kegagalan quota tidak menghentikan editor. Logout melakukan best-effort cleanup draft user.

Saat draft dipulihkan, aplikasi menampilkan status `Draft sesi dipulihkan` dan catatan bahwa JSON lokal perlu diunggah ulang untuk preview data yang sama. Raw SAP JSON, token autentikasi, dan kredensial tidak masuk payload. Persistensi ditahan selama Fabric masih melakukan `loadFromJSON` agar draft valid tidak tertimpa canvas parsial.

## Verifikasi

- `npm run typecheck:core` — PASS.
- Draft validation test was added for valid, malformed, foreign-user, negative-dimension, and invalid-object payloads. Root menjalankan `npm test` di luar sandbox setelah `spawn EPERM` pada percobaan awal; hasil akhir 97/97 PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS; hanya peringatan LF/CRLF.
- Browser refresh test — PASS: static text dipulihkan setelah reload; binding `material_number` dan inspector tetap ada; edit token setelah reload mengubah canvas.
- `tokenMap`/`jsonData` tidak dipulihkan. Setelah refresh, pengguna harus mengulang edit token atau mengunggah ulang JSON lokal sebelum mempercayai data pada Preview.
- Tidak ada commit, push, deployment, atau akses printer.
