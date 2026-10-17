# Tinjauan dokumentasi: 17 Oktober 2026

Tanggal tinjauan: **17 Oktober 2026 (Asia/Jakarta)**. Cakupan: dokumentasi berdasarkan
source working tree aktif Thermal-Label-Studio. Root Git aplikasi diverifikasi
terpisah dari repositori induk workspace sebelum pengeditan.

Indeks, panduan utama, referensi source, dan laporan ini menggunakan Bahasa
Indonesia sesuai permintaan pengguna. Nama API, path, perintah, konfigurasi,
key JSON/SAP, dan kode status teknis dipertahankan persis. Kontrak terdahulu tetap
tersedia dalam bahasa aslinya.

## Hasil pekerjaan

| Artefak | Kegunaan |
| --- | --- |
| [Indeks dokumentasi](README.md) | Titik masuk pembaca, tanggung jawab kontrak, perangkat pendamping, dan hierarki bukti |
| [Panduan utama proyek](PROJECT_HANDBOOK.md) | Cakupan produk, arsitektur, alur operator, data, penyimpanan, integrasi, pengembangan, validasi, dan penanganan masalah |
| [Referensi source](SOURCE_REFERENCE.md) | Inventaris statis deklarasi route, direktori modul, dan nama konfigurasi TLS literal |
| Navigasi README aplikasi | Tautan ke kumpulan dokumentasi baru dan tinjauan ini |
| Ringkasan Architecture / Product flow / pengantar Binding | Koreksi penjelasan perilaku terkini yang tertinggal tanpa menulis ulang laporan historis |

## Metode tinjauan dan cakupan source

Membaca aturan workspace/aplikasi, README aplikasi, kontrak aktif, dan tabel
penerimaan pipeline. Mencocokkan titik masuk dengan `backend/app/main.py`,
`runtime.py`, `frontend/src/app/routes.tsx`, komposisi Management, serta handler
HTTP fitur. Memeriksa konfigurasi, model/validasi kanonis, DDL layout/dataset,
berkas skema, artefak pratinjau, akses RFC/runtime, manifest frontend/Vite, dan
definisi Compose standar. README agen mandiri dan pengirim saudara digunakan
untuk menjelaskan tanggung jawabnya yang terpisah.

Inventaris route memakai Python AST tanpa mengimpor aplikasi. Terdapat 44
deklarasi, terdiri atas 42 route `/api/v1` default serta `/health` dan `/ready`.
Dua deklarasi perubahan layout merupakan handler pensiun yang mengembalikan
HTTP 410. Shell/aset runtime dan route otomatis framework dijelaskan terpisah.
Inventaris memuat 37 direktori modul langsung pada backend/fitur frontend serta
28 nama `TLS_*` literal dari source aplikasi/perangkat pendukung. Nama yang muncul
dapat berupa prefix, referensi, atau konstanta validasi; daftar ini bukan salinan
konfigurasi layanan aktif.

Perubahan source dan dokumentasi yang telah ada dipertahankan. Dokumentasi baru
menjelaskan working tree lokal tersebut; hash commit saja tidak cukup untuk
mengidentifikasi snapshot ini. Tidak dilakukan pembuatan branch, staging, commit,
push, PR, merge, atau publikasi.

## Koreksi dan batas yang dipertahankan

- Architecture dan Product flow kini menjelaskan pengambilan SAP terkonfigurasi,
  pratinjau Test Data tersimpan, dan pengiriman LAN eksplisit oleh server,
  menggantikan ringkasan lama yang hanya menjelaskan navigasi/fitur rencana.
- Pengantar kontrak binding kini menjelaskan integrasi binder bersama yang sudah
  digunakan editor, Label Print, dan intake. Detail tahap implementasi historis
  serta batas bukti generator/raster/perangkat tetap diberi konteks.
- Studio Print, Label Print, dan intake eksternal mempunyai makna tujuan/identitas
  berbeda. Hanya intake yang memiliki ledger permanen replay pengirim/permintaan
  eksternal.
- Akses sumber ke semua template dan tujuan logis opsional per transaksi mengikuti
  keputusan eksplisit yang lebih baru; persetujuan per kode sebelumnya tetap historis.
- Source Vite saat ini memakai `0.0.0.0`; backend dan port yang dipublikasikan
  Compose mempunyai definisi loopback masing-masing. Binding jaringan tidak
  membuktikan otorisasi jarak jauh, dukungan XP, atau kesiapan produksi.
- Demo, pengujian sintetis, SAP native, penyimpanan langsung, dan hasil printer
  fisik tetap dibedakan. Output berstatus submitted belum mengonfirmasi hasil fisik.

## Cakupan verifikasi

| Pemeriksaan | Hasil / makna |
| --- | --- |
| Root Git aplikasi aktif | PASS: repositori source diverifikasi sebelum pengeditan dokumentasi |
| Tautan lokal / anchor dokumentasi baru | PASS: diperiksa terhadap berkas lokal dan heading Markdown, termasuk setelah penerjemahan |
| Struktur Markdown dokumentasi baru | PASS: pagar blok kode seimbang dan jumlah kolom tabel konsisten |
| Inventaris deklarasi route | PASS: dibandingkan dengan handler fitur terpasang yang dibaca secara statis; tanpa impor aplikasi |
| Perubahan berkas yang sudah ada | PASS: perubahan ringkasan/navigasi terbatas; laporan hasil/historis bertanggal dipertahankan |
| Regresi aplikasi / TypeScript / build frontend | NOT RUN: perubahan dokumentasi saja |
| UI browser / integrasi | NOT RUN |
| PostgreSQL / MinIO langsung | NOT RUN |
| Build container / runtime paket | NOT RUN |
| SonarQube / coverage terkini | NOT RUN |
| SAP RFC / aktivasi ABAP | NOT RUN |
| Status printer / pencetakan fisik | NOT RUN |

Pemeriksaan dokumentasi tidak menaikkan status penerimaan implementasi. Tabel
pipeline yang tercatat tetap T06 `BLOCKED`, T07/T10/T11 `NEEDS_REPLAN`, dan T12
opsional `BLOCKED`; lihat [STATUS](implementation/universal-label-pipeline/STATUS.md).
Tanggal tabel dan checkpoint terdahulu tetap merupakan bukti historis, bukan
pelaksanaan baru. Tinjauan ini tidak mengotorisasi perubahan storage/skema,
startup/restart layanan, akses SAP, eksekusi pengirim, atau efek ke printer.

## Disiplin pemeliharaan dokumentasi

Kontrak yang sudah ada memuat checkpoint implementasi bertanggal. Baca keputusan
pengganti yang lebih baru dan source terkini sebelum memakai ulang persyaratan
lama. Tinjauan ini memperbaiki kontradiksi ringkasan terkini yang ditemukan;
isinya tidak menyatakan sertifikasi setiap baris laporan historis atau berkas arsip.

Untuk perubahan berikutnya, perbarui kontrak terkait dan bagian panduan utama,
perbarui inventaris source jika relevan, lalu catat cakupan verifikasi bertanggal
baru. Simpan laporan yang dihasilkan dalam subdirektori `.tmp/` unik yang dapat
dibuang. Berkas environment privat, kredensial, dan bukti operasional tidak boleh
di-commit.
