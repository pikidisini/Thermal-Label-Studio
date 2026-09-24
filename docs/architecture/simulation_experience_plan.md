# Rancangan Pengalaman Simulasi Label

Status: rancangan produk untuk Fase 3.1; belum merupakan bukti implementasi atau kesiapan produksi.

## Mengapa disatukan di antarmuka

Saat ini studio dapat menampilkan dua pintu masuk, **Safe Demo** dan **SAP Simulation**. Keduanya mudah disalahartikan sebagai dua langkah yang harus dipilih pengguna, padahal kebutuhan uji mandiri adalah satu perjalanan: masukkan data SAP, periksa urutan label, lalu lihat PDF tanpa mencetak fisik. Fase 3.1 menyatukan pengalaman pengguna itu di bawah satu nama **Simulasi Label**.

Penyatuan ini hanya pada navigasi dan bahasa UI. Backend Safe Demo lama dan SAP shadow simulation masih memiliki kontrak, autentikasi, serta tujuan pengujian yang berbeda. Jangan menggabungkan service atau melonggarkan guard server hanya karena tombolnya disederhanakan.

## Alur pengguna yang dituju

1. Pengguna membuka **Simulasi Label** dari studio dan masuk sebagai operator pilot jika diperlukan.
2. Pengguna mengimpor JSON yang diekspor dari SAP DEV melalui komputer lokal. Data bisnis tidak dijadikan fixture atau masuk Git.
3. Aplikasi memvalidasi data di server melalui jalur simulasi yang sudah ada, lalu menampilkan batch dan urutan item.
4. Pengguna membuka PDF simulasi untuk memeriksa isi dan urutan label. Hasil ini bukan bukti cetak fisik maupun persetujuan produksi.

## Keputusan pengalaman untuk Fase 3.1

- Hanya satu tombol simulasi tampil pada topbar ketika capability SAP shadow simulation aktif. Mengaktifkan Safe Demo lama saja tidak boleh membuka jalur operator baru.
- Modal operator yang sudah mendukung impor JSON, daftar item, dan PDF menjadi tujuan tombol tersebut. Safe Demo lama tetap tersedia bagi developer/test, tanpa entry utama kedua bagi pengguna.
- UI harus menyatakan bahwa berkas diunggah/diproses oleh backend lokal atau intranet; jangan menyebutnya diproses hanya di browser. Tampilkan penjelasan bahwa tidak ada pengiriman ke printer pada alur simulasi.
- Hak akses tetap ditentukan server. Tidak munculnya tombol bukan kontrol keamanan.
- Kontrak implementasi dan acceptance criteria terukur berada di `docs/tasks/F3.1/TASK_CONTRACT.md`.

## Yang belum diputuskan untuk fase berikutnya

- Kapan dan bagaimana operator/PPIC dapat memilih template, profil label, atau parameter simulasi melalui UI penuh.
- Kapan jalur impor berkas lokal diganti atau dilengkapi pengiriman langsung dari SAP melalui jaringan perusahaan.
- Kebijakan retensi dan akses PDF simulasi untuk penggunaan tim di luar pilot.
- Penyelarasan istilah Safe Demo di dokumentasi teknis lama; jangan mengubah nama kontrak atau API lama hanya demi copy UI.

Pembaruan rencana (2026-09-24): Fase 3.3 mengusulkan login aplikasi satu kali untuk PPIC/IT dan menghilangkan login operator tambahan di modal Simulasi Label setelah endpoint browser terlindungi sesi aplikasi. Lihat `application_authentication_plan.md` dan `docs/tasks/F3.3/TASK_CONTRACT.md`. Ini belum diimplementasikan; alur login operator pada bagian sebelumnya tetap menggambarkan kondisi F3.1.

Topik di atas bukan bagian otomatis dari Fase 3.1. Masing-masing memerlukan task, kebutuhan bisnis, dan verifikasi sendiri sebelum dijadwalkan.
