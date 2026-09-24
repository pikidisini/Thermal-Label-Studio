# Rancangan login aplikasi Thermal Label Studio

Status: `PROPOSED` untuk Fase 3.3. Dokumen ini adalah rancangan, belum bukti implementasi.

## Keputusan pengalaman pengguna

Pengguna membuka Thermal Label Studio, masuk sekali pada halaman login aplikasi, lalu dapat memakai studio dan **Simulasi Label** dalam sesi yang sama. Akun PPIC dan IT yang aktif sama-sama dapat menjalankan simulasi, mengimpor JSON SAP, melihat batch dan urutan item, serta mengunduh PDF bukti. Modal simulasi tidak meminta password kedua. Hak untuk mencetak fisik tidak disimpulkan dari hak simulasi.

Menyembunyikan halaman/modal bukan pengamanan data. Semua endpoint browser yang membaca atau mengubah data sensitif harus memverifikasi sesi aplikasi di server. Endpoint mesin SAP dan Print Agent tetap menggunakan autentikasi mesin masing-masing, bukan cookie pengguna. `GET /health` tetap dapat dipakai probe; `GET /api/status` hanya boleh mengembalikan informasi non-sensitif. Executor wajib membuat inventaris seluruh endpoint sebelum mengubah guard.

## Rancangan pilot lokal

- Tidak ada pendaftaran publik. Akun pertama dibuat oleh operator melalui perintah administrasi satu kali yang tidak mencetak password ke terminal/log. Akun berikutnya dibuat atau dinonaktifkan oleh administrator, dengan jejak audit. Identitas PPIC dan IT terpisah; akun bersama tidak menjadi desain target.
- Untuk satu container pilot, gunakan penyimpanan akun dan sesi yang tahan restart pada volume data lokal yang sudah disediakan. Rancangan awal: adapter SQLite khusus identitas lokal, terpisah dari data batch. Struktur repository harus memungkinkan penggantian ke PostgreSQL/identity provider perusahaan ketika pilot intranet dirancang. Jangan menjalankan migrasi destruktif otomatis pada startup.
- Password disimpan sebagai hash password yang sesuai rekomendasi OWASP, bukan teks asli atau hash SHA-256 biasa. Sesi disimpan di server dengan token acak; bila token disimpan pada disk, simpan hash token. Cookie sesi `HttpOnly` dan `SameSite`, dengan `Secure` pada HTTPS. HTTP hanya untuk akses loopback laptop yang benar-benar dibatasi pada host; akses LAN/intranet membutuhkan HTTPS yang terverifikasi oleh aplikasi/proxy tepercaya.
- Login memiliki pembatasan percobaan dan pesan error yang tidak mengungkap apakah nama pengguna ada. Logout mencabut sesi. Permintaan mutasi yang memakai cookie tetap memiliki proteksi CSRF. Perubahan password atau penonaktifan akun mencabut sesi terkait. Identitas pengguna dan peristiwa penting dicatat tanpa password/token/data SAP penuh.
- Pertahankan satu sumber identitas browser. `pilot_session`, `PILOT_OPERATOR_SECRET`, dan kartu login di modal simulasi baru boleh dihapus setelah seluruh endpoint browser simulasi memakai sesi aplikasi dan test keamanan lulus. Migrasi tidak boleh membuat jendela akses anonim.
- Deployment Jenkins lokal tetap bind `127.0.0.1`. `LOCAL_SIMULATION_ONLY=true` tetap memblokir rute cetak fisik. Bootstrap akun tidak boleh memakai password default atau hardcoded di repo, Dockerfile, Jenkinsfile, test report, maupun log. Penggantian dari secret operator pilot ke mekanisme bootstrap akun harus mempunyai langkah upgrade yang jelas agar data simulasi pada volume lama tidak hilang.

## Batas fase

F3.3 menargetkan login lokal yang dapat diuji di laptop. SSO SAP/LDAP/Entra, MFA perusahaan, administrasi akun penuh melalui UI, akses jaringan kantor, dan otorisasi cetak fisik adalah pekerjaan terpisah. Jangan menyebut desain pilot lokal ini production ready.

Referensi keamanan: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), dan [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
