# Result — B2B2L: Versioned Label Profile Composition for Safe Demo

## Ringkasan Eksekutif

- **Status**: `REMEDIATION_COMPLETED` (Semua temuan P1 dan P2 dari review independen Codex telah diperbaiki dan diverifikasi dengan tes baru; berhenti sebelum commit, push, dan PR agar Codex dapat me-review ulang).
- **Branch**: `codex/b2b2l-profile-composition-engine` (baseline `origin/main` commit `3984469`, starting commit `b090996`).
- **Executor**: Gemini Flash via Antigravity.
- **Tujuan Tercapai**: Seluruh temuan P1-1, P1-2, P1-3, P1-4, P2-1, dan P2-2 telah diperbaiki secara tuntas. Termasuk temuan re-review Codex: sanitasi nilai raw SAP dari pesan error HTTP publik, penegakan fail-closed pemilihan versi profile dari SAP yang tidak aktif/unpinned, serta inspeksi mendalam intermediate `rendered_svg` yang memverifikasi kecocokan geometri vektor lengkap `<path d="...">`, penolakan muatan berbeda yang memiliki jumlah bar identik (`WRONG-INSPECT-99`), rekonstruksi 211-bit Code128 dari subpath SVG, rekonstruksi 2D boolean matrix QR dari subpath SVG, dan verifikasi rasterisasi PDF evidence (1600x640 px pada 203.2 DPI). Suite pengujian B2B2L bertambah menjadi 36 tes, dan regresi gabungan 129 tes (B2B2I, B2B2K, B2B2L) lulus 100% tanpa error.

---

## File yang Diubah dan Ditambahkan pada Remediasi

1. `backend/app/models/profile_composition_v1.py`:
   - **P1-1**: Mengeluarkan `production_date_provenance` dan seluruh audit field dari `ALLOWED_BUSINESS_CONTEXT_FIELDS`. Menambahkan `"provenance"`, `"audit"`, `"source_metadata"` ke `FORBIDDEN_KEY_SUBSTRINGS`.
   - **P1-2**: Menetapkan `model_config = ConfigDict(extra="forbid", frozen=True)` pada seluruh model (`FieldFormatConfig`, `LiteralSegment`, `FieldSegment`, `ProfileElementConfig`, `LabelProfileConfig`, `ProfileCompositionResult`).
2. `backend/app/services/profile_composer.py`:
   - **P1-2**: Menambahkan proteksi konkurensi `threading.RLock()` pada `ProfileRegistry`.
   - **P1-2**: Mengisolasi penyimpanan dan retrieval profile dengan `copy.deepcopy` pada `register()`, `get()`, dan `list_profiles()`.
   - **P1-3**: Memperketat `validate_template_compatibility`:
     - Mencocokkan atribut XML yang diparse secara eksplisit (`barcode_fields`, `qr_fields`, `tokens`).
     - Menghapus pencocokan substring mentah (`raw_svg`).
     - Menolak slot barcode yang diarahkan ke slot QR, slot QR yang diarahkan ke slot barcode, dan slot teks yang diarahkan ke slot kode.
     - Memvalidasi slot kode yang didukung oleh kontrak renderer (`batch_barcode`, `roll_barcode`, `material_barcode`, `qr_payload`).
   - **P1-4 / Round 2 P1**: Memperketat `apply_field_formatting`:
     - Mem-parsing numerik dengan `Decimal` dan pembulatan `ROUND_HALF_UP`.
     - Memvalidasi `d.is_finite()` fail-closed.
     - Menolak string campuran (`"12kg34"`), teks non-angka (`"not-a-number"`), dan nilai non-finite (`NaN`, `Infinity`) dengan `ProfileCompositionError`.
     - **Sanitasi Error Message (Round 2 P1)**: Menghapus interpolasi nilai mentah (`val_str`) dan karakter non-ASCII dari exception message agar data raw SAP tidak pernah bocor ke error HTTP 400 publik.
   - **P2-1 / Round 2 P2**: Menambahkan dukungan kebijakan versi aktif server-side (`set_active_version`, `get_active_version`) pada `ProfileRegistry`.
3. `backend/app/services/n001_rule_adapter.py`:
   - **P1-3**: Menggabungkan hasil komposisi teks (`comp_result.fields`) ke dalam `SapCanonicalFields` sehingga teks konfigurasi (`batch_text`, dll.) aktif dan mengalir ke renderer.
   - **Round 2 P1**: Menghapus interpolasi nilai mentah pada error parsing numerik adapter (`width_mm`, `length_m`, `net_weight_kg`).
4. `backend/app/services/sap_shadow_service.py`:
   - **P1-2**: Melepaskan panggilan `ProfileRegistry.clear_for_tests()` dari `SapShadowService.clear_for_tests()` agar reset service tidak memutasi state registry global.
   - **P2-1 / Round 2 P2**: Menerapkan kebijakan versi aplikasi (`ProfileRegistry.get_active_version`) secara fail-closed: menolak dengan HTTP 400 / `ValueError` bila payload SAP meminta `profile_version` yang berbeda dari versi aktif yang dipin oleh aplikasi.
   - **P2-2 / Round 2 P2**: Menyimpan `rendered_svg` pada status batch item `"completed"` untuk audit dan verifikasi pipeline inspeksi.
5. `backend/tests/test_profile_composition.py`:
   - Menambahkan 13 pengujian spesifik yang memverifikasi remedi P1-1, P1-2, P1-3, P1-4, P2-1, P2-2, sanitasi HTTP 400 error message, penolakan versi tidak aktif, dan inspeksi intermediate SVG (total 36 tes, semua PASS).

---

## Pemetaan Temuan Review Codex ke Verifikasi Aktual

| Kode Temuan | Deskripsi & Koreksi | Status | Pengujian / Bukti Aktual |
| :--- | :--- | :---: | :--- |
| **P1-1** | Provenance audit dikeluarkan dari allowlist field label; substring audit/provenance dilarang. | `PASS` | `test_p1_1_provenance_and_audit_fields_rejected_by_schema` |
| **P1-2** | Immutabilitas model Pydantic (`frozen=True`), thread-safe `ProfileRegistry` (`RLock`), snapshot `deepcopy`, dan dekopling service clear. | `PASS` | `test_p1_2_models_frozen_immutable`<br>`test_p1_2_registry_deep_copy_and_mutation_isolation`<br>`test_p1_2_registry_thread_safety`<br>`test_p1_2_isolated_service_clear_does_not_wipe_registry` |
| **P1-3** | Teks hasil komposisi N001 diterapkan ke `SapCanonicalFields`; validasi slot template ketat berbasis atribut dan tipe (tanpa substring SVG). | `PASS` | `test_p1_3_n001_composed_text_applied_to_canonical_fields`<br>`test_p1_3_strict_slot_validation_rejects_mismatched_element_types` |
| **P1-4** | Parsing angka ketat dengan `Decimal`, `ROUND_HALF_UP`, penolakan non-finite/huruf campuran fail-closed. | `PASS` | `test_p1_4_round_decimal_strict_parsing` |
| **Round 2 P1** | Sanitasi pesan error HTTP: nilai raw SAP tidak pernah dibocorkan melalui error response publik saat parsing gagal. | `PASS` | `test_p1_raw_sap_value_never_leaked_in_http_error` |
| **P2-1 / Round 2 P2** | Kepemilikan aplikasi atas versi profile: pinning versi aktif, penolakan mismatch batch/item dan penolakan versi SAP di luar versi aktif yang dipin. | `PASS` | `test_p2_1_batch_item_version_mismatch_fails_closed`<br>`test_p2_1_application_version_pinning`<br>`test_p2_reject_sap_requesting_inactive_profile_version` |
| **P2-2 / Round 2 P2** | Bukti inspeksi mendalam PDF evidence dan intermediate SVG: keberadaan composed text, kecocokan geometri path vektor lengkap Code128 & QR terhadap generator referensi, penolakan beda payload dengan jumlah bar identik (`WRONG-INSPECT-99`), rekonstruksi 211-bit Code128 dari SVG subpaths, rekonstruksi 2D boolean module matrix QR dari SVG subpaths, serta rasterisasi halaman PDF evidence (1600x640 px pada 203.2 DPI). | `PASS` | `test_p2_2_deep_evidence_composed_text_and_code_inspection` |

---

## Log Verifikasi Command Aktual

### 1. Test Suite B2B2L (36 Pengujian)
```bash
python -m pytest backend/tests/test_profile_composition.py -v -p no:cacheprovider
```
**Hasil**: `36 passed, 2 warnings in 5.33s` (Exit Code: 0).

### 2. Regresi Penuh (B2B2I + B2B2K + B2B2L — 129 Pengujian)
```bash
python -m pytest backend/tests/test_raw_sap_snapshot_v2.py backend/tests/test_sap_shadow_simulation.py backend/tests/test_profile_composition.py -v -p no:cacheprovider
```
**Hasil**: `129 passed, 2 warnings in 54.57s` (Exit Code: 0).
- `test_raw_sap_snapshot_v2.py`: 68 passed
- `test_sap_shadow_simulation.py`: 25 passed
- `test_profile_composition.py`: 36 passed

### 3. Pemeriksaan Whitespace dan Formatting Git
```bash
git diff --check
```
**Hasil**: Clean, exit code 0.

---

## Batasan Lingkungan (Di Luar Scope)

- **Koneksi SAP Nyata (RFC, OData, SM59, STRUST)**: `NOT RUN` (virtual simulation sink only).
- **Persetujuan PPIC untuk Format Produksi N001**: `NOT RUN` (profile tetap development-only).
- **Cetak Fisik / TCP 9100 / Windows Spooler**: `NOT RUN` (zero physical socket/spooler calls).
- **Database Production / Staging**: `NOT RUN` (seluruh tes terisolasi pada filesystem `tmp_path`).

---

## Transparansi Teknis (Radical Transparency)

Selama proses perbaikan, teridentifikasi dua hal teknis yang langsung ditangani:
1. **Subclass Exception Hierarchy di Python**: Pengecualian `ProfileCompositionError` mewarisi `ValueError`. Saat memvalidasi `d.is_finite()`, exception `ProfileCompositionError` awalnya sempat tertangkap oleh blok `except (InvalidOperation, ValueError, TypeError)` berikutnya. Hal ini diperbaiki dengan menambahkan `except ProfileCompositionError: raise` sebelum blok generik.
2. **Aturan Pembulatan Desimal**: Formatting desimal standar Python untuk string menggunakan banker's rounding (`ROUND_HALF_EVEN`), sedangkan pelabelan industri memerlukan `ROUND_HALF_UP` (misal `1500.25` menjadi `1500.3`). Implementasi disempurnakan dengan `d.quantize(exp, rounding=ROUND_HALF_UP)`.

---

## Status Akhir & Langkah Selanjutnya

Remediasi B2B2L telah tuntas diperbaiki dan tervalidasi 100%. Sesuai instruksi, perubahan berada di working tree branch `codex/b2b2l-profile-composition-engine` dan **berhenti sebelum commit, push, dan PR** agar Codex Level 3 dapat melakukan review independen ulang.
