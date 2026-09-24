# Review Fase F3.2 — Perbaikan Jenkins Container Safety Check

Status: `PASS — PR-ready` pada commit `e030c19`. Belum dibuat PR atau di-merge.

## Ruang lingkup

Review hanya mencakup perbaikan kegagalan Jenkins Build #11 dengan pesan:

```text
ModuleNotFoundError: No module named 'app'
```

Perubahan runtime hanya berada pada `ops/jenkins/deploy-local.sh`; dokumentasi hasil dan handoff turut diperbarui.

## Temuan dan verifikasi

1. Root cause benar: image menempatkan package pada `/app/backend/app`, sedangkan safety check menjalankan modul dari `/app` tanpa path backend.
2. Koreksi tepat sasaran: safety check sekarang menjalankan `env PYTHONPATH=/app/backend python -m app.cli.user_admin --help`.
3. Saya menjalankan smoke check pada image `tls-local-sim:bd0b78ee6c36` menggunakan container disposable `tls-jenkins-review`, tanpa publish port dan tanpa volume live. Perintah CLI berhasil dan menampilkan help; container uji kemudian dihapus.
4. `git diff --check origin/main...HEAD` PASS. Tidak ada source backend/frontend, Dockerfile, autentikasi, SAP, printer, atau database production yang diubah.

## Batas verifikasi

- Jenkins build ulang: `NOT RUN` dalam review ini; perlu dijalankan oleh pengguna melalui Jenkins.
- Bash syntax check: `NOT RUN` karena `bash.exe`/WSL Bash tidak tersedia pada shell review. Perintah yang berubah hanya satu baris dan berhasil diverifikasi melalui Docker smoke check.
- SAP, printer fisik, TCP 9100, Windows Spooler, dan database production: `NOT RUN`.

## Verdict

Perbaikan koheren dan layak dibuat PR. Setelah PR di-merge, jalankan Jenkins build pada `main`; keberhasilan deploy tetap harus dibuktikan oleh Jenkins, bukan diasumsikan dari smoke check lokal.
