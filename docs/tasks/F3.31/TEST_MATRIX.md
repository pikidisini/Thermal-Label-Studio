# F3.31 — Acceptance, pengujian dan UAT

Status automated acceptance: PASS (AC01–AC18; lihat `RESULT.md` untuk mapping dan bukti). UAT manual pengguna belum dijalankan. Bukti F3.30 tidak dipakai sebagai bukti F3.31.
Tolerance perhitungan model: 1e-6 mm; toleransi posisi layar maksimal 1 CSS px di luar stroke/antialiasing. Ukuran dan bentuk harus diperiksa, bukan hanya tombol terlihat.

| ID | Kriteria dan skenario minimum | Bukti yang diperlukan |
|---|---|---|
| AC01 | Tabel baru 3 × 2 hanya garis, tanpa R1C1/text/token/font, satu layer/object | Model + DOM/canvas + SVG assertion |
| AC02 | Grid 10 × 8: hover 5 × 4 benar; keyboard, Esc dan focus kembali ke tool | Browser |
| AC03 | Drag empat arah menghasilkan posisi/dimensi benar; preview hilang saat cancel; click default muat sheet | Browser + geometry unit |
| AC04 | Sheet terlalu kecil, drag kecil dan posisi di luar tidak menghasilkan model invalid atau history kosong | Unit + browser |
| AC05 | Delapan handle: sudut proporsional, sisi satu sumbu; ukuran cell ikut proporsi; stroke tetap | Browser + model dimension assertions |
| AC06 | Width/height model benar setelah resize/save/import; zoom 50/100/200% tidak mengubah ukuran cetak | Round-trip + browser |
| AC07 | Internal drag 30+20 menjadi 35+15; total tetap; minimum clamp; track lain tetap; garis tersembunyi tidak hit | Unit + browser |
| AC08 | Mode objek drag memindah; mode edit drag memilih; Shift+klik memperluas; keluar mode memulihkan lock | Browser + assert posisi tetap |
| AC09 | Merge 2 × 2, 1 × 3, 3 × 1 menghilangkan hanya interior; selection auto-expand seluruh merged region; invalid overlap ditolak | Model + renderer + browser |
| AC10 | Split mengembalikan grid/style tersimpan; merge/undo/redo/split tidak mengubah ukuran luar | Unit + browser + SVG |
| AC11 | Solid/dashed/dotted/color/width/none; scope semua/luar/internal/perimeter/segmen; shared edges tunggal; style interior tersimpan | Unit + SVG + visual browser |
| AC12 | Export/import dua tabel dengan merge berbeda dan objek teks/barcode mandiri tetap terpisah/editable | Browser download/upload + semantic metadata assertion |
| AC13 | Save/load template server dan draft refresh mempertahankan v2, style, ukuran, topologi; malformed/oversize metadata aman | Disposable server/browser + validator unit |
| AC14 | Pointercancel/Escape/tool switch/unmount menghentikan gesture; tidak ada listener ganda setelah undo/redo/remount | Browser lifecycle regression |
| AC15 | Satu gesture = satu undo; redo mengembalikan hasil; intermediate remove/insert tidak tercatat; noop/cancel tidak menambah history | History integration test |
| AC16 | Tambah/hapus/distribute mempertahankan total, bounds, merge/style remap; track terakhir tak dapat dihapus | Unit + browser |
| AC17 | Preview/render lokal SVG dan PDF/PNG menunjukkan bentuk benar, tanpa handle/editor UI atau binding tabel; auth/guard tetap berlaku | Backend render fixture + inspeksi hasil lokal |
| AC18 | Menu dalam viewport, label jelas, keyboard/focus/Escape; rotasi 30° dan zoom/pan tidak menggeser hit target | Browser + visual QA |

## Invariant model yang wajib diuji

- Setiap unit grid dimiliki tepat satu region; setiap region persegi panjang, bounded dan tidak overlap.
- Edge matrices memiliki ukuran tepat; renderer mengecualikan interior merge berdasarkan topologi, bukan menghapus data edge.
- Ukuran finite, >= 1 mm per track; tidak ada NaN/Infinity/negatif.
- Command tidak memutasi input; failed command tidak menyebabkan partial state.
- Merge/split, insert/delete dan global resize mempertahankan satuan mm serta topologi.
- Urutan elemen lain, ID dan pose tabel tidak hilang saat objek dibangun ulang.

## Gate perintah

Dari web_app/frontend:
- npx tsc --noEmit -p tsconfig.json
- npm run typecheck:core (tambahan, bukan pengganti full check)
- Strict TypeScript untuk seluruh modul fitur tabel yang baru/diubah; tambah config scoped bila perlu tanpa menyembunyikan error.
- npm test
- npx playwright test tests/table_editor.spec.js --project=chromium --workers=1
- npm run build

Dari web_app:
- python -m pytest backend/tests/test_renderer_table_contract.py -q
- Tes server/save/load/guard yang relevan bila jalurnya diubah.
- git diff --check, ditambah pemeriksaan langsung file baru/untracked yang tidak dicakup diff.

Nama suite boleh disesuaikan saat implementasi, tetapi coverage acceptance tidak boleh hilang.
Jangan membuat test pengganti yang hanya menguji helper duplikat atau keberadaan nama file.
Perbarui test lama yang mengharapkan isi sel; jangan menghapus regression non-tabel.
Jalankan server test pada loopback dengan auth/storage disposable dan physical printing disabled.
Catat perintah, exit code, ringkasan, artifact path, dan keterbatasan aktual di RESULT.md.

## UAT pengguna setelah gates lulus

1. Dari desain kosong pilih 5 kolom × 4 baris dan drag kerangka 100 × 40 mm.
2. Geser garis pertama 5 mm; pastikan ukuran luar tetap 100 × 40 mm.
3. Masuk Edit kerangka; drag rentang 2 × 2, klik Gabungkan sel; garis interior menghilang.
4. Pilih sel gabungan; klik Pisahkan sel; garis kembali.
5. Set bingkai luar 0.5 mm hitam solid dan internal 0.25 mm dashed; pilih satu segmen dan ubah dotted.
6. Resize sudut dan sisi; pastikan proporsi yang diharapkan, stroke tidak berubah.
7. Tambah/hapus baris di sekitar merge; coba samakan kolom; Undo/Redo setiap langkah.
8. Tambahkan teks dan barcode sebagai objek mandiri di atas kerangka; edit tabel tidak mengubah konten objek tersebut.
9. Download SVG, impor kembali, simpan/muat template baru dari server, refresh untuk recovery draft.
10. Bandingkan preview/render lokal dengan canvas; tidak ada teks otomatis atau placeholder dalam objek tabel.

UAT ini checklist rencana, bukan bukti sudah dijalankan. Bug baru yang ditemukan berarti acceptance terkait dibuka kembali.
