# F3.31 — Perombakan tabel menjadi kerangka garis dengan merge

Status: IMPLEMENTED — automated acceptance gates complete and ready for local review; manual UAT pending.
Tanggal penyusunan: 2026-09-26.
Otorisasi saat penyusunan dahulu hanya dokumen; pengguna sekarang meminta perubahan konfigurasi model dan memulai implementasi.
Dokumen ini mengikat behavior F3.31; prioritasnya di atas rancangan tabel berisi teks pada F3.25–F3.30 bila bertentangan.

## 1. Tujuan dan keputusan pengguna

Membuat tabel sebagai satu objek kerangka garis di canvas label, dengan interaksi familiar seperti pembuatan tabel Word/Google Docs yang disesuaikan untuk canvas bebas.

Keputusan eksplisit pengguna:
- Tidak membutuhkan isi sel, font, placeholder, formula, ataupun editor teks dalam tabel.
- Merge tetap wajib; split/unmerge harus tersedia untuk membatalkannya.
- Grid selector visual, drag untuk menentukan ukuran, global resizing, penggeseran garis internal, dan styling garis menjadi inti fitur.
- Kompatibilitas isi tabel lama tidak diperlukan; pengguna akan membuat ulang template.
- Implementasi diotorisasi setelah penyusunan task, dengan larangan memakai Astra.

Tidak diperlukan migrasi tabel v1. Ini bukan izin menghapus template di server, MinIO, file pengguna, ataupun seluruh draft browser. Objek teks/barcode/QR mandiri tetap merupakan fitur aplikasi tersendiri.

## 2. Baseline yang ditemukan

- Repository: web_app; branch saat penyusunan: codex/f3-4-architecture-safety-foundation.
- HEAD lokal: b30e7a6670a4e281362e180f251e5e7250d362ca.
- Working tree memiliki banyak perubahan tracked/untracked dari pekerjaan sebelumnya. HEAD bukan representasi lengkap aplikasi saat ini; inventaris ulang sebelum mengedit.
- Model saat ini version 1 berisi cells dengan text/token/font dan spans. Renderer, inspector, resize, range selection sudah berada di frontend/src/features/table/.
- Import SVG masih menetapkan tableVersion = 1; jalur export/import, draft/history, Layers dan backend render perlu ditinjau bersama.
- typecheck:core saat ini hanya mencakup src/types/selection.ts dan src/store/useHistoryStore.ts. PASS dari perintah itu bukan bukti seluruh fitur tabel sudah diperiksa.
- git fetch origin saat penyusunan BLOCKED: cannot open '.git/FETCH_HEAD': Permission denied. Tidak ada klaim sinkron dengan remote.
- Periksa IMPLEMENTATION_PLAN.md untuk file kandidat dan TEST_MATRIX.md untuk bukti wajib.

## 3. Lingkup wajib

1. Grid selector 10 kolom × 8 baris.
2. Penempatan klik-drag dengan preview dan klik singkat untuk ukuran default.
3. Objek tabel dengan delapan handle ukuran.
4. Resize garis internal dengan ukuran luar tetap.
5. Mode edit kerangka, seleksi rentang, merge persegi panjang, dan split.
6. Styling garis: warna, ketebalan, solid/dashed/dotted, serta hapus garis eksplisit.
7. Tambah/hapus baris/kolom dan samakan ukuran.
8. Undo/redo, duplikasi, Layers, draft recovery, simpan/muat, SVG round-trip, dan render lokal.
9. Penghapusan UI/logic isi sel dari tool tabel baru.
10. Pengujian dan review berdasar behavior, bukan sekadar pemindahan file.

Di luar lingkup: formula, teks sel, token sel, autofit berdasarkan isi, clipboard spreadsheet, nesting tabel, library spreadsheet besar, migrasi data lama, printer fisik, SAP live, deployment, commit/push/PR/merge.

## 4. Kontrak interaksi

Detail angka di bawah adalah default desain task, bukan klaim bahwa pengguna menentukan setiap angka. Writer mempertahankannya agar hasil dapat diuji; perubahan material dicatat reviewer sebelum diimplementasikan.

### 4.1 Membuat tabel

- Klik tool Tabel membuka popover grid 10 × 8; hover menyorot persegi dari kiri atas.
- Hover kolom 5/baris 4 menampilkan "Buat Tabel 5 × 4" dan keterangan "5 kolom, 4 baris".
- Memilih ukuran menutup popover dan mengaktifkan crosshair. Belum ada objek permanen.
- Drag pada area sheet membuat preview transparan; tampilkan lebar × tinggi dalam mm.
- Mendukung keempat arah drag; origin akhir dinormalisasi ke kiri atas.
- Lepas pointer meng-commit satu objek dan satu history entry, lalu kembali ke select tool.
- Klik dengan gerak kurang dari 4 CSS px membuat ukuran default 60 × 24 mm di titik klik, disesuaikan agar muat pada sheet.
- Ukuran minimum keseluruhan = jumlah kolom × 1 mm dan jumlah baris × 1 mm.
- Jika sheet/ruang tidak cukup, tampilkan pesan yang jelas dan jangan membuat objek invalid.
- Esc, pointercancel, atau pergantian tool membatalkan preview tanpa history entry.
- Titik mulai di luar sheet tidak membuat tabel. Selama drag, preview dibatasi sheet; jangan mengubah zoom/pan.
- Keyboard: panah memilih jumlah di grid, Enter mengonfirmasi; sediakan "Letakkan di tengah" dengan ukuran default agar pembuatan tidak hanya bergantung pada mouse.

### 4.2 Mode objek dan mode edit kerangka

Mode objek:
- Klik badan/garis tabel memilih satu objek; drag badan tabel memindahkan seluruh tabel.
- Delapan handle untuk global resizing; tidak ada editor teks atau caret.
- Double-click tabel atau tombol berlabel "Edit kerangka" masuk mode edit.
- Objek lain tetap dipilih dengan aturan z-order biasa; tidak ada pencurian klik dari teks/barcode yang berada di atas tabel.

Mode edit kerangka:
- Delapan handle objek disembunyikan sementara; tampilkan indikator mode dan kontrol pindah tabel yang jelas.
- Klik area sel kosong memilih satu sel logis; drag dari area sel memilih rentang persegi panjang.
- Shift+klik memperluas rentang dari anchor. Ctrl+klik tidak membuat seleksi sel terpencar.
- Drag dari garis internal yang terlihat menggeser garis, bukan memilih rentang atau memindahkan objek.
- Handle pindah memindahkan seluruh objek. Drag isi sel dalam mode ini hanya untuk seleksi.
- Klik di luar tabel kembali ke mode objek/seleksi objek lain. Esc membatalkan gesture aktif terlebih dahulu; Esc berikutnya keluar mode edit.
- Saat gesture dibatalkan/unmount, pulihkan movement lock dan lepas semua listener/pointer capture.
- Hover garis menampilkan highlight dan cursor col-resize/row-resize; area hit sekitar 6 CSS px, stabil terhadap zoom.

### 4.3 Global resizing dan garis internal

- Sudut mempertahankan rasio lebar:tinggi total; handle sisi mengubah satu sumbu.
- Proporsi setiap kolom/baris dipertahankan saat ukuran total berubah.
- Lebar/tinggi model dinormalisasi dalam mm ketika commit; jangan menumpuk scale Fabric yang berbeda dari metadata model.
- Ketebalan garis tidak ikut membesar karena resize.
- Ukuran minimum kolom/baris 1 mm; clamp sebelum ada overlap/ukuran nol.
- Dalam mode edit, batas internal mengubah tepat dua kolom/baris bersebelahan:
  contoh 30 + 20 mm menjadi 35 + 15 mm; total tetap 50 mm.
- Semua sel lain mempertahankan ukurannya. Batas luar hanya diubah melalui global resizing.
- Saat merged cells membuat garis terputus, drag segmen yang terlihat memindahkan track kolom/baris tersebut pada seluruh tabel. Segmen tersembunyi tidak boleh memiliki hit target.
- Preview perubahan terlihat selama drag; commit hanya saat selesai.
- Integrasikan snap existing bila aktif. Clamp/minimum/ukuran luar tetap memiliki prioritas lebih tinggi daripada snap.
- Untuk tabel yang dirotasi, koordinat pointer harus melalui inverse transform. Jangan menampilkan handle pada posisi salah; uji rotasi dan zoom.

### 4.4 Merge dan split

- Merge wajib tersedia sebagai perintah berlabel "Gabungkan sel" pada menu/toolbar kontekstual mode edit.
- Merge hanya untuk rentang persegi panjang, setidaknya dua sel logis. Tidak memerlukan teks.
- Hasil merge menghilangkan segmen garis di interior wilayah terpilih, mempertahankan perimeter serta posisi dan ukuran luar tabel.
- Klik di mana pun dalam sel gabungan memilih seluruh wilayahnya.
- Jika drag/Shift+klik memotong sel gabungan, perluas seleksi ke seluruh merged region. Ulangi perluasan hingga tidak ada region yang terpotong; highlight menunjukkan rentang final sebelum commit.
- Merge tidak menciptakan overlapping region, bentuk L, atau partisi yang bolong.
- "Pisahkan sel" pada satu atau beberapa merged region terpilih mengembalikan unit sel dasar. Bila tidak ada merged region, perintah disabled dengan keterangan.
- Split mengembalikan garis interior dan style yang tersimpan sebelum merge; style border yang sengaja dihapus tetap none.
- Merge bukan penghapusan track dasar; pembagian kolom/baris tetap tersimpan.
- Undo merge/split satu kali mengembalikan geometri, style, dan topologi persis.
- Pilihan baris/kolom biasa tidak memerlukan tindakan dari panel "Select cell" seperti implementasi lama.

### 4.5 Styling garis dan struktur

- Default: hitam #000000, solid, 0.25 mm; tidak ada fill sel.
- Sasaran: semua garis, bingkai luar, garis internal, perimeter rentang terpilih, atau satu segmen garis yang dipilih.
- Dalam mode edit: klik garis tanpa drag memilih segmennya untuk styling; gerak melewati threshold drag mengubah ukuran track. Tampilkan highlight sasaran sebelum Apply.
- Solid, dashed, dotted dan none/hapus garis. Warna hex valid; ketebalan finite 0.05–5 mm untuk garis terlihat.
- mm menjadi satuan model utama. UI menyediakan satuan mm dan pixel dokumen yang saling dikonversi melalui pxPerMm; pixel dokumen tidak berubah mengikuti zoom dan bukan dot printer. Tampilkan ekuivalen sesuai DPI bila tersedia.
- Dotted menggunakan ujung bulat dan jarak yang konsisten; dashed/dotted menghasilkan SVG yang didukung renderer lokal.
- Satu batas bersama hanya memiliki satu style dan dirender sekali. Untuk sasaran yang berpotongan, aksi terakhir pada segmen yang sama menang.
- Styling selama merge hanya mengubah segmen terlihat; interior yang tersembunyi tetap disimpan untuk split.
- Teks/barcode/QR mandiri di atas tabel tidak berubah karena aksi style/merge/resize.
- Tambah baris/kolom sebelum/sesudah sel aktif; hapus track terpilih; batas 1–20 per sumbu. Tidak boleh menghapus track terakhir.
- Ukuran luar tetap: ketika menambah track, sisipkan bobot ukuran rata-rata lalu normalisasi semua ukuran ke total lama. Ketika menghapus track, normalisasi ukuran yang tersisa secara proporsional.
- Bila normalisasi melanggar minimum 1 mm, tolak aksi dengan alasan; jangan merusak model.
- Insert di dalam merged region memperpanjang span; insert tepat di luar perimeter tidak memperpanjangnya. Delete mengecilkan span; region dengan area nol dihapus. Remap indeks secara deterministik.
- Garis baru memakai default style. Garis bertahan membawa style lama; bila penghapusan menyatukan dua batas, pilih style batas atas/kiri. Catat aturan ini pada test.
- "Samakan lebar kolom"/"Samakan tinggi baris" membagi total secara merata dan mempertahankan merge/style.

### 4.6 Riwayat, Layers, simpan dan ekspor

- Satu tabel = satu objek dan satu item Layers. Boleh duplikasi, hapus, reorder, serta lock melalui fasilitas existing.
- Satu gesture/command = satu history entry. Jangan merekam state antara remove/insert saat rebuild Fabric.
- Cancel/no-op tidak menambah history. Undo/redo tidak memasang listener ganda.
- Tabel baru tidak menghasilkan R1C1, text, token, placeholder, atau binding. Panel tidak memuat pengaturan isi sel/font.
- SVG template memuat geometri vektor dan metadata versi baru; metadata memungkinkan editing kembali.
- SVG hasil render/preview lokal menunjukkan garis dan merge yang sama; tidak mengandung editor handles/seleksi.
- Save/load server, export/import lokal, serta draft refresh mengembalikan model baru, merge, ukuran dan style.
- Elemen mandiri di luar tabel tetap tersimpan; jangan menyatukan dua tabel menjadi satu group saat import.
- Format metadata invalid/oversize ditolak dengan pesan terkontrol; jangan membuat objek setengah valid.
- Model v1 tidak dimigrasi ke v2 dan tidak dijamin editable. SVG lama boleh dimuat sebagai geometri statis bila jalur existing aman, atau ditolak dengan pesan versi tidak didukung. Jangan diam-diam mengubahnya ke v2. Draft lama invalid tidak boleh menyebabkan crash atau menghapus seluruh penyimpanan template.

## 5. Arsitektur dan model v2

Gunakan feature boundary F3.30; jangan mengembalikan semua logika ke useFabricCanvas.ts.

Model murni yang disarankan, wajib ditetapkan schema konkretnya pada T01:
- version: 2; columnWidthsMm[]; rowHeightsMm[].
- regions[]: partisi persegi panjang dengan rowStart/colStart/rowSpan/colSpan. Sel tunggal adalah region 1 × 1.
- horizontalEdges: (rows + 1) × cols; verticalEdges: rows × (cols + 1).
- Setiap edge menyimpan color, widthMm, style. Tidak ada text/token/font/formula.
- Visibility edge merupakan hasil topologi region; edge interior merged disimpan tetapi tidak dirender.
- Pose/ID objek berada pada metadata object/editor; geometri lokal dalam mm.
- Validasi jumlah, panjang matriks, indeks, overlap, coverage seluruh grid, nilai finite, ukuran minimum, warna/style, versi dan batas payload.

Model tidak mengimpor React, Fabric, DOM atau API. Renderer tidak memutasi model.
Controller menyelesaikan command model lalu satu commit history. Preview transient tidak menjadi state tersimpan.
React menangani grid picker, inspector, dan menu berlabel; adapter canvas menangani pointer, koordinat, overlay dan cleanup.
Bukan target meniru seluruh fitur Word/Docs; acceptance pada dokumen ini adalah sumber kebenaran.

## 6. Definition of Done

- Semua acceptance wajib pada TEST_MATRIX.md lulus atau task tetap belum selesai.
- Semua T01–T07 pada IMPLEMENTATION_PLAN.md memiliki diff yang direview dan bukti aktual.
- Full TypeScript dan strict checking modul tabel, unit test, build, browser regression, SVG/draft/server save round-trip serta render lokal lulus.
- Test isi tabel lama diganti karena requirement berubah; test fitur mandiri non-tabel dipertahankan.
- Tidak ada dead code, duplicate lifecycle, wrapper kosong, unchecked any baru, atau renderer reference tanpa import.
- RESULT.md berisi perintah dan hasil; REVIEW.md berisi temuan, koreksi dan batas verifikasi.
- Tidak mengklaim zero bug atau produksi siap hanya karena local gates lulus.

## 7. Cara memulai

Baca TASK_CONTRACT.md, IMPLEMENTATION_PLAN.md, TEST_MATRIX.md dan AGENTS.md.
Konfigurasi rencana awal: Sol 6 medium reviewer/pengarah teknis; Luna 5.6 medium writer utama, Luna 5.6 low hanya subtask UI rutin yang terikat. Saat implementasi, Luna 5.6 terkena usage limit; perubahan provider dilaporkan dan writer tunggal berlanjut memakai gpt-6-luna medium. Status konfigurasi aktual dicatat di RESULT.md. Astra dilarang. Sol 6 high hanya reviewer read-only bila diperlukan. Pengguna mengotorisasi T01–T07.
Jangan membuat task aplikasi Codex baru, commit, push, atau deployment hanya karena dokumen ini ada.
