# Hasil Fase 3.3 — Login Aplikasi & Satu Sesi untuk Simulasi Label

Status: `IMPLEMENTED & VERIFIED`. Siap untuk review Level 3 Codex.
Branch: `codex/f3-3-app-login` (dibangun dari `main` `98a5983`).

---

## 1. Ringkasan Eksekutif & Tujuan Pengguna

Fase 3.3 berhasil menyatukan pengalaman otentikasi Thermal Label Studio menjadi satu sesi aplikasi terpadu berbasis peran (`PPIC` dan `IT`).
1. Pengguna masuk satu kali melalui halaman login aplikasi (`LoginPage`).
2. Sesi server-side diterbitkan melalui cookie HttpOnly `app_session` (SameSite=lax, Secure di HTTPS, loopback allowed untuk local dev).
3. Setelah masuk, kedua peran `PPIC` dan `IT` dapat menggunakan seluruh fitur Studio dan **Simulasi Label** (unggah/impor snapshot JSON SAP mentah, pantau batch/item sequence, dan unduh PDF bukti) tanpa memerlukan login operator pilot kedua.
4. Form login dan tombol logout operator pilot di dalam modal simulasi telah dihapus; identitas pengguna dan aksi logout ditampilkan secara terpusat pada header aplikasi (`TopMenuBar`).
5. Seluruh endpoint browser sensitif dilindungi di sisi server (fail-closed dengan HTTP 401 saat belum terautentikasi); pengamanan tidak hanya mengandalkan kunci SPA.
6. Endpoint machine-to-machine (SAP shadow ingestion `X-SAP-Simulation-Token`, Print Agent token) tetap menggunakan otentikasi mesin masing-masing tanpa terpengaruh sesi browser.
7. Rute cetak fisik (`/api/v1/print/tcp`, `/api/v1/print/spooler`, `/api/v1/print/batch`, `/api/v1/sap/print`) tetap dicegat 404 pada deployment lokal (`LOCAL_SIMULATION_ONLY=true`).
8. Administrasi akun pilot lokal disediakan melalui CLI satu kali (`python -m app.cli.user_admin`) tanpa pendaftaran publik dan tanpa password default / hardcoded.

---

## 2. Inventaris & Klasifikasi Endpoint

| Endpoint | Metode | Klasifikasi | Skema Autentikasi & Guard | Keterangan |
|---|---|---|---|---|
| `/health`, `/api/v1/health` | GET | Publik Minimum | Tanpa autentikasi | Liveness & container health probe |
| `/api/status` | GET | Publik Minimum | Tanpa autentikasi | Status non-sensitif & ketersediaan fitur |
| `/api/v1/simulation/status` | GET | Publik Minimum | Tanpa autentikasi | Status kesiapan sink simulasi virtual |
| `/api/v1/auth/login` | POST | Publik Terbatas | Transport security + Rate limiter lockout | Penerbitan HttpOnly `app_session` cookie |
| `/api/v1/auth/me` | GET | Browser Sensitif | Cookie `app_session` (Depends `get_current_user`) | Probe identitas pengguna aktif & CSRF token |
| `/api/v1/auth/csrf` | GET | Browser Sensitif | Cookie `app_session` (Depends `get_current_user`) | Pengambilan CSRF token sesi aktif |
| `/api/v1/auth/logout` | POST | Browser Sensitif | Cookie `app_session` + Header `X-CSRF-Token` | Pencabutan sesi & penghapusan cookie |
| `/api/v1/templates` (all) | GET, POST, DELETE | Browser Sensitif | Cookie `app_session` (Depends `get_current_user`) | Manajemen template SVG label |
| `/api/v1/render` (all) | POST, GET | Browser Sensitif | Cookie `app_session` (Depends `get_current_user`) | Pipeline rendering rasterisasi & preview |
| `/api/v1/inspect` (all) | POST, GET | Browser Sensitif | Cookie `app_session` (Depends `get_current_user`) | Validasi data contract vs template |
| `/api/v1/simulation/batches` | GET | Browser Sensitif | Cookie `app_session` / `pilot_session` | Daftar batch simulasi (PPIC & IT) |
| `/api/v1/simulation/batches/{id}` | GET | Browser Sensitif | Cookie `app_session` / `pilot_session` | Detail batch & urutan item (PPIC & IT) |
| `/api/v1/simulation/batches/{id}/pdf` | GET | Browser Sensitif | Cookie `app_session` / `pilot_session` | Unduh berkas bukti PDF simulasi |
| `/api/v1/simulation/import-json` | POST | Browser Sensitif | Early Guard + Cookie + `X-CSRF-Token` | Impor multipart JSON SAP mentah (max 2 MiB) |
| `/api/v1/simulation/sap-batches` | POST, GET | Machine-to-Machine | Header `X-SAP-Simulation-Token` | Ingestion batch SAP DEV dari ERP |
| `/api/v1/simulation/raw-batches` | POST | Machine-to-Machine | Header `X-SAP-Simulation-Token` | Ingestion batch mentah SAP DEV dari ERP |
| `/api/v1/agent/*` | GET, POST | Machine-to-Machine | Agent Pairing & Polling Token | Local Print Agent polling |
| `/api/v1/print/*`, `/api/v1/sap/print` | ALL | Rute Fisik Terblokir | Intercepted 404 (`LOCAL_SIMULATION_ONLY=true`) | Hak simulasi bukan hak cetak fisik |

---

## 3. Keputusan Arsitektur & Keamanan

1. **Password Hashing OWASP-Compliant**:
   - Menggunakan PBKDF2-HMAC-SHA256 dengan 600.000 iterasi dan random salt kriptografis 16-byte (`backend/app/auth/security.py`).
   - Verifikasi kata sandi menggunakan `secrets.compare_digest` untuk mencegah timing attacks.
   - Waktu verifikasi konstan saat user tidak ditemukan melalui pra-komputasi dummy hash, mencegah serangan enumerasi pengguna berbasis respon waktu (*timing enumeration*).

2. **Perlindungan Brute-Force & Lockout**:
   - Pembatasan 5 kali kegagalan login berturut-turut memicu penguncian sementara akun/klien selama 300 detik (5 menit) dengan HTTP 429 Too Many Requests.
   - Pesan kegagalan login bersifat seragam (`detail: "Nama pengguna atau kata sandi tidak valid."`) tanpa mengungkap keberadaan username.

3. **Manajemen Sesi Server-Side & CSRF**:
   - Token sesi acak berukuran 32-byte (64 karakter hex kriptografis).
   - Di database `auth_sessions`, hanya SHA-256 hash dari token sesi yang disimpan (`session_hash`), sehingga kebocoran basis data tidak langsung mengekspos token sesi aktif.
   - Cookie `app_session` dikonfigurasi `HttpOnly`, `SameSite=lax`, `Path=/`, dan `Secure` aktif saat request ditransmisikan melalui protokol HTTPS.
   - Request mutasi browser (`logout`, `import-json`) mewajibkan header `X-CSRF-Token` yang divalidasi secara konstan (`secrets.compare_digest`).

4. **Isolasi Database & Pencegahan Destruksi Data Lama**:
   - Data akun dan sesi disimpan pada SQLite adapter mandiri (`backend/data/auth.db`) dengan WAL mode, foreign keys, dan busy timeout.
   - Basis data simulasi batch (`sap_shadow_simulation.db`) tetap utuh dan terpisah, tanpa migrasi destruktif pada data batch yang sudah ada.

5. **Transport Security Enforcer**:
   - Mengizinkan koneksi HTTP loopback lokal (`127.0.0.1`, `localhost`, `::1`, `testserver`, `testclient`) untuk kebutuhan pengembangan lokal dan testing.
   - Menolak koneksi plain HTTP jika Host/IP mengarah ke jaringan intranet/LAN (`HTTP 403 Forbidden`).

---

## 4. File-File yang Diubah dan Ditambahkan

### Backend
- `backend/app/auth/__init__.py`: Ekspor modul autentikasi.
- `backend/app/auth/models.py`: Model domain `Role` (PPIC, IT), `User`, `Session`, `LoginRequest`, `UserProfile`, `SessionInfo`.
- `backend/app/auth/security.py`: Kriptografi PBKDF2 600.000 iterasi, SHA-256 token hashing, token acak aman.
- `backend/app/auth/repository.py`: Interface `AuthRepository` & implementasi `SqliteAuthRepository`.
- `backend/app/auth/service.py`: `AuthService` dengan lockout 5 percobaan/5 menit, mitigasi timing attack, validasi & revokasi sesi, CSRF.
- `backend/app/auth/dependencies.py`: FastAPI dependencies `evaluate_app_transport_security`, `get_current_user`, `get_current_user_optional`, `require_role`, `verify_csrf_token`.
- `backend/app/api/routes_auth.py`: Router `/api/v1/auth` (`/login`, `/logout`, `/me`, `/csrf`).
- `backend/app/api/operator_import_guard.py`: Early multipart streaming guard yang mendukung `app_session` terpadu dan fail-closed physical print blocking.
- `backend/app/api/routes_sap_shadow.py`: Alias route `/batches`, `/batches/{batch_id}`, `/batches/{batch_id}/pdf`, `/import-json` dengan resolusi sesi ganda (`app_session` & `pilot_session`).
- `backend/app/api/routes_templates.py`: Diberikan guard `Depends(get_current_user)`.
- `backend/app/api/routes_render.py`: Diberikan guard `Depends(get_current_user)`.
- `backend/app/api/routes_inspect.py`: Diberikan guard `Depends(get_current_user)`.
- `backend/app/cli/user_admin.py`: CLI tool satu kali untuk `create-user`, `set-password`, `deactivate-user`, `activate-user`, `list-users`.
- `backend/tests/conftest.py`: Fixture terisolasi `test_auth.db`, seeded `test_ppic` & `test_it`, client otomatis terotentikasi, dan `unauthenticated_client`.
- `backend/tests/test_auth_service.py`: 18 tests untuk unit AuthService & SqliteAuthRepository.
- `backend/tests/test_auth_api.py`: 13 tests untuk Auth API, transport rejection, single-session simulation access, dan physical print guard.
- `backend/tests/test_user_admin_cli.py`: 6 tests untuk CLI user admin.
- `.gitignore`: Menambahkan `backend/data/*.db` dan `backend/data/*.sqlite*`.

### Frontend
- `frontend/src/types/auth.ts`: Tipe `UserRole`, `UserProfile`, `LoginResponse`, `SessionInfo`.
- `frontend/src/utils/api/authApi.ts`: HTTP API client untuk `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/csrf`.
- `frontend/src/store/useAuthStore.ts`: Zustand store pengelola status sesi aplikasi.
- `frontend/src/components/auth/LoginPage.tsx`: Halaman login aplikasi elegan, dark-theme, error handling lengkap.
- `frontend/src/App.tsx`: Gating aplikasi di balik pengecekan sesi dan `LoginPage`.
- `frontend/src/components/layout/TopMenuBar.tsx`: Badge peran & username di `BrandRow` dengan tombol Logout.
- `frontend/src/components/modals/SapShadowSimulationModal.tsx`: Menghapus form login operator pilot dan tombol logout lokal; langsung menampilkan dashboard batch list.
- `frontend/src/utils/api/sapShadowSimulationApi.ts`: Penggunaan `credentials: 'same-origin'`.
- `frontend/tests/test_auth.mjs`: Unit tests untuk `authApi` dan `useAuthStore`.
- `frontend/package.json`: Memasukkan `tests/test_auth.mjs` ke skrip `npm test`.

### Ops & Deployment
- `ops/jenkins/deploy-local.sh`: Mendukung deployment tanpa secret wajib; verifikasi keamanan kandidat memeriksa `/api/v1/auth/me` fail-closed (401), verifikasi CLI `user_admin --help`, dan dokumentasi bootstrap akun.

---

## 5. Bukti Test Aktual

### Backend Suite (Targeted & Full Regression)
```
Targeted Auth Tests (37 items):
backend\tests\test_auth_service.py ..................                    [ 48%]
backend\tests\test_auth_api.py .............                             [ 83%]
backend\tests\test_user_admin_cli.py ......                              [100%]
======================= 37 passed, 2 warnings in 26.43s =======================

Full Backend Regression Suite (498 items):
backend\tests\test_auth_api.py .............                             [  2%]
backend\tests\test_auth_service.py ..................                    [  6%]
...
backend\tests\test_user_admin_cli.py ......                              [100%]
=========== 477 passed, 21 skipped, 2 warnings in 215.26s (0:03:35) ===========
```

### Frontend Suite & Build
```
npm test:
✔ renderApi preview sends backend contract and returns Blob (1.2412ms)
✔ renderApi monochrome preview uses the same binary endpoint (0.4146ms)
✔ renderApi export sends one selected format and custom dimensions (1.576ms)
✔ renderApi inspect sends JSON body and propagates non-2xx errors (0.7247ms)
✔ authApi.login sends credentials and returns LoginResponse (1.1654ms)
✔ authApi.login propagates 401, 403, and 429 errors (0.6666ms)
✔ authApi.logout sends X-CSRF-Token (0.3742ms)
✔ authApi.getCurrentSession returns SessionInfo or unauthenticated (0.4056ms)
✔ useAuthStore login and logout workflow (0.9067ms)
...
ℹ tests 79
ℹ suites 0
ℹ pass 79
ℹ fail 0
ℹ duration_ms 607.2149

npm run build:
✓ 1837 modules transformed.
dist/index.html                               1.66 kB │ gzip:  0.82 kB
dist/assets/index-q6_rBvCI.css               43.33 kB │ gzip:  8.09 kB
dist/assets/ThermalPreviewDeck-BIniXdG2.js    6.86 kB │ gzip:  1.93 kB
dist/assets/vendor-icons-8WaO-z2v.js         23.09 kB │ gzip:  6.55 kB
dist/assets/vendor-react-CQt4-Az3.js        134.67 kB │ gzip: 43.22 kB
dist/assets/index-TYc26PMh.js               309.87 kB │ gzip: 79.02 kB
dist/assets/vendor-fabric-RHFYdypW.js       310.49 kB │ gzip: 91.50 kB
✓ built in 9.86s
```

---

## 6. Prosedur Bootstrap, Upgrade, & Rollback

### Prosedur Bootstrap Akun Pertama Kali (Deployment Lokal)
Jalankan perintah interaktif berikut pada container yang sedang berjalan untuk membuat akun PPIC dan IT:
```bash
# Membuat akun PPIC (kata sandi diinput interaktif tanpa echo di terminal)
docker exec -it tls-local-sim python -m app.cli.user_admin create-user --username operator_ppic --role PPIC

# Membuat akun IT
docker exec -it tls-local-sim python -m app.cli.user_admin create-user --username admin_it --role IT

# Memeriksa daftar akun aktif
docker exec -it tls-local-sim python -m app.cli.user_admin list-users
```

### Prosedur Upgrade dari Versi Sebelumnya
1. Image baru `tls-local-sim-candidate` diuji secara terisolasi tanpa memublikasikan port dan tanpa menimpa volume live.
2. Volume `tls-local-sim-data:/app/backend/data` tetap di-mount ke container live baru. Database batch lama `sap_shadow_simulation.db` tetap dipertahankan utuh.
3. Basis data identitas `auth.db` dibuat secara otomatis pada volume yang sama tanpa mengganggu tabel batch yang ada.
4. Buat akun pertama melalui CLI bootstrap di atas.

### Prosedur Rollback
Jika rollback diperlukan:
1. Skrip `deploy-local.sh` secara otomatis mempertahankan tag image lama `tls-local-sim:previous`.
2. Jika kandidat gagal dalam pemeriksaan kesehatan atau uji keamanan, deployment mengembalikan image lama secara otomatis.
3. Seluruh sesi lama di `auth.db` bersifat terisolasi; penghapusan atau pergantian container tidak merusak file batch kanonikal simulasi.

---

## 7. Risiko Tersisa & Batasan

1. **Pilot Lokal Bukan Enterprise SSO**:
   - Implementasi Fase 3.3 ditujukan untuk deployment pilot mandiri satu server/laptop lokal. Belum mencakup federasi SSO (LDAP / Active Directory / SAML / OIDC) atau MFA.
2. **Administrasi Akun Berbasis CLI**:
   - Pembuatan dan pengelolaan pengguna saat ini menggunakan CLI `user_admin` dari shell container untuk menjamin keamanan tanpa mengekspos public signup di UI. Manajemen user berbasis antarmuka grafis (admin panel) dapat dipertimbangkan pada fase lanjutan.
3. **Penyimpanan Sesi SQLite**:
   - Format penyimpanan sesi menggunakan SQLite yang sangat optimal untuk single-container deployment. Jika arsitektur horizontal (multiple multi-node workers) diterapkan di masa mendatang, `AuthRepository` dirancang dapat diganti dengan PostgreSQL/Redis backend tanpa mengubah business logic `AuthService`.
