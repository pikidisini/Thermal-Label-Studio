# Result — B2B2N: Uji Mandiri Safe Demo dengan SAP DEV

## Ringkasan Eksekutif

- **Status**: `REMEDIATION_P1_P2_COMPLETED_AWAITING_REVIEW` (Perbaikan temuan P1, P2, dan P3 dari Review Level 3 selesai 100%; seluruh 26 automated unit/integration test operator, 172 test regresi backend, 66 unit test frontend, dan 3 Playwright E2E simulation test lulus; UAT live transmisi jaringan SAP DEV tetap dilaporkan `BLOCKED` secara transparan karena ketiadaan rute ingress HTTPS intranet / SM59 di workstation lokal).
- **Baseline**: `origin/main` commit `0f2cf82` (PR #24 merged).
- **Branch**: `codex/b2b2n-self-service-safe-demo`.
- **Penulis Tunggal**: Gemini Flash via Antigravity. Reviewer akhir: Codex Level 3.

---

## Perbaikan Temuan Review Level 3 (P1, P2, P3)

### 1. P1 — Sesi `HttpOnly` Tanpa Kebocoran ke JavaScript & Cookie-Only Auth
- **Penyebab Awal**: Endpoint `POST /simulation/operator/login` mengembalikan `session_id` pada payload JSON, dan dependensi otorisasi menerima header `X-Pilot-Session-Token`.
- **Perbaikan**:
  - Menghapus total `session_id` dari respons JSON `POST /simulation/operator/login` dan dari probe `GET /simulation/operator/session`.
  - Menghapus penerimaan header `X-Pilot-Session-Token` pada seluruh dependensi backend (`get_current_pilot_operator` dan `get_pilot_operator_session_status`). Autentikasi browser kini **strictly via HttpOnly cookie** (`pilot_session`).
  - Menghapus field `session_id` dari tipe TypeScript frontend (`PilotOperatorSessionStatus`, `PilotOperatorLoginResponse`).
  - Mengubah seluruh pengujian backend untuk memakai cookie jar `TestClient` dan menambahkan assertion eksplisit: `assert "session_id" not in data`.
  - Menambahkan test `test_header_session_token_rejected_fails_closed_401` yang membuktikan pengiriman token via header tanpa cookie ditolak `HTTP 401 Unauthorized`.
  - Mempertahankan token CSRF terpisah (`X-CSRF-Token`) untuk memvalidasi aksi mutasi (logout).

### 2. P1 — Guard HTTPS / Loopback, Penolakan Spoofing `X-Forwarded-Proto`, & Pengetatan CORS
- **Penyebab Awal**: Cookie sebelumnya disetel `secure=False` tanpa memeriksa apakah koneksi berasal dari loopback development atau intranet publik. Selain itu, `CORS_ORIGINS` memuat wildcard `"*"` bersama `allow_credentials=True`. Pada evaluasi review lanjutan, ditemukan bahwa `evaluate_pilot_transport_security()` menerima header mentah `X-Forwarded-Proto: https` dari klien tak tepercaya, sehingga klien pada plain HTTP intranet dapat memalsukan header untuk melewati guard TLS.
- **Perbaikan**:
  - Menghapus wildcard `"*"` dari `CORS_ORIGINS` di `backend/app/config.py`. CORS default kini strictly terbatas pada origin eksplisit (`http://localhost:3000`, `http://localhost:5173`, `http://localhost:8080`, `http://127.0.0.1:3000`, `http://127.0.0.1:5173`, `http://127.0.0.1:8080`), dengan dukungan konfigurasi melalui environment variable tanpa wildcard.
  - Mengeliminasi kepercayaan buta terhadap `X-Forwarded-Proto` mentah: fungsi evaluator `evaluate_pilot_transport_security(request)` di `backend/app/api/routes_sap_shadow.py` kini **strictly hanya mempercayai scheme ASGI resmi** (`request.url.scheme == "https"`), yang telah divalidasi oleh native TLS atau trusted proxy middleware ASGI. Header mentah dari klien plain HTTP tidak lagi dipercaya.
  - Menolak login operator melalui plain HTTP pada host non-loopback / intranet dengan respons `HTTP 403 Forbidden` (*"Akses operator pilot melalui jaringan intranet wajib menggunakan HTTPS."*).
  - Percobaan pemalsuan header (`X-Forwarded-Proto: https`) melalui koneksi plain HTTP dari klien non-loopback / intranet secara tegas **DITOLAK dengan status `HTTP 403 Forbidden`** (fail-closed).
  - Mengizinkan plain HTTP hanya pada loopback development (`localhost`, `127.0.0.1`, `::1`, `testserver`) dengan cookie `secure=False`.
  - Pada koneksi verified HTTPS (`request.url.scheme == "https"`), cookie otomatis disetel dengan `secure=True`, `samesite="strict"`, dan `httponly=True`.
  - Memperbarui test `test_transport_security_loopback_vs_intranet` untuk menguji secara ketat 4 jalur: (1) Loopback HTTP dev (200 OK, cookie tanpa `secure`), (2) Plain HTTP non-loopback intranet (403 Forbidden), (3) Plain HTTP non-loopback dengan spoofed `X-Forwarded-Proto: https` (WAJIB 403 Forbidden), dan (4) Verified HTTPS intranet (200 OK, cookie dengan `secure=True`, `samesite="strict"`).
- **Catatan Non-blocking untuk Mode Pilot**:
  - *Batas Browser Cookie Max-Age vs Sliding TTL*: Fungsi `get_valid_session()` memperpanjang masa berlaku sesi di server memory setiap kali diakses (server-side sliding TTL). Namun atribut `Max-Age=3600` pada cookie peramban dipasang saat awal login; peramban klien dapat menghapus cookie lokal jika sesi melampaui `Max-Age` awal tanpa penyegaran cookie HTTP dari server. Untuk kebutuhan pilot uji coba terarah (durasi evaluasi interaktif operator per sesi < 1 jam), batas 1 jam ini memadai.
  - *Batas Rate-Limiting IP Klien di Balik Single Reverse Proxy*: Pelacakan percobaan login gagal menggunakan `request.client.host`. Pada konfigurasi jaringan intranet di mana semua peramban klien mengakses backend melalui satu reverse proxy bersama tanpa middleware trusted proxy ASGI Uvicorn, seluruh operator akan berbagi kuota IP yang sama. Untuk rilis intranet produksi multi-klien di masa mendatang, disarankan mengaktifkan trusted proxy middleware Uvicorn (`--proxy-headers` dengan `--forwarded-allow-ips`) agar IP asli klien diekstrak secara aman dari reverse proxy tepercaya.

### 3. P2 — Tampilan Urutan Item (Item Sequence) di UI
- **Penyebab Awal**: Modal UI hanya memanggil `listOperatorBatches()` dan menampilkan jumlah item agregat tanpa rincian urutan sekuensial.
- **Perbaikan**:
  - Menambahkan tombol interaktif **"Urutan Item"** (`data-testid="btn-toggle-items-<batch_id>"`) pada setiap baris batch di [`SapShadowSimulationModal.tsx`](file:///c:/Users/fiqih/Documents/0000_TRST\Cline\0009_JSON_SVG_LABEL\web_app\frontend\src\components\modals\SapShadowSimulationModal.tsx).
  - Mengambil data detail batch tersanitasi dari endpoint `GET /simulation/operator/batches/{batch_id}` via `sapShadowSimulationApi.getOperatorBatch(batchId)`.
  - Merender sub-panel rincian (`data-testid="panel-batch-items-detail"`) yang memuat tabel urutan item (`data-testid="table-batch-items"`):
    * Kolom: Urutan sekuensial (`#1`, `#2`, ...), Item ID tersanitasi, Template Version ID, Jumlah Salinan, dan Status Item (Badge Selesai / Gagal / Rendering).
    * Penanganan status kegagalan (failure state) secara aman: menampilkan alert kendala simulasi tanpa membocorkan trace eksepsi internal.
  - Menambahkan unit test di `frontend/tests/test_frontend.mjs` dan test E2E Playwright di `frontend/tests/e2e/pilot_operator_self_service.spec.js` yang membuka rincian item, memvalidasi `#1` dan `#2`, serta memastikan penutupan kembali sub-panel.

### 4. P2 — Pembatasan Percobaan Login (Rate-Limiting & Lockout)
- **Penyebab Awal**: `PilotSessionService.authenticate_and_create()` memvalidasi kata sandi tanpa pembatasan percobaan gagal.
- **Perbaikan**:
  - Mengimplementasikan rate limiter brute-force berbasis window sliding di `PilotSessionService`:
    * Maksimal 5 percobaan gagal berturut-turut per client IP (`MAX_FAILED_ATTEMPTS = 5`) dalam window 300 detik.
    * Percobaan ke-6 memicu penguncian sementara (lockout) selama 300 detik (`LOCKOUT_SECONDS = 300`).
    * Selama periode lockout, seluruh upaya login ditolak dengan `HTTP 429 Too Many Requests` (*"Terlalu banyak percobaan login gagal. Klien dikunci sementara selama X detik."*).
    * Percobaan dari client/IP lain tetap independen dan tidak terpengaruh.
    * Login yang berhasil langsung membersihkan riwayat kegagalan client.
  - Menambahkan unit test `test_rate_limit_lockout_unit` dan API route test `test_rate_limit_lockout_http_429`.

### 5. P3 — Sinkronisasi Bukti, Sliding TTL Sejati, dan Redaksi Data Sensitif
- **Penyebab Awal**: Klaim `SameSite=Strict` dan sliding TTL pada `RESULT.md` versi sebelumnya belum sepenuhnya sinkron dengan kode, serta memuat detail IP/topologi internal SAP DEV.
- **Perbaikan**:
  - Cookie resmi menggunakan `samesite="strict"`.
  - Menerapkan sliding TTL sejati pada `PilotSessionService.get_valid_session`: setiap kali sesi aktif diakses, `expires_at` diperpanjang secara otomatis hingga `TTL` penuh dari waktu aktivitas terbaru (`session.expires_at = current_time + timedelta(seconds=ttl)`).
  - Menambahkan unit test `test_sliding_ttl_extends_session` yang membuktikan perpanjangan `expires_at` saat sesi diakses.
  - Meradaksi seluruh detail IP internal dan host internal SAP DEV pada seluruh dokumentasi publik menjadi penanda aman: `[REDACTED_DEV_IP]` dan `[REDACTED_DEV_HOST]`.

---

## File yang Diubah dan Ditambahkan

1. `backend/app/config.py`:
   - Menghapus wildcard `"*"` dari `CORS_ORIGINS`.
   - Mengonfigurasi `DEFAULT_CORS_ORIGINS` eksplisit untuk loopback dev (`localhost` dan `127.0.0.1` pada port 3000, 5173, 8080).
2. `backend/app/services/pilot_session_service.py`:
   - Menerapkan sliding TTL sejati pada `get_valid_session`.
   - Menambahkan pelacakan kegagalan login per client identity, deteksi lockout 5 kali gagal, dan pengecekan durasi terkunci.
   - Membersihkan data lockout saat `clear_for_tests()`.
3. `backend/app/api/routes_sap_shadow.py`:
   - Menambahkan evaluator transport security: `evaluate_pilot_transport_security`.
   - Mengeliminasi kepercayaan buta terhadap `X-Forwarded-Proto` mentah dari klien tak tepercaya; verifikasi HTTPS strictly mengandalkan ASGI scheme `https`.
   - Menghapus penerimaan header `X-Pilot-Session-Token` dari seluruh rute operator (auth strictly via cookie `pilot_session`).
   - Menghapus `session_id` dari JSON respons login dan status sesi probe.
   - Menerapkan cookie `samesite="strict"`, sliding TTL max-age, dan `secure=is_secure_cookie`.
   - Menolak plain HTTP dan pemalsuan header HTTPS pada host intranet dengan `HTTP 403 Forbidden`.
   - Menangani `PermissionError` lockout dengan `HTTP 429 Too Many Requests`.
4. `backend/tests/test_pilot_operator_session.py`:
   - Mengembangkan suite pengujian dari 20 menjadi **26 pengujian komprehensif**.
   - Menambahkan test penolakan header session token, penolakan plain HTTP intranet (403), penolakan spoofed `X-Forwarded-Proto` (403), penerimaan verified HTTPS (200 + secure cookie), penguncian rate limit (429), sliding TTL, ketiadaan `session_id` di respons JSON, dan rincian urutan item detail (`items`).
5. `frontend/src/types/sapShadowSimulation.ts`:
   - Menghapus `session_id` dari `PilotOperatorLoginResponse`.
   - Menambahkan interface `PilotOperatorItemSummary` dan `PilotOperatorBatchDetail`.
6. `frontend/src/utils/api/sapShadowSimulationApi.ts`:
   - Memperbarui `loginOperator` untuk menangani status 429 (lockout) dan 403 (intranet HTTPS required).
   - Memperbarui `getOperatorBatch` dengan typed return `Promise<PilotOperatorBatchDetail>`.
7. `frontend/src/components/modals/SapShadowSimulationModal.tsx`:
   - Menambahkan state dan fungsi interaktif `handleToggleDetail(batchId)`.
   - Menambahkan tombol "Urutan Item" pada kolom aksi tabel batch.
   - Menambahkan sub-panel ekspansi tabel urutan item (`#1, #2...`) dengan detail ID item, template ID, salinan, dan status individual per-item, serta alert kendala simulasi.
   - Membungkus baris tabel dalam `React.Fragment`.
8. `frontend/tests/test_frontend.mjs`:
   - Memperbarui unit test login untuk memvalidasi ketiadaan `session_id`.
   - Menambahkan unit test `getOperatorBatch` yang memvalidasi parsing urutan item.
9. `frontend/tests/e2e/pilot_operator_self_service.spec.js`:
   - Memperbarui pengujian E2E Playwright: login cookie-only -> memuat tabel batch -> toggle tombol "Urutan Item" -> memverifikasi kehadiran tabel item sequence (`#1` dan `#2`) -> menutup kembali -> logout membersihkan sesi.

---

## Pemetaan Acceptance Criteria (AC)

| Kriteria | Deskripsi Kontrak | Status | Bukti Pengujian Aktual |
| :--- | :--- | :---: | :--- |
| **AC 1** | Browser tanpa sesi tidak bisa membaca daftar/status/PDF; token SAP mesin tidak berada di frontend bundle, storage browser, URL, atau response operator; `session_id` tidak bocor ke JS. | `PASS` | `test_anonymous_access_to_operator_batches_fails_closed_401`<br>`test_machine_sap_token_cannot_access_operator_endpoints_fails_closed_401`<br>`test_header_session_token_rejected_fails_closed_401`<br>`test_login_200_sets_httponly_cookie_without_leaking_session_id` (`assert "session_id" not in data`). |
| **AC 2** | Sesi operator pilot hanya dapat membaca data simulasi yang diizinkan; mutasi, raw snapshot sensitif, dan unduhan PDF memiliki otorisasi server-side; brute-force login di-lockout; sliding TTL aktif. | `PASS` | `test_authenticated_operator_can_list_batches_with_data_minimization`<br>`test_authenticated_operator_can_download_evidence_pdf`<br>`test_operator_logout_requires_csrf_and_revokes_session`<br>`test_operator_session_expiry_fails_closed`<br>`test_sliding_ttl_extends_session`<br>`test_rate_limit_lockout_http_429`<br>`test_transport_security_loopback_vs_intranet` (26 tes lulus). |
| **AC 3** | UI dapat menampilkan batch dan urutan item dari API nyata secara in-process/e2e, lalu membuka PDF B2B2M; empty/loading/failure state dapat dipahami pengguna awam. | `PASS` | `test_authenticated_operator_can_get_batch_detail_with_item_sequence`<br>`frontend/tests/e2e/pilot_operator_self_service.spec.js` lulus (10.8s). Sub-tabel urutan item menampilkan `#1, #2...`, status per-item, dan alert kegagalan yang aman. |
| **AC 4** | Endpoint SAP DEV machine-to-machine tetap menerima request valid dan menolak token salah/hilang, duplikasi yang tidak sah, serta input malformed tanpa jalur printer. | `PASS` | 172 test regresi backend lulus 100%: `test_raw_sap_snapshot_v2.py` (68 passed), `test_sap_shadow_simulation.py` (25 passed), `test_profile_composition.py` (36 passed), `test_safe_demo_pdf_hardening.py` (17 passed), `test_pilot_operator_session.py` (26 passed). |
| **AC 5** | Bila lingkungan SAP DEV siap, jalankan satu UAT nyata menggunakan label code N001 development-only dan data yang diizinkan... Bila belum siap, tandai live UAT BLOCKED dan jangan klaim selesai end-to-end. | `BLOCKED` | **Status Resmi: BLOCKED (Transparansi Radikal)**.<br>Workstation lokal (`127.0.0.1:8000`) belum terhubung ke jaringan intranet host SAP DEV (`[REDACTED_DEV_HOST]`) dan belum ada RFC Destination SM59 tipe G yang dikonfigurasi Basis. Tidak ada data sintetis yang difabrikasi sebagai klaim UAT lapangan nyata. Prasyarat teknis untuk tim IT/ABAP didokumentasikan di bawah. |
| **AC 6** | PDF tetap jelas bertanda simulasi; test dan inspeksi visual tidak menemukan placeholder mentah, overlap, atau pita yang menutupi konten. | `PASS` | `test_safe_demo_pdf_hardening.py` (17 passed). Dimensi 200x80 mm, watermark translusen alpha 0.18, perimeter frame `fill=0, stroke=1`, cover banner A4 multi-zone, 0 orphan placeholder `{{...}}`. |
| **AC 7** | Backend/frontend test terarah, TypeScript, build, dan E2E relevan lulus atau dilabeli NOT RUN/BLOCKED dengan alasan. Secret scan, git diff --check, dan pemeriksaan generated artifact dilakukan sebelum checkpoint. | `PASS` | 172 backend pytest lulus (65.70s), 66 frontend unit test lulus (643ms), `tsc --noEmit` bersih, Vite build berhasil (7.77s), 3 Playwright E2E simulation test lulus (27.4s), `git diff --check` bersih (exit code 0). |

---

## Log Verifikasi Command Aktual

### 1. Backend Pilot Operator Session Suite (26 Pengujian)
```bash
python -m pytest backend/tests/test_pilot_operator_session.py -v
```
**Hasil**: `26 passed, 2 warnings in 8.19s` (Exit Code: 0).

### 2. Regresi Penuh Backend (172 Pengujian: B2B2N + B2B2M + B2B2K + B2B2I + B2B2L)
```bash
python -m pytest backend/tests/test_pilot_operator_session.py backend/tests/test_safe_demo_pdf_hardening.py backend/tests/test_raw_sap_snapshot_v2.py backend/tests/test_sap_shadow_simulation.py backend/tests/test_profile_composition.py
```
**Hasil**: `172 passed, 2 warnings in 65.70s` (Exit Code: 0).
- `test_pilot_operator_session.py`: 26 passed
- `test_safe_demo_pdf_hardening.py`: 17 passed
- `test_raw_sap_snapshot_v2.py`: 68 passed
- `test_sap_shadow_simulation.py`: 25 passed
- `test_profile_composition.py`: 36 passed

### 3. Frontend Unit & API Integration Tests (66 Pengujian)
```bash
npm test
```
**Hasil**: `66 passed, 0 failed in 643ms` (Exit Code: 0).

### 4. Pemeriksaan Tipe TypeScript
```bash
npx tsc --noEmit
```
**Hasil**: Bersih tanpa error (Exit Code: 0).

### 5. Frontend Production Bundle Build
```bash
npm run build
```
**Hasil**: Berhasil (`✓ built in 7.77s`, Exit Code: 0).

### 6. Playwright End-to-End Simulation Tests (3 Pengujian)
```bash
npx playwright test tests/e2e/sap_shadow_simulation.spec.js tests/e2e/pilot_operator_self_service.spec.js
```
**Hasil**: `3 passed in 27.4s` (Exit Code: 0).
- Test 1 (B2B2N): Form login operator tampil, validasi password salah, login cookie-only sukses tanpa kebocoran session_id, tabel batch muncul, toggle rincian urutan item (`#1` dan `#2`) terverifikasi, tutup rincian, logout membersihkan sesi (8.4s).
- Test 2 (B2B2I): Tombol simulasi tersembunyi saat default-off (5.6s).
- Test 3 (B2B2I): Modal fail-closed saat simulasi aktif namun mode operator nonaktif (7.0s).

### 7. Pemeriksaan Whitespace dan Formatting Git
```bash
git diff --check
```
**Hasil**: Bersih tanpa whitespace issue (Exit Code: 0).

---

## Panduan Uji Mandiri Operator (Sudut Pandang Pengguna Awam)

Jika mode operator pilot diaktifkan untuk demonstrasi, pengguna/operator dapat melakukan uji mandiri sebagai berikut:

1. **Jalankan Aplikasi dalam Mode Pilot**:
   - Pastikan backend dijalankan dengan variabel lingkungan:
     ```env
     SAP_SHADOW_SIMULATION_ENABLED=true
     PILOT_OPERATOR_ENABLED=true
     PILOT_OPERATOR_PASSWORD=<KataSandiOperatorRahasia>
     SAP_SIMULATION_TOKEN=<TokenMesinSAP>
     ```
2. **Buka Layar Simulasi di Peramban**:
   - Buka aplikasi Thermal Label Studio di browser.
   - Klik tombol **"SAP Simulation"** pada bilah alat atas.
   - Peringatan keamanan akan muncul: *"SIMULASI — BUKAN UNTUK CETAK FISIK"*.
3. **Masuk sebagai Operator Pilot**:
   - Masukkan kata sandi operator pilot yang telah ditentukan pada kartu login.
   - Klik **"Masuk sebagai Operator"**. Sesi aman (cookie HttpOnly `SameSite=Strict`) akan dibuat secara otomatis.
4. **Kirim Data dari SAP DEV (atau Simulator ABAP)**:
   - Jalankan program cetak label di SAP DEV (misalnya tcode `ZLABEL` atau program report `ZMMR_LABEL_JSON`).
   - Program SAP DEV akan mengirimkan payload JSON ke endpoint `/api/v1/simulation/raw-batches`.
5. **Periksa Hasil Simulasi & Urutan Item**:
   - Tabel simulasi akan menampilkan batch baru, ID request, profil label (`N001`), jumlah item (misal `3/3`), dan status hijau **"Selesai"**.
   - Klik tombol **"Urutan Item"** untuk membuka panel rincian dan memeriksa urutan sekuensial label (`#1, #2, ...`) beserta status masing-masing.
   - Klik tombol **"Bukti PDF"** untuk mengunduh dan memeriksa berkas PDF simulasi.
   - Periksa halaman cover manifest dan halaman label ber-watermark. Perhatikan bahwa **tidak ada perintah cetak yang dikirim ke printer fisik manapun**.
6. **Keluar dari Sesi**:
   - Klik tombol **"Keluar"** di pojok kanan atas modal untuk mencabut sesi dan token CSRF.

---

## Prasyarat Konkret untuk IT / Basis / ABAP (Unblocking AC 5)

Tahap uji coba langsung dari server SAP DEV AIX (`[REDACTED_DEV_HOST]`) saat ini berstatus **BLOCKED**. Untuk mengaktifkan konektivitas jaringan end-to-end secara resmi dan aman, tim IT/Basis/ABAP perlu menyelesaikan prasyarat berikut:

1. **Rute Jaringan & Domain Intranet (Tim IT / Network)**:
   - Workstation/server backend harus memiliki IP intranet statis atau DNS lokal (misalnya `https://label-studio.dev.corp/`).
   - Port HTTPS (misalnya 443 atau 8443) harus dibuka pada firewall dari host SAP DEV (`[REDACTED_DEV_HOST]`) ke host Thermal Label Studio.
   - Pasang sertifikat TLS yang valid (internal CA atau sertifikat yang dipercaya oleh keystore SAP `STRUST`).
2. **Konfigurasi RFC HTTP Destination SM59 (Tim Basis SAP)**:
   - Buat Destination tipe `G` (HTTP Connection to External Server):
     * **RFC Destination**: `ZLABEL_STUDIO_SIM`
     * **Target Host**: IP atau hostname server Thermal Label Studio
     * **Service No. (Port)**: Port HTTPS tujuan (misal 443 / 8443)
     * **Path Prefix**: `/api/v1/simulation/raw-batches`
     * **Security / SSL**: Aktifkan SSL (`DFAULT` atau sertifikat SSL Client Anonymous / Standard).
3. **Konfigurasi Kredensial Mesin pada Program ABAP (Tim Pengembang ABAP)**:
   - Sertakan HTTP Header pada panggilan client HTTP SAP:
     * Header name: `X-SAP-Simulation-Token`
     * Header value: String rahasia yang identik dengan nilai `SAP_SIMULATION_TOKEN` di backend.
   - Format payload JSON wajib mematuhi skema **Raw SAP Snapshot v2**:
     * Header: `schema_version: "2.0"`, `producer_namespace: "SAP_DEV"`, `request_id`, `label_code: "N001"`.
     * Items: array item dengan urutan sekuensial eksplisit (`sequence_no: 1, 2, ...`).
4. **Batas Keamanan & Otorisasi Operasional**:
   - Uji coba wajib menggunakan profil label sementara `N001` (development-only).
   - Dilarang menghubungkan output simulasi ke printer produksi atau spooler fisik.

---

## Batasan Lingkungan (Di Luar Scope)

- **Koneksi Jaringan Fisik SAP DEV (Live SM59 Handshake)**: `BLOCKED` (memerlukan tindakan tim IT/Basis sesuai daftar prasyarat di atas).
- **Persetujuan Layout Final PPIC**: `NOT RUN` (di luar scope B2B2N; komposisi draft label PPIC dijadwalkan pada subfase berikutnya).
- **Integrasi SSO / OIDC / LDAP Perusahaan**: `NOT RUN` (mode operator pilot adalah mekanisme autentikasi sementara yang aman dan fail-closed untuk keperluan evaluasi mandiri; bukan SSO enterprise).
- **Akses Printer Fisik (Port 9100 / Spooler)**: `EXCLUDED BY CONTRACT` (zero physical socket calls).

---

## Status Akhir & Kesiapan Review

Seluruh temuan P1, P2, dan P3 telah diperbaiki tuntas, diuji, dan didokumentasikan. Perubahan tersimpan pada working tree branch `codex/b2b2n-self-service-safe-demo`. Sesuai instruksi, pengerjaan **berhenti di sini sebelum commit, push, PR, atau merge** untuk peninjauan ulang independen oleh Codex Level 3.
