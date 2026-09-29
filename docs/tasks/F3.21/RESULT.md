# F3.21 Result

Status: IMPLEMENTED — review advisor selesai untuk alur editor lokal.

Perubahan: generator barcode default `displayValue=false`; inspector memakai textarea; metadata komposisi diserialisasi sebagai base64 JSON versi 1; backend mendekode serta menyelesaikan literal/token sebelum membentuk barcode/QR.

Verifikasi reviewer: `npm run typecheck:core` PASS; `npm test` 102/102 PASS; `python -m pytest backend/tests/test_barcode_payload_metadata.py backend/tests/test_profile_composition.py -q -p no:cacheprovider` 39/39 PASS; `npm run build` PASS; `git diff --check` PASS. Pada browser lokal, barcode baru tampil tanpa caption. QR dengan `batch_number`, `roll_no`, dan `type_film` dalam tiga baris diekspor ke SVG, diimpor kembali, lalu inspector tetap menampilkan template multiline yang dapat diedit. Mengosongkan payload mempertahankan input kosong dan menampilkan validasi. Perubahan nilai token menghitung ulang payload komposit; nilai invalid menandai preview sebagai stale.

Limitasi: payload komposit 1D pada jalur backend hanya menerima Code128 karena generator vector engine saat ini Code128. EAN-13/Code39 legacy tetap dipertahankan untuk payload lama dan tidak diam-diam dipakai untuk komposisi baru.

Belum diverifikasi pada printer fisik, SAP, atau jalur profile production yang memerlukan persetujuan/versioning terpisah. `git fetch origin` BLOCKED oleh izin sandbox pada `.git/FETCH_HEAD`; status remote tidak diklaim.

Draft payload kosong tetap disimpan dan diekspor sebagai metadata komposit kosong. Jalur strict menolak render dan jalur simulasi tolerant menghilangkan barcode/QR, sehingga tidak kembali diam-diam ke nilai preview lama.

Object dengan `payloadTemplate` selalu mengikuti perubahan `tokenMap` hasil parsing data; preview komposit valid diperbarui, sedangkan payload invalid ditandai stale dan tidak diencode.
