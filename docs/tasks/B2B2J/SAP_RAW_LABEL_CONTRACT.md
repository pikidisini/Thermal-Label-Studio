# Raw SAP Label Input Contract — Specification & Boundary (B2B2J)

- Dokumen: Spesifikasi Kontrak Snapshot Data Mentah SAP (Raw SAP Label Input)
- Versi Kontrak: `1.0-raw`
- Status: `PROPOSED — B2B2J REPLAN (Correction Pass 3)`
- Target Audience: Tim ABAP, Basis, Tim PPIC, dan Arsitek Thermal Label Studio

---

## 1. Perubahan Batas Tanggung Jawab (*Responsibility Boundary*)

Berdasarkan analisis proses bisnis pada `ZMMR_LABELROL` (`docs/tasks/B2B2J/Analisa_Pencetakan_Label.md`), arsitektur integrasi target menetapkan pemisahan tanggung jawab yang tegas:

```text
┌─────────────────────────────────────────────────────────────┐
│ SAP ERP / ECC (Source of Truth untuk Fakta Bisnis)          │
│                                                             │
│ - Membaca data master batch (MCHA, MCH1, MCHB)              │
│ - Membaca karakteristik QM/MM (QC01_BATCH_VALUES_READ)      │
│ - Membaca relasi Sales Order & Pelanggan (MSKA, VBAP, VBKD) │
│ - Mengirimkan snapshot data mentah (raw facts) + ZZLABEL    │
│                                                             │
│ DILARANG:                                                   │
│ ✗ Melakukan konversi formatting/display (gauge, feet, lbs)   │
│ ✗ Merakit string barcode/QR majemuk                         │
│ ✗ Memilih file template fisik (.TAX / .SVG)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ HTTP POST (Snapshot Raw Facts)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Thermal Label Studio (Source of Truth untuk Aturan Label)   │
│                                                             │
│ - Menerima snapshot fakta mentah terverifikasi               │
│ - Memetakan ZZLABEL ke Rule Profile & Template terdaftar    │
│ - Menghitung nilai turunan (konversi satuan, rounding)      │
│ - Merakit payload Barcode 1D & QR Code 2D                   │
│ - Menyuntikkan data ke SVG template canonical               │
│ - Merender Safe Demo PDF evidence untuk verifikasi PPIC      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Prinsip Kontrak Data Mentah (*Raw Facts Invariants*)

1. **Fakta Mentah Murni, Bukan Nilai Tampilan**:
   Payload SAP hanya memuat data faktual dari database (misal: `net_weight_kg: 12.1` atau `width_mm: 80.0`), bukan string yang sudah dikonversi atau diformat seperti `"80 mm ( 3.15 inch )"` atau `"12 mic. / 48 ga."`.
2. **Eliminasi Kontradiksi Bobot (Gross vs Net Weight)**:
   Fakta mentah yang tersedia dari karakteristik batch SAP (`ZZCONVERSIONROLLKG`) adalah **berat bersih (`net_weight_kg`)**.
   Berat kotor (`gross_weight_kg`) **TIDAK** diperlakukan sebagai fakta mentah SAP karena nilainya merupakan hasil penjumlahan bobot roll dengan bobot core (*Core Weight*). Karena sumber bobot core belum distandarisasi pada seluruh alur SAP, gross weight diklasifikasikan sebagai aturan aplikasi masa depan (`OPEN_QUESTION`).
3. **Status Tanggal Produksi (`SAP_RESOLVED_TRANSITIONAL`) & Kedaluwarsa (`APPLICATION_DERIVED_TARGET`)**:
   - **Tanggal Produksi (`production_date`)**: Saat ini SAP menyelesaikan tanggal produksi melalui function module `Z_GET_PRODUCTION_DATE` (Function Group `SAPLZTRIAS`, include `LZTRIASU01`) dengan input `MATNR` dan `CHARG`. Function mencari record `MSEG` movement type 101 dan 102, mengeliminasi material document yang dibatalkan/reversal (`SMBLN`), dan mengambil `BUDAT_MKPF` dari record tersisa sebagai `PDATE` (output bertipe data ABAP `SY-DATUM`, bukan berarti nilainya dari tanggal sistem). Jika tidak ada record `MSEG` yang cocok, fallback menggunakan `MCH1-ERSDA`.
   - **Isu Record Selection Target**: Aturan pemilihan record `MSEG` target masih berstatus **`OPEN_QUESTION`** karena alur legacy mengambil record pertama tanpa klausul `ORDER BY`. Tanggal produksi tidak boleh disebut sebagai fakta mentah murni sampai keputusan target rule dan provenance final disetujui.
   - **Tanggal Kedaluwarsa (`expiry_date`)**: Pada alur legacy, expiry dihitung di ABAP dengan formula `V_EXPDATE = V_POSTDATE + ITAB-VLIVE` (di mana `ITAB-VLIVE` diambil dari characteristic batch `ZZEXPIREDLIVE` via `QC01_BATCH_VALUES_READ`). Tidak ada bukti perkalian 30 atau lookup shelf life di kode legacy. Tanggal kedaluwarsa diklasifikasikan sebagai **`SAP_DERIVED_LEGACY`** pada alur lama dan dipindahkan menjadi **`APPLICATION_DERIVED_TARGET`** pada Thermal Label Studio. Aplikasi akan menghitung expiry date secara deterministik melalui rule profile yang versioned setelah PPIC menyetujui definisi bisnis dan satuan `ZZEXPIREDLIVE`.
   - **Strategi Target Raw-SAP**: SAP tetap mengirimkan fakta sumber yang memadai dan aplikasi tidak menerima tanggal hasil manipulasi format/display. Sebelum rule aplikasi mengambil alih sepenuhnya, SAP diperbolehkan mengirim `production_date` hasil resolusi `Z_GET_PRODUCTION_DATE` sebagai **`SAP_RESOLVED_TRANSITIONAL`**. Ketika rule target disetujui, SAP harus menyediakan fakta minimum yang dibutuhkan aplikasi untuk menghitung tanggal secara deterministik tanpa aplikasi mengakses tabel SAP secara langsung.
   - **Data Fixture Sintetis**: Tanggal pada fixture pengujian merupakan contoh struktural sintetis murni untuk validasi skema, bukan hasil aktual SAP DEV atau data produksi nyata.
4. **Immutabilitas Snapshot**:
   Sekali snapshot dikirim dengan `request_id`, data tersebut bersifat final dan tidak boleh berubah pada saat retry.
5. **Selektor Bisnis `label_code` (`ZZLABEL`)**:
   SAP wajib menyertakan kode label bisnis (`ZZLABEL`). Pada dokumen perencanaan ini, kode `"REDACTED_STANDARD_LABEL_CODE"` digunakan sebagai **asumsi placeholder**. Kode produksi definitif dan pemetaannya ke template aplikasi wajib menunggu persetujuan resmi dari Pengguna dan PPIC.
6. **Data Hygiene & Pembatasan Metadata Audit**:
   Field `source_provenance.sap_user` (beserta `system_id`, `mandt`) adalah **audit metadata terbatas**. Metadata ini hanya disimpan untuk keperluan audit log server-side dan forensik keamanan. **DILARANG KERAS** menampilkan `sap_user` pada layout label fisik/PDF evidence ataupun pada tampilan monitoring operator PPIC biasa.

---

## 3. Spesifikasi Skema JSON: `1.0-raw`

### 3.1 Struktur Utama Payload (Batch Envelope)

```json
{
  "_fixture_notice": "SYNTHETIC_REDACTED_DATA_ONLY: This fixture contains purely artificial synthetic values for structural schema validation. Zero real production values or live SAP references.",
  "contract_schema_version": "1.0-raw",
  "producer_namespace": "SAP_PPIC",
  "request_id": "REQ-SYNTHETIC-20260922-RAW-001",
  "source_provenance": {
    "system_id": "SYN_DEV",
    "mandt": "000",
    "plant": "SYN_PLANT_1100",
    "storage_location": "SYN_SLOC_0001",
    "sap_user": "SYNTHETIC_TEST_USER",
    "transaction_code": "ZMMR_LABELROL",
    "snapshot_timestamp": "2026-09-22T00:00:00Z"
  },
  "items": [
    {
      "item_sequence": 1,
      "label_code": "REDACTED_STANDARD_LABEL_CODE",
      "copies": 1,
      "raw_business_facts": {
        "batch_number": "SYN-BATCH-2026-001",
        "material_number": "SYN-MAT-00000001",
        "material_description": "Synthetic Test Roll Film Grade A",
        "roll_number": "SYN-ROLL-001",
        "film_type_code": "PET_PLAIN",
        "film_type_text": "PET PLAIN FILM",
        "quality_grade": "A",
        "dates_note": "STRUCTURAL_EXAMPLE_ONLY: Pure synthetic dates for structural schema testing. Not real SAP DEV output. In SAP, production_date is SAP_RESOLVED_TRANSITIONAL via Z_GET_PRODUCTION_DATE, and target expiry is APPLICATION_DERIVED_TARGET.",
        "synthetic_production_date": "2026-09-22",
        "synthetic_expiry_date": "2027-09-22",
        "measurements": {
          "thickness_micron": 12.0,
          "width_mm": 80.0,
          "length_meters": 2000.0,
          "net_weight_kg": 12.1,
          "core_diameter_inch": 3.0
        },
        "surface_treatment": {
          "inside": "CORONA",
          "outside": "NONE"
        },
        "splices": {
          "splice_1_meters": 0.0,
          "splice_2_meters": 0.0
        },
        "sales_order_ref": {
          "sales_order": "SYN-SO-00000001",
          "sales_order_item": "0010",
          "customer_part_number": "SYN-CUST-PART-001"
        }
      }
    }
  ]
}
```

---

## 4. Definisi Elemen Data Kontrak

### 4.1 Header Batch & Provenance

| Field | Tipe | Wajib | Keterangan & Batasan Hygiene |
|---|---|---|---|
| `contract_schema_version` | String | Ya | Tetap `"1.0-raw"`. Menandakan kontrak snapshot data mentah. |
| `producer_namespace` | String | Ya | Namespace modul pengirim, misal `"SAP_PPIC"`. |
| `request_id` | String | Ya | Kunci idempotensi unik bisnis (persisted sebelum transmisi). |
| `source_provenance` | Object | Ya | Metadata audit sistem asal SAP (Plant, SLoc, User, TCode, Timestamp). |
| `source_provenance.sap_user` | String | Ya | **Audit metadata terbatas**. Tidak boleh ditampilkan pada label atau UI operator. |

### 4.2 Item Detail (`items[]`)

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `item_sequence` | Integer | Ya | Urutan fisik label (1, 2, 3...) — 1-indexed. |
| `label_code` | String | Ya | Kode label SAP (`ZZLABEL`), misal `"REDACTED_STANDARD_LABEL_CODE"` (placeholder asumsi). |
| `copies` | Integer | Ya | Wajib bernilai `1` pada fase Safe Demo & simulasi. |
| `raw_business_facts` | Object | Ya | Kumpulan fakta bisnis mentah tanpa manipulasi display. |

### 4.3 Sub-objek Fakta Bisnis Mentah (`raw_business_facts`)

| Elemen | Field | Tipe | Sumber Asal SAP | Status / Catatan |
|---|---|---|---|---|
| Identitas Batch | `batch_number` | String | `MCH1-CHARG` | `SOURCE_FACT` |
| | `material_number` | String | `MCH1-MATNR` | `SOURCE_FACT` |
| | `material_description` | String | `MAKT-MAKTX` | `SOURCE_FACT` (Kandidat fakta master material). Deskripsi label kustom (bila ada) dipisahkan sebagai `CUSTOMIZING_DEPENDENCY` / `OPEN_QUESTION`. `ZZLABEL` tetap sebagai business selector. |
| | `roll_number` | String | Karakteristik `ZZNOMORROLL` | `SOURCE_FACT` |
| Spesifikasi Film | `film_type_code` | String | Karakteristik `ZZCODE` | `SOURCE_FACT` |
| | `film_type_text` | String | Teks karakteristik `ZZCODE` | `SOURCE_FACT` |
| | `quality_grade` | String | Karakteristik `ZZGRADE` | `SOURCE_FACT` |
| Tanggal Produksi | `production_date` | String | Function `Z_GET_PRODUCTION_DATE` (`MSEG-BUDAT_MKPF` filter reversal 101/102; fallback `MCH1-ERSDA`) | **`SAP_RESOLVED_TRANSITIONAL`**. Pemilihan record MSEG target berstatus `OPEN_QUESTION` (legacy tanpa `ORDER BY`). Pada fixture pengujian digunakan contoh struktural sintetis `synthetic_production_date`. |
| Tanggal Kedaluwarsa | `expiry_date` | String | Legacy ABAP: `production_date + ZZEXPIREDLIVE` (characteristic via `QC01_BATCH_VALUES_READ`) | **`SAP_DERIVED_LEGACY` (Legacy) / `APPLICATION_DERIVED_TARGET` (Target)**. Target dihitung deterministik oleh rule profile aplikasi setelah definisi dan satuan `ZZEXPIREDLIVE` disetujui PPIC. Pada fixture pengujian digunakan contoh struktural sintetis `synthetic_expiry_date`. |
| Pengukuran Fisik | `thickness_micron` | Float | Karakteristik `ZZTHICKNESS` (numerik mentah) | `SOURCE_FACT` |
| | `width_mm` | Float | Karakteristik `ZZWIDTH` (numerik mentah) | `SOURCE_FACT` (atau `SAP_RESOLVED_TRANSITIONAL` bila via `ZALIAS`) |
| | `length_meters` | Float | Karakteristik `ZZLENGTH` (numerik mentah) | `SOURCE_FACT` (atau `SAP_RESOLVED_TRANSITIONAL` bila via `ZALIAS`) |
| | `net_weight_kg` | Float | Karakteristik `ZZCONVERSIONROLLKG` (numerik mentah) | `SOURCE_FACT` |
| | `core_diameter_inch`| Float | Karakteristik `ZZCORE` (numerik mentah) | `SOURCE_FACT` |
| Treatment & Splice | `surface_treatment` | Object | Karakteristik `ZZINSIDE` dan `ZZOUTSIDE` | `SOURCE_FACT` |
| | `splices` | Object | Karakteristik `ZZSPLICE-1` dan `ZZSPLICE-2` (meter) | `SOURCE_FACT` |
| Sales Order | `sales_order_ref` | Object | `MSKA-VBELN`, `MSKA-POSNR`, `VBAP-KDMAT` | `SOURCE_FACT` |

---

## 5. Nilai Turunan yang Dipindahkan ke Thermal Label Studio

Field-field berikut yang sebelumnya dihitung di ABAP (`ZMMR_LABELROL` / `ZMMR_LABEL_JSON`) **TIDAK DIKIRIM OLEH SAP**, melainkan menjadi tanggung jawab rule engine Thermal Label Studio:

1. **Konversi Satuan Imperial**:
   - `width_inch = width_mm * 0.03937`
   - `length_feet = length_meters * 3.28`
   - `weight_lbs = net_weight_kg * 2.2046`
   - `thickness_gauge = thickness_micron * 4`
2. **Kalkulasi Bobot Kotor (Gross Weight)**:
   - `gross_weight_kg`: Dihitung oleh rule engine aplikasi berdasarkan bobot core standar jika disetujui, atau disesuaikan dengan sumber data penimbangan operasional (`OPEN_QUESTION`).
3. **Payload Barcode & QR Code**:
   - Barcode 1D Code128: `batch_barcode`, `roll_barcode`
   - QR Code 2D gabungan: string terstruktur yang dirakit oleh rule engine
4. **Kalkulasi Tanggal Kedaluwarsa (Target Expiry Date)**:
   - `expiry_date`: Dihitung oleh rule engine aplikasi (`APPLICATION_DERIVED_TARGET`) berdasarkan tanggal produksi dan characteristic masa simpan (`ZZEXPIREDLIVE`) yang telah distandarisasi definisinya oleh PPIC.
5. **Pemilihan Layout SVG**:
   - Pemetaan template SVG (`label_roll_80x200`) berdasarkan `label_code` berstatus **kandidat pemetaan yang belum disetujui** (*unapproved candidate mapping*), menunggu persetujuan resmi Pengguna dan PPIC setelah perbandingan golden sample.
