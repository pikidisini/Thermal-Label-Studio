# Review Level 3 — B2B2N

Status: **NEEDS_FIX**. Reviewer: Codex. Scope: working tree `codex/b2b2n-self-service-safe-demo`, belum commit/merge. Review ini tidak menjalankan SAP DEV, printer, Docker, atau database.

## Temuan yang harus diperbaiki

1. **P1 — Sesi `HttpOnly` bocor ke JavaScript.** `backend/app/api/routes_sap_shadow.py` mengembalikan `session_id` pada JSON login (baris 366), walaupun ID yang sama dipasang dalam cookie `HttpOnly`. Endpoint juga menerima ID itu via `X-Pilot-Session-Token` (baris 102, 393). Akibatnya batas cookie `HttpOnly` tidak efektif; test bahkan mengharapkan ID dari JSON. Hapus `session_id` dari respons dan tipe frontend, autentikasi browser hanya lewat cookie, ubah test memakai cookie jar. Pertahankan CSRF token terpisah untuk logout.
2. **P1 — Sesi dapat aktif lewat HTTP non-loopback.** Cookie dipasang dengan `secure=False` (baris 361), sementara host backend default `0.0.0.0` (`backend/app/config.py`) dan tidak ada guard HTTPS/loopback pada login. Untuk data SAP DEV nyata, batasi mode HTTP hanya pada loopback development; untuk host intranet wajib HTTPS dan cookie `Secure`, atau fail closed. Uji kedua jalur tersebut. `CORS_ORIGINS` juga masih berisi `*` dengan `allow_credentials=True`; batasi origin operator secara eksplisit sebelum akses jaringan.
3. **P2 — UI belum menampilkan urutan item.** Acceptance criterion 3 meminta pengguna melihat `item_sequence`. Endpoint detail `/operator/batches/{batch_id}` sudah memberi `items` tersanitasi, tetapi modal hanya memanggil `listOperatorBatches()` dan menampilkan hitungan item. Tambahkan tampilan detail/urutan yang membaca API operator, dengan test UI/E2E untuk urutan serta failure state.
4. **P2 — Login belum dibatasi percobaannya.** `PilotSessionService.authenticate_and_create()` membandingkan satu password bersama tanpa rate limit/lockout. Sebelum mode pilot dibuka ke intranet, tambahkan pembatasan percobaan login yang fail-closed dan test beberapa principal/penolakan berulang.
5. **P3 — Bukti dan dokumentasi perlu dikoreksi.** `RESULT.md` mengklaim `SameSite=Strict` dan sliding TTL, sedangkan kode memakai `SameSite=Lax` dan expiry absolut. Dokumen juga memuat IP/topologi SAP DEV spesifik; redaksi detail internal sebelum commit ke repo publik. Jangan sebut AC1/AC3 `PASS` hingga temuan terkait diperbaiki.

## Bukti yang diverifikasi

- `python -m pytest backend/tests/test_pilot_operator_session.py -q -p no:cacheprovider`: **PASS, 20 passed**, 9 deprecation warnings. Test membuktikan perilaku saat ini, termasuk regresi keamanan yang ditandai di atas; jumlah test lulus bukan persetujuan desain.
- Inspeksi langsung route, service sesi, konfigurasi CORS, UI, tipe frontend, test, dan `RESULT.md`: temuan di atas terkonfirmasi.
- Klaim Gemini tentang suite backend/frontend, TypeScript/build, dan Playwright: tercatat di `RESULT.md`, **belum diverifikasi ulang** oleh reviewer pada putaran ini.
- Pengiriman nyata SAP DEV dan pemeriksaan manusia atas PDF: **BLOCKED/NOT RUN**; fixture sintetis/E2E mock bukan bukti UAT lapangan.

## Keputusan

Jangan commit, push, PR, merge, atau mengaktifkan mode pilot pada intranet dulu. Gemini sebagai satu-satunya writer runtime memperbaiki P1 dan P2, memperbarui `RESULT.md`, menjalankan gate relevan, lalu minta review ulang. Reviewer hanya menulis berkas ini. `output/` adalah artefak generated yang tidak boleh masuk checkpoint.

## Review ulang setelah koreksi Gemini — 2026-09-23

Status: **NEEDS_FIX (satu P1 tersisa)**. Poin 1, 3, 4, dan 5 di atas tampak telah dikoreksi: ID sesi tidak lagi ada di JSON, autentikasi operator cookie-only, CORS wildcard dihapus, urutan item tampil di modal, pembatasan login tersedia, dan detail internal SAP DEV direduksi dari `RESULT.md`. Ini bukan persetujuan untuk mengaktifkan mode intranet.

**P1 tersisa — `X-Forwarded-Proto` mentah dapat memalsukan HTTPS.** `evaluate_pilot_transport_security()` di `backend/app/api/routes_sap_shadow.py` menerima HTTPS bila `request.headers.get("x-forwarded-proto") == "https"`, tanpa membuktikan bahwa header ditulis proxy tepercaya. Test `test_transport_security_loopback_vs_intranet` justru mengirim request HTTP ke host intranet dengan header tersebut dan mengharapkan status 200. Klien yang dapat menjangkau backend HTTP langsung dapat mengirim header yang sama; password pilot lalu diterima melalui jalur HTTP tanpa TLS. Gunakan hanya scheme ASGI yang sudah ditetapkan oleh proxy middleware tepercaya, atau fail closed bila koneksi backend tidak diverifikasi HTTPS. Tambahkan test HTTP non-loopback + header spoof yang wajib ditolak, serta test HTTPS tepercaya yang diterima. Jangan menyebut AC keamanan `PASS` sebelum ini selesai.

Catatan non-blocking untuk pilot: `get_valid_session()` memperpanjang expiry server, tetapi cookie `Max-Age` hanya disetel ketika login; browser tetap dapat menghapus cookie pada batas awal. Jadi klaim "sliding TTL" end-to-end masih berlebihan kecuali cookie ikut diperbarui atau dokumentasi menyebut batas browser. Rate limit berdasarkan `request.client.host` juga dapat mengunci semua operator di belakang satu reverse proxy; dokumentasikan batas pilot dan konfigurasi proxy tepercaya.

Verifikasi independen putaran ini:

- Backend pilot: **PASS, 26 passed** (`python -m pytest backend/tests/test_pilot_operator_session.py -q -p no:cacheprovider`), 2 deprecation warnings.
- Frontend unit: **PASS, 66 passed** (`npm.cmd test`); percobaan sandbox awal `spawn EPERM`, rerun dengan izin proses lokal berhasil.
- TypeScript: **PASS** (`npm.cmd exec tsc -- --noEmit`).
- Build, Playwright, full backend: **NOT RUN** oleh reviewer putaran ini. Klaim Gemini ada di `RESULT.md`, belum diverifikasi ulang.
- SAP DEV live UAT/PDF diperiksa manusia: **BLOCKED/NOT RUN**. Tidak ada akses SAP, printer, Docker, atau database pada review ini.

Keputusan: Gemini memperbaiki P1 spoofed HTTPS saja, memperbarui test dan `RESULT.md`, lalu minta review ulang. Jangan commit/push/merge atau mengaktifkan mode operator pada intranet sebelum guard transport terbukti aman.

## Review akhir koreksi transport — 2026-09-23

Status: **READY_FOR_CHECKPOINT; LIVE_UAT_BLOCKED**. Temuan P1 terakhir telah ditutup pada kode: `evaluate_pilot_transport_security()` kini hanya membaca `request.url.scheme`, bukan header `X-Forwarded-Proto` mentah. Test mengirim request HTTP non-loopback dengan header spoof dan memverifikasi `403`; request dengan scheme HTTPS ASGI memverifikasi `200` dan cookie `Secure`. Koreksi cookie-only, CORS origin eksplisit, pembatasan login, serta tampilan urutan item dari putaran sebelumnya tetap ada.

Verifikasi independen: `python -m pytest backend/tests/test_pilot_operator_session.py -q -p no:cacheprovider` **PASS, 26 passed**, 2 warning dependency; `git diff --check` **PASS** (hanya warning line-ending). Frontend unit 66 passed dan TypeScript PASS diverifikasi pada review sebelumnya; tidak diulang setelah koreksi transport backend. Full backend, build, dan Playwright pada putaran ini **NOT RUN** oleh reviewer; hasil Gemini tercatat di `RESULT.md` dan harus tetap diverifikasi pada checkpoint bila ada perubahan tambahan.

Catatan deployment: scheme HTTPS pada ASGI hanya dapat dipercaya jika reverse proxy/ASGI server dikonfigurasi menerima forwarded headers **hanya dari proxy tepercaya** dan backend HTTP tidak terbuka langsung ke klien. Ini prasyarat IT, bukan bukti bahwa intranet SAP DEV sudah siap. Cookie expiry browser tetap dibatasi `Max-Age` awal meski expiry server bergeser; dokumentasikan sebagai batas pilot, bukan jaminan sliding session end-to-end.

Keputusan: Gemini boleh membuat safe checkpoint dengan staged diff yang diperiksa, tanpa `output/`, data SAP nyata, secret, atau generated report. **Belum boleh menyatakan UAT SAP DEV lulus atau mengaktifkan pilot di intranet** sebelum TLS, proxy, token mesin, akses jaringan, dan pemeriksaan PDF oleh manusia tersedia. PR/merge memerlukan review checkpoint dan instruksi pengguna berikutnya.
