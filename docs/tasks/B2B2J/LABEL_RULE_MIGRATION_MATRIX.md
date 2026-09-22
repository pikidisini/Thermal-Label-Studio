# Label Rule Migration Matrix & Application Profile Model (B2B2J)

Dokumen ini memetakan seluruh aturan bisnis, kalkulasi nilai turunan, dan ketergantungan kustomisasi dari program SAP legacy `ZMMR_LABELROL` ke model aturan *Label Rule Profile* pada Thermal Label Studio.

---

## 1. Taksonomi Klasifikasi Aturan & Field

Setiap field dan aturan bisnis diklasifikasikan ke dalam 7 kategori status migrasi:

| Kategori | Definisi | Lokasi Tanggung Jawab |
|---|---|---|
| **`SOURCE_FACT`** | Fakta bisnis mentah murni dari SAP (tidak dimanipulasi). | SAP ERP (Snapshot Payload) |
| **`SAP_RESOLVED_TRANSITIONAL`**| Nilai yang masih diselesaikan oleh SAP pada masa transisi (misal tabel override). | SAP ERP (Transitional Resolution) |
| **`SAP_DERIVED_LEGACY`** | Nilai turunan yang pada sistem legacy dihitung di ABAP. | Dihentikan di SAP pada target |
| **`APPLICATION_DERIVED_TARGET`**| Nilai turunan yang menjadi tanggung jawab Thermal Label Studio. | Rule Engine Thermal Label Studio |
| **`CUSTOMIZING_DEPENDENCY`** | Ketergantungan pada tabel kustomisasi SAP (`ZMAP_LABEL`, `ZLABEL`, dll.). | Dievaluasi / dipetakan bertahap |
| **`UNSUPPORTED`** | Fitur legacy usang yang ditinggalkan (DOS/DAX/BAT, printer Zebra emulasi lokal). | Deprecated / Dihapus |
| **`OPEN_QUESTION`** | Hal yang belum terbukti, membutuhkan keputusan bisnis, atau belum diputuskan sumbernya. | Menunggu persetujuan PPIC/Basis |

---

## 2. Matriks Migrasi Aturan Lengkap (`ZMMR_LABELROL`)

| # | Field / Aturan Bisnis | Sumber Legacy di SAP | Logika / Transformasi Legacy | Klasifikasi Migrasi | Target Penanganan di Thermal Label Studio |
|---|---|---|---|---|---|
| 1 | `CHARG` | `MCH1-CHARG` | Nomor batch SAP | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.batch_number`. |
| 2 | `MATNR` | `MCH1-MATNR` | Nomor material Finish Goods | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.material_number`. |
| 3 | `MAKTX` / Material Desc | `MAKT-MAKTX` | Deskripsi material master | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.material_description` sebagai kandidat fakta master material. Deskripsi label kustom (bila ada) dipisahkan sebagai `CUSTOMIZING_DEPENDENCY` atau `OPEN_QUESTION`. `ZZLABEL` tetap sebagai business label selector. |
| 4 | `ZZLABEL` | Karakteristik batch | Kode label penentu format (misal `REDACTED_STANDARD_LABEL_CODE` sebagai asumsi placeholder; kode produksi aktual menunggu persetujuan PPIC) | **`SOURCE_FACT`** | Sebagai selektor bisnis `label_code`. Menentukan Rule Profile & Template (status kandidat belum disetujui). |
| 5 | `ZZNOMORROLL` | Karakteristik batch | Nomor roll fisik produk | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.roll_number`. |
| 6 | `ZZCODE` | Karakteristik batch | Kode tipe film (misal `PET`, `BOPP`) | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.film_type_code`. |
| 7 | `ZZTHICKNESS` (micron) | Karakteristik batch | Ketebalan nominal dalam micron | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.measurements.thickness_micron` (numerik mentah). |
| 8 | `ZZWIDTH` (mm) | Karakteristik batch | Lebar nominal dalam mm | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.measurements.width_mm` (numerik mentah). |
| 9 | `ZZLENGTH` (m) | Karakteristik batch | Panjang roll dalam meter | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.measurements.length_meters` (numerik mentah). |
| 10| `ZZCONVERSIONROLLKG` (kg) | Karakteristik batch | Berat bersih roll dalam KG | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.measurements.net_weight_kg` (numerik mentah). |
| 11| `ZZCORE` (inch) | Karakteristik batch | Diameter core dalam inch | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.measurements.core_diameter_inch` (numerik mentah). |
| 12| `ZZINSIDE` / `ZZOUTSIDE` | Karakteristik batch | Jenis perlakuan corona/flame | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.surface_treatment`. |
| 13| `ZZSPLICE-1/2` | Karakteristik batch | Titik sambungan dalam meter | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.splices`. |
| 14| `VPOSTDATE` (Tgl Produksi)| Function `Z_GET_PRODUCTION_DATE` | Baca record `MSEG` 101/102, eliminasi reversal (`SMBLN`), ambil `BUDAT_MKPF`. Fallback `MCH1-ERSDA`. Output bertipe ABAP `SY-DATUM` (bukan dari tanggal sistem). | **`SAP_RESOLVED_TRANSITIONAL`** | SAP menyelesaikan tanggal produksi via `Z_GET_PRODUCTION_DATE` pada masa transisi. Aturan pemilihan record `MSEG` target masih **`OPEN_QUESTION`** karena legacy mengambil record pertama tanpa `ORDER BY`. Tidak boleh disebut fakta mentah murni sampai aturan target disetujui. |
| 15| `VEXPDATE` (Tgl Expiry)   | `VPOSTDATE` + `ZZEXPIREDLIVE` | Formula caller program legacy ABAP: `V_EXPDATE = V_POSTDATE + ITAB-VLIVE` (dari characteristic `ZZEXPIREDLIVE` via `QC01_BATCH_VALUES_READ`). Tidak ada bukti perkalian 30 atau lookup shelf life. | **`SAP_DERIVED_LEGACY` (Legacy) / `APPLICATION_DERIVED_TARGET` (Target)** | Di legacy dihitung pada caller program ABAP (`ZMMR_LABEL_JSON`). Pada arsitektur target, Thermal Label Studio menghitung expiry date secara deterministik melalui rule profile yang versioned setelah PPIC menyetujui definisi bisnis dan satuan `ZZEXPIREDLIVE`. |
| 16| `MSKA-VBELN/POSNR` | `MSKA` | Relasi Sales Order dan Item | **`SOURCE_FACT`** | Masuk ke `raw_business_facts.sales_order_ref`. |
| 17| `sap_user` | `SY-UNAME` | User ID eksekutor transaksi SAP | **`SOURCE_FACT` (Restricted Audit)** | Hanya disimpan sebagai audit metadata terbatas. DILARANG ditampilkan di label atau UI operator. |
| 18| `ZALIAS` (Dimensi Override) | Tabel custom SAP `ZALIAS` | Override dimensi roll bila ada karakteristik `ZZALIAS` | **`SAP_RESOLVED_TRANSITIONAL`** | Pada masa transisi, SAP menyelesaikan resolusi alias sebelum mengirim snapshot. Keputusan memindahkan rule alias ke aplikasi merupakan pekerjaan lanjutan yang belum disetujui. |
| 19| Konversi Width mm → inch | ABAP: `mm * 0.03937` | Rumus konversi desimal | **`APPLICATION_DERIVED_TARGET`** | Dihitung oleh rule engine aplikasi. |
| 20| Konversi Length m → feet | ABAP: `m * 3.28` | Rumus konversi desimal | **`APPLICATION_DERIVED_TARGET`** | Dihitung oleh rule engine aplikasi. |
| 21| Konversi Weight kg → lbs | ABAP: `kg * 2.2046` | Rumus konversi desimal | **`APPLICATION_DERIVED_TARGET`** | Dihitung oleh rule engine aplikasi. |
| 22| Konversi Thickness → gauge| ABAP: `micron * 4` | Rumus konversi gauge | **`APPLICATION_DERIVED_TARGET`** | Dihitung oleh rule engine aplikasi. |
| 23| Barcode-1 (Batch) | ABAP `CONCATENATE` | Code128 dari nomor batch | **`APPLICATION_DERIVED_TARGET`** | Rule engine merakit payload barcode batch. |
| 24| Barcode-2 (Roll) | ABAP `CONCATENATE` | Code128 dari nomor roll | **`APPLICATION_DERIVED_TARGET`** | Rule engine merakit payload barcode roll. |
| 25| QR Code 2D | ABAP `CONCATENATE` string | String terstruktur roll | **`APPLICATION_DERIVED_TARGET`** | Rule engine menyusun string terstruktur untuk generator QR vektor. |
| 26| Gross Weight Calculation | ABAP: Core WT + Roll WT | Penjumlahan bobot roll dan bobot core | **`OPEN_QUESTION` / `APPLICATION_DERIVED_TARGET`** | Sumber data bobot core (`V_WCORE` dari SO text 'WC' atau master core) belum distandarisasi. Dilarang menggunakan fallback angka buatan (seperti `+0.40`). |
| 27| Brand Display Value | Tidak ada di legacy | Asumsi teks brand | **`OPEN_QUESTION` / `ASSUMPTION`** | Tidak ada field `BRAND` pada sumber legacy `ZMMR_LABELROL`. Harus diputuskan oleh PPIC apakah dicetak atau memakai header template statis. |
| 28| Base Film Fact | Karakteristik polimer | Basis polimer film | **`OPEN_QUESTION` / `ASSUMPTION`** | Sumber karakteristik eksplisit `base_film` belum terbukti di legacy (hanya ada `ZZCODE`). |
| 29| Printer Hardware DPI | Konfigurasi printer fisik | Resolusi dot per inch printer | **`OPEN_QUESTION` / `ASSUMPTION`** | Resolusi printer (203, 300, atau 600 DPI) bergantung pada hardware fisik pada line/work center, wajib dikonfigurasi melalui printer profile terdaftar. |
| 30| `ZMAP_LABEL` (Routing) | Tabel custom SAP | Memetakan DOS vs Windows | **`CUSTOMIZING_DEPENDENCY`** | Digantikan oleh Rule Profile Registry di Thermal Label Studio. |
| 31| `ZCORER` (Core RTP Tracking)| Dialog Screen 100 di SAP | Validasi & ikat Core ID | **`CUSTOMIZING_DEPENDENCY`** | Tetap dieksekusi di SAP sebelum transmisi snapshot. |
| 32| Special Touch Attributes | `MILL_SE_GET_CHAR_AND_VALUE`| Atribut spesifik tembakau | **`OPEN_QUESTION`** | Memerlukan analisis mendalam saat migrasi family Sampoerna/PMI. |
| 33| SO Item Text Parsing (Interfilm)| `READ_TEXT` (Object VBBP) | Parsing string L1, L2, W1 | **`OPEN_QUESTION`** | Pola teks bebas SO rentan salah; butuh standarisasi field terstruktur. |
| 34| Aturan Ganjil/Genap Toyobo | `V_TY_ROLLN` digit ke-2 | Logika kalender ganjil-genap | **`OPEN_QUESTION`** | Memerlukan konfirmasi kebutuhan aktual dari PPIC/Toyobo. |
| 35| Download file .DAX/.BAT | `GUI_DOWNLOAD` ke C:\tslabel| Eksekutor cetak DOS | **`UNSUPPORTED`** | **DITINGGALKAN TOTAL**. Digantikan oleh Safe Demo PDF & Dispatcher. |
| 36| Flag Zebra Emulation | `c:\tslabel\zebra.zpl` | Cek file emulasi printer | **`UNSUPPORTED`** | **DITINGGALKAN TOTAL**. Konfigurasi printer diisolasi di dispatcher server. |

---

## 3. Kriteria Pemilihan & Rekomendasi Pilot Label Family

Sesuai aturan eskalasi (*Escalation Rules*), pemilihan akhir label family untuk fase produksi/pilot **WAJIB mendapatkan persetujuan eksplisit dari Pengguna dan PPIC**.

### 3.1 Kriteria Seleksi Kandidat Pilot
1. **Ketersediaan Data Standar**: Fakta bisnis tersedia langsung dari tabel standar SAP (`MCH1`, `MCHB`) dan karakteristik batch umum tanpa parsing teks bebas.
2. **Bebas dari Dependensi Dialog Interaktif**: Tidak memerlukan interaksi layar popup SAP (seperti alur input Core RTP kompleks `ZCORER` Screen 100).
3. **Bebas dari Parsing Teks Bebas Customer**: Tidak bergantung pada teks bebas Sales Order (`TLINE` VBBP ID Z001).
4. **Formula Konversi Baku**: Menggunakan konversi metrik-imperial standar tanpa konstanta khusus per customer.
5. **Rasio Volume Produksi Tinggi**: Merupakan jenis label roll standar dengan frekuensi operasional tinggi.

### 3.2 Evaluasi Kandidat Family

| Label Family | Karakteristik Utama | Risiko Migrasi | Rekomendasi Status |
|---|---|---|---|
| **Standard Roll Label (`REDACTED_STANDARD_LABEL_CODE`)** | Mengikuti alur `PERFORM NEW_TEXT_DATA` standar. Fakta batch murni, konversi standar, barcode 1D standar. | **RENDAH** | **KANDIDAT REKOMENDASI PILOT** *(Unapproved Candidate Mapping)* |
| **Toyobo Family (A002, B00X..)** | Aturan bulan ganjil-genap, lookup posisi passing join 2 di `MSEG` bwart 101, 3 barcode terpisah. | TINGGI | DITUNDA (Tahap Lanjutan) |
| **Interfilm Family (D009, B013..)** | Bergantung pada parsing teks bebas SO (`VBBP Z001`), formula konversi non-standar (`V_C_FEET_INTER_BOPET`). | TINGGI | DITUNDA (Tahap Lanjutan) |
| **Sampoerna / PMI (K100..)** | Memerlukan modul `MILL_SE_GET_CHAR_AND_VALUE` (`ZZSPECIALTOUCH`), format barcode kustom customer. | TINGGI | DITUNDA (Tahap Lanjutan) |
| **PrimaPack (A009)** | Format nomor roll khusus dengan perakitan derivatif posisi. | SEDANG | DITUNDA (Tahap Lanjutan) |

> [!NOTE]
> Analisis `ZMMR_LABELROL` membuktikan keberadaan alur label standar (`PERFORM NEW_TEXT_DATA`), tetapi **TIDAK** membuktikan kode string tertentu (seperti `"STD01"`) atau pemetaannya secara otomatis ke `label_roll_80x200`. Oleh karena itu, kode `"REDACTED_STANDARD_LABEL_CODE"` digunakan sebagai asumsi placeholder dan pemetaan ke `label_roll_80x200` diklasifikasikan sebagai **kandidat pemetaan yang belum disetujui** (*unapproved candidate mapping*). Profil ini **tidak boleh diklaim siap pakai** sampai Pengguna dan PPIC memberikan persetujuan formal terhadap kode `ZZLABEL` aktual dan sampel cetak legacy pembanding.

---

## 4. Definisi Model Profil Aturan Kandidat Pilot: `PROFILE-STD-ROLL-CANDIDATE-V1`

> [!IMPORTANT]
> **Status: KANDIDAT BELUM DISETUJUI (*Unapproved Candidate Mapping*)**
> Model profil berikut adalah rancangan spesifikasi untuk memverifikasi kapasitas komputasi rule engine aplikasi, bukan konfigurasi produksi yang telah disetujui.

### 4.1 Metadata Profil
- **Profile ID**: `PROFILE-STD-ROLL-CANDIDATE-V1`
- **Rule Version**: `1.0.0-draft`
- **Target Template (Candidate)**: `label_roll_80x200` (Dimensi fisik nominal: 200mm x 80mm — pending sign-off PPIC)
- **Target Printer Resolution**: Tergantung konfigurasi profil printer terdaftar (ASSUMPTION: Default profil virtual/pilot disesuaikan pada runtime).

### 4.2 Aturan Komputasi & Derivasi Aplikasi
```yaml
profile_id: "PROFILE-STD-ROLL-CANDIDATE-V1"
version: "1.0.0-draft"
target_template_id: "label_roll_80x200" # Unapproved candidate mapping

conversions:
  width_inch:
    formula: "round(raw.measurements.width_mm * 0.03937, 2)"
    format: "{value} in"
  length_feet:
    formula: "round(raw.measurements.length_meters * 3.28, 2)"
    format: "{value} ft"
  net_weight_lbs:
    formula: "round(raw.measurements.net_weight_kg * 2.2046, 2)"
    format: "{value} lbs"

barcodes:
  batch_barcode_1d:
    symbology: "CODE128"
    payload: "raw.batch_number"
  roll_barcode_1d:
    symbology: "CODE128"
    payload: "raw.roll_number"
  qr_matrix_2d:
    symbology: "QR_CODE"
    payload: "MAT:{raw.material_number};BAT:{raw.batch_number};ROL:{raw.roll_number};NET:{raw.measurements.net_weight_kg}"

expiry_rule:
  target: "expiry_date"
  formula: "production_date + raw.batch_characteristics.expired_live"
  status: "APPLICATION_DERIVED_TARGET (pending PPIC approval of unit and business definition)"

display_mapping:
  type_film: "raw.film_type_text"
  material_desc: "raw.material_description" # Dari MAKT-MAKTX
  batch_text: "raw.batch_number"
  roll_no: "raw.roll_number"
  production_date: "raw.synthetic_production_date" # SAP_RESOLVED_TRANSITIONAL via Z_GET_PRODUCTION_DATE
  used_before: "derived.expiry_date"               # APPLICATION_DERIVED_TARGET (production_date + ZZEXPIREDLIVE)
  # Brand, gross weight, dan base film tidak di-hardcode; tunduk pada resolusi template / master data
```
