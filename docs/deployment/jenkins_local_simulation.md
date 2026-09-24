# Jenkins lokal — simulasi label di laptop

Status: konfigurasi Fase 3.2; lihat `docs/tasks/F3.2/RESULT.md` untuk bukti aktual. Ini **bukan** deployment intranet atau production.

## Yang berjalan

- Jenkins di Docker Desktop pada `http://127.0.0.1:8081`.
- Job Jenkins membaca branch `main` di GitHub tiap sekitar 5 menit (SCM polling, **tanpa GitHub Actions**). Perubahan pada feature branch boleh dites, tetapi tahap deploy hanya berjalan jika commit checkout sama dengan HEAD `origin/main`.
- Gate: seluruh tes backend, tes frontend, TypeScript, build frontend, dan build image aplikasi. Kegagalan gate menghentikan deploy.
- Kandidat image diperiksa kesehatan tanpa port publik atau volume data. Setelah lulus, aplikasi lama diganti pada `http://127.0.0.1:8000`. Bila instance baru gagal health check, image sebelumnya dicoba dipulihkan.
- Data simulasi memakai volume Docker `tls-local-sim-data`; Jenkins memakai volume berbeda, `thermal-label-jenkins-local_jenkins_home`.

Jenkins hanya memakai source GitHub sebagai sumber kode. GitHub Actions tidak digunakan.

## Pemasangan awal (sekali)

1. Pastikan Docker Desktop menyala. Dari `web_app/`, jalankan `docker compose -f ops/jenkins/compose.yml up -d --build`.
2. Buka `http://127.0.0.1:8081`. Untuk layar Unlock Jenkins, baca initial admin password **di laptop Anda sendiri** dengan `docker exec thermal-label-jenkins-local cat /var/jenkins_home/secrets/initialAdminPassword`. Jangan kirim nilainya ke chat atau Git.
3. Pilih **Install suggested plugins**, lalu buat akun administrator Jenkins pribadi. Pastikan plugin **Pipeline**, **Git**, dan **Credentials Binding** terpasang. Jangan izinkan anonymous build atau konfigurasi job. Biarkan Jenkins hanya dapat diakses dari laptop (port sudah bind loopback).
4. Buat job **Pipeline** bernama `thermal-label-local-simulation`, pilih **Pipeline script from SCM**, SCM **Git**, repository URL `https://github.com/pikidisini/Thermal-Label-Studio.git`, branch `*/main`, script path `Jenkinsfile`. Bila repo GitHub privat, masukkan credential Git read-only di Jenkins; jangan menaruh token dalam URL. Jalankan **Build Now** sekali. `pollSCM` baru aktif setelah Jenkinsfile pertama berhasil dibaca.
   Opsional untuk tombol rollback manual: buat job Pipeline kedua dengan SCM/branch yang sama, script path `Jenkinsfile.rollback`, dan **jangan** tambahkan polling. Job ini hanya dijalankan manual bila image sebelumnya perlu dipulihkan.
5. Setelah build dan deploy pertama berhasil, buka `http://127.0.0.1:8000`. Layar login aplikasi akan meminta akun pengguna resmi.
6. **Bootstrap Akun Pengguna**: Buat akun awal (PPIC atau IT) langsung di dalam container aplikasi melalui CLI aman interaktif:
   ```bash
   docker exec -it tls-local-sim python -m app.cli.user_admin create-user --username ppic_operator --role PPIC
   ```
   CLI akan meminta konfirmasi kata sandi secara aman tanpa menyimpannya dalam history shell atau argumen proses. Akun dan hash kata sandi PBKDF2 tersimpan secara persisten pada volume Docker `tls-local-sim-data` (`backend/data/auth.db`).

Jika fase ini belum di-merge ke `main`, job `main` belum menemukan `Jenkinsfile`. Untuk verifikasi pra-merge, gunakan job terpisah sementara yang membaca branch yang diuji; tahap deploy secara sengaja akan **dilewati** pada branch non-main. Sesudah review dan merge, arahkan job utama ke `*/main`.

## Batas keamanan

- **Jangan** mengganti port menjadi `0.0.0.0`, IP LAN, atau host kantor sebelum HTTPS dan review keamanan deployment selesai.
- `LOCAL_SIMULATION_ONLY=true` membuat endpoint legacy `/api/v1/print/*` dan `/api/v1/sap/print` mengembalikan 404 sebelum memproses body. `SAFE_DEMO_MODE=false`; alur simulasi memakai `SAP_SHADOW_SIMULATION_ENABLED=true` dan login aplikasi terpadu.
- Jenkins diberi akses Docker socket untuk membangun dan mengganti container. Akses ini setara hak administratif atas Docker host. Hanya pengguna tepercaya yang boleh mengubah job/Jenkinsfile; jangan menjalankan PR dari pihak lain secara otomatis. [Docker menjelaskan risiko akses daemon](https://docs.docker.com/engine/security/protect-access/).
- Tidak ada password bersama atau rahasia default di environment / Jenkinsfile; akun dikelola per pengguna melalui CLI admin terproteksi hash PBKDF2 pada volume data terisolasi.
- Laptop/Docker mati berarti Jenkins dan aplikasi lokal berhenti. Setelah menyala lagi, polling dapat mengejar perubahan Git berikutnya, tetapi tidak menjamin ketersediaan 24 jam.

## Pemeriksaan dan pemulihan

- `docker ps --filter name=thermal-label-jenkins-local --filter name=tls-local-sim` untuk status container.
- `docker logs --tail 100 thermal-label-jenkins-local` untuk log Jenkins, dan Console Output pada job untuk hasil gate.
- `docker exec tls-local-sim python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read())"` untuk health lokal aplikasi.
- Jika deploy gagal, skrip otomatis mencoba memulihkan image lama; cek Console Output dan container sebelum Build Now ulang. Untuk rollback manual setelah deploy sukses, jalankan **Build Now** pada job `Jenkinsfile.rollback`; image `tls-local-sim:previous` harus masih ada. Jangan hapus image tersebut sebelum masa observasi selesai.
- Untuk berhenti Jenkins: `docker compose -f ops/jenkins/compose.yml stop`. Perintah ini tidak menghapus volume Jenkins atau data aplikasi.
- Jangan menjalankan `docker compose down --volumes` atau menghapus volume `tls-local-sim-data` tanpa backup dan persetujuan eksplisit.

Deployment ini terpisah dari `docker-compose.pilot.yml`, PostgreSQL, dispatcher produksi, SAP HTTP integration, dan printer fisik.
