# Fase 3.2 — Jenkins CI/CD lokal untuk simulasi label

Status: `IN_PROGRESS`. Level 3 karena deployment dan batas keselamatan printer.

## Tujuan

Jenkins berjalan self-hosted pada Docker Desktop laptop pengembang, tanpa GitHub Actions. Job membaca branch `main` dari GitHub, menjalankan tes, membangun image, dan hanya setelah seluruh gate lulus memperbarui aplikasi simulasi di `127.0.0.1:8000`. Jenkins hanya dapat diakses di `127.0.0.1:8081`.

## Batas

- Tidak menyentuh SAP, database perusahaan, printer fisik, atau port 9100.
- Tidak menaruh kredensial di Git, Dockerfile, Jenkinsfile, ataupun log.
- Tidak mengubah atau menghapus container lain. Deployment menggunakan nama dan volume khusus fase ini.
- Tidak membuka aplikasi ke jaringan kantor sebelum login aplikasi dan review deployment intranet selesai.
- Tidak mengaktifkan `SAFE_DEMO_MODE` lama; simulasi SAP/operator tetap memakai guard login yang ada.
- Instalasi awal Jenkins dan kredensial operator memerlukan langkah interaktif pengguna. Jangan mengklaim pipeline berjalan sebelum build Jenkins nyata lulus.

## Acceptance criteria

1. Jenkins dapat dinyalakan dengan Docker Compose dan port UI hanya bind loopback.
2. Pipeline mengambil `main`, menjalankan tes backend/frontend dan typecheck, lalu build image; kegagalan gate menghentikan deployment.
3. Update aplikasi hanya terjadi setelah image kandidat lolos health check, dan image sebelumnya dipulihkan bila deployment baru gagal.
4. Aplikasi terpasang hanya bind loopback, menyimpan data pada volume Docker terpisah, dan menolak seluruh endpoint legacy yang dapat mengirim ke printer.
5. Secret operator berasal dari Jenkins Credentials, bukan source code; jika belum diatur, deploy berhenti tertutup.
6. Ada panduan setup awal, pemicu polling Git tanpa GitHub Actions, troubleshooting, dan rollback manual.
7. Bukti test/statis/runtime dicatat jujur pada `RESULT.md`; pekerjaan berhenti sebelum PR/merge tanpa instruksi pengguna.
