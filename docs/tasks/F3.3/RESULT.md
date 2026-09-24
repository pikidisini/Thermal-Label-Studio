# Hasil Fase 3.3 — Login Aplikasi & Satu Sesi untuk Simulasi Label

Status: `REMEDIATION IMPLEMENTED & VERIFIED`. Siap untuk review ulang Level 3 Codex.
Branch: `codex/f3-3-app-login`.

---

## 1. Ringkasan Eksekutif & Remediasi Temuan Review Level 3

Fase 3.3 menyatukan otentikasi Thermal Label Studio menjadi satu sesi aplikasi terpadu berbasis peran (`PPIC` dan `IT`) dan telah menyelesaikan seluruh remedi temuan review Level 3 (`docs/tasks/F3.3/REVIEW.md`):

1. **P1 — Urutan React Hooks Terisolasi Penuh**:
   - Mengekstrak seluruh hooks studio, canvas, modal, shortcuts, dan template ke komponen terpisah [`frontend/src/components/studio/AuthenticatedStudio.tsx`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/src/components/studio/AuthenticatedStudio.tsx).
   - [`frontend/src/App.tsx`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/src/App.tsx) kini hanya memiliki hooks top-level (`useAuthStore` & `useEffect(checkAuth)`), merender loading spinner jika `isLoading`, `LoginPage` jika unauthenticated, dan `AuthenticatedStudio` setelah terautentikasi tanpa conditional early returns di atas deklarasi hook.
   - Ditambahkan pengujian komponen nyata [`frontend/tests/test_auth_flow.mjs`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/tests/test_auth_flow.mjs) dengan runner DOM mock [`frontend/tests/setup_dom_mock.mjs`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/tests/setup_dom_mock.mjs) untuk menguji transisi siklus penuh: `loading` → `unauthenticated (LoginPage)` → `authenticated PPIC` → `authenticated IT` → `logout` tanpa pelanggaran hook order.

2. **P1 — Decommissioning Total Password & Jalur Akses Operator Pilot Lama**:
   - `POST /api/v1/simulation/operator/login` dinonaktifkan permanen dan mengembalikan HTTP 404 fail-closed.
   - Dependensi `get_current_pilot_operator` dan intake guard `operator_import_guard.py` menolak cookie `pilot_session` legacy tanpa `app_session` dengan HTTP 401 fail-closed.
   - Variabel `PILOT_OPERATOR_ENABLED=true` dan `PILOT_OPERATOR_SECRET` dihapus dari [`ops/jenkins/deploy-local.sh`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/ops/jenkins/deploy-local.sh). Akses simulasi kini hanya dapat diakses melalui satu identitas akun aplikasi (`app_session` PPIC/IT).
   - Diuji dan diverifikasi pada `test_pilot_operator_session.py` (24 passed) dan `test_pilot_operator_import_json.py` (28 passed).

3. **P1 — Penegakan CSRF pada Seluruh Endpoint Mutasi Berbasis Cookie**:
   - Guard `Depends(verify_csrf_token)` dipasang pada seluruh endpoint mutasi (POST/DELETE):
     - `POST /api/v1/templates`, `DELETE /api/v1/templates/{id}`, `POST /api/v1/templates/upload`, `POST /api/v1/templates/parse-raw`
     - `POST /api/v1/render`, `POST /api/v1/render/preview`
     - `POST /api/v1/inspect/validate`
     - `POST /api/v1/safe-demo/run`, `POST /api/v1/safe-demo/reset`
     - `POST /api/v1/simulation/operator/logout`
   - Dibuat utilitas frontend [`frontend/src/utils/api/csrfHelper.ts`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/src/utils/api/csrfHelper.ts) dan diintegrasikan ke `templatesApi.ts`, `renderApi.ts`, `sapApi.ts`, dan `safeDemoApi.ts` dengan menyertakan header `X-CSRF-Token` dan `credentials: 'same-origin'`.
   - Endpoint read-only (GET) tetap bebas CSRF token dan autentikasi mesin SAP/Print Agent tetap terpisah.

4. **P2 — Konsistensi Pemeriksaan Transport Security**:
   - `evaluate_app_transport_security()` dipasang pada batas sesi browser [`get_current_user_optional`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/app/auth/dependencies.py). Request dengan cookie `app_session` yang mengakses plain HTTP intranet (non-loopback) ditolak dengan HTTP 403 Forbidden.
   - Header mentah `X-Forwarded-*` dari koneksi plain HTTP tidak dipercaya.

5. **P2 — Penghapusan Flag `--password` dari CLI**:
   - Argumen `--password` dihapus dari parser CLI [`backend/app/cli/user_admin.py`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/app/cli/user_admin.py) untuk mencegah password terekspos di riwayat shell / process list.
   - Input password diwajibkan melalui prompt interaktif/piped `getpass.getpass` dengan konfirmasi ulang. Penolakan flag `--password` diuji pada `test_user_admin_cli.py`.

6. **P2 — Safe Demo API Masuk Inventaris Guard Browser**:
   - `safe_demo_router` dilindungi dengan `Depends(get_current_user)`.
   - Endpoint mutasi `/safe-demo/run` dan `/safe-demo/reset` dilindungi dengan `Depends(verify_csrf_token)`.
   - Rute cetak fisik (`/api/v1/print/*`, `/api/v1/sap/print`) tetap dicegat 404 pada mode simulasi lokal.

### Remediasi Review Ulang Putaran 2 (Commit c07179c Follow-up):

1. **P1 — E2E Browser Playwright Mewakili Alur Login Baru & Setup Otomatis**:
   - Skrip E2E [`frontend/tests/e2e/pilot_operator_self_service.spec.js`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/tests/e2e/pilot_operator_self_service.spec.js) diperbarui total:
     - Menguji alur pengguna nyata: `LoginPage` unauthenticated → validasi penolakan password salah → login berhasil sebagai PPIC → transisi ke `AuthenticatedStudio` dengan topbar role badge `[PPIC]` dan username → buka modal Simulasi Label → verifikasi safety warning fail-closed & badge operator aktif → tabel batch & rincian urutan item (`#1`, `#2`) → tombol bukti PDF → unggah berkas JSON SAP lokal dengan verifikasi header `X-CSRF-Token` → kemunculan batch baru di tabel → logout global via `btn-app-logout` mengembalikan user ke `LoginPage`.
     - Dibuat [`backend/scripts/seed_e2e_users.py`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/scripts/seed_e2e_users.py) dan [`frontend/tests/e2e/global-setup.js`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/tests/e2e/global-setup.js) untuk bootstrapping akun E2E deterministik ke database terisolasi `backend/data/auth_e2e.db`.
     - [`frontend/playwright.config.js`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/playwright.config.js) dikonfigurasi dengan `globalSetup`, `AUTH_DB_PATH` terisolasi, dan setup project [`frontend/tests/e2e/auth.setup.js`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/frontend/tests/e2e/auth.setup.js) yang menyimpan authenticated `storageState` ke `frontend/.auth/user.json`.
     - Pengujian E2E aktual: `3 passed (28.1s)` pada `pilot_operator_self_service.spec.js` dan `5 passed (39.5s)` pada `sap_shadow_simulation.spec.js`. Zero socket / printer fisik dipanggil.

2. **P2 — Pelepasan Ketergantungan Credential Pilot Legacy di Jenkins**:
   - Blok `withCredentials([string(credentialsId: 'tls-pilot-operator-secret', ...)])` dihapus dari [`Jenkinsfile`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/Jenkinsfile) dan [`Jenkinsfile.rollback`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/Jenkinsfile.rollback).
   - Tahap deploy `ops/jenkins/deploy-local.sh` dieksekusi bersih tanpa secret legacy.
   - Dokumentasi [`docs/deployment/jenkins_local_simulation.md`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/docs/deployment/jenkins_local_simulation.md) diperbarui untuk menghapus persyaratan credential tersebut dan menjelaskan langkah bootstrap akun pasca-deploy via CLI interaktif.

3. **P2 — Transport Guard pada Probe Sesi `/operator/session`**:
   - Handler `get_pilot_operator_session_status` pada [`backend/app/api/routes_sap_shadow.py`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/app/api/routes_sap_shadow.py) diperbarui menggunakan `Depends(get_current_user_optional)`.
   - Request dengan cookie `app_session` yang mengakses plain HTTP intranet (non-loopback) ditolak seketika dengan `HTTP 403 Forbidden` sebelum mengembalikan status sesi atau token CSRF.
   - Ditambahkan pengujian `test_session_probe_authenticated_on_plain_http_intranet_fails_closed_403` pada [`backend/tests/test_pilot_operator_session.py`](file:///c:/Users/fiqih/Documents/0000_TRST/Cline/0009_JSON_SVG_LABEL/web_app/backend/tests/test_pilot_operator_session.py) (25 passed).

---

## 2. Inventaris Endpoint & Guard Matriks

| Endpoint | Metode | Guard Autentikasi | CSRF Guard | Transport Guard | Keterangan |
|---|---|---|---|---|---|
| `/health`, `/api/v1/health` | GET | Tanpa auth | - | - | Liveness & health probe |
| `/api/status` | GET | Tanpa auth | - | - | Status fitur |
| `/api/v1/simulation/status` | GET | Tanpa auth | - | - | Status sink simulasi |
| `/api/v1/auth/login` | POST | Publik Terbatas | - | Intranet HTTPS wajib (403 jika plain HTTP) | Rate limit 5 fail/5 min (429) |
| `/api/v1/auth/me` | GET | Cookie `app_session` | - | Intranet HTTPS wajib (403 jika plain HTTP) | User profile & CSRF token |
| `/api/v1/auth/csrf` | GET | Cookie `app_session` | - | Intranet HTTPS wajib (403 jika plain HTTP) | CSRF token provider |
| `/api/v1/auth/logout` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib (403 jika plain HTTP) | Revokasi sesi & clear cookie |
| `/api/v1/templates` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | List template |
| `/api/v1/templates` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Save template |
| `/api/v1/templates/{id}` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Detail template |
| `/api/v1/templates/{id}` | DELETE | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Hapus template kustom |
| `/api/v1/templates/upload` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Unggah template kustom |
| `/api/v1/templates/parse-raw` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Parse SVG string |
| `/api/v1/render` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Label render pipeline |
| `/api/v1/render/preview` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Live in-memory preview |
| `/api/v1/render/download/{job_id}/{fn}` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Download render artifact |
| `/api/v1/inspect/sample-contract` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Sample SAP Contract v1.1 |
| `/api/v1/inspect/validate` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Validasi contract vs SVG |
| `/api/v1/safe-demo/batch` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Batch fixture data demo |
| `/api/v1/safe-demo/status` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Status simulasi demo |
| `/api/v1/safe-demo/run` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Eksekusi simulator in-memory |
| `/api/v1/safe-demo/reset` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Reset fixture simulator |
| `/api/v1/simulation/operator/login` | POST | Decommissioned | - | - | Mengembalikan HTTP 404 |
| `/api/v1/simulation/operator/session` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Status sesi browser |
| `/api/v1/simulation/operator/batches` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | List batch simulasi SAP |
| `/api/v1/simulation/operator/batches/{id}` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Rincian batch simulasi SAP |
| `/api/v1/simulation/operator/batches/{id}/pdf` | GET | Cookie `app_session` | - | Intranet HTTPS wajib | Unduh berkas bukti PDF simulasi |
| `/api/v1/simulation/operator/import-json` | POST | Cookie `app_session` | `verify_csrf_token` | Intranet HTTPS wajib | Impor multipart JSON SAP |
| `/api/v1/simulation/sap-batches` | POST, GET | Token mesin | - | - | `X-SAP-Simulation-Token` |
| `/api/v1/simulation/raw-batches` | POST | Token mesin | - | - | `X-SAP-Simulation-Token` |
| `/api/v1/agent/*` | ALL | Token mesin | - | - | Local Print Agent token |
| `/api/v1/print/*`, `/api/v1/sap/print` | ALL | Rute Fisik Terblokir | - | - | HTTP 404 (`LOCAL_SIMULATION_ONLY=true`) |

---

## 3. Bukti Verifikasi Aktual

### Full Backend Pytest Suite
```
python -m pytest backend/tests -q
================ 480 passed, 21 skipped, 2 warnings in 277.50s (0:04:37) ================
```
- `backend/tests/test_auth_api.py`: 15 passed (CSRF mutation protection, intranet transport guard, session rejection, print block).
- `backend/tests/test_auth_service.py`: 18 passed (PBKDF2 hashing, lockout 5 fail/5 min, constant time compare).
- `backend/tests/test_user_admin_cli.py`: 7 passed (interactive getpass, rejection of `--password` flag, activation/deactivation).
- `backend/tests/test_safe_demo.py`: 9 passed (unauthenticated 401, missing CSRF 403, simulation zero sockets).
- `backend/tests/test_pilot_operator_session.py`: 24 passed (legacy login 404, legacy cookie 401, unified session PPIC/IT).
- `backend/tests/test_pilot_operator_import_json.py`: 28 passed (unified app_session, CSRF, transport, 2 MiB limit, idempotent replay).
- `backend/tests/test_routes_templates.py`, `test_routes_render.py`, `test_routes_inspect.py`: 21 passed.

### Frontend Test Suite (`npm test`)
```
npm.cmd test
✔ renderApi preview sends backend contract and returns Blob (1.1419ms)
✔ renderApi monochrome preview uses the same binary endpoint (0.4384ms)
✔ renderApi export sends one selected format and custom dimensions (1.6704ms)
✔ renderApi inspect sends JSON body and propagates non-2xx errors (1.1347ms)
✔ authApi.login sends credentials and returns LoginResponse (1.1704ms)
✔ authApi.login propagates 401, 403, and 429 errors (0.7235ms)
✔ authApi.logout sends X-CSRF-Token (0.2365ms)
✔ authApi.getCurrentSession returns SessionInfo or unauthenticated (0.208ms)
✔ useAuthStore login and logout workflow (0.4508ms)
▶ App Component Lifecycle: loading -> login -> authenticated studio -> logout
  ✔ 1. Initial loading state renders auth loading spinner (45.6738ms)
  ✔ 2. Unauthenticated state renders LoginPage (36.1168ms)
  ✔ 3. Authenticated PPIC state renders AuthenticatedStudio with user badge and logout button (32.8672ms)
  ✔ 4. Authenticated IT state renders AuthenticatedStudio with IT badge (10.8289ms)
  ✔ 5. Full Transition Lifecycle without React hook order error (18.0699ms)
✔ App Component Lifecycle: loading -> login -> authenticated studio -> logout (149.7939ms)
...
ℹ tests 85
ℹ suites 0
ℹ pass 85
ℹ fail 0
```

### Production Build (`npm run build`)
```
vite v6.4.3 building for production...
transforming...
✓ 1839 modules transformed.
rendering chunks...
dist/index.html                               1.66 kB │ gzip:  0.82 kB
dist/assets/index-q6_rBvCI.css               43.33 kB │ gzip:  8.09 kB
dist/assets/ThermalPreviewDeck-DNP3y2ZN.js    6.86 kB │ gzip:  1.92 kB
dist/assets/vendor-icons-B3O7YfLa.js         23.09 kB │ gzip:  6.55 kB
dist/assets/vendor-react-ce_Hlx9g.js        134.67 kB │ gzip: 43.22 kB
dist/assets/index-BkjwATtf.js               310.45 kB │ gzip: 79.48 kB
dist/assets/vendor-fabric-CXn53Had.js       310.49 kB │ gzip: 91.50 kB
✓ built in 28.98s
```

### Git Diff Whitespace Check
```
git diff --check
[Clean — 0 whitespace errors]
```

---

## 4. Instruksi Bootstrap Akun Operator

Untuk membuat akun pertama kali pada deployment lokal:
```bash
# Buat akun PPIC (kata sandi dimasukkan secara interaktif via prompt getpass aman)
docker exec -it tls-local-sim python -m app.cli.user_admin create-user --username operator_ppic --role PPIC

# Buat akun IT
docker exec -it tls-local-sim python -m app.cli.user_admin create-user --username admin_it --role IT

# Cek daftar pengguna aktif
docker exec -it tls-local-sim python -m app.cli.user_admin list-users
```
