# Thermal Label Studio

Thermal Label Studio digunakan untuk mengedit template SVG, mengikat data label
kanonis, menghasilkan PNG monokrom, dan mengodekan output IPL. Antarmuka mendukung
bahasa Inggris sebagai default serta Bahasa Indonesia. Pengaturan bahasa tidak
mengubah key SAP/JSON, isi label yang dibuat, atau payload hasil encoding.
README dan panduan proyek menggunakan Bahasa Indonesia; kontrak teknis terdahulu
tersedia dalam bahasa aslinya.

Mulai dari [indeks dokumentasi](docs/README.md) dan
[panduan utama proyek](docs/PROJECT_HANDBOOK.md) untuk memahami keseluruhan aplikasi.
[Referensi source](docs/SOURCE_REFERENCE.md) memetakan route, modul, dan konfigurasi.

Maintenance melalui Jenkins, migrasi CI server, quality gate, rilis otomatis,
dan pengawasan dasar dijelaskan dalam [runbook CI server](tools/jenkins/server/README.md).
Status eksekusi setiap gate tetap terpisah dari keberadaan source pipeline.

[Design MCP](tools/mcp/DESIGN.md) bersifat opsional dan mendukung pembuatan SVG
melalui AI, validasi, pratinjau PNG, serta penyimpanan template berversi yang
diaktifkan secara eksplisit melalui API aplikasi lokal. Desain tersimpan dapat
dibuka melalui kontrol Open yang sudah tersedia di Studio.

## Implementasi dan status penerimaan

- Label Print mengirim artefak pratinjau terpilih langsung dari server ke printer
  LAN aktif yang terdaftar di Application Management menggunakan TCP/RAW IPL.
  Pencetakan LAN tidak memerlukan agen lokal atau token pairing browser. Print
  memakai ulang bitmap pratinjau tanpa panggilan SAP tambahan; jumlah salinan
  dikodekan sekali. Hasil gagal/tidak pasti mengunci pencetakan browser sampai
  ditinjau operator. Penerimaan printer fisik tetap terpisah. ZPL belum tersedia.
  Paket mandiri `local_agent` tetap dipertahankan secara terpisah dan tidak
  digunakan oleh alur LAN ini.

- SAP Get Data di Label Print terhubung ke worker RFC terkonfigurasi untuk
  operasi `label_json` dengan satu input batch bertipe string. Alur ini memakai
  layout tersimpan dan pratinjau hasil dekode IPL bersama, menampilkan kegagalan
  per batch, dan tidak mengirim pekerjaan cetak. Aktivasi target/fungsi SAP aktual
  serta runtime native memerlukan konfigurasi eksplisit; verifikasi mock/source
  tidak membuktikan eksekusi SAP nyata.

- Label Print menampilkan printer terdaftar dari konfigurasi Application
  Management. Tujuan nonaktif tidak dapat dipilih; IP/port dan dukungan
  IPL/Ethernet/TCP RAW ditampilkan. Pemuatan katalog serta pemilihan printer
  tidak memeriksa kesiapan, menghubungi perangkat, atau dengan sendirinya
  mengaktifkan pencetakan nyata.

- Application Management -> Test Data mendukung pengeditan tabel bertipe,
  impor/ekspor JSON kanonis, serta pembaruan dataset contoh dengan pemeriksaan
  revisi. Sumber Test Data di Label Print menampilkan batch tersebut menggunakan
  layout Studio tersimpan melalui binding dan dekode IPL bersama. Alur ini tidak
  memerlukan migrasi skema atau penghapusan data; dataset yang ada dipertahankan.
  Pengeditan dan pratinjau Test Data tidak menimbulkan efek SAP atau printer.
  Tindakan Print eksplisit atas pratinjaunya dapat menghubungi printer nyata.

- `/` membuka menu aktivitas dengan Label Studio (`/studio`), Application
  Management (`/management`), kontrol Preference bersama, dan Label Print
  (`/print`). Label Print mendukung input batch bernomor secara lokal dan tempel
  massal satu kolom dengan peringatan duplikat. SAP Get Data memakai operasi RFC
  label terkonfigurasi ketika runtime native aktif. Pencetakan LAN memerlukan
  akses jaringan server ke printer terdaftar.

- Integrations mendukung pengeditan koneksi SAP, parameter RFC, dan pemetaan hasil.
  Backend memiliki pengujian regresi sintetis serta penanganan
  `EV_STATUS`/`EV_MESSAGE`/`EV_JSON` untuk `Z_TLS_GET_LABEL_DATA` tanpa mewajibkan
  pemetaan per field. Management dapat mengambil respons RFC aktual secara
  eksplisit melalui worker PyRFC native yang diaktifkan tersendiri serta daftar
  target/fungsi yang diizinkan server. Verifikasi MCP terpisah dari eksekusi
  aplikasi. Label Print memakai rutin eksekusi yang sama untuk operasi label
  yang memenuhi kontrak.

- Workspace Print menyediakan pengaturan lokal dan mode Demo yang dipilih
  eksplisit untuk gambar ilustratif, detail, pemilihan, dan simulasi pencetakan.
  Gambar Demo bukan hasil dekode IPL/ZPL atau hasil SAP. Menu sumber operator
  hanya memuat SAP dan Test Data. Test Data memanggil
  `/api/v1/label-print/preview` dengan dataset tersimpan yang dipilih; data fixture
  bawaan tetap menjadi pendukung regresi backend di luar menu tersebut. Home
  dan Print tidak memuat editor atau diagnostik Studio.

- Studio mendukung pengeditan kanvas, impor/ekspor SVG, penjelajah template,
  Save/Open berversi, Rename/Delete, eksplorasi JSON, dan dataset contoh JSONB
  PostgreSQL. PostgreSQL menyimpan metadata template; MinIO menyimpan artefak SVG
  yang tidak diubah setelah dibuat. Dataset contoh terpisah dari identitas
  permintaan intake.

- Metadata template berversi mendukung binding teks, barcode, dan QR dengan batas
  yang ditentukan. Key yang tidak ada, null, dan string kosong tetap dibedakan;
  nilai pengganti output dijelaskan pada bagian akhir README ini. Nol dan false
  tetap merupakan nilai. Profil dinamis yang tidak didukung ditolak tanpa
  pendekatan diam-diam.

- Preview dan Label Simulation memakai `/api/v1/simulation/editor-preview`.
  Studio Print memakai `/api/v1/printing/editor`; persiapan, raster, dan output
  IPL bersama digunakan oleh simulasi maupun transport. Print eksplisit dapat
  menghubungi tujuan yang tervalidasi satu kali; membuka dialog tidak membuat
  koneksi. Tidak ada percobaan ulang otomatis setelah pengiriman tidak pasti.
  Penerimaan printer fisik merupakan gerbang pemeriksaan tersendiri.

- `/api/v1/label-intake` mengimplementasikan validasi kanonis, kebijakan,
  penguncian versi template, simulasi, identitas/replay permanen, serta alur print
  yang dibatasi izin. Kredensial, kebijakan, serta ledger/skema eksplisit wajib
  tersedia. Startup penyimpanan Studio biasa tidak memberikan izin intake atau
  mengaktifkan skema intake.

- `/fixture-simulation` adalah halaman sintetis milik aplikasi, bukan stack lain.

[Status pipeline](docs/implementation/universal-label-pipeline/STATUS.md) menjadi
rujukan penerimaan dan mencatat T06 untuk penerimaan mock browser aplikasi saat
ini sebagai `BLOCKED`, serta T07/T10/T11 sebagai `NEEDS_REPLAN` terkait pembatalan
paksa/batas memori native yang wajib dipenuhi dan sisa bukti runtime/siklus hidup.
Simulasi/replay lokal template tersimpan `sample_roll` tercatat di sana; bukti
tersebut tidak menutup gerbang yang masih terbuka. Penerimaan fisik T12 berstatus
`BLOCKED` dan bersifat opsional, bukan gerbang wajib penerimaan perangkat lunak.

Studio kini memiliki login akun lokal, sesi server, dan peran Admin/Designer/Operator.
Aktivasi akun/database dan profil HTTPS/cloud atau HTTP LAN eksplisit mengikuti [kontrak login](docs/AUTH_CONTRACT.md);
belum ada akun bawaan atau provisioning otomatis. Keamanan produksi, integrasi SAP
ECC aktual, penerimaan operasional paket, dan pencetakan fisik tetap merupakan
pekerjaan terpisah. Graphics mendukung pustaka lokal PNG/JPEG/WebP dengan
penyisipan salinan tertanam setelah provisioning PostgreSQL eksplisit. Graphic
Update Center dan ekspor data/protokol belum tersedia. Lihat
[kontrak Graphics](docs/GRAPHICS_CONTRACT.md).

## Struktur source dan tanggung jawab

| Path | Tanggung jawab |
| --- | --- |
| `backend/app/` | Komposisi API dan modul fitur |
| `backend/app/label_data/` | Kontrak data dan skalar kanonis |
| `backend/app/template_binding/` | Validasi metadata serta binding data dengan batas yang ditentukan |
| `backend/app/engine/` | Persiapan bersama, raster, dan output hasil encoding |
| `backend/app/label_intake/` | Validasi awal, kebijakan, identitas permanen, dan eksekusi intake |
| `backend/schema/` | Artefak skema eksplisit; packaging tidak menerapkan migrasi intake |
| `backend/tests/`, `tests/contracts/` | Pengujian source dan fixture kontrak sintetis bersama |
| `frontend/src/features/` | UI/model/API milik fitur; komponen dasar bersama berada di `shared/` |
| `engine/bin/` | Binary renderer lokal terpasang yang diabaikan Git |
| `scripts/` | Pengembangan, validasi, dan operasi dengan cakupan eksplisit |
| `tools/` | Stack kualitas terpisah dan perangkat inspeksi MCP opsional |
| `docs/` | Kontrak aktif, operasional, dan bukti bertanggal |
| `.tmp/` | Direktori pengujian/laporan unik yang dapat dibuang; bukan penyimpanan operasional |

## Pengembangan dengan hot reload

Jalankan perintah Python dari root repositori ini dan perintah npm dari
`frontend/`. Pasang `requirements.txt` pada root ke environment Python yang
dipilih, lalu pasang dependensi berdasarkan lockfile frontend terlebih dahulu.
Startup default memerlukan Docker Desktop, layanan PostgreSQL/MinIO yang sudah
ada dan diizinkan, `.env` pada root yang diabaikan Git, serta aplikasi Compose
dalam keadaan berhenti.

```powershell
python -B scripts/dev.py --check
python -B scripts/dev.py
```

Di Windows, klik dua kali `run-dev.bat` atau jalankan `./run-dev.bat` dari
PowerShell. Berkas ini memilih direktori proyek dan memanggil launcher `dev.py`
yang sama menggunakan Python dari PATH atau virtual environment aktif. Argumen
diteruskan, misalnya `./run-dev.bat --check`. Jika startup gagal, jendela tetap
terbuka agar kesalahan dapat dibaca. Biarkan jendela terbuka selama menggunakan
Studio; Ctrl+C menghentikan proses pengembangan.

Jika port terpakai di Windows, startup interaktif mengidentifikasi PID/proses dan
meminta `[y/N]` sebelum menghentikan server pengembangan yang telah diverifikasi
berasal dari checkout ini. Aplikasi lain tidak dihentikan otomatis. `--check`
hanya melakukan diagnosis.

Buka [Studio lokal](http://127.0.0.1:5173/studio). Vite memperbarui perubahan
frontend; Uvicorn memuat ulang perubahan `backend/app` pada port 8000. Biarkan
terminal terbuka; Ctrl+C menghentikan keduanya. Jika salah satu proses anak
berhenti, launcher menghentikan proses pasangannya. Jangan memulai launcher kedua
pada port yang masih terpakai. Untuk proses latar belakang, verifikasi kepemilikan
proyek sebelum menghentikan pohon proses; jangan menghentikan semua proses
Python berdasarkan nama executable.

Startup default membaca konfigurasi Compose tanpa menampilkan rahasia dan
memetakan penyimpanan ke port loopback host. `--compose-storage` memilih perilaku
yang sama secara eksplisit. `--persistence` memakai pengaturan shell lengkap.
`--no-storage` menonaktifkan penyimpanan sehingga Save/Open template mengembalikan
503. Pratinjau native memerlukan renderer dan font; startup Windows memilih
`engine/bin/resvg.exe` yang sudah terpasang, kecuali diganti melalui
`TLS_RENDERER_PATH`. Executable Linux tidak dapat berjalan langsung di Windows.

Untuk simulasi intake lokal yang dikonfigurasi eksplisit, gunakan
`scripts/start-intake-simulation.ps1` dan README SAP-Simulator di direktori saudara.
Alur ini memakai launcher pengembangan yang sama dan konfigurasi lokal tepercaya
yang diabaikan Git. Alur tersebut tidak otomatis melakukan provisioning ledger
atau memberikan izin printer.

## Aplikasi dalam paket container

Satu `Dockerfile`, `docker-compose.yml`, `requirements.txt`, dan `.env.example`
pada root menentukan aplikasi paket standar. Setelah target bernama diotorisasi
dan prasyarat dipenuhi, dengan pengembangan lokal sudah dihentikan:

```powershell
docker compose up --build -d
```

Studio dalam paket secara default tersedia di
[http://127.0.0.1:8002/studio](http://127.0.0.1:8002/studio). Port host memakai
loopback. Volume eksternal PostgreSQL/MinIO mempertahankan data yang sudah ada
dan harus tersedia terlebih dahulu. Penggantian container bukan penggantian
volume atau backup. Penyimpanan layout terkonfigurasi menginisialisasi
skema/bucket saat startup; aktivasi ledger intake merupakan operasi eksplisit
terpisah. Build memerlukan checksum arsip renderer yang telah diverifikasi
secara independen. Hindari penulis lokal dan aplikasi paket yang bersaing pada
penyimpanan yang sama.

### Profil self-hosted LAN

Untuk server internal yang dipercaya, gunakan override LAN setelah target
penyimpanan dan schema/auth awal diprovisikan secara eksplisit. Profil ini
mempertahankan login dan role aplikasi, tetapi menerbitkan HTTP hanya pada IP
privat server yang dipilih. Contoh target `192.168.254.58` menggunakan port
khusus `18082`:

```text
TLS_LAN_BIND_IP=192.168.254.58
TLS_LAN_PORT=18082
```

```powershell
docker compose -f docker-compose.yml -f deploy/compose.lan.yml up --build -d
```

Pengguna LAN lalu membuka `http://192.168.254.58:18082`. PostgreSQL dan MinIO
tetap loopback-only; SAP, printer, dan queue tidak diaktifkan oleh override ini.
Untuk cloud atau internet-hosted, jangan gunakan override ini: gunakan profil
HTTPS production dan origin `https://` yang tepat.

Gunakan hot reload untuk iterasi source, lalu lakukan build dan uji singkat image
untuk bukti packaging. Lihat [Pengembangan](docs/DEVELOPMENT.md) untuk siklus hidup
dan pemulihan.

## Validasi

Dari root repositori ini:

```powershell
python -B scripts/check_project.py
python -B scripts/check_project.py --run-source-checks
```

Perintah pertama menampilkan rencana. Perintah kedua menjalankan regresi backend,
TypeScript frontend penuh, build frontend baru, dan regresi frontend tanpa
memulai layanan atau memasang dependensi. Laporan ditempatkan dalam subdirektori
unik `.tmp/source-checks-*`. `typecheck:core` saja tidak mencakup seluruh fitur.
PASS source tidak membuktikan kesiapan deployment.

Dari `frontend/`, setelah target yang diizinkan berjalan:

```powershell
npm run test:e2e:ui
npm run test:e2e:integration
```

Satu `playwright.config.js` mengatur browser dan tidak memulai server.
`E2E_BASE_URL` default adalah `http://127.0.0.1:8002`; gunakan
`http://127.0.0.1:5173` untuk pengembangan. Pengujian UI memakai mock API;
integrasi memakai aplikasi aktual. `E2E_ALLOW_STORAGE_WRITES=true` memerlukan
izin target bernama dan mempertahankan layout sintetis. Laporan, screenshot,
dan trace ditempatkan dalam subdirektori `.tmp` unik. Pemeriksaan browser tidak
mengotorisasi cetak fisik. Scan kualitas serta coverage merupakan gerbang terpisah.

## Dokumentasi proyek

Dokumentasi proyek dalam Bahasa Indonesia tersedia melalui
[indeks dokumentasi](docs/README.md), [panduan utama proyek](docs/PROJECT_HANDBOOK.md),
dan [referensi source](docs/SOURCE_REFERENCE.md).
[Tinjauan dokumentasi 17 Oktober 2026](docs/DOCUMENTATION_REVIEW_2026-10-17.md)
mencatat pembaruan berdasarkan source serta batas verifikasinya.

[Audit dokumentasi 12 Oktober 2026](docs/PROJECT_AUDIT_2026-10-12.md) mencatat
pemeriksaan pada pembaruan terdahulu. Dokumen tersebut merupakan snapshot
bertanggal, bukan rujukan penerimaan pipeline yang terus berjalan.

- [Arsitektur](docs/ARCHITECTURE.md)
- [Alur produk](docs/PRODUCT_FLOW.md)
- [Kontrak API](docs/API_CONTRACT.md)
- [Kontrak binding template](docs/TEMPLATE_BINDING_CONTRACT.md)
- [Pemberitahuan generator simbol](docs/SYMBOL_GENERATOR_NOTICES.md)
- [Pengembangan](docs/DEVELOPMENT.md)
- [Keputusan](docs/DECISIONS.md)
- [Status pipeline](docs/implementation/universal-label-pipeline/STATUS.md)
- [SonarQube](docs/SONARQUBE.md) dan [perangkat MCP opsional](tools/mcp/README.md)
- [Kontribusi](CONTRIBUTING.md) dan [aturan agen](AGENTS.md)

Source dan status terkini didahulukan dari laporan historis. Pertahankan riwayat
dan bedakan penerimaan source/fake, mock browser, penyimpanan, runtime paket,
kualitas, SAP, serta perangkat fisik. Repositori source adalah
[Thermal-Label-Studio](https://github.com/pikidisini/Thermal-Label-Studio);
riwayat lama hanya sebagai referensi. Kredensial, data operasional, dependensi,
binary, dan laporan hasil pemeriksaan tidak boleh masuk Git.

## Pemeriksaan status printer LAN eksplisit (16 Oktober 2026)

Label Print menyediakan Check status untuk printer Management terpilih yang
aktif. Hanya tombol tersebut yang memanggil `POST /api/v1/label-print/printer-status`
dengan `target_id`, `expected_host`, dan `expected_port`; tujuan yang dikendalikan
pemanggil tidak diterima. Route memeriksa kembali konfigurasi tersimpan
(409 jika berubah/nonaktif), memakai pemeriksaan sesi/peran/origin dan JSON terbatas
yang sama dengan LAN Print, mengembalikan `no-store`, serta berjalan bergantian
dengan pengiriman LAN (429 saat sibuk). Tidak ada polling latar belakang, probe
saat pemilihan, akses SAP, payload cetak, reset, atau perintah konfigurasi.

Server mengirim satu byte IPL ENQ (`0x05`) ke tujuan TCP numerik tersimpan, dengan
batas tiga detik untuk koneksi dan anggaran I/O tambahan tiga detik, maksimal
16 byte respons awal, serta pembacaan respons berbingkai yang dibatasi.
Tidak ada percobaan ulang. `RESPONDING` berarti respons dikenali, bukan proses
fisik selesai. DC1 standar berarti ready/printing/skipping; US menggabungkan
kesalahan jalur label/ribbon. UI mempertahankan ambiguitas ini dan menampilkan
`ATTENTION`, `UNREACHABLE`, atau `UNAVAILABLE` masing-masing untuk gangguan,
kegagalan koneksi, dan respons tidak ada/tidak dikenal. Koneksi ditolak atau
timeout tidak membuktikan printer mati. Data tidak dikenal tidak dapat dianggap
`READY`.

Respons memuat timestamp UTC server `checked_at`, target, metode `IPL_ENQ`, dan
`confirmed=false`. UI membersihkan hasil ketika printer berubah, saat refresh,
atau ketika memilih Demo, serta mengabaikan respons terlambat. Hasil merupakan
snapshot terpisah dari hasil job cetak. Pemeriksaan status tidak membuka kunci
job yang tidak pasti atau memberikan izin cetak. Dukungan perangkat, firmware,
dan protokol tetap memerlukan penerimaan target bernama tersendiri. Fitur ini
belum mengimplementasikan SNMP.

Referensi protokol yang digunakan:

- [Honeywell IPL Command Reference — Status Enquiry](https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf)
- [ITE Programmer's Reference — Printer Status Query Responses](https://automation.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/discontinued/software/sps-ppr-937-015.pdf)

## Riwayat operasional Label Print (16 Oktober 2026)

Activity Log yang diaktifkan eksplisit kini mencakup
`POST /api/v1/label-print/preview`, `/label-print/print`, dan
`/label-print/printer-status`. Fitur ini memakai ulang tabel JSONB
`app_management.activity_log` yang telah diprovisikan, tanpa migrasi atau DDL
saat startup. Catatan memuat trace ID buatan server, waktu permintaan UTC, status
HTTP, durasi, origin `label_print`, mode preview/print/status, dan kode kesalahan
yang diizinkan.

Log preview menyimpan jenis sumber, jumlah item, tahap berindeks, serta jumlah
hasil. HTTP 200 masih dapat memuat hasil preview FAILED/PARTIAL. Log print
menyimpan ID target terdaftar, copies, hasil pengiriman berindeks, dan
`confirmed=false`. Log status menyimpan kode keadaan/alasan perangkat yang tetap;
`CHECKED` berarti kueri selesai, termasuk `UNREACHABLE`/`UNAVAILABLE`, bukan
kesiapan fisik perangkat.

Jangan mencatat identitas batch, field SAP, body permintaan/respons mentah,
token, ID artefak, SVG, PNG, atau IPL. Kegagalan penulisan log tidak mengubah
pengiriman atau memicu percobaan ulang. Sanitasi kesalahan HTTP global
mempertahankan `preview_busy`/`print_busy` dan kode validasi awal Label Print
lainnya dengan pesan statis serta ID korelasi. Activity Log menampilkan Label
Print sebagai sumber dan menyediakan filter mode preview/status.

Pencatatan dilakukan saat selesai dan bersifat best-effort: permintaan yang
masih berjalan atau macet belum menjadi baris tersimpan. Fitur ini bukan monitor
job langsung atau antrean permintaan permanen. Permintaan lama yang tidak
tercatat tidak dapat direkonstruksi dari catatan baru tersebut.

## Output binding ketika data tidak tersedia

Field teks menampilkan ` - ` untuk null/string kosong dan `N/A` untuk key persis
yang tidak ada. Barcode/QR dengan token sumber tidak tersedia menampilkan kotak
polos bergaris dengan ` N/A ` di tengah, mempertahankan area dan transformasi
template. Binding bersama menerapkannya pada output Studio, Label Print, dan
intake tersimpan. Perilaku ini tidak mengubah data tersimpan, contoh pada Design,
validasi status RFC, atau kontrol printer. Lihat
[kontrak binding](docs/TEMPLATE_BINDING_CONTRACT.md).

## Tujuan printer logis per transaksi

Intake eksternal mendukung `target_id` logis opsional per transaksi dalam mode
print. Izin sumber Management menyediakan pilihan printer tambahan yang diizinkan;
IP/port tetap dikelola server. Lihat [kontrak API](docs/API_CONTRACT.md) dan
`PRINTER_TEST.md` milik simulator di direktori saudara untuk prosedur penerimaan
loopback dua stasiun.

## Antrean permintaan SAP dan dua worker

Source API asinkron `/api/v2/label-intake`, antrean PostgreSQL dengan payload
terenkripsi, dua worker Linux, koordinasi printer bersama, dan layar Permintaan
SAP tersedia. HTTP 202 berarti permintaan tersimpan; SAP membaca hasil melalui
URL status. Tidak ada cetak ulang otomatis setelah hasil pengiriman tidak pasti.
Konfigurasi Ubuntu/HTTPS tersedia di `deploy/compose.production.yml`; antrean
dimulai dalam keadaan dijeda dan tidak menerapkan migrasi saat startup.

Lihat [kontrak, backup/restore, dan gerbang production](docs/PRODUCTION_QUEUE.md).
Implementasi source ini belum membuktikan deployment, batas memori Linux, SAP
aktual, pemulihan data, atau printer fisik pada target operasional.
