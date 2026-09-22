# Analisa Proses Bisnis Pencetakan Label (Program `ZMMR_LABELROL`)

> Sumber: SAP Server QA — Program `ZMMR_LABELROL` beserta seluruh INCLUDE-nya.
> Tanggal: 27 Juli 2026

---

## BAB 1. Pendahuluan
Program `ZMMR_LABELROL` merupakan program induk (ABAP Report) yang bertugas mencetak label roll (Finish Goods dengan awalan material 'SR'). Program ini pertama kali dibuat oleh **Mualifi** pada tanggal **11 Oktober 2012**, dan telah mengalami banyak enhancement dari berbagai developer untuk mengakomodasi banyak sekali tipe label pelanggan / customer.

Secara arsitektur, pencetakan label dibagi menjadi 2 metode:
- **DOS**: Menggunakan format template `.TAX` (di server SAP `/spare/saplabel/`) dan output data dinamis `.DAX` (di lokal PC `C:\tslabel\`). Pencetakan dijalankan lewat script `.BAT` atau printer Zebra langsung.
- **WINDOWS**: Menggunakan SAP **Smartforms** (via SUBMIT ke program lain yang di-map di tabel `ZMAP_LABEL-PROG_ROLL`).

---

## BAB 2. Struktur Program dan File yang Dilibatkan

### 2.1. Includes Program `ZMMR_LABELROL`
| Include | Fungsi Utama |
|---|---|
| `ZMMR_LABELROL_INCL` | Deklarasi tabel, variabel global, konstanta konversi, & form umum (`PRINT`, `GETFRSRV_F`, `DOWNLOAD_DATA`, `CEK_RTP_CORE`, dll.). Sekaligus meng-*include* `ZLABEL_ZEBRA_INCL`. |
| `ZLABEL_ZEBRA_INCL` | Handling printer Zebra: `CHECK_USING_ZEBRA`, `CHANGE_ZEBRA_EMULATION`, `PRINT_ZEBRA`, `CLEAR_ZEBRA`. |
| `ZMMR_LABELROL_STANDAR` | Rutin default `TEXT_DATA` (Old Label) & `NEW_TEXT_DATA` (New Label) + `F_EXIT_LABEL`. |
| `ZMMR_LABELROL_TOYOBO` | Rutin `TYB_TEXT_DATA`, `GET_JR_POSITION`, `GET_GRADE`, `GET_GRADE_B032`. |
| `ZMMR_LABELROL_TTE` | Rutin `TYB_TEXT_DATA_TTE`, `F_LOADIMAGE_TTE` (Label TTE-Toyobo). |
| `ZMMR_LABELROL_TTA` | Rutin `TYB_TEXT_DATA_TTA`, `F_LOADIMAGE_TTA` (Label TTA-Toyobo). |
| `ZMMR_LABELROL_INTER` | Rutin `INTER_TEXT_DATA2` (Interfilm & sejenisnya). |
| `ZMMR_LABELROL_PRIMA` | Rutin `PRIMA_TEXT_DATA` (PrimaPack). |
| `ZMMR_LABELROL_PM` | Rutin `SAMPOERNA_TEXT_DATA` & `PM_TEXT_DATA` (Sampoerna & Philip Morris). |
| `ZMMR_LABELROL_INCHI` | Rutin `INCHI_TEXT_DATA`, `GET_INCHI` (Inchi label). |
| `ZLABEL_A211` | Rutin `F_A211`, `GET_TEXT` (Label A211 series). |
| `ZMMR_LABELROL_TYB_WIN` | (Program terpisah) - Print Toyobo dengan Smartforms/Windows. |

### 2.2. Struktur File Output
| File | Path | Fungsi |
|---|---|---|
| Template `.TAX` | `/spare/saplabel/{V_LABELTYPE}.TAX` | Layout ZPL/DAX template. |
| Data `.DAX` | `C:\tslabel\DATA.DAX` | Data dinamis (isi dari LOOP). |
| Batch `.BAT` | `C:\tslabel\DATA.BAT` | Executor cetak. |
| `zebra.zpl` | `C:\tslabel\zebra.zpl` | Flag deteksi Zebra Printer + kode emulasi. |

---

## BAB 3. Tabel Custom yang Digunakan

| Tabel | Fields Kunci | Tujuan |
|---|---|---|
| **`ZMAP_LABEL`** | CODE (Label Code), TYPE (DOS/WIN), **PROG_ROLL** (Program cetak Windows), FORM_ROLL (Smartforms Roll), PROG_HU (Program cetak HU), FORM_HU, TEXT1..TEXT5 | Master mapping kode label ke program cetak/format. Kolom TEXT1..5 juga digunakan untuk penanda fitur khusus (contoh: `TEXT1='CONVB64'` untuk exit label, `TEXT2` untuk enhancement Bothside Treatment). |
| **`ZMAP_LABEL_TYB`** | ZCODE | Master mapping kode label khusus Toyobo yang menggunakan Windows Smartforms (`ZMMR_LABELROL_TYB_WIN`). |
| **`ZLABEL`** | ATNAM, DATA1 (Placeholder DAX/ZPL), DATA2 (Value) | Master mapping karakteristik batch (`ATNAM`) ke placeholder / instruksi DAX (misal `F"BARC "<LF>`). Diambil dan diloop untuk assemble output DAX. |
| **`ZLABELMAPIMAGE`** | KODE, IMAG1 | Master mapping kode label ke file image `.TAX` untuk logo (Corona, Ceramic, Coated, Cercoat, Astria, dll.). |
| **`ZALIAS`** | MATNR, CHARG, WERKS, ZALIA, LENGT, WIDTH, THICK, DENSI | Alias fisik roll (dimensi override) jika ada `ZZALIAS` characteristic pada batch. |
| **`ZCORER`** | SEQNO, COREID, CHARG, WERKS, STATUS (R/B/C/I/D/U/N), DOCTYPE, DOCNO, POSNR, ERSDA, ERZET, ZUSER, REMARK | Master pelacakan Core RTP: Ikat/Lepas Core dengan Batch, tracking histori Free-to-SO, SO-to-Free, dsb. |
| **`ZBATCHISTORY`** | NCHARG (new charg), CHARG, WERKS | Melacak history perubahan grade batch, digunakan sebagai referensi untuk memindahkan Core RTP dari batch lama ke batch baru. |
| **`ZMAPP_RTP`** | CATEGORY, INT_CHAR, CHAR_VALUE | Master mapping untuk properti packaging RTP (mis. `ZZPACKINGCODE` mengandung 'C' berarti CP/CB packaging). |
| **`ZCONSTANT`** | (Konstanta konversi) | Menyimpan konstanta yang dipakai program (khususnya Interfilm). |
| **`ZALIAS`** (Cross ref) | — | Dipakai bila terdapat karakteristik `ZZALIAS`, override dimensi. |

### Catatan Karakteristik (`ATNAM`) yang Dikonsumsi Program:
- `ZZLABEL` (**wajib**, penentu tipe label)
- `ZZTYPE`, `ZZALIAS`, `ZZPACKING`, `ZZTHICKNESS`, `ZZWIDTH`, `ZZLENGTH`, `ZZWEIGHT`, `ZZGRADE`, `ZZCRITERIA`
- `ZZCORE`, `ZZINSIDE`, `ZZOUTSIDE`, `ZZSPLICE-1`, `ZZSPLICE-2`
- `ZZPRODLINE`, `ZZMONTHYEAR`, `ZZSEQUENCENBR`, `ZZCODE`, `ZZDERIVATIVEMS`, `ZZDERIVATIVESS`, `ZZPOSITIONMS`, `ZZPOSITIONSS`, `ZZNOMORROLL`
- `ZZEXPIREDLIVE`, `ZZCONVERSIONROLLKG`, `ZZLENGTHSHT`
- `ZZSPECIALTOUCH-1`, `ZZSPECIALTOUCH-2`, `ZZSPECIALTOUCH-3`
- `ZZNOROLLTOYOBO`, `ZZNOLOTTOYOBO`, `ZZTAILORED`, `ZZPOCUSTOMER`, `ZZSKU`, `ZZCUSTOMER`
- `ZZPACKINGCODE`, `ZZNOLOTSUBCONT`, `ZZNOLOTSUBCONT2`, `ZZNOLOTSUBCONT3`
- `ZZUNITOFMEASURE`

---

## BAB 4. Alur Proses Utama Program

### 4.1. Persiapan (Start-of-Selection)
1. **Select data batch** dari tabel `MCHA` berdasar `P_CHARG`.
2. **Cek otorisasi** menggunakan authority object `Z_WERKS` (per plant).
3. Loop per batch, membaca karakteristik dengan `QC01_BATCH_VALUES_READ` -> Table `V_TAB` (type `API_VALI`).

### 4.2. Cek RTP Core (Form `CEK_RTP_CORE`)
- Baca stok batch dari `MCHB`/`MSKA`.
- Cek karakteristik `ZZPACKINGCODE` — mengandung 'C' -> harus link Core RTP.
- Interaksi popup untuk input Core ID, validasi via table `ZCORER` (status Master).
- Insert log SO-to-Free / Free-to-SO / SO-to-SO / Change Grade ke `ZCORER`.
- Dialog `Screen 100` untuk pilih Core ID jika ditemukan lebih dari satu.

### 4.3. Cek Printer Zebra
- `CHECK_USING_ZEBRA` mencari file `c:/tslabel/zebra.zpl` di PC.
- Jika ada, `V_IS_ZEBRA_LABELROL = 'X'`. Sebelum SUBMIT Smartforms, emulator diganti ke `'NONE'` melalui `CHANGE_ZEBRA_EMULATION`.

### 4.4. Percabangan Windows vs DOS
1. Baca `ZZLABEL` dari `V_TAB`.
2. `SELECT PROG_ROLL FROM ZMAP_LABEL WHERE CODE = ZZLABEL`. Jika ada:
   - Ini adalah **Windows label**. Program `SUBMIT (VPROGNAME) ... AND RETURN`. Kemudian `EXIT`.
3. `SELECT ZCODE FROM ZMAP_LABEL_TYB WHERE ZCODE = ZZLABEL`. Jika ada:
   - **Toyobo Windows**. `SUBMIT ZMMR_LABELROL_TYB_WIN ... AND RETURN`. `EXIT`.
4. Jika tidak ada mapping Windows di atas, lanjut ke **DOS** dengan penentuan berdasarkan pola kode label.

### 4.5. Kriteria "Old Label" vs "New Label" (DOS)
- **Old Label**: `V_TAB-ATWRT+1(1) = '0'` (karakter kedua adalah '0', mis. A0XX, B0XX, C0XX, D0XX) **dan** tidak ada mapping `TEXT2` di `ZMAP_LABEL`.
- **New Label**: Sebaliknya (karakter kedua non-'0'), atau memiliki mapping `TEXT2` di `ZMAP_LABEL` (Bothside Treatment enhancement per 29.04.2026).

### 4.6. Distribusi Label ke Include (routine `PERFORM ...`)
```
─── Old Label
    ├── Toyobo (A002, B00X, B02X, B03X, B04X)                   → PERFORM TYB_TEXT_DATA
    ├── Interfilm (D009, D010, B013-018, A010-021, dst.)          → PERFORM INTER_TEXT_DATA2
    ├── PrimaPack (A009)                                          → PERFORM PRIMA_TEXT_DATA
    └── Selain di atas                                             → PERFORM TEXT_DATA (Standar Old)

─── New Label
    ├── Sampoerna (K100, K101, K102, K103)                         → PERFORM SAMPOERNA_TEXT_DATA
    ├── TTE (TE02)                                                 → PERFORM TYB_TEXT_DATA_TTE
    ├── TTA (TA02, TA03, TA04, TA05, TA06, TA07)                   → PERFORM TYB_TEXT_DATA_TTA
    ├── Philip Morris (K110, K120, K130, K140, K150, K160)         → PERFORM PM_TEXT_DATA
    ├── Inchi (A300, A301, A304, A305, A134, A137, A142, A145, J129) → PERFORM INCHI_TEXT_DATA
    ├── A211 Series (A211, A212, A213)                              → PERFORM F_A211
    └── Selain di atas                                              → PERFORM NEW_TEXT_DATA
                                                                        + PERFORM F_EXIT_LABEL
```

### 4.7. Penutup (`AT LAST`)
- `PERFORM DOWNLOAD_DATA` — Simpan `TEXT_DATA[]` ke `C:\tslabel\DATA.DAX`.
- `PERFORM GETFRSRV_B` — Download file `.BAT` dari server.
- `PERFORM PRINT` — Eksekusi `DATA.BAT` (atau `PRINT_ZEBRA.BAT` untuk Zebra).
- `PERFORM REFRESH_ALL` — Reset table internal.

---

## BAB 5. Analisa Detail Per Tipe Label

### 5.1. Bab: Label Old — Standar (`PERFORM TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_STANDAR`.
- **Kode Label**: Semua kode label yang tidak spesifik masuk kategori khusus (Toyobo/Interfilm/PrimaPack), namun tetap termasuk Old Label.
- **Isi Logika**:
  - Ambil SO Number & Item terakhir dari `MSKA`.
  - Konversi standar: **Thickness** (mic → gauge × 4), **Width** (mm → inch × 0.03937), **Length** (m → feet × 3.28), **Weight** (kg → lbs × 2.2046).
  - Right-justify string sesuai `V_LEN_*`.
  - Bila `V_LABELORIG` = `D009/D010/D013/D015` → gunakan konstanta khusus Interfilm.
  - Loop `V_ZLABEL` (tabel `ZLABEL`) untuk assemble text DAX per `ATNAM`.
  - Handling logo image via `V_LABELIMGOLD` vs `V_LABELIMGNEW`.

### 5.2. Bab: Label Old — Toyobo (`PERFORM TYB_TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_TOYOBO`.
- **Sub-BAB 5.2.1 Kode Label**:
  - **A002**: Old Toyobo AH.
  - **B001**: AT2 (dengan hard-code `AC` atau `A` berdasar No Roll digit ke-9).
  - **B002**, **B022**, **A002**: Old dengan cek year/month via `V_TY_ROLLN`.
  - **B003**: (Ref B002) label `NJ`.
  - **B004**: Toyobo ATPP.
  - **B005**: Toyobo ATPF (Added 21.06.2019).
  - **B020**: Toyobo ATTA (Added 09.05.2019).
  - **B021**: Toyobo ATAT.
  - **B023**: Toyobo ATAL.
  - **B024**: Toyobo ATAC.
  - **B025**: Toyobo ATAR.
  - **B026, B027, B029, B044, B045, B046**: Toyobo dengan J1/J2 tail (Join code disertakan di Barcode-2 dan Text1).
  - **B030, B031, B032, B047, B048**: Toyobo Passing Join 2 (harus lookup posisi via `ZZUNITOFMEASURE` batch mother roll di `MSEG` bwart 101; grade JS/JD).
- **Sub-BAB 5.2.2 Rule Barcode**:
  - **Barcode-1**: No Roll Toyobo (`ZZNOROLLTOYOBO`).
  - **Barcode-2**: `[TYPE][THK][WIDTH][LENGTH][AT/AH/AK/…][TAIL]`.
  - **Barcode-3**: `[YEARMONTH][NoRoll][LotNo][000]`.
- **Sub-BAB 5.2.3 Rule Ganjil/Genap Bulan**:
  - Digit ke-2 nomor roll × 2 - 1 (ganjil), atau × 2 (genap).
  - Bila tanggal ≤ 50 → gunakan bulan ganjil, > 50 → bulan genap.

### 5.3. Bab: Label New — TTE (`PERFORM TYB_TEXT_DATA_TTE`)
- **Include**: `ZMMR_LABELROL_TTE`.
- **Kode Label**: **TE02**.
- **Karakteristik Khusus**:
  - Handling image treatment berdasarkan `ZZINSIDE` / `ZZOUTSIDE`: CO=IMGCORONA, CM=IMGCERAMIC, CC=IMGCERCOAT.
  - QR Code (`ZZBARC1`) berisi gabungan `V_TY_TEXT1` (Type-Thick-Width-Length-Grade-Tailored) + `V_TY_TEXT2` (YearMonth-NoRoll-LotNo).
  - Enhance Fiqih 08.07.2026: Hilangkan `NC` dari category.
  - Enhance Fiqih 17.07.2026: QR label TTE menggunakan `RESPECTING BLANKS`.

### 5.4. Bab: Label New — TTA (`PERFORM TYB_TEXT_DATA_TTA`)
- **Include**: `ZMMR_LABELROL_TTA`.
- **Kode Label**: **TA02**, **TA03**, **TA04**, **TA05**, **TA06**, **TA07**.
- **Karakteristik Khusus**:
  - Grade hard-coded per tipe: TA02='A', TA03='AG', TA04='AK', TA05='AR', TA06='AC', TA07='AL'.
  - Image treatment mirip TTE tetapi menambahkan `CD` = IMGCOATED.
  - `V_TY_TEXT1` berisi Type/Thick/Width/Length/Grade code.

### 5.5. Bab: Label Old — Interfilm (`PERFORM INTER_TEXT_DATA2`)
- **Include**: `ZMMR_LABELROL_INTER`.
- **Kode Label**:
  - **BOPET Interfilm**: `D009`, `D010`, `D013`, `D014`, `D015`, `D020`.
  - **BOPP Interfilm**: `B013`, `B014`, `B015`, `B016`, `B017`, `B018`, `B020`.
  - **Alu / Metallized**: `A010`, `A011`, `A012`, `A013`, `A014`, `A015`, `A016`, `A017`, `A018`, `A019`, `A020`, `A021`.
  - **Laminator**: `L001`, `L002`, `L003`, `L004`, `L005`, `L011`, `L012`.
  - **Grid / Special**: `G001`.
- **Karakteristik Khusus**:
  - Membaca SO Item Text (Object VBBP, ID Z001) untuk field L1, L2, W1, W2, N1, N2, S1, S2, T1, T2, P1, J1, F1-F4.
  - Konversi length menggunakan `V_C_FEET_INTER_BOPET` (3.28) dan width `V_C_INCH_INTER` (0.0395).
  - Format tampilan: `V_INCH " ( V_MILI mm )`, `V_FEET feet ( V_METERS meters )`, `V_LBS lbs ( V_KGS kgs )`.
  - Untuk L001-L005, L011, L012, G001 → gunakan template Laminator (menggunakan langsung V_L1/V_L2/V_W1 dari SO text).
  - L012 tambahan menampilkan thickness dalam format `MIC + GAUGE`.

### 5.6. Bab: Label Old — PrimaPack (`PERFORM PRIMA_TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_PRIMA`.
- **Kode Label**: **A009** (PrimaPack).
- **Karakteristik Khusus**:
  - Tidak menampilkan splice.
  - Roll No format: `[V_CHARG]-[Derivative+Position]`.
  - Text 1: `[Thickness]micron x [Width]mm x [Length]Meters`.
  - Text 2: `[Core]" x [Treat] x [Weight]Kgs`.
  - Hard-code untuk 'BOPP Heatseal Clear'.

### 5.7. Bab: Label New — Sampoerna (`PERFORM SAMPOERNA_TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_PM`.
- **Kode Label**: **K100**, **K101**, **K102**, **K103** (K102/K103 khusus Asia Tembakau).
- **Karakteristik Khusus**:
  - Ambil Special Touch dari VBAP-CUOBJ via `MILL_SE_GET_CHAR_AND_VALUE`:
    - `ZZSPECIALTOUCH-1` → WOP Number.
    - `ZZSPECIALTOUCH-2` → Text info.
    - `ZZSPECIALTOUCH-3` → Wrapping Film descriptor.
  - `ZZBARC1` = `[VBELN][POSNR+1(5)]` (SO+Item sebagai batch number).
  - `ZZBCROLL` = `0000[STOUCH1][POSTDATE-DDMMYY]000000[VBELN][POSNR+1(5)]A`.
  - Untuk K102/K103: replace text `WRAPPING FILM` di template dengan `WA_STOUCH3`.

### 5.8. Bab: Label New — Philip Morris / PMI (`PERFORM PM_TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_PM`.
- **Kode Label**: **K110**, **K120**, **K130**, **K140**, **K150**, **K160**.
- **Karakteristik Khusus**:
  - Similar seperti Sampoerna namun `V_KDMAT` (VBAP-KDMAT) dari SO dipakai sebagai identifier.
  - Rolling No K130 di-concate tanpa separator (`SEPARATED BY SPACE` di-skip).
  - `ZZBARC1` (untuk K140/K150/K160): `[STOUCH1+4(6)][STOUCH1+13(2)][CHARG+3(7)]`.
  - Manufacturing Date format DD.MM.YYYY untuk K140/K150/K160, sisanya DD/MM/YYYY.
  - `ZZBCROLL`: `[KDMAT][POSTDATE-DDMMYY]037832[STOUCH1+4(6)][STOUCH1+13(2)][CHARG+3(7)]A`.

### 5.9. Bab: Label New — Inchi (`PERFORM INCHI_TEXT_DATA`)
- **Include**: `ZMMR_LABELROL_INCHI`.
- **Kode Label**: **A300**, **A301**, **A304**, **A305**, **A134**, **A137**, **A142**, **A145**, **J129**.
- **Karakteristik Khusus**:
  - Menggunakan SO Item Text (VBBP object Z001) untuk get L1/L2, W1/W2, N1/N2, T2 (dipetakan ke Gauge, Inch, Feet, Lbs untuk mostly Inchi format).
  - Untuk A137 & J129: Gunakan Special Touch-1 (film type), Special Touch-2 (width), Special Touch-3 (PO Ref).
  - Untuk A134/A142/A145: Ambil KDMAT sebagai Part Number.
  - Manufacturing Date: Format YYYY.MM (kecuali A113/E109 pakai DD/MM/YYYY).

### 5.10. Bab: Label New — A211 Series (`PERFORM F_A211`)
- **Include**: `ZLABEL_A211`.
- **Kode Label**: **A211**, **A212**, **A213**.
- **Karakteristik Khusus**:
  - Membaca SO Item Text prefix 'WC' untuk get Core Weight (`V_WCORE`).
  - Compute Gross Weight (GW Roll) = Core Weight + Roll Weight (`ZZCONVERSIONROLLKG`).
  - Output: `Core WT:` dan `GW Roll:`.
  - Concatenate Inside + Outside menjadi satu tag.

### 5.11. Bab: Label New — Standar Baru (`PERFORM NEW_TEXT_DATA` + `F_EXIT_LABEL`)
- **Include**: `ZMMR_LABELROL_STANDAR`.
- **Kode Label**: Semua New Label yang tidak masuk kategori diatas.
- **Karakteristik Khusus**:
  - Berbagai enhancement kondisional untuk tipe label spesifik seperti:
    - **A129, A302, A303, A306**: Get width dari SO text (`W2`).
    - **B211, B212, B222, D211, D212, D218**: Get feet dari SO text (`L2`).
    - **D218, B222**: Split Roll No menjadi 2 baris (`ZZROLL8`, `ZZROLL9`).
    - **A143**: Inner Core Label — Type/Thick/Width/Length/Weight.
    - **A147, A148, A172**: Inner Core Label + Special Touch-3.
    - **A171, SB17**: Inner Core Label + SO PO Ref (VBAK-BSTNK). *Enhance 11-13.03.2026 by Fiqih*.
    - **D113, B113**: Barcode Roll pakai `SNW_ROLL_BARCODE` (kondensasi).
    - **A214, A215, E201**: Add Part No dari VBAP-KDMAT.
    - **D201, D205, D206, D207, D208**: Tanpa `ZZEX`.
    - **D206, D207**: PO No + Part No dari Special Touch-1 & 2.
    - **D207**: Actual Length & Weight dari Special Touch-3 (`GET_ACTDATA`).
    - **A162, C126, D131, G104, G105**: Manuf & Expired Date muncul terpisah.
    - **D121**: Expired Date bervariasi berdasar `ZZTYPE` (mapping dari `ZMAP_LABEL-TEXT5`).
    - **G104**: Laminator Subcont Project — cetak No Lot per komponen dari ZBATCHISTORY, PO Customer, SKU. *Add Fany 16-May-2025*.
    - **G105**: Custom Stock CKI Laminator — `ZZNOMORROLL` sebagai Roll No, customer/SKU dari `ZZCUSTOMER`/`ZZSKU`.
    - **SE01-SE05 (SANYO EPac)**: Barcode-2 = No Roll condensed, Barcode-3 = LBS dari netweight.
    - **SB10**: Weight & LBS di-rounded via `CONVERSION_WEIGHT`.
    - **PMI-QR** (via `ZMAP_LABEL-TEXT2`): QR Code berisi Roll No, Type, Thick, Width, Length, Used Before. *Enhance Fiqih 16.07.2026*.
    - **J120/J121/A305/A308/J122/J123/A309/B215/B216/B223/D213/D214/D219**: Get `BSTKD_E` dari VBKD sebagai `ZZODR`.
    - **A172, A171, SB17**: Enhancement Fiqih untuk Manuf Date format DD.MM.YYYY (A172) dan display Inner Core dengan BSTNK.
- **`F_EXIT_LABEL`**: User-exit khusus untuk label dengan flag `TEXT1='CONVB64'` di `ZMAP_LABEL`. Menggantikan barcode B64 dengan versi de-convert.

---

## BAB 6. Rangkuman Alur DOS - File Output

```
        [karakteristik batch]                    [ZLABEL: DATA1, DATA2]
                │                                       │
                └───► PERFORM xxx_TEXT_DATA ────────► TEXT_DATA[] ────► DATA.DAX
                                                                           │
        [ZMAP_LABEL: TEXT2='PMI-QR'?]                                    ZPL/DAX
        [ZLABELMAPIMAGE (logo)]                                            │
                │                                                           ▼
                └───► IMG.TAX loaded ──► TEXT_DATA[]                    DATA.BAT
                                                                           │
                                                                           ▼
                                                              Zebra Printer (ZPL/APL-I)
```

---

## BAB 7. Kesimpulan & Insight untuk Simplifikasi
1. **Coupling tinggi ke `ZZLABEL`**: Semua percabangan hard-coded di `ZMMR_LABELROL`. Setiap penambahan label baru = tambah `IF/ELSEIF`.
2. **Duplikasi Logika**: Include `TOYOBO`, `TTE`, `TTA`, `PM`, `INCHI` memiliki flow yang sangat mirip. Berpotensi diabstraksikan menjadi 1 rutin generik.
3. **Mixed I/O**: Gabungan `GUI_DOWNLOAD` (ke PC lokal), `OPEN DATASET` (Application Server) dan `GUI_RUN` (batch cmd). Rentan bila di-migrate ke SAP GUI cloud/Fiori.
4. **Rekomendasi Simplifikasi**:
   - Migrasi ke Windows Smartforms/AdobeForms yang di-map lewat `ZMAP_LABEL-PROG_ROLL`.
   - Buat satu program cetak Smartforms generik dengan parameter kode label, thickness formula, & special-touch attribute.
   - Externalize hard-coded kode label ke customizing (mis. `ZMAP_LABEL-TEXT5` bisa dipakai untuk kategori label).
5. **Perlu Diperhatikan Saat Migrasi**:
   - Handling **RTP Core** (`ZCORER`) yang kompleks harus dipertahankan.
   - Special Touch handling (VBAP-CUOBJ via `MILL_SE_GET_CHAR_AND_VALUE`) untuk PM/Sampoerna/Inchi.
   - SO Item Text mapping untuk Interfilm.
   - Aturan Ganjil-Genap Bulan Toyobo.