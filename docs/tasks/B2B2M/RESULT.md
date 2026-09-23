# Result — B2B2M: Safe Demo PDF Visual & Placeholder Hardening

## Ringkasan Eksekutif

- **Status**: `REMEDIATION_P1_P2_COMPLETED_AWAITING_REVIEW` (Koreksi P1 dan P2 selesai secara sempit; 17 test suite B2B2M dan 146 test regresi gabungan lulus 100%; berhenti sebelum `git add`, `commit`, `push`, `PR`, atau `merge` agar Codex Level 3 dapat melakukan review ulang).
- **Branch**: `codex/b2b2m-safe-demo-pdf-hardening` (dibentuk dari `origin/main` terbaru `3f8c8ba`, pasca merge B2B2L).
- **Executor Tunggal**: Gemini Flash via Antigravity. Reviewer akhir: Codex Level 3.
- **Koreksi Temuan Review P1 & P2**:
  1. **P1 — Nama Characteristic Splice SAP Legacy & Penundaan Feet Conversion**:
     - Mapping karakteristik splice pada `N001DevelopmentAdapter` diperbaiki agar membaca nama terbukti dari legacy ABAP `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON.abap` baris 391 & 398 (`ZZSPLICE-1` dan `ZZSPLICE-2`), serta varian `ZZSPLICE1` dan `ZZSPLICE2`.
     - Alias spekulatif tanpa dasar (`ZZSAMBUNGAN1`, `ZZSPLICE1_M`) dihapus seluruhnya.
     - Penurunan konversi feet (`splice_1_feet`, `splice_2_feet`) ditunda dari scope adapter (`None`) karena belum disetujui secara formal oleh PPIC; kebijakan field opsional merender token kosong `""` secara aman tanpa memalsukan konversi.
  2. **P2 — Pemisahan Field Wajib Inti vs Truly Optional pada Jalur Canonical**:
     - `KNOWN_OPTIONAL_CANONICAL_FIELDS` dipersempit secara ketat hanya mencakup 13 field yang benar-benar opsional (`so_item`, `splice_1_m`, `splice_1_feet`, `splice_2_m`, `splice_2_feet`, `treatment_inside`, `treatment_outside`, `core_inch`, `used_before`, `gross_weight`, `gross_weight_kg`, `material_desc`, `production_date`).
     - Field bisnis inti roll label (`brand`, `type_film`, `base_film`, `width_mm`, `length_m`, `net_weight_kg`) dipisahkan dan dipastikan **TIDAK** berada di dalam `KNOWN_OPTIONAL_CANONICAL_FIELDS`.
     - Ditambahkan penurunan unit imperial kanonikal deterministik (`width_inch`, `length_feet`, `weight_lbs`) jika nilai metrik tersedia.
     - Pengujian fail-closed jalur kanonikal langsung ditambahkan (`test_canonical_path_missing_required_core_fact_fails_closed` dan `test_canonical_path_with_complete_required_facts_succeeds`).
  3. **P2 — Bukti Visual & Inspeksi Raster Non-Occlusion Keempat Halaman**:
     - Ditambahkan pengujian inspeksi mendalam (`test_synthetic_batch_all_four_pages_deep_visual_inspection`) yang memeriksa seluruh 4 halaman dari eksekusi batch simulasi sintetis nyata:
       * Halaman 1 (Sampul Manifest): A4 portrait (595.28 x 841.89 pt), multi-zone separation >= 23pt, tabel manifest lengkap.
       * Halaman 2 s.d. 4 (Label Pages 1, 2, 3):
         - Ukuran fisik presisi 200x80 mm (~566.93 x ~226.77 pt).
         - Operator content stream diperiksa: **0** balok merah terisi (`re f` / `re f*`) yang menutupi layout (pita merah lama 14pt terbukti dieliminasi total).
         - Bingkai perimeter stroke tipis (`re S`) hadir tanpa background fill.
         - Tag margin atas kanan hadir pada area margin kosong tanpa opaque background.
         - Watermark diagonal translusen (`alpha=0.18`) hadir tanpa mengaburkan teks/barcode di bawahnya.
         - Tepat 1 embedded raster image per halaman label dengan resolusi 1600x640 px (203.2 DPI).
         - Pixel inspection membuktikan gambar memuat tinta/isi aktual (extrema 0-255, dark pixels present).

---

## File yang Diubah dan Ditambahkan

1. `backend/app/services/n001_rule_adapter.py`:
   - Membaca `splice_1_m` dan `splice_2_m` menggunakan nama terbukti ABAP legacy `ZZSPLICE-1` dan `ZZSPLICE-2` (serta `ZZSPLICE1`, `ZZSPLICE2`). Menghapus alias spekulatif.
   - Menunda kalkulasi `splice_1_feet` dan `splice_2_feet` (`None`).
   - Memperbarui `audit_meta` (`characteristics_used`, `raw_sources_mapped`, dan `derived_fields`).
2. `backend/app/services/sap_shadow_service.py`:
   - Mempersempit `KNOWN_OPTIONAL_CANONICAL_FIELDS` hanya untuk field yang benar-benar opsional (mengecualikan core roll facts: `brand`, `type_film`, `base_film`, `width_mm`, `length_m`, `net_weight_kg`).
   - Menambahkan auto-derivation field imperial (`width_inch`, `length_feet`, `weight_lbs`) pada jalur canonical jika input metrik tersedia.
3. `backend/app/services/pdf_evidence_service.py`:
   - Multi-zone cover banner (Zone 1: Eyebrow/Status pill, Zone 2: Title dengan auto-scaling, Zone 3: Subtitle).
   - Menghapus balok merah opak (`fill=1`) pada halaman label; menggantinya dengan bingkai perimeter (`stroke=1, fill=0`), tag margin kanan atas, dan watermark diagonal translusen (`alpha=0.18`).
   - Menghapus substitusi `material_desc` dengan `type_film`.
4. `backend/tests/test_sap_shadow_simulation.py`:
   - Melengkapi fixture `make_canonical_fixture_items` dengan fakta roll wajib (`brand`, `type_film`, `base_film`, `width_mm`, `length_m`).
5. `backend/tests/test_safe_demo_pdf_hardening.py` [NEW]:
   - 17 pengujian komprehensif memvalidasi seluruh AC 1 hingga AC 7, koreksi P1 splice names, pemisahan P2 core vs optional canonical fields, dan inspeksi visual non-occlusion 4 halaman.

---

## Pemetaan Acceptance Criteria (AC)

| Kriteria | Deskripsi Kontrak | Status | Bukti Pengujian Aktual |
| :--- | :--- | :---: | :--- |
| **AC 1** | Test reproduksi PDF sintetis membuktikan sampul tanpa overlap judul/status dan 3 halaman label sesuai urutan item. | `PASS` | `TestCoverBannerGeometry::test_cover_banner_zones_vertical_separation`<br>`TestCoverBannerGeometry::test_cover_banner_long_title_dynamic_scaling`<br>`TestCoverBannerGeometry::test_synthetic_batch_pdf_reproduction_pages_and_order` (4 halaman terverifikasi: Cover A4 + 3 Label 200x80mm). |
| **AC 2** | Inspeksi visual hasil render PDF membuktikan peringatan simulasi terbaca, tidak menutupi layout label, ukuran/orientasi fisik tidak berubah. | `PASS` | `TestVisualSafetyIndicators::test_pdf_evidence_service_uses_perimeter_frame_and_no_opaque_rect`<br>`TestVisualSafetyIndicators::test_synthetic_batch_all_four_pages_deep_visual_inspection`<br>Inspeksi raster PDF: 566.93x226.77 pt (~200x80mm), raster 1600x640 px (203.2 DPI), watermark diagonal translusen `alpha=0.18`, frame perimeter `fill=0, stroke=1`. |
| **AC 3** | Test integrasi memastikan field opsional dikenal yang kosong tidak tampil sebagai `{{so_item}}`, `{{splice_1_m}}`, dll.; tidak ada nilai SAP yang difabrikasi. | `PASS` | `TestKnownOptionalFieldsHandling::test_known_optional_canonical_fields_does_not_contain_core_business_facts`<br>`TestKnownOptionalFieldsHandling::test_normalize_canonical_populates_empty_strings_only_for_truly_optional_fields`<br>`TestKnownOptionalFieldsHandling::test_so_item_present_is_preserved_not_overwritten`<br>`TestKnownOptionalFieldsHandling::test_synthetic_simulation_renders_zero_raw_placeholders` (regex `\{\{.*?\}\}` menghasilkan 0 orphan). |
| **AC 4** | Token asing atau field wajib yang hilang gagal tertutup sebelum PDF dinyatakan sukses, dengan error publik/log tersanitasi. | `PASS` | `TestFailClosedBoundary::test_canonical_path_missing_required_core_fact_fails_closed`<br>`TestFailClosedBoundary::test_canonical_path_with_complete_required_facts_succeeds`<br>`TestFailClosedBoundary::test_unknown_token_in_svg_fails_closed`<br>`TestFailClosedBoundary::test_process_batch_with_orphan_token_fails_closed_zero_pdf`<br>`TestFailClosedBoundary::test_missing_required_raw_fact_fails_closed_in_adapter` (Status: `failed`, artifact: `None`, 0 PDF produced). |
| **AC 5** | Regression Safe Demo B2B2I/B2B2K/B2B2L tetap lulus; auth, no-physical-route, item order, replay, dan PDF evidence tidak mundur. | `PASS` | Seluruh regresi 146 tes lulus: `test_safe_demo_pdf_hardening.py` (17), `test_raw_sap_snapshot_v2.py` (68), `test_sap_shadow_simulation.py` (25), `test_profile_composition.py` (36). |
| **AC 6** | Template kanonikal tidak berubah; tidak ada akses SAP nyata, printer fisik, TCP 9100, Windows Spooler, database production, atau credential. | `PASS` | `TestCanonicalTemplateIntegrity::test_canonical_template_sha256_unmodified` (SHA-256: `4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577` identik). |
| **AC 7** | `RESULT.md` mencatat hasil aktual; `REVIEW.md` disiapkan untuk reviewer independen. | `PASS` | Dokumen `RESULT.md` diperbarui dengan bukti aktual P1/P2. |

---

## Log Verifikasi Command Aktual

### 1. Test Suite B2B2M (17 Pengujian)
```bash
python -m pytest backend/tests/test_safe_demo_pdf_hardening.py -v -p no:cacheprovider
```
**Hasil**: `17 passed, 2 warnings in 8.89s` (Exit Code: 0).

### 2. Regresi Gabungan Lengkap (146 Pengujian: B2B2M + B2B2K + B2B2I + B2B2L)
```bash
python -m pytest backend/tests/test_safe_demo_pdf_hardening.py backend/tests/test_raw_sap_snapshot_v2.py backend/tests/test_sap_shadow_simulation.py backend/tests/test_profile_composition.py -p no:cacheprovider
```
**Hasil**: `146 passed, 2 warnings in 60.84s` (Exit Code: 0).
- `test_safe_demo_pdf_hardening.py`: 17 passed
- `test_raw_sap_snapshot_v2.py`: 68 passed
- `test_sap_shadow_simulation.py`: 25 passed
- `test_profile_composition.py`: 36 passed

### 3. Pemeriksaan Invarian Template Kanonikal
```bash
python -c "import hashlib; from pathlib import Path; assert hashlib.sha256(Path('assets/templates/label_roll_80x200.svg').read_bytes()).hexdigest().upper() == '4D3C7B18A4B30B40C682F71736F2C4CF364C8CF2005FA35D555E65CF229B1577'"
```
**Hasil**: Match (Exit Code: 0).

### 4. Pemeriksaan Whitespace dan Formatting Git
```bash
git diff --check
```
**Hasil**: Clean, exit code 0.

---

## Bukti Inspeksi Visual PDF Evidence (AC 2 & P2)

Metode inspeksi mendalam pada batch simulasi sintetis nyata (`raw_sap_snapshot_v2_n001_synthetic.json`):
1. **Halaman 1 (Sampul Manifest)**:
   - Dimensi: 595.28 x 841.89 pt (A4 portrait).
   - Pemisahan 3 Zona Vertikal:
     * Zona 1: Category Eyebrow di `y = 815.89 pt`, Status badge pill di `x = 394.28 pt`, `y = 806.89 pt`, lebar 165 pt.
     * Zona 2: Judul dokumen di `y = 783.89 pt` (gap vertikal >= 23.0 pt dari badge).
     * Zona 3: Subtitle di `y = 763.89 pt`.
   - Jumlah embedded image: 0 (vektor murni).
   - Tabel manifest item: 3 baris item berurutan (Seq 1, 2, 3) beserta hash ringkasan data.
2. **Halaman 2 s.d. 4 (Label Pages 1, 2, 3)**:
   - Dimensi fisik: 566.93 x 226.77 pt (200.0 x 80.0 mm).
   - Operator Content Stream:
     * Balok merah terisi (`re f` / `re f*`): **0** (tereliminasi total).
     * Perimeter frame (`re S`): **1** perimeter stroke rectangle hadir di sekeliling margin label.
   - Text Layer:
     * Tag margin atas kanan: `"SIMULASI — BUKAN UNTUK CETAK FISIK  |  Item: <seq>/3  |  Batch: <id>"` berada di `y = 218.77 pt` tanpa background fill.
     * Watermark diagonal: translusen `alpha=0.18`, font Helvetica-Bold 24pt, rotasi 24 derajat, berada di titik tengah (283.46, 113.38 pt).
   - Embedded Raster Layer:
     * Format: RGB, dimensi exact 1600 x 640 px (203.2 DPI).
     * Extrema: `((0, 255), (0, 255), (0, 255))`.
     * Deteksi Tinta/Piksel Gelap (`has_dark_pixels`): `True` (memuat layout template SVG, teks, garis tabel, dan barcode/QR terinjeksi).
   - Validasi Placeholder: Regex `\{\{.*?\}\}` pada seluruh halaman mengekstrak 0 orphan tokens (`orphans=[]`).

---

## Batasan Lingkungan (Di Luar Scope)

- **Koneksi SAP Nyata (RFC, OData, SM59)**: `NOT RUN` (sink simulasi virtual offline).
- **Persetujuan Bisnis PPIC untuk Shelf-Life / Barcode Produksi N001**: `NOT RUN` (profile N001 tetap `DEVELOPMENT_SAFE_DEMO_ONLY`).
- **Printer Fisik / TCP 9100 / Windows Spooler**: `NOT RUN` (zero physical socket/spooler calls).
- **Database Produksi**: `NOT RUN` (seluruh pengujian menggunakan `tmp_path` terisolasi).
- **Frontend UI**: `NOT RUN` (perubahan terbatas pada backend render engine dan PDF service).

---

## Transparansi Teknis (Radical Transparency)

1. **Splice Name Mapping (P1)**: Legacy ABAP `ZMMR_LABEL_JSON.abap` secara eksplisit menggunakan tanda hubung `ZZSPLICE-1` dan `ZZSPLICE-2`. Tanpa tanda hubung, karakteristik tidak terpilih saat membaca dari SAP nyata/fixture yang mematuhi report lama. Adapter N001 kini mendukung kedua varian (`ZZSPLICE-1` dan `ZZSPLICE1`). Konversi feet ditunda (`None`) untuk mencegah fabrikasi unit sebelum disetujui PPIC.
2. **Canonical Optional vs Required Fields (P2)**: Jika fakta inti (`brand`, `type_film`, dll.) dibiarkan di dalam `KNOWN_OPTIONAL_CANONICAL_FIELDS`, request kanonikal yang tidak lengkap akan merender string kosong tanpa peringatan. Dengan membatasi list opsional strictly pada 13 atribut opsional dan menambahkan unit derivation imperial kanonikal, kontrak data tetap aman dan fail-closed via `validate_no_orphan_tokens`.
3. **Inspeksi Non-Occlusion (P2)**: Verifikasi visual dilakukan secara programatik melalui pembongkaran PDF content stream (memastikan tidak ada operator fill rectangle `re f`), pemeriksaan tag margin atas kanan dan watermark translusen, serta ekstraksi dan analisis piksel raster 1600x640 px yang membuktikan teks/barcode label tidak tertutup.

---

## Status Akhir & Kesiapan Review

Koreksi P1 dan P2 telah selesai, diuji, dan didokumentasikan. Seluruh perubahan berada di working tree branch `codex/b2b2m-safe-demo-pdf-hardening`. Sesuai instruksi, eksekutor **berhenti di sini sebelum git add, commit, push, PR, atau merge** untuk peninjauan ulang oleh Codex Level 3.
