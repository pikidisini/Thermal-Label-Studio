# Review Level 3 — B2B2O: Remediasi P1 & P2 Operator Local JSON Import, Konfigurasi Docker Fail-Closed & .env Git Protection

Status: **REMEDIATION_APPLIED**. Scope: working tree `codex/b2b2o-local-json-export-import`, belum commit/push/merge.

---

## 1. Temuan P1 yang Dikoreksi: Dual Intake Path Endpoint Impor JSON Operator

- **Isu**: Endpoint `POST /api/v1/simulation/operator/import-json` sebelumnya memiliki blok fallback `body = await request.body()` ketika `file is None`. Jalur ganda ini membuka celah penerimaan `application/json` atau body langsung tanpa validasi multipart form, melanggar batas arsitektural intake eksklusif form upload operator.
- **Koreksi**:
  1. Menghapus total fallback raw request body (`body = await request.body()`).
  2. Menjadikan unggahan berkas multipart (`file: UploadFile`) sebagai satu-satunya intake format yang diterima. Jika `file` tidak ada (termasuk request `application/json` atau raw body tanpa field `file`), endpoint langsung menolak fail-closed dengan `HTTP 400 Bad Request` dan pesan aman: `"Unggahan berkas multipart dengan field 'file' wajib disertakan."`.
  3. Filename dan path dari klien tidak pernah digunakan untuk penulisan/penyimpanan berkas server (hanya divalidasi ekstensinya `.json` dan dibaca langsung ke memory stream).
  4. Tidak menambah endpoint alternatif untuk raw JSON.

---

## 2. Temuan P2 yang Dikoreksi: Content-Length Header Check & Multipart Overhead

- **Isu**: Pemeriksaan awal header `Content-Length` membandingkan nilai header request langsung dengan `MAX_IMPORT_BYTES` (2 MiB). Pada request multipart/form-data, header `Content-Length` mencakup MIME boundary, header `Content-Disposition`, dan `Content-Type` (~200–500 byte overhead), sehingga berkas JSON valid yang berukuran isi tepat 2 MiB ditolak secara prematur sebelum sempat dibaca.
- **Koreksi**:
  1. Mempertahankan `MAX_IMPORT_BYTES = 2 * 1024 * 1024` (2 MiB) sebagai batas ketat ukuran **isi berkas**.
  2. Menetapkan batas toleransi overhead multipart terpisah:
     `MAX_IMPORT_MULTIPART_OVERHEAD_BYTES = 64 * 1024` (64 KiB)
     `MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_BYTES + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES`
  3. Pemeriksaan awal header `Content-Length` hanya menolak payload jika melebihi `MAX_IMPORT_REQUEST_BYTES`.
  4. Pembacaan stream chunk `UploadFile` (64 KiB) tetap menjadi penegakan batas final: jika akumulasi isi berkas melebihi `MAX_IMPORT_BYTES` (2 MiB), endpoint tetap menghasilkan fail-closed `HTTP 413 Content Too Large`.

---

## 3. Temuan P1 Docker Configuration, Runtime Fail-Closed & Perlindungan .env

- **Isu**:
  - Variabel lingkungan Safe Demo dan operator pilot sempat didefinisikan dengan default `true` serta memuat kata sandi di `docker-compose.yml`, melanggar prinsip fail-closed/default-off Safe Demo.
  - Risiko kebocoran berkas lingkungan `.env` lokal yang memuat kata sandi/token jika tidak diabaikan secara ketat oleh Git.
- **Koreksi**:
  1. Menghapus seluruh empat environment variable Safe Demo/operator (`SAP_SHADOW_SIMULATION_ENABLED`, `PILOT_OPERATOR_ENABLED`, `PILOT_OPERATOR_PASSWORD`, `SAFE_DEMO_MODE`) dari `docker-compose.yml`. File dikembalikan murni ke kondisi default production-ready tanpa kata sandi atau secret default.
  2. Memastikan baris `.env` terdaftar dan aktif di `.gitignore` root repositori (`web_app/.gitignore`).
  3. Mempertahankan `.env.example` tetap dapat di-track (`!.env*.example`) sebagai template panduan konfigurasi tanpa kata sandi atau token rahasia.
  4. Tidak membuat atau menyimpan file `.env` nyata berisi secret di working tree.
  5. Mempertahankan dependensi `reportlab>=4.0.0` pada `requirements.txt` dan `backend/requirements.txt` yang dibutuhkan oleh `PdfEvidenceService` untuk menghasilkan manifest cover & halaman bukti PDF simulasi.
  6. Menambahkan suite pengujian `TestDefaultRuntimeConfigurationFailClosed` yang membuktikan secara otomatis:
     - Runtime default tanpa env vars tetap Safe Demo OFF dan endpoint simulasi merespons 404 (disabled).
     - Static regression check membuktikan bahwa `.gitignore` memuat `.env`, `.env.*`, dan mengecualikan `!.env*.example`.

---

## 4. Bukti Pengujian Regresi Aktual

Jalur pengujian regresi telah diverifikasi pada [`backend/tests/test_pilot_operator_import_json.py`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/tests/test_pilot_operator_import_json.py):

| Kasus Uji | Skenario | Ekspektasi | Hasil Aktual |
| :--- | :--- | :---: | :---: |
| `test_missing_file_field_in_multipart_fails_closed_400` | Operator sah + CSRF sah, request form multipart tanpa field `file` | HTTP 400 Bad Request | **PASS** |
| `test_raw_json_body_without_file_fails_closed_400` | Operator sah + CSRF sah, payload `application/json` tanpa field `file` | HTTP 400 Bad Request | **PASS** |
| `test_raw_bytes_body_without_file_fails_closed_400` | Operator sah + CSRF sah, payload raw octet-stream tanpa field `file` | HTTP 400 Bad Request | **PASS** |
| `test_exact_2mib_file_accepted_without_multipart_overhead_rejection` | File JSON valid berukuran tepat 2 MiB (dengan trailing whitespace padding RFC 8259) | HTTP 202 Accepted | **PASS** |
| `test_file_exceeding_2mib_by_one_byte_fails_closed_413` | File dengan ukuran isi `MAX_IMPORT_BYTES + 1` byte | HTTP 413 Content Too Large | **PASS** |
| `test_payload_exceeding_2mib_fails_closed_413` | Upload file multipart raksasa | HTTP 413 Content Too Large | **PASS** |
| `test_successful_json_import_creates_batch_and_pdf` | Upload file multipart JSON valid (happy path) | HTTP 202 Accepted | **PASS** |
| `test_idempotent_replay_with_identical_payload_returns_200` | Replay multipart JSON dengan payload identik | HTTP 200 OK | **PASS** |
| `test_default_config_functions_fail_closed_without_env_vars` | Evaluasi fungsi konfigurasi tanpa env var | Seluruh mode `False`, secret `""` | **PASS** |
| `test_simulation_endpoints_fail_closed_when_simulation_disabled` | Request ke probe & import saat simulasi nonaktif | Status probe `disabled`, import ditolak 404 | **PASS** |
| `test_gitignore_strictly_ignores_dotenv_and_allows_example` | Static assertion verifikasi `.gitignore` memuat `.env` dan mengizinkan `.env.example` | Assertion lolos | **PASS** |

### Eksekusi Verifikasi Command:
```bash
git check-ignore -v .env
```
**Hasil**: `.gitignore:34:.env	.env` (Exit Code: 0).

```bash
python -m pytest backend/tests/test_pilot_operator_import_json.py -q -p no:cacheprovider
```
**Hasil**: `24 passed, 2 warnings in 41.44s` (Exit Code: 0).

```bash
git diff --check
```
**Hasil**: Bersih tanpa error whitespace (Exit Code: 0).

---

## 5. Batasan Lingkungan & Stop Gate

- **Aktivasi ABAP di SAP DEV (`ZMMR_LABEL_JSON.abap`)**: `NOT RUN` (source di `docs/tasks/B2B2O/abap/` adalah kandidat implementasi lokal yang harus diverifikasi syntax dan kesiapan function module-nya oleh tim SAP di SAP DEV).
- **UAT Ekspor Data Nyata dari SAP DEV**: `NOT RUN` (pengujian dilakukan dengan fixture sintetis; tidak ada data SAP nyata disimpan di repositori).
- **Akses Jaringan SAP / Printer Fisik**: `EXCLUDED BY CONTRACT` (zero socket/print calls).
- **Status Gate**: Tidak ada commit, push, PR, atau merge yang dilakukan. Working tree siap ditinjau ulang oleh reviewer.
