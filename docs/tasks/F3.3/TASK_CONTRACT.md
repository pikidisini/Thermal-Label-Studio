# Fase 3.3 — Login aplikasi dan satu sesi untuk Simulasi Label

Status: `PLANNED`. Level 3 karena autentikasi, otorisasi, sesi, dan perubahan akses API.

Branch: `codex/f3-3-app-login`, dibuat dari `main` `98a5983`.

Executor setelah handoff: Gemini Flash 3.8 High (Antigravity), satu-satunya writer branch. Reviewer akhir: Codex Level 3.

Rancangan: `docs/architecture/application_authentication_plan.md`.

## Tujuan pengguna

PPIC atau IT masuk sekali melalui halaman login Thermal Label Studio. Setelah masuk, mereka dapat menggunakan studio dan Simulasi Label tanpa login operator pilot kedua. Kedua peran boleh memakai simulasi yang sama. Aplikasi tetap tidak mengirim label ke printer pada deployment lokal.

## Fakta awal yang wajib diverifikasi executor

- Studio React saat ini langsung muncul pada `frontend/src/App.tsx`; login operator berada di `SapShadowSimulationModal.tsx`.
- Endpoint browser simulasi memakai cookie `pilot_session`, CSRF, dan `pilot_session_service` di `routes_sap_shadow.py` serta `operator_import_guard.py`. Guard upload berjalan sebelum multipart diparsing; urutan ini harus dipertahankan.
- `ops/jenkins/deploy-local.sh` menyuntikkan `PILOT_OPERATOR_SECRET` dan hanya memublikasikan `127.0.0.1:8000`. `LOCAL_SIMULATION_ONLY=true` menutup rute cetak fisik.
- `backend/app/main.py` memasang router API serta aset SPA. Endpoint SAP/Print Agent memiliki autentikasi mesin sendiri. Jangan menggantinya dengan cookie browser.
- Periksa `git status`, diff, `origin/main`, seluruh route browser, dan kondisi Jenkins terbaru sebelum implementasi. Angka test lama bukan hasil fase ini.

## Scope implementasi

1. Buat halaman login aplikasi yang dapat diakses saat belum masuk, dengan state loading, salah kredensial, sesi kedaluwarsa, dan server gagal. Studio hanya tampil setelah status sesi terverifikasi. Tampilkan identitas pengguna dan aksi logout di UI.
2. Implementasikan akun per pengguna untuk pilot lokal, tanpa pendaftaran publik atau password default. Sediakan bootstrap/admin CLI satu kali yang aman untuk membuat akun IT dan PPIC; password diinput tanpa echo/log dan hanya hash yang disimpan. Persistensikan akun serta sesi di volume lokal, melalui repository yang mudah diganti pada deployment perusahaan. Jangan menghapus/menginisialisasi ulang data batch lama.
3. Gunakan satu sesi aplikasi server-side untuk endpoint browser. Kedua peran aktif `PPIC` dan `IT` boleh mengakses Simulasi Label: impor JSON, daftar dan detail batch, urutan item, PDF. Hapus form login dan logout operator pilot dari modal setelah endpoint tersebut memakai sesi aplikasi. Pertahankan CSRF, batas file dan streaming guard, rate limit, validasi JSON, audit, serta aturan fail-closed.
4. Buat inventaris endpoint dan klasifikasikan browser-sensitif, publik minimum, serta machine-to-machine. Terapkan otorisasi server-side pada endpoint browser yang sensitif, termasuk desain/template/render/export yang relevan; jangan hanya mengunci SPA. Jangan mengubah kontrak/token SAP atau Print Agent. Rute cetak fisik pada deployment lokal tetap 404; hak simulasi bukan hak cetak fisik.
5. Pastikan cookie dan pemeriksaan transport cocok untuk browser `http://127.0.0.1:8000` melalui Docker bridge, tetapi HTTP dengan host/IP LAN tetap ditolak. Jangan mempercayai `X-Forwarded-*` langsung dari klien. HTTPS menggunakan cookie Secure; HTTP loopback lokal menggunakan cookie yang dapat bekerja tanpa membuka akses jaringan.
6. Sesuaikan Jenkins dan panduan deployment agar bootstrap akun menggantikan ketergantungan login operator pilot. Image kandidat harus diperiksa aman sebelum aplikasi live diganti. Tidak ada secret dalam repo atau Console Output. Sediakan langkah upgrade dan rollback dari deployment sekarang, termasuk bagaimana sesi lama diperlakukan dan volume data dipertahankan.
7. Isi `RESULT.md` dengan diff, keputusan implementasi, inventaris endpoint, bukti test, migrasi/rollback, serta risiko. Reviewer mengisi `REVIEW.md`.

## Acceptance criteria

1. Browser tanpa sesi mendapat halaman login; request langsung ke endpoint browser sensitif ditolak server. Login PPIC dan IT yang valid membuka studio dan simulasi tanpa password tambahan.
2. Login salah, akun nonaktif, sesi hilang/kedaluwarsa, logout, dan pergantian password tidak memberi akses. Error login tidak membocorkan keberadaan akun atau secret; pembatasan percobaan terbukti lewat test.
3. Impor JSON tetap diperiksa **sebelum** body multipart di-spool: sesi, CSRF, transport, dan batas ukuran. Batch/detail/PDF tidak dapat dibaca anonim. Test menunjukkan PPIC dan IT dapat mengakses fungsi simulasi yang sama.
4. Password tidak tersimpan plaintext; token sesi tidak masuk JavaScript storage atau log. Cookie, CSRF, revocation, serta perlindungan transport diuji untuk localhost Docker, HTTP LAN, dan HTTPS.
5. Endpoint SAP dan Print Agent tetap menerima autentikasi mesin yang benar dan menolak akses yang tidak sah. `/health` tetap bekerja. Seluruh rute cetak fisik tetap tertutup pada deployment `LOCAL_SIMULATION_ONLY=true`.
6. Akun dan sesi yang masih valid bertahan sesuai kebijakan saat container restart; bootstrap tidak membuat akun default berpassword tetap, tidak menghapus volume data lama, dan upgrade/rollback pilot terdokumentasi serta diuji pada container/data disposable.
7. Backend targeted dan full regression, frontend unit/typecheck/build, E2E login/simulasi, serta Jenkins branch build lulus atau dicatat `NOT RUN`/`BLOCKED` dengan alasan aktual. `git diff --check` dan secret/generated artifact scan bersih.

## Batas dan stop gate

- Jangan membuat public signup, memakai password bersama sebagai desain akhir, atau menganggap alamat IP tersembunyi sebagai autentikasi.
- Jangan akses SAP PRD, printer fisik, TCP 9100, Windows Spooler, atau database perusahaan. Data SAP nyata tidak boleh masuk fixture, screenshot, log, atau Git.
- Jangan membuka port aplikasi ke jaringan kantor, mengaktifkan print transport, atau mengubah role menjadi hak cetak fisik.
- Jangan menghapus guard operator pilot sebelum pengganti berbasis sesi aplikasi terbukti bekerja pada seluruh route browser simulasi. Jika migrasi akun/volume atau credential memerlukan tindakan interaktif pengguna, siapkan langkahnya tanpa mengisi secret sendiri.
- Executor boleh commit dan push branch fitur setelah gate lulus, lalu berhenti sebelum PR/merge. Hanya satu writer branch; review Codex memakai hasil dan diff aktual.

## Cara kerja executor

Baca `AGENTS.md`, rancangan di atas, `docs/QUALITY_GATE.md`, dan kode terbaru. Tulis implementation plan ringkas di `RESULT.md`, implementasikan satu vertical slice, jalankan test yang relevan, lalu isi hasil aktual. Perbarui snapshot aktif `docs/AI_HANDOFF.md` dan dokumentasi arsitektur jika keputusan berubah. Jangan klaim production-ready dari keberhasilan pilot lokal.
