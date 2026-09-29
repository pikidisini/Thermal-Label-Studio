# F3.20 — Review advisor

## Keputusan

Pemulihan draft desain setelah refresh diterima untuk cakupan satu tab browser dan satu pengguna yang sedang login. Payload disimpan di `sessionStorage` dengan kunci `user.id`, divalidasi menurut versi dan bentuk, lalu Fabric canvas dipulihkan sebelum pengguna melanjutkan edit. Logout membersihkan draft pengguna aktif. Penyimpanan saat `pagehide` serta event canvas menjaga perubahan yang belum tersimpan.

## Bukti

- Browser lokal pada tab uji terpisah: Add Text → ubah menjadi `DRAFT-RECOVERY-PASS` → refresh; teks tetap terlihat pada canvas.
- Browser lokal: binding `material_number` tetap terlihat di inspector setelah refresh; perubahan nilai token sesudah pemulihan kembali mengubah teks pada canvas.
- `npm run typecheck:core`: PASS.
- `npm run build`: PASS.
- `npm test`: 97/97 PASS, termasuk tes validasi draft baru.
- `git diff --check`: PASS; peringatan LF/CRLF saja.

## Batas review

- `sessionStorage` bertahan saat refresh tab yang sama; draft tidak dijamin bertahan setelah tab/browser ditutup atau ketika pengguna beralih perangkat.
- Raw JSON lokal dan nilai token yang diedit tidak termasuk draft. Setelah refresh, desain dan binding dipulihkan, tetapi JSON lokal harus diunggah ulang atau nilai token diedit ulang sebelum Preview data dapat dianggap sesuai dengan sesi sebelumnya. Banner UI menyatakan kebutuhan unggah ulang JSON lokal.
- Kegagalan quota/storage diberi status UI, tetapi belum diuji dengan simulasi quota browser.
- Tidak ada commit, push, deployment backend, atau akses printer.
