# Result — B2B2J: Raw SAP Contract and Label Rule Migration

- Status: `REPLANNED_FACTUAL_CORRECTION — READY_FOR_CODEX_REVIEW`
- Risk Level: `3` (Public SAP-to-application contract, business-rule migration, rendering correctness, idempotency, and future print lifecycle)
- Branch: `codex/b2b2j-abap-http-contract`
- Baseline: `origin/main` at commit `a5fc287` (setelah B2B2I merge)
- Executor: `Gemini Flash 3.8 via Antigravity`
- Reviewer: `Codex`
- Target Selesai: Berhenti untuk review Codex sebelum commit/push/PR/merge

---

## 1. Ringkasan Eksekusi & Koreksi Faktual (Pasca-Verifikasi SAP DEV oleh Codex)

Berdasarkan pembacaan source code secara *read-only* dari sistem SAP DEV oleh Codex melalui `sap-mcp-local` pada Function Module `Z_GET_PRODUCTION_DATE` (Function Group `SAPLZTRIAS`, include `LZTRIASU01`), seluruh artefak perencanaan B2B2J telah diselaraskan dengan fakta teknis yang terbukti:

1. **Koreksi Faktual Tanggal Produksi (`production_date`)**:
   - Menghapus klaim keliru bahwa `V_POSTDATE` diisi dari `SY-DATUM` atau tanggal sistem runtime. `SY-DATUM` hanyalah tipe data kamus ABAP untuk parameter output `PDATE`.
   - Logika aktual `Z_GET_PRODUCTION_DATE` di SAP DEV:
     1. Menerima input `MATNR` dan `CHARG`.
     2. Mencari record tabel `MSEG` dengan movement type `101` dan `102` untuk material dan batch terkait.
     3. Membaca field `MBLNR`, `SMBLN`, dan `BUDAT_MKPF`.
     4. Mengeliminasi dokumen material yang dibatalkan/reversal melalui referensi `SMBLN`.
     5. Mengambil tanggal posting `BUDAT_MKPF` dari record tersisa dan mengisikannya ke `PDATE`.
     6. Jika tidak ada record `MSEG` yang cocok, menggunakan tanggal pembuatan batch `MCH1-ERSDA` sebagai fallback `PDATE`.
   - Klasifikasi: **`SAP_RESOLVED_TRANSITIONAL`**.
   - Isu Target: Pada alur legacy, pembacaan record `MSEG` dilakukan dengan `READ TABLE ... INDEX 1` tanpa klausul `ORDER BY`. Oleh karena itu, perilaku pemilihan tanggal legacy belum deterministik dan aturan penentuan record target diklasifikasikan sebagai **`OPEN_QUESTION`**.
2. **Koreksi Faktual Tanggal Kedaluwarsa (`expiry_date`)**:
   - Menghapus klaim spekulatif bahwa expiry memakai formula SY-DATUM, perkalian 30 terhadap expired-live, atau lookup shelf life tanpa bukti.
   - Formula aktual legacy pada `ZMMR_LABEL_JSON`:
     `QC01_BATCH_VALUES_READ` membaca characteristic batch (`ZZEXPIREDLIVE`) ke `ITAB-VLIVE`, kemudian dihitung dengan `V_EXPDATE = V_POSTDATE + ITAB-VLIVE`.
   - Klasifikasi: **`SAP_DERIVED_LEGACY`** (pada legacy) dan dipindahkan menjadi **`APPLICATION_DERIVED_TARGET`** (pada target). Aplikasi akan menghitung tanggal kedaluwarsa secara deterministik melalui versioned rule profile setelah PPIC menyetujui definisi bisnis dan satuan `ZZEXPIREDLIVE`.
3. **Strategi Target Raw-SAP**:
   - SAP tetap menjadi sumber fakta dan mengirimkan data sumber yang memadai tanpa manipulasi tampilan.
   - Pada masa transisi sebelum rule aplikasi mengambil alih penuh, SAP mengirimkan `production_date` hasil resolusi `Z_GET_PRODUCTION_DATE` sebagai `SAP_RESOLVED_TRANSITIONAL`.
   - Ketika rule target disetujui, SAP wajib menyediakan fakta minimum yang dibutuhkan aplikasi untuk komputasi deterministik tanpa aplikasi mengakses tabel internal SAP secara langsung.
4. **Koreksi Material Description**:
   - Menghapus frasa `"MAKT-MAKTX atau ZZLABEL desc"`.
   - Menggunakan `MAKT-MAKTX` sebagai kandidat fakta mentah master material (**`SOURCE_FACT`**).
   - Teks deskripsi label (bila ada) dipisahkan dan diklasifikasikan sebagai **`CUSTOMIZING_DEPENDENCY`** atau **`OPEN_QUESTION`**. `ZZLABEL` tetap sebagai *business label selector*, bukan pengganti deskripsi material.
5. **Penegasan Data Fixture Tetap Sintetis**:
   - Tanggal pada berkas fixture [`raw_sap_label_batch_redacted.json`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/docs/tasks/B2B2J/fixtures/raw_sap_label_batch_redacted.json) dipertahankan murni sintetis untuk validasi struktur skema, dan ditegaskan bukan hasil SAP DEV atau data produksi nyata.

---

## 2. Matriks Hasil Verifikasi Aktual

| No | Kategori Pengujian | Metode / Sumber Bukti | Status | Keterangan Aktual |
|---|---|---|---|---|
| 1 | SAP DEV Source Function Inspection | Read-only inspection via `sap-mcp-local` (Codex) | **`PASS`** | Terverifikasi pada `Z_GET_PRODUCTION_DATE` (include `LZTRIASU01`): membaca `MSEG` 101/102, eliminasi reversal `SMBLN`, ambil `BUDAT_MKPF`, fallback `MCH1-ERSDA`. Tiada `SY-DATUM` sebagai sumber nilai. |
| 2 | Raw Fixture Structural Check | `python` structural parser check | **`PASS`** | `raw_sap_label_batch_redacted.json` valid: skema `1.0-raw`, 3 item, `item_sequence` 1..3, `copies = 1`, `label_code = REDACTED_STANDARD_LABEL_CODE`, identifier sintetis `SYN-...`, tanpa `gross_weight_kg` atau `base_film`. |
| 3 | Static Scan (Active Artifacts Scope) | Regex scan pada `ZMMR_LABEL_JSON_HTTP_REFERENCE.abap` | **`PASS`** | 0 panggilan `GUI_DOWNLOAD`, 0 `CL_GUI_FRONTEND_SERVICES`, 0 fungsi `RFC_*`, 0 socket raw, 0 TCP 9100, 0 spooler, 0 executable `CREATE_BY_DESTINATION`, 0 `IV_DESTINATION`. |
| 4 | Static Scan: Infrastructure & Secrets | Regex scan pada seluruh artefak aktif B2B2J | **`PASS`** | 0 URL literal (`http://`, `https://`), 0 IP privat (`192.168.`, `10.`), 0 token placeholder, 0 parameter input bebas destination. |
| 5 | Non-Executable Safety Guard | Inspeksi `START-OF-SELECTION` ABAP reference | **`PASS`** | Terbukti fail-closed: me-raise error `E` dan menghentikan seluruh eksekusi secara preventif. |
| 6 | Historical References Preservation | Line count & hash check | **`PASS`** | `Analisa_Pencetakan_Label.md` (308 baris) dan `ZMMR_LABEL_JSON.abap` (752 baris) dipertahankan utuh sebagai referensi historis. |
| 7 | Whitespace & Format Check | Direct recursive whitespace check + `git diff --check` | **`PASS`** | 0 trailing whitespace warnings pada seluruh berkas di `docs/tasks/B2B2J/`, `git diff --check` bersih (exit code 0). |
| 8 | Runtime B2B2I Ingestion of Raw Fixture | API server runtime | **`NOT RUN`** | Sesuai desain: Endpoint B2B2I beroperasi pada kontrak render canonical `1.1`. Adaptasi runtime untuk skema mentah `1.0-raw` dan Rule Engine merupakan pekerjaan fase mendatang. |
| 9 | Live SAP Execution / Transports / SM59 | Transaksi SAP DEV/QAS/PRD | **NOT RUN** | Tidak ada perubahan, eksekusi bisnis, transport, SM59, STRUST, atau koneksi printer. (Satu pembacaan source read-only pada SAP DEV telah dilakukan oleh Codex melalui sap-mcp-local untuk memverifikasi Z_GET_PRODUCTION_DATE). |
| 10 | ABAP Syntax / Unit Compiler di SAP GUI | Transaksi SE24 / SE38 di SAP | **`NOT RUN`** | Sintaks diverifikasi statis offline; program ABAP non-eksekutabel tidak diklaim verified tanpa compiler SAP berotorisasi. |
| 11 | Printer Fisik / Socket TCP 9100 | N/A | **`NOT RUN`** | Dilarang keras dalam scope proyek. |
| 12 | Prasyarat Bisnis & Aturan Target | Evaluasi arsitektur | **`OPEN_QUESTIONS`** | Rule pemilihan record MSEG target (tanpa ORDER BY di legacy), otorisasi kode `ZZLABEL` pilot & template mapping, serta standarisasi bobot core belum diputuskan. |

---

## 3. Daftar Isu Terbuka (Open Questions) & Asumsi

1. **`OPEN_QUESTION-01` (Aturan Target Seleksi Record MSEG untuk Tanggal Produksi)**:
   Pada `Z_GET_PRODUCTION_DATE`, record MSEG dipilih dengan `INDEX 1` tanpa `ORDER BY`. Sebelum dipindahkan ke rule engine aplikasi secara deterministik, PPIC dan tim ABAP harus menyepakati apakah record yang diambil adalah dokumen penerimaan paling awal (*earliest GR*) atau paling akhir (*latest GR*).
2. **`OPEN_QUESTION-02` (Definisi Bisnis & Satuan Karakteristik `ZZEXPIREDLIVE`)**:
   Formula legacy menghitung `V_EXPDATE = V_POSTDATE + ITAB-VLIVE`. Satuan operasional (apakah hari atau bulan) dan penanganan nilai kosong harus disetujui PPIC sebelum rule engine aplikasi mengimplementasikan kalkulasi expiry.
3. **`OPEN_QUESTION-03` (Otorisasi Resmi Kode Label Pilot & Template Mapping)**:
   `REDACTED_STANDARD_LABEL_CODE` adalah asumsi placeholder, dan pemetaan ke template `label_roll_80x200` adalah kandidat belum disetujui (*unapproved candidate mapping*). Diperlukan konfirmasi kode `ZZLABEL` produksi aktual dan sampel cetak legacy dari PPIC sebelum profil dinyatakan siap pakai.
4. **`OPEN_QUESTION-04` (Standarisasi Sumber Core Weight untuk Gross Weight)**:
   Kalkulasi bobot kotor roll membutuhkan bobot core (`V_WCORE`). Standarisasi sumber data (apakah dari teks Sales Order 'WC', master data diameter core, atau timbangan fisik) menunggu keputusan operasional PPIC.
5. **`OPEN_QUESTION-05` (Resolusi Brand Display & Hardware Printer)**:
   Pencetakan field brand menunggu konfirmasi PPIC; profil resolusi hardware printer (203, 300, 600 DPI) ditentukan melalui konfigurasi virtual printer profile pada database master aplikasi.
6. **`OPEN_QUESTION-06` (Migrasi Aturan ZALIAS ke Aplikasi)**:
   Saat ini SAP menyelesaikan alias dimensi secara transisional (`SAP_RESOLVED_TRANSITIONAL`). Keputusan memindahkan aturan tabel `ZALIAS` ke rule engine aplikasi menunggu persetujuan arsitektur lanjutan.

---

## 4. Batas Keselamatan & Batasan Klaim

> [!CAUTION]
> **Pernyataan Kesiapan Sistem**:
> Fase B2B2J adalah **fase desain kontrak data mentah dan analisis aturan migrasi**. Fase ini **TIDAK DIKLAIM** sebagai siap deployment (*deployment-ready*), siap SAP (*SAP-ready*), ataupun siap produksi (*production-ready*). Seluruh integrasi fisik dan eksekusi live ditunda hingga pengujian golden sample disetujui oleh PPIC.

- Branch aktif: `codex/b2b2j-abap-http-contract` (bercabang dari `origin/main` commit `a5fc287`).
- File di luar B2B2J (`docs/architecture/production_architecture_options.md`, `frontend/dist/`, test reports, `.env`) tetap bersih dan tidak disentuh.
- Tidak ada perubahan, eksekusi bisnis, transport, SM59, STRUST, atau koneksi printer. Satu pembacaan source read-only pada SAP DEV telah dilakukan oleh Codex melalui sap-mcp-local untuk memverifikasi Z_GET_PRODUCTION_DATE.
- Berhenti sebelum `git commit`, `push`, `PR`, atau `merge`.
- Status handoff: **Menunggu review Codex**.
