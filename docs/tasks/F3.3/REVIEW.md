# Review Fase 3.3 — Login aplikasi

Status: `CHANGES REQUIRED`. Review ulang Level 3 terhadap koreksi `7a45416`; jangan buat PR atau merge dahulu.

## Review ulang ketiga — commit `7a45416`

Temuan putaran kedua pada Jenkins dan probe sesi sudah tertutup secara inspeksi kode; `test_pilot_operator_session.py` lulus 25 test. Spec E2E lama sudah diubah menjadi alur login aplikasi. Namun, dua batas keselamatan pada harness E2E baru masih perlu diperbaiki:

1. **P1 — Server Playwright tidak memaksa simulasi-only.** `frontend/playwright.config.js` mengatur `SAFE_DEMO_MODE=true` dan `AUTH_DB_PATH`, tetapi tidak `LOCAL_SIMULATION_ONLY=true`. Default `backend/app/config.py` untuk variabel itu adalah `false`; middleware hanya menutup `/api/v1/print/*` bila variabel bernilai true. Jadi selama E2E berjalan, rute cetak fisik berpotensi terbuka di server test. Setel `LOCAL_SIMULATION_ONLY=true` secara eksplisit pada konfigurasi `webServer` backend dan tambahkan assertion E2E/preflight bahwa rute fisik memberi 404. Jangan menjalankan E2E lagi sebelum guard ini dipasang.
2. **P1 — Seeder E2E memiliki fallback ke database akun biasa.** `backend/scripts/seed_e2e_users.py:20–24` memilih `backend/data/auth.db` ketika `AUTH_DB_PATH` tidak ada, lalu membuat atau mereset akun dengan password test tetap (baris 28–44). Menjalankan skrip di luar Playwright tanpa env dapat mengubah akun pilot nyata. Hapus fallback tersebut: wajibkan path E2E eksplisit, tolak path `auth.db`/volume live atau target yang tidak dikenali, dan gagal sebelum membuka repository. Tambahkan regression test bahwa tanpa env atau dengan path live skrip exit non-zero tanpa mutasi data.

P2 untuk ketegasan E2E: `frontend/tests/e2e/auth.setup.js:13–24` hanya login jika halaman login kebetulan terlihat; jika tidak, ia tetap menyimpan `storageState` dan setup bisa lulus tanpa autentikasi. Jadikan tampilan login dan keberhasilan autentikasi assertion wajib, lalu pastikan cookie sesi tersedia sebelum menyimpan state.

Verifikasi reviewer putaran ketiga: `git fetch origin` PASS, status bersih pada `7a45416`, `git diff --check origin/main...HEAD` PASS, `test_pilot_operator_session.py` 25 PASS. Playwright **NOT RUN oleh reviewer** karena pengaman rute fisik belum diaktifkan pada webServer test; angka E2E di `RESULT.md` adalah laporan executor. Setelah dua P1 dan P2 di atas dikoreksi, jalankan E2E dalam mode simulasi-only, catat hasil, lalu minta review final. Jangan PR/merge terlebih dahulu.

---

## Riwayat review putaran kedua — commit `c07179c`

## Review ulang — commit `c07179c`

Tiga P1 putaran pertama tertutup secara inspeksi kode: `AuthenticatedStudio` memisahkan hooks dari gerbang login; endpoint simulasi dan upload guard hanya menerima `app_session`, sedangkan `/operator/login` memberi 404; POST/DELETE studio telah memakai guard CSRF. Transport sesi, CLI password interaktif, dan Safe Demo juga diperbaiki. Backend terarah `104 passed, 2 warnings`; frontend `85 passed`. Ini belum menggantikan E2E browser maupun build Jenkins.

Temuan yang masih perlu ditindaklanjuti:

1. **P1 — E2E lama pasti tidak mewakili alur baru dan quality gate belum lengkap.** `frontend/tests/e2e/pilot_operator_self_service.spec.js` masih menunggu `input-pilot-password`, menekan `btn-pilot-login`, dan menekan `btn-pilot-logout` (baris 178–233, 361–362). Komponen baru telah menghapus ketiganya. `playwright.config.js` juga tidak menyiapkan akun login aplikasi bagi browser E2E. Ganti spec lama dengan alur login aplikasi PPIC/IT → studio → Simulasi Label → impor/detail/PDF → logout; pastikan test tidak memakai printer fisik. Jalankan E2E yang relevan, atau laporkan blocker aktual dan jangan klaim AC 7 terpenuhi.
2. **P2 — Jenkins masih mensyaratkan secret pilot yang sudah dipensiunkan.** `Jenkinsfile:58–59` membungkus deploy dengan credential `tls-pilot-operator-secret`, padahal `ops/jenkins/deploy-local.sh` tidak lagi menggunakannya. Build/deploy tetap bergantung pada credential lama dan task meminta penggantian ketergantungan itu. Lepas wrapper credential tersebut; uji syntax/pipeline branch, dan dokumentasikan bootstrap akun setelah deploy.
3. **P2 — Probe sesi kompatibilitas melewati transport guard.** `routes_sap_shadow.py:394–405` pada `/operator/session` memvalidasi `app_session` dan mengembalikan `csrf_token` tanpa `evaluate_app_transport_security`/dependency sesi yang sudah diberi guard. Semua route browser lain menolak HTTP LAN. Terapkan pemeriksaan transport yang sama dan test HTTP LAN bersesi ditolak sebelum token CSRF dikembalikan.

Verifikasi reviewer putaran kedua: `git fetch origin` PASS; status branch bersih pada `c07179c`; `git diff --check origin/main...HEAD` PASS; backend terarah 104 PASS; `npm.cmd test` 85 PASS. Full backend, production build, Playwright, Jenkins runtime, dan deployment **NOT RUN oleh reviewer**. Angka full suite di `RESULT.md` merupakan laporan executor. Setelah koreksi di atas, ulang review final sebelum PR.

---

## Riwayat review putaran pertama — commit `9cfa3f6`

## Temuan yang wajib diperbaiki

1. **P1 — React hooks berubah urutan saat login.** `frontend/src/App.tsx` mengembalikan loading/login pada baris 117–130, tetapi masih memanggil `React.useEffect` dan `useCallback` mulai baris 134/150 di bawah return itu. Render pertama hanya memanggil sebagian hooks; render setelah autentikasi memanggil lebih banyak. Pindahkan semua hooks sebelum conditional return, atau pisahkan komponen `AuthenticatedStudio` yang baru dimount setelah login. Tambahkan test komponen yang benar-benar merender transisi loading → login → studio dan logout, bukan hanya test store/API.
2. **P1 — Password operator pilot lama tetap menjadi jalur akses simulasi.** `ops/jenkins/deploy-local.sh` masih mengaktifkan `PILOT_OPERATOR_ENABLED=true` (baris 26) dan meneruskan `PILOT_OPERATOR_SECRET` bila tersedia. `routes_sap_shadow.py` masih menyediakan `/operator/login` serta menerima `PilotOperatorSession` pada `get_current_pilot_operator` (baris 101–128). `operator_import_guard.py` juga menerimanya. Akibatnya, pemegang password bersama lama dapat mengakses batch/PDF/impor tanpa akun PPIC/IT, bertentangan dengan satu identitas browser. Lakukan migrasi terkontrol: bootstrap akun dahulu, lalu matikan/hapus penerimaan legacy pada route browser dan deployment baru; jangan mengandalkan hanya penghapusan form UI. Uji bahwa cookie dan login legacy tidak lagi membuka simulasi, termasuk jika secret lama masih ada di environment.
3. **P1 — Endpoint mutasi berbasis cookie tidak memeriksa CSRF.** Router `routes_templates.py`, `routes_render.py`, dan `routes_inspect.py` hanya memakai `Depends(get_current_user)` di tingkat router; POST/DELETE-nya tidak memakai `verify_csrf_token`. Ini tidak memenuhi rancangan F3.3 bahwa semua mutasi browser berkuki dilindungi CSRF. Tambahkan guard per metode mutasi, perbarui frontend untuk mengirim token, dan test permintaan bersesi tanpa/ber-CSRF salah ditolak. Pertahankan GET read-only serta autentikasi mesin SAP/Print Agent terpisah.

## Temuan lanjutan

- **P2 — Transport check belum konsisten.** `evaluate_app_transport_security()` hanya dipanggil pada login; dependency pembacaan sesi `/auth/me`, `/auth/csrf`, dan route browser lain tidak memeriksa HTTP LAN. Tambahkan pemeriksaan pada batas sesi browser agar syarat HTTPS intranet tidak hanya berlaku saat login. Uji request bersesi ke HTTP LAN ditolak; jangan percaya header `X-Forwarded-*` mentah.
- **P2 — CLI masih menerima `--password`.** `backend/app/cli/user_admin.py` menyediakan argumen ini pada create/reset walau prompt aman sudah ada. Password yang diberikan lewat argumen dapat masuk shell history/daftar proses. Hapus opsi tersebut dari alur operasional atau beri guard eksplisit; test bootstrap interaktif tanpa password di argv.
- **P2 — Safe Demo API belum masuk inventaris guard browser.** `routes_safe_demo.py` tidak memakai sesi aplikasi pada `/batch`, `/status`, `/run`, `/reset` ketika mode itu diaktifkan. Tentukan apakah semua route itu harus dilindungi; jika fitur ini tetap tersedia untuk pengguna studio, lindungi sesuai aturan login tunggal dan uji anonim ditolak. Jangan mengubah rute cetak fisik.

## Verifikasi review

- `git fetch origin`: PASS; branch `codex/f3-3-app-login` pada `9cfa3f6`, working tree awal bersih.
- Diff `origin/main...HEAD`: 37 file, dua commit termasuk task contract; cakupan backend, frontend, Jenkins, dokumen.
- Test backend terarah: `37 passed, 2 warnings` setelah izin temp Windows tersedia. Percobaan sandbox awal gagal saat setup dan bukan bukti kegagalan kode.
- `npm.cmd test`: `79 passed` setelah izin subprocess Node tersedia. Percobaan sandbox awal gagal `spawn EPERM` dan bukan bukti kegagalan kode.
- Full backend, build, E2E, Jenkins deployment, login browser nyata, dan uji migrasi volume: **NOT RUN oleh reviewer**. Hasil dalam `RESULT.md` adalah laporan executor, bukan verifikasi independen pada review ini.

## Arahan executor

Perbaiki temuan P1 dahulu pada branch yang sama. Tambahkan regression test yang membuktikan transisi UI, penolakan jalur pilot lama, dan CSRF pada mutasi studio. Evaluasi temuan P2 dan catat keputusan/hasil aktual di `RESULT.md`. Jalankan kembali quality gate relevan, commit/push branch, lalu minta review ulang. Jangan PR/merge atau mengakses printer/database perusahaan.
