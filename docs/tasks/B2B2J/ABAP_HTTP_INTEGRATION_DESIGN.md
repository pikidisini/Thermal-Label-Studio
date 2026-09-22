# ABAP HTTP Integration Design: Raw SAP Snapshot Architecture (B2B2J Replan)

- Dokumen: Desain Integrasi HTTP & Interface Seam ABAP (B2B2J Replan — Correction Pass 2)
- Status: `REVISED / SUPERSEDES EARLIER ADAPTER SCOPE`
- Target Audience: Tim ABAP, Basis, Tim PPIC, dan Arsitek Thermal Label Studio

---

## 1. Konteks Replan & Perubahan Paradigma Integrasi

Fase B2B2J telah di-replan berdasarkan analisis mendalam terhadap orchestrator produksi `ZMMR_LABELROL` (`docs/tasks/B2B2J/Analisa_Pencetakan_Label.md`).

Rancangan sebelumnya yang mencoba membuat adapter generik langsung di ABAP dinyatakan **SUPERSEDED** karena membebankan logika format, konversi imperial, dan rakitan barcode ke SAP. Pada arsitektur target baru:

1. **SAP ERP sebagai Sumber Fakta Murni**:
   SAP hanya mengekstrak dan mengirimkan **snapshot fakta bisnis mentah** (`1.0-raw`) bersama kode label (`label_code` / `ZZLABEL`).
2. **Thermal Label Studio sebagai Sumber Aturan & Render**:
   Aplikasi mengelola *Label Rule Profile*, menghitung nilai konversi/tampilan, merakit barcode/QR vektor, menyuntikkan ke template SVG, dan merender Safe Demo PDF.
3. **Desain Interface Non-Eksekutabel**:
   Artefak ABAP pada fase ini dirancang sebagai **spesifikasi tipe data dan interface seam non-eksekutabel** (`docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON_HTTP_REFERENCE.abap`). Tidak ada implementasi transport HTTP aktif, pemanggilan SECSTORE nyata, atau konfigurasi SM59/STRUST yang dijalankan sebelum fase pilot disetujui.

---

## 2. Arsitektur Komunikasi Target

```text
[SAP ERP: ZMMR_LABELROL / Collector]
  │
  ├─ 1. Ekstraksi Fakta Mentah Batch (MCHA, Characteristics)
  ├─ 2. Baca Kode Label Bisnis (ZZLABEL)
  ├─ 3. Baca Relasi Sales Order (MSKA, VBAP)
  ├─ 4. Bentuk Snapshot Immutabel (contract_schema_version: '1.0-raw')
  ├─ 5. Sisipkan Stable Request ID (dari transaksi bisnis yang persisten)
  │
  ▼ HTTP(S) POST (via Named Protected Destination 'ZLABEL_SIMULATION')
+─────────────────────────────────────────────────────────────────+
│ Thermal Label Studio                                            │
│                                                                 │
│ 1. Menerima Raw Snapshot + Validasi Skema '1.0-raw'             │
│ 2. Cek Idempotensi (producer_namespace, request_id)             │
│ 3. Resolusi Rule Profile berdasarkan label_code (ZZLABEL)       │
│ 4. Eksekusi Rule Engine:                                        │
│    - Konversi mm→in, m→ft, kg→lbs, mic→gauge                    │
│    - Perakitan payload Barcode 1D & QR Code 2D                  │
│ 5. Resolusi Template SVG (Kandidat Belum Disetujui: label_roll_80x200)│
│ 6. Real Pipeline Render (Pure text + Vector Barcode + Raster)   │
│ 7. Safe Demo Multi-Page PDF Evidence (Watermarked)              │
+─────────────────────────────────────────────────────────────────+
```

---

## 3. Spesifikasi Interface Seam ABAP

Untuk menjamin pemisahan concern yang bersih pada modul SAP di masa mendatang, rancangan menggunakan dua interface seam terisolasi:

### 3.1 `ZIF_RAW_LABEL_COLLECTOR` (Ekstraksi Fakta Mentah)
Bertanggung jawab mengumpulkan data batch dan karakteristik dari tabel standar SAP tanpa melakukan konversi satuan atau manipulasi string:
```abap
INTERFACE ZIF_RAW_LABEL_COLLECTOR.
  METHODS:
    COLLECT_BATCH_FACTS
      IMPORTING
        IT_CHARG        TYPE STANDARD TABLE
        IV_WERKS        TYPE WERKS_D
        IV_LGORT        TYPE LGORT_D
      RETURNING
        VALUE(RT_ITEMS) TYPE TY_T_RAW_LABEL_ITEMS
      RAISING
        CX_STATIC_CHECK.
ENDINTERFACE.
```

### 3.2 `ZIF_RAW_LABEL_DISPATCHER` (Pengiriman Terproteksi)
Bertanggung jawab melakukan dispatch snapshot ke server Thermal Label Studio. Destination tidak diberikan oleh caller, melainkan di-resolve secara internal dari konfigurasi terlindungi Basis/allowlist:
```abap
INTERFACE ZIF_RAW_LABEL_DISPATCHER.
  METHODS:
    DISPATCH_SNAPSHOT
      IMPORTING
        IS_SNAPSHOT     TYPE TY_RAW_BATCH_SNAPSHOT
      EXPORTING
        EV_HTTP_STATUS  TYPE I
        EV_BATCH_ID     TYPE STRING
        EV_OUTCOME_CODE TYPE STRING
      RAISING
        CX_STATIC_CHECK.
ENDINTERFACE.
```

---

## 4. Batasan Keamanan & Prinsip Fail-Closed

1. **Zero Hardcoded Secrets / Infrastructure**:
   Kode ABAP dilarang memuat URL (`http://`, `https://`), alamat IP privat, port, password, atau token autentikasi.
2. **Protected Destination Internal Resolution**:
   Destination SM59 (misal `ZLABEL_SIMULATION`) dikelola oleh Basis dan di-resolve secara internal via allowlist terproteksi. Dilarang menyediakan input bebas destination di selection screen atau mengizinkan caller menentukan destination sewenang-wenang.
3. **Data Hygiene & Restricted Audit Metadata**:
   Field `sap_user` (beserta `system_id`, `mandt`) diperlakukan secara ketat sebagai **audit metadata terbatas**. Metadata ini disimpan hanya untuk audit trail server-side dan tidak boleh dirender pada label fisik/PDF evidence atau ditampilkan di UI monitoring operator biasa.
4. **Stable Request ID Prerequisite**:
   Idempotensi wajib didukung oleh `request_id` yang stabil dan telah dipersistensikan oleh transaksi bisnis sebelum pengiriman HTTP. Adapter wajib fail-closed bila `request_id` kosong, dan dilarang membangkitkan ID acak/berbasis waktu di dalam loop retry.
5. **Sanitized Audit Logging**:
   Jika log output dicetak di SAP, hanya metadata aman yang boleh ditulis: HTTP status, kategori outcome, `request_id`, dan `batch_id`. Dilarang menulis response body mentah, request payload, token, atau URL ke output screen/spool.
6. **Non-Executable in B2B2J**:
   Program referensi pada fase ini tidak dapat dieksekusi (`START-OF-SELECTION` me-raise error `E`) untuk mencegah transmisi tidak sengaja sebelum fase pengujian resmi disetujui.
