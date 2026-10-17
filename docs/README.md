# Dokumentasi proyek

Ditinjau berdasarkan working tree lokal pada **17 Oktober 2026 (Asia/Jakarta)**.
Dokumentasi yang disusun dalam tinjauan ini menggunakan Bahasa Indonesia sesuai
permintaan pengguna. Dokumen kontrak terdahulu tetap tersedia dalam bahasa aslinya.
Indeks ini mencakup aplikasi aktif Thermal-Label-Studio dan menjelaskan perangkat
pendamping yang terpisah. Isinya tidak menyatakan suatu instalasi telah terverifikasi.

## Mulai dari sini

| Kebutuhan pembaca | Dokumen rujukan |
| --- | --- |
| Memahami keseluruhan proyek | [Panduan utama proyek](PROJECT_HANDBOOK.md) |
| Menemukan penanggung jawab fitur, endpoint, atau konfigurasi | [Referensi source](SOURCE_REFERENCE.md) |
| Mendesain dan mengoperasikan alur label | [Alur produk](PRODUCT_FLOW.md), kemudian bagian alur operator dalam panduan utama |
| Mengembangkan aplikasi atau menangani masalah lokal | [Pengembangan](DEVELOPMENT.md), [Kontribusi](../CONTRIBUTING.md) |
| Mengetahui pemeriksaan dalam pembaruan dokumentasi ini | [Tinjauan dokumentasi, 17 Oktober 2026](DOCUMENTATION_REVIEW_2026-10-17.md) |
| Menilai status penerimaan pipeline | [Status pipeline](implementation/universal-label-pipeline/STATUS.md) |

## Kontrak teknis

| Dokumen | Tanggung jawab |
| --- | --- |
| [Arsitektur](ARCHITECTURE.md) | Batas komponen, persiapan output, penyimpanan, dan runtime |
| [Kontrak API](API_CONTRACT.md) | Makna permintaan/respons, kesalahan, dan efek operasi |
| [Binding template](TEMPLATE_BINDING_CONTRACT.md) | Metadata SVG, key persis, teks, komposisi, barcode/QR, batas, dan nilai pengganti |
| [Application Management](MANAGEMENT_CONTRACT.md) | Sumber, printer, konfigurasi RFC, key, revisi, audit, dan Activity Log |
| [Graphics](GRAPHICS_CONTRACT.md) | Aset gambar yang tidak diubah setelah disimpan dan penyisipan salinan tertanam |
| [Identitas permintaan](REQUEST_ID_CONTRACT.md) | Identitas pengirim/permintaan, percobaan ulang dengan identitas tetap, dan replay |
| [Keputusan](DECISIONS.md) | Alasan desain serta keputusan bertanggal yang menggantikan keputusan sebelumnya |
| [Pemberitahuan generator simbol](SYMBOL_GENERATOR_NOTICES.md) | Profil dependensi, atribusi, dan pemberitahuan lisensi |

## Pengembangan, integrasi, dan operasional

| Dokumen / artefak | Kegunaan |
| --- | --- |
| [README aplikasi](../README.md) | Gambaran proyek, titik masuk standar, dan pemeriksaan |
| [Aturan agen](../AGENTS.md) | Aturan pengembangan repositori dan batas tindakan yang menimbulkan efek eksternal |
| [Contoh environment](../.env.example) | Template konfigurasi dalam Git; jangan memasukkan rahasia asli ke dokumentasi |
| [Compose](../docker-compose.yml), [Dockerfile](../Dockerfile) | Definisi standar aplikasi dalam paket container |
| [SonarQube](SONARQUBE.md) | Alur pemeriksaan kualitas lokal yang terpisah serta batas pembuktiannya |
| [Perangkat MCP](../tools/mcp/README.md) | Perangkat inspeksi opsional dengan kredensial pembaca tersendiri |
| [Design MCP](../tools/mcp/DESIGN.md) | Pembuatan SVG yang dapat diedit, validasi, pratinjau, dan penyimpanan eksplisit |
| [MinIO MCP](../tools/mcp/MINIO.md), [Jenkins MCP](../tools/mcp/JENKINS.md), [Sonar MCP](../tools/mcp/SONARQUBE.md) | Inspeksi atau penyiapan opsional untuk masing-masing layanan |
| [Panduan IPL](print_guide/IPL/README.md) | Referensi protokol dan contoh tersimpan; bukan bukti penerimaan perangkat |
| [Agen lokal](../local_agent/README.md) | Klien workstation mandiri, terpisah dari LAN Print melalui server |
| [Contoh data kanonis](examples/label_data.sample.json) | Contoh data persis dan deskripsi tampilannya |

Direktori saudara **SAP-Simulator** memiliki `README.md`, `SAP_SENDER_HANDOFF.md`,
dan `PRINTER_TEST.md` sendiri. Komponen ini merupakan pengirim HTTP terpisah dan
bukan bagian dari startup aplikasi. Dokumen penelusuran SAP dan source ABAP di
workspace merupakan referensi; keberadaannya tidak membuktikan kode ECC telah
aktif. Batas setiap komponen dijelaskan dalam panduan utama.

## Bukti dan pemeliharaan

Source terkini dan kontrak aktif menentukan perilaku aplikasi. Dokumen status
pipeline menjadi rujukan tabel penerimaannya. Dokumen tugas/hasil/tinjauan yang
bertanggal menyimpan bukti historis. Keputusan eksplisit yang lebih baru menggantikan
penjelasan lama pada pokok yang sama. Panduan utama dan referensi source berfungsi
sebagai navigasi serta penjelasan, bukan pengganti skema API atau izin mengoperasikan
target eksternal.

Gunakan `PASS`, `FAIL`, `BLOCKED`, `PENDING`, `NEEDS_REPLAN`, dan `NOT RUN` dengan
cakupan yang jelas. Pengujian source, mock browser, penyimpanan langsung, runtime
paket, kualitas, SAP, dan output fisik merupakan gerbang pemeriksaan terpisah.
PASS historis bukan hasil pemeriksaan baru. [Audit 12 Oktober 2026](PROJECT_AUDIT_2026-10-12.md)
merupakan catatan kondisi pada tanggal tersebut.

Ketika perilaku berubah, perbarui kontrak terkait dan bagian panduan utama yang
relevan. Perbarui referensi source ketika route, modul, atau nama environment
berubah. Pertahankan bukti bertanggal dan buat tinjauan baru. Jangan memasukkan
rahasia, data operasional mentah, atau bukti runtime yang dihasilkan ke Git.
