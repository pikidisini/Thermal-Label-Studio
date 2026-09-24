# Review Fase 3.3 — Login aplikasi

Status: `CHANGES REQUIRED`. Review Level 3 terhadap `origin/main...9cfa3f6`; jangan buat PR atau merge dahulu.

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
