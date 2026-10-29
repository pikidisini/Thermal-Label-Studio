# Panduan maintenance server

Panduan ini berlaku untuk server `192.168.254.58`. Status implementasi pipeline
tidak menggantikan laporan penerimaan untuk commit yang akan dirilis.

## Melaporkan bug dan mengembangkan fitur

1. Catat revisi aplikasi dari artefak job monitoring, halaman yang bermasalah,
   langkah reproduksi, hasil aktual, dan hasil yang diharapkan. Gunakan formulir
   issue repository. Sertakan screenshot atau trace yang sudah disanitasi;
   jangan sertakan password, token, payload SAP, atau isi label operasional.
2. Untuk fitur, tentukan pengguna, tujuan, kriteria penerimaan, dan kebutuhan
   perubahan database. Kerjakan di branch dan buat pull request.
3. Tinjau perubahan, tes, dan dampak skema sebelum merge. Agent build mempunyai
   akses administratif Docker host; jangan menjalankan source PR/fork yang belum
   dipercaya dengan agent ini.
4. Setelah cutover, job `thermal-label-release` memeriksa `main` setiap lima
   menit. Commit baru harus lulus source/coverage, analisis SonarQube terbaru,
   dan penerimaan image dengan storage sintetis sebelum deployment.

Perubahan SQL menghentikan deployment otomatis. Tinjau migrasi, backup, dan
kompatibilitas image sebelumnya dalam pekerjaan terpisah. Jangan mengubah gate
atau menggunakan laporan commit lama agar suatu kandidat dapat dirilis.

## Membaca dashboard

- [Jenkins](http://192.168.254.58:8081): lihat hasil job, stage yang gagal,
  commit checkout, dan artefak laporan pada build yang bersangkutan.
- [SonarQube](http://192.168.254.58:9004): cocokkan versi analisis dengan SHA
  kandidat; gate dari analisis lama tidak meluluskan rilis baru.
- [Monitoring](http://192.168.254.58:8081/job/thermal-label-monitor/): baca
  `status.json`, waktu sampel, status layanan, resource, umur backup,
  `last-release`, dan `last-backup`.

`UP` membutuhkan dua sampel berhasil; `DOWN` muncul setelah tiga kegagalan
berturut-turut. Disk 80% memberi peringatan dan 90% kritis. Ringkasan berumur
lebih dari 180 detik ditolak oleh job monitoring. Umur backup bersifat informatif;
belum ada janji backup harian maupun RPO/RTO yang ditetapkan.

Collector berjalan melalui systemd meskipun executor build sibuk. Job monitoring
tidak merestart layanan, melakukan rollback, atau mengirim pekerjaan cetak.
Host yang mati total belum dapat dilaporkan dari mesin lain.

## Diagnosis administrator

Jalankan pada server melalui SSH. Perintah berikut hanya membaca status:

```sh
systemctl is-active thermal-label-ci.service thermal-label-monitor.timer
systemctl status thermal-label-monitor.service --no-pager
docker ps --filter label=com.docker.compose.project=thermal-label-ci
cat /var/lib/thermal-label-ci/monitor/status.json
cat /var/lib/thermal-label-ci/last-release.json
```

File `last-release.json` belum tersedia sebelum ada percobaan deployment.
Jangan menampilkan resolved Compose configuration, environment container, atau
file privat ketika membagikan diagnosis. Log layanan juga harus ditinjau dan
disanitasi sebelum disalin ke issue atau chat.

Jika tes source, gate SonarQube, atau kandidat gagal, perbaiki branch dan uji
ulang. Jangan langsung mengganti image operasional. Bedakan bukti browser mock,
storage nyata terisolasi, dan runtime image dalam laporan.

## Menahan rilis dan memulihkan image

Untuk menahan perubahan operasional berikutnya, administrator deployment dapat
memindahkan marker berikut ke nama privat lain sebelum build memasuki deployment:

```sh
mv /var/lib/thermal-label-ci/auto-release.enabled /var/lib/thermal-label-ci/auto-release.paused
```

Lakukan hanya jika marker aktif memang tersedia. Build tanpa marker hanya dapat
mencapai `QUALIFIED`. Penggantian marker tidak membatalkan deployment yang sudah
berjalan; periksa hasil build dan lock sebelum pemeliharaan manual.

Deployment yang gagal pada pemeriksaan runtime mengembalikan image, environment,
dan tautan source sebelumnya secara otomatis. Periksa `last-release.json` untuk
hasil rollback dan verifikasi kembali `/health`, `/ready`, serta akses login.
Rollback tidak memulihkan database dan tidak mengulang pekerjaan cetak.

Jika diperlukan pemulihan manual, gunakan `previous_image` dan `previous_source`
dari laporan rilis yang relevan. Administrator harus memverifikasi kompatibilitas
skema dan identitas image sebelum mengganti container aplikasi. Pertahankan
volume operasional dan backup; jangan menjalankan `down -v`, prune global, atau
restore database sebagai bagian rutin pemulihan image.

Setelah perbaikan diterima, aktifkan kembali marker dan jalankan kandidat `main`
terbaru melalui pipeline. Jangan merilis kandidat lama yang sudah tersusul.

## Backup dan restore CI

Backup CI harus mencakup keenam volume `thermal-label-ci-*`, konfigurasi privat
CI dan agent, serta identitas image. Jenkins home harus menyertakan material
enkripsi credential aslinya. Pertahankan versi Jenkins, plugin, SonarQube, dan
PostgreSQL saat pemulihan; upgrade dilakukan terpisah.

1. Pastikan tidak ada build atau analisis aktif. Hentikan controller, agent,
   SonarQube, dan database CI secara terkontrol dalam jendela pemeliharaan.
   Collector monitoring aplikasi tetap terpisah dari stack CI.
2. Arsipkan keenam volume melalui container utilitas yang teridentifikasi,
   tanpa menyalin direktori internal volume Docker secara langsung. Lindungi
   konfigurasi dan material kunci sebagai data privat.
3. Enkripsi arsip, verifikasi dekripsi/integritas, catat checksum, lalu transfer
   lewat SSH ke penyimpanan di luar server. Simpan kunci pembuka secara terpisah.
4. Jalankan kembali stack CI dan periksa akun, histori, agent, dan quality gate.

`restore_volumes.py` adalah installer pemulihan migrasi dengan enam nama target
tetap. Tanpa `--apply`, script hanya menampilkan rencana. Mode apply memerlukan
`--confirm-host 192.168.254.58`, manifest privat, arsip terenkripsi, dan volume
tujuan yang belum ada. Script menolak volume yang sudah tersedia. Jangan
menghapus volume aktif untuk memaksa restore; siapkan target pemulihan terisolasi
dengan lingkup yang ditinjau tersendiri bila server tersebut sudah terisi.

Backup aplikasi sebelum deployment dan backup CI adalah dua hal berbeda.
Retensi backup operasional, jadwal rutin, RPO/RTO, dan notifikasi dari mesin
lain tetap memerlukan keputusan lanjutan. SAP, worker antrean, dan printer
fisik tetap **NOT RUN** dalam penerimaan maintenance ini.
