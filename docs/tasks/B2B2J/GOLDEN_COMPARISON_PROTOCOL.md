# Golden Comparison Protocol: Legacy Output vs Safe Demo PDF (B2B2J)

Protokol verifikasi komparatif antara hasil cetak program legacy (`ZMMR_LABELROL` / Smartforms / DOS DAX) dengan berkas **Safe Demo PDF Evidence** yang dihasilkan oleh Thermal Label Studio.

---

## 1. Tujuan & Batasan Runtime Saat Ini

Sebelum sebuah *Label Family* diotorisasi untuk beralih dari sistem lama ke Thermal Label Studio, tim PPIC dan QA wajib melakukan perbandingan "Golden Sample" menggunakan protokol terstandarisasi ini.

> [!IMPORTANT]
> **Status Runtime Saat Ini (NOT RUN / Future Implementation)**:
> Komponen *Raw Input Adapter* dan *Label Rule Engine* yang bertugas menerima skema `1.0-raw` dan mengompilasinya menjadi parameter render belum diimplementasikan pada fase perencanaan B2B2J ini.
> Endpoint B2B2I saat ini tetap beroperasi pada kontrak canonical rendering `1.1`. Runtime B2B2I **TIDAK DIUBAH** pada fase ini. Langkah runtime pada protokol di bawah ini merupakan panduan prosedur untuk fase implementasi mendatang.

Prinsip Utama:
1. **Verifikasi Visual dan Data (Dua Sisi)**: Memeriksa kesesuaian data teks faktual sekaligus ketepatan render fisik visual (barcode, QR code, posisi layout).
2. **Tanpa Risiko Fisik**: Perbandingan dilakukan 100% secara digital pada berkas PDF bukti ber-watermark simulasi sebelum menyentuh printer fisik.
3. **Pintu Persetujuan Manusia (*Human PPIC Gate*)**: Sistem tidak dapat mengklaim sebuah template "siap produksi" tanpa tanda tangan persetujuan tertulis dari penanggung jawab PPIC.

---

## 2. Parameter Komparasi Golden Sample

| Dimensi Komparasi | Aspek yang Diuji | Kriteria Kelulusan (*Pass Criteria*) | Toleransi |
|---|---|---|---|
| **1. Bidang Teks & Label** | Kelengkapan field teks (Material Desc, Batch, Roll, Tanggal, dll.) | Seluruh field wajib tampil dan cocok 100% dengan data legacy. | Toleransi 0% (Exact Match) |
| **2. Satuan & Konversi** | Konversi metrik ke imperial (mm→in, m→ft, kg→lbs) | Angka hasil konversi sesuai dengan formula yang disepakati, pembulatan 2 desimal konsisten. | ±0.01 pembulatan desimal |
| **3. Barcode 1D (Code128)** | Keterbacaan dan string payload yang di-encode | Payload teks barcode sama persis dengan barcode legacy; rasio modul bar memenuhi standar ISO/IEC 15417. | 100% string match |
| **4. QR Code 2D** | Keterbacaan matriks QR dan delimiter string | Seluruh elemen data QR dapat di-scan dan terbaca dengan urutan tag/delimiter yang tepat. | 100% string match |
| **5. Dimensi Media Fisik** | Ukuran halaman label dalam satuan titik/point | Ukuran halaman PDF sama persis dengan ukuran fisik roll: `200 mm` (566.93 pt) x `80 mm` (226.77 pt) pada 72 pt/inch. | 0 point deviasi (No auto-scaling) |
| **6. Urutan Item (*Sequence*)**| Urutan label dalam satu batch roll | Halaman 1 = Cover Manifest, Halaman 2..N+1 berurutan strictly `item_sequence ASC`. | Tidak boleh ada halaman tertukar |
| **7. Watermark Bukti** | Keberadaan watermark simulasi | Terdapat watermark "SIMULASI — BUKAN UNTUK CETAK FISIK" diagonal semi-transparan pada setiap halaman label. | Wajib ada di Safe Demo |

---

## 3. Tahapan Protokol Pengujian Golden Sample

```text
[Langkah 1: Siapkan Snapshot Data Mentah]
  - Ekstrak fakta batch uji (MCH1, karakteristik) menjadi fixture JSON redacted (1.0-raw)
  - Simpan salinan dokumen cetak legacy (scan fisik / spool PDF Smartforms lama)
        │
        ▼
[Langkah 2: Eksekusi Transformasi & Rendering Safe Demo (NOT RUN pada B2B2J)]
  - Raw Input Adapter mengompilasi fakta mentah dengan Rule Profile terpilih
  - Render multi-halaman PDF evidence pada Thermal Label Studio
  - Unduh file PDF bukti hasil simulasi
        │
        ▼
[Langkah 3: Komparasi Otomatis (Data Payload & Structural)]
  - Ekstraksi teks PDF menggunakan parser digital (pypdf)
  - Dekode barcode dan QR menggunakan barcode scanner / pustaka ZXing
  - Verifikasi kesamaan string teks terhadap dokumen referensi legacy
        │
        ▼
[Langkah 4: Komparasi Visual oleh Manusia (PPIC / QA)]
  - Inspeksi visual layout: perataan teks, margin media, logo vektor, kontras barcode
  - Pemeriksaan kesesuaian visual dengan label roll eksisting di lapangan
        │
        ▼
[Langkah 5: Pintu Persetujuan PPIC (Human Sign-off Gate)]
  - Pengisian Formulir Berita Acara Golden Comparison
  - Keputusan: APPROVED (Lanjut ke shadow pilot) atau REJECTED (Revisi aturan)
```

---

## 4. Formulir Persetujuan PPIC (PPIC Sign-Off Gate Checklist)

Formulir ini wajib diisi sebelum status suatu *Label Family* dinaikkan ke fase berikutnya:

```text
================================================================================
BERITA ACARA VERIFIKASI GOLDEN SAMPLE LABEL SIMULATION
================================================================================
Nomor Batch Simulasi : __________________________________________________
Label Family / Kode  : __________________________________________________ (Kandidat Rekomendasi)
Rule Profile Version : __________________________________________________
Template SVG Version : __________________________________________________
Tanggal Evaluasi     : __________________________________________________

Item Pemeriksaan:
[ ] 1. Nomor Batch dan Nomor Roll terbaca jelas dan cocok dengan SAP.
[ ] 2. Nilai konversi (Width mm/inch, Length m/ft, Weight kg/lbs) akurat.
[ ] 3. Barcode 1D Code128 terbaca oleh scanner genggam di lantai produksi.
[ ] 4. QR Code 2D (bila ada) terbaca dan susunan datanya valid.
[ ] 5. Dimensi fisik label (80x200 mm) presisi tanpa pemotongan / auto-scaling.
[ ] 6. Urutan label dalam batch evidence sesuai dengan urutan pengerjaan bisnis.
[ ] 7. Watermark simulasi tampil jelas dan tidak menutupi barcode inti.

Keputusan Tim Evaluasi:
( ) DISETUJUI — Label family ini siap masuk ke fase shadow comparison berikutnya.
( ) DITOLAK — Diperlukan penyesuaian aturan atau layout template SVG.

Catatan / Temuan Khusus:
________________________________________________________________________________
________________________________________________________________________________

Tanda Tangan Penanggung Jawab:

  PPIC Lead / Supervisor               Staff IT / Developer

  ( _______________________ )          ( _______________________ )
  Tanggal:                             Tanggal:
================================================================================
```
