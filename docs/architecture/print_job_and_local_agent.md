# Arsitektur Print Job dan Local Print Agent

Status dokumen: desain awal Fase 2.3A. Belum production-ready dan belum merupakan implementasi.

## 1. Tujuan dan batasan

Dokumen ini mendefinisikan batas antara webservice Thermal Label Studio dan proses lokal yang mengirim artefak label ke printer. Fase ini hanya menghasilkan spesifikasi arsitektur, kontrak JSON, dan contoh profil printer.

Fase 2.3B2A menambahkan adapter HTTP pilot yang dinonaktifkan secara default. Adapter ini diuji offline dengan FastAPI TestClient; belum ada database baru, Windows Service, executable Print Agent, atau komunikasi printer. Template canonical pengguna juga tidak disentuh.

Keputusan pilot:

- Zebra memakai ZPL native.
- Honeywell/Intermec PM45 memakai IPL native sebagai jalur default pilot karena sudah terbukti dipakai untuk test print.
- PM45 juga memiliki jalur ZSim2/ZPL, tetapi baru digunakan untuk uji kompatibilitas berikutnya. Dalam kontrak job, emulation ditulis `zsim2`.
- PNG hanya untuk preview dan inspeksi manusia.
- SAP mengirim `printer_id`, bukan alamat IP.
- Resolusi DPI PM45 masih open question.

## 2. Alur end-to-end

```text
SAP / SAP integration producer
        |
        | HTTPS request: contract + printer_id + request_id
        v
Webservice Thermal Label Studio
  - validasi kontrak dan izin site
  - idempotency request_id
  - render artifact.ipl / artifact.zpl / artifact.png
  - checksum SHA-256
  - membuat print job
        |
        | HTTPS outbound dari agent: poll/claim/report
        v
Local Print Agent di workstation
  - autentikasi ke webservice
  - claim dengan lease
  - download artifact berdasarkan job_id
  - verifikasi SHA-256 dan bahasa printer
  - map printer_id -> endpoint lokal dari konfigurasi agent
  - connect/write timeout dan audit bytes_sent
        |
        | koneksi lokal RAW TCP 9100, hanya berdasarkan allowlist lokal
        v
Printer Honeywell/Intermec PM45 atau Zebra
```

Agent menggunakan koneksi keluar ke webservice. Webservice tidak perlu membuka port inbound ke workstation.

## 3. Mengapa browser tidak mengirim RAW TCP langsung

Browser tidak boleh menjadi pengendali koneksi printer karena:

1. API browser tidak memberi kontrol socket RAW TCP yang konsisten.
2. Alamat printer dan kredensial jaringan akan terekspos ke JavaScript dan pengguna.
3. Kebijakan browser, CORS, firewall, VPN, dan topologi jaringan dapat membuat hasil tidak konsisten.
4. Browser tidak cocok untuk lease, retry, audit bytes, pembatasan ukuran, dan pemulihan koneksi.
5. Aplikasi web dapat tertutup ketika job sedang dikirim.

Browser cukup membuat permintaan job dan menampilkan status. Local Print Agent menjadi boundary lokal yang dipercaya untuk memetakan `printer_id` ke endpoint yang sudah di-allowlist.

## 4. Tanggung jawab komponen

### Webservice

- Menerima permintaan dari SAP integration producer.
- Memvalidasi `request_id`, `site_id`, `printer_id`, bahasa, emulation, DPI, copies, dan ukuran payload.
- Melakukan idempotency sehingga request yang sama tidak membuat job ganda.
- Merender artefak menggunakan engine yang sesuai.
- Menyimpan atau menyediakan artefak dengan referensi opaque `payload_ref` dan SHA-256. Agent membentuk endpoint download dari trusted base URL miliknya sendiri; job tidak memasok URL.
- Mengelola status job, lease, expiry, cancellation, dan audit log.
- Membatasi agent berdasarkan `site_id` dan `agent_id`.
- Tidak menerima IP printer arbitrer dari payload SAP.

### Local Print Agent

- Berjalan sebagai Windows Service atau proses lokal terkelola.
- Menggunakan HTTPS dan autentikasi ke webservice.
- Hanya mengambil job untuk `site_id` yang diizinkan.
- Mengklaim satu job dengan lease agar satu job hanya dimiliki satu agent pada satu waktu.
- Mengunduh artefak berdasarkan `payload_ref` melalui trusted base URL agent, lalu memverifikasi SHA-256, bahasa, ukuran, dan profile printer.
- Memetakan `printer_id` ke IP/hostname dari konfigurasi lokal agent, bukan dari SAP.
- Menerapkan connect timeout dan write timeout.
- Mencatat `bytes_sent`, waktu, hasil, dan error per job.
- Tidak melakukan retry otomatis ketika delivery tidak dapat dipastikan.
- Tidak menganggap socket sukses sebagai bukti label tercetak.

## 5. Printer language dan profil

### Zebra ZPL native

ZPL adalah bahasa native pada printer Zebra. Encoder proyek menghasilkan format ZPL II dengan header/trailer `^XA` dan `^XZ`, ukuran print field, serta bitmap `^GFA`. Artefak diberi ekstensi eksplisit `label.zpl`.

### Honeywell/Intermec PM45 dengan ZSim2/ZPL

ZSim2 adalah emulasi yang membuat printer menerima subset/varian ZPL. Dalam kontrak, kombinasi yang valid adalah `printer_language: zpl` dan `emulation: zsim2`. Keberhasilan parsing tidak otomatis berarti posisi, font, barcode, darkness, atau speed sama dengan Zebra. Kompatibilitas harus diuji berdasarkan model PM45, firmware, konfigurasi ZSim2, media, dan isi label.

Jalur ini hanya profil tambahan untuk perbandingan berikutnya, bukan default pilot.

### Honeywell/Intermec PM45 dengan IPL native

IPL adalah jalur native Intermec/Honeywell yang dipilih sebagai default pilot PM45. Encoder IPL proyek menghasilkan stream biner dengan STX/ETX dan memiliki batas alignment bitmap, termasuk lebar kelipatan 8 dot. Artefak diberi ekstensi `label.ipl`.

File legacy `DATA.DAX` diperlakukan sebagai nama file lama saja. Isinya raw IPL; ekstensi `.DAX` bukan identitas bahasa printer. Artefak baru wajib memakai ekstensi bahasa yang jelas.

PNG memakai ekstensi `label.png` dan hanya untuk preview, bukan payload printer.

`printed` sengaja tidak digunakan dalam status v1. RAW TCP hanya dapat membuktikan pengiriman byte dari agent, bukan hasil fisik di media.

### Lifecycle artifact

`artifact` dan `artifact_sha256` selalu ada sebagai field root agar bentuk response stabil. Sebelum rendering selesai, keduanya bernilai `null`. Status `accepted` wajib menggunakan `artifact: null` dan `artifact_sha256: null`.

Status `rendered`, `queued`, `claimed`, `sending`, `sent_to_printer`, dan `delivery_unknown` wajib memiliki artifact object serta checksum SHA-256 valid. Status `failed`, `expired`, dan `cancelled` boleh memiliki artifact/checksum atau `null`, karena kegagalan dapat terjadi sebelum maupun sesudah rendering.

Artifact hanya memakai `payload_ref` opaque, nama `label.ipl` atau `label.zpl`, media type `application/octet-stream`, dan panjang 1 sampai 10 MiB. Agent membentuk endpoint download dari trusted base URL lokalnya sendiri, bukan dari URL dalam job.

## 6. Status print job

Status yang digunakan pada kontrak v1:

| Status | Arti |
|---|---|
| `accepted` | Request lolos validasi dasar dan diterima sebagai job idempotent. |
| `rendered` | Artefak berhasil dibuat dan checksum tersedia. |
| `queued` | Job menunggu agent yang diizinkan. |
| `claimed` | Satu agent memperoleh lease job. |
| `sending` | Agent sedang menulis byte ke koneksi printer. |
| `sent_to_printer` | Penulisan selesai menurut agent; bukan bukti label tercetak. |
| `delivery_unknown` | Koneksi putus atau hasil penerimaan printer tidak dapat dipastikan. |
| `failed` | Kegagalan yang diketahui sebelum kondisi delivery tidak pasti. |
| `expired` | Job melewati `expires_at` tanpa penyelesaian. |
| `cancelled` | Job dibatalkan sebelum pengiriman dimulai. |

Kondisi `delivery_unknown` meliputi koneksi terputus setelah sebagian atau seluruh byte mungkin terkirim, agent crash di tengah write, atau printer tidak menyediakan konfirmasi penerimaan. Job dalam status ini tidak boleh otomatis di-retry karena berisiko mencetak dua kali. Operator harus melakukan keputusan manual setelah memeriksa printer/media.

## 7. Idempotency, lease, dan retry

- `request_id` adalah kunci idempotency dari SAP. Request berulang dengan `request_id` dan payload yang sama mengembalikan job yang sama.
- Request dengan `request_id` sama tetapi payload berbeda harus ditolak sebagai konflik.
- `job_id` unik untuk satu job dan tidak dibuat ulang saat status berubah.
- Claim dilakukan secara atomik oleh webservice melalui object `claim` berisi `agent_id`, `claimed_at`, dan `lease_expires_at`. Status `accepted`, `rendered`, dan `queued` wajib memiliki `claim: null`.
- Status `claimed`, `sending`, `sent_to_printer`, dan `delivery_unknown` wajib memiliki claim object strict. Status `failed`, `expired`, dan `cancelled` boleh memiliki claim object atau `null`; claim final dipertahankan untuk audit agent yang melakukan pengiriman.
- `lease_expires_at` harus lebih besar dari `claimed_at`; perbandingan urutan tanggal dilakukan aplikasi karena JSON Schema tidak cukup untuk membandingkan dua nilai tanggal.
- Agent wajib memperbarui lease hanya ketika masih memiliki claim yang sah.
- Job yang lease-nya kedaluwarsa dapat kembali `queued` hanya jika belum masuk `sending`.
- Retry otomatis aman hanya untuk kegagalan yang dipastikan terjadi sebelum koneksi/write dimulai.
- Setelah `sending` menghasilkan kondisi tidak pasti, status menjadi `delivery_unknown` dan retry otomatis dilarang.
- `copies` dirender sebagai satu job dengan jumlah salinan yang tervalidasi; agent tidak boleh menggandakan job ketika mengulang laporan status.

## 8. Keamanan

### HTTP API Print Agent pilot

Router `/api/v1/print-agent` hanya dapat digunakan bila `PRINT_AGENT_API_ENABLED=true` dan bearer token, `agent_id`, `site_id`, serta profile registry tervalidasi dikonfigurasi lengkap. `PrintAgentSettings.from_environment()` dipakai saat lifespan bootstrap aplikasi utama. Konfigurasi yang tidak lengkap gagal tertutup dengan `503`; token tidak dipercaya dari body job dan dibandingkan menggunakan constant-time comparison. Dependency repository, temporary artifact storage, profile registry, dan limiter diinjeksikan ke application state untuk menghindari singleton mutable yang bocor antar-test.

Endpoint pilot menyediakan claim-next, pembacaan job, download artefak untuk pemilik claim aktif, begin-delivery, dan pelaporan `success`, `failure_before_send`, atau `delivery_unknown`. Claim-next memfilter site, printer, bahasa, emulation, dan DPI yang confirmed di dalam operasi repository atomik; job yang tidak cocok tidak mendapat lease. Tidak ada endpoint create-job atau penerimaan raw SVG. Callback outcome yang sama idempotent setelah ownership diverifikasi di dalam lock repository, outcome berbeda menghasilkan conflict, dan `delivery_unknown` tidak di-retry otomatis. Unexpected error ditangani oleh route class Print Agent saja dan dikembalikan sebagai 500 generik; exception handler catch-all tidak dipasang pada aplikasi utama. Log hanya mencatat event tersanitasi berupa method, route template, dan nama class exception; body, query, URL mentah, path filesystem, token, pesan exception, dan traceback tidak dicatat. Mutasi dan download artefak dibatasi oleh limiter in-memory per agent; karena credential registry pilot saat ini satu principal per process kecuali dependency test diinjeksi, ini hanya cocok untuk single-process pilot dan bukan proteksi multi-worker/production.

Saat lifespan berakhir, temporary artifact directory dibersihkan dan dependency state dilepas. Repository memory sengaja dibuat ulang pada startup, sehingga restart menghasilkan state job kosong. Profile lokal hanya dibaca dari path konfigurasi trusted melalui `PRINT_AGENT_PROFILE_CONFIG` dan setiap entry divalidasi sebagai `PrinterProfile`; tidak ada profile nyata atau DPI yang disimpan di source.

Bearer token adalah mekanisme pilot sementara. Sebelum produksi, ganti dengan enrollment agent dan mTLS/OAuth atau mekanisme autentikasi terkelola dengan rotasi dan pencabutan credential.

- Semua komunikasi agent-webservice memakai HTTPS dan autentikasi agent yang dapat dicabut.
- Agent memiliki allowlist `site_id` dan printer profile lokal.
- `printer_id` adalah identifier logis. IP/hostname hanya berada di konfigurasi lokal agent.
- Payload SAP tidak boleh membawa host/IP yang kemudian dipakai langsung untuk koneksi.
- Webservice membatasi bahasa printer, emulation, kecocokan filename dengan bahasa, DPI, ukuran artefak, dan `copies` (maksimum 100 untuk pilot; server dapat menerapkan batas yang lebih rendah per site atau printer).
- `payload_ref` adalah identifier opaque tanpa slash, backslash, colon, URL, atau traversal. `filename` hanya boleh `label.ipl` atau `label.zpl`, `media_type` harus `application/octet-stream`, dan `byte_length` harus integer 1 sampai 10 MiB (10.485.760 byte).
- Agent membentuk endpoint download hanya dari trusted base URL lokalnya sendiri dan `payload_ref`; URL, host, atau path tidak pernah diterima dari payload job.
- Artefak diverifikasi dengan SHA-256 sebelum dikirim.
- Checksum `artifact_sha256` harus berupa 64 karakter hexadecimal lowercase (`^[a-f0-9]{64}$`).
- Job memiliki expiry dan audit log tanpa menyimpan secret.
- Source seperti `program: ZMMR_LABEL_JSON` hanya metadata/audit. Itu bukan autentikasi, authorization, atau aturan bisnis.
- Agent tidak membuka listener publik yang tidak diperlukan.
- Secret dan token nyata tidak boleh berada di contoh, source code, log, atau Git.

### Rekonsiliasi lease sebelum agent nyata

`claim_next` menjalankan rekonsiliasi atomik di dalam lock repository sebelum memilih kandidat. Crash sebelum `sending` dapat dipulihkan: jika lease pada status `claimed` habis sementara `expires_at` job belum tercapai, claim dilepas dan job kembali ke `queued`, sehingga agent lain dapat mengklaimnya. Jika job sudah mencapai expiry, status menjadi `expired` dan tidak dapat diklaim kembali. Status `accepted`, `rendered`, dan `queued` yang sudah mencapai `expires_at` juga ditandai `expired` oleh rekonsiliasi.

Crash setelah status `sending` berisiko mencetak ganda: jika lease atau expiry tercapai, job menjadi `delivery_unknown`, claim terakhir dipertahankan untuk audit, dan tidak dikembalikan ke queue atau di-retry otomatis. `sent_to_printer` tetap hanya berarti bytes dilaporkan telah dikirim, bukan bukti label tercetak. Belum ada heartbeat atau lease renewal; desain tersebut menjadi pertanyaan fase berikutnya.

## 9. Satu agent per workstation atau satu agent per plant

### Rekomendasi pilot: satu agent per workstation

Model ini paling sederhana untuk PM45 karena koneksi printer biasanya lokal pada komputer pengguna. Isolasi masalah lebih mudah, mapping printer berada dekat dengan perangkat, dan kegagalan satu workstation tidak memblokir workstation lain.

Trade-off-nya adalah lebih banyak instalasi, enrollment, patching, dan monitoring agent.

### Model skala: satu agent per plant

Satu agent terpusat dapat mengurangi jumlah instalasi dan memudahkan operasi, tetapi membutuhkan konektivitas jaringan ke semua printer, high availability, mapping printer yang lebih kompleks, serta blast radius lebih besar ketika agent gagal.

Model plant dapat dipertimbangkan setelah pilot membuktikan kebutuhan operasional dan jaringan.

## 10. Pilot dan produksi

### Pilot

1. Konfirmasi DPI PM45 dan konfigurasi media. Nilai `dpi: 203` pada contoh print job hanyalah nilai contoh, bukan konfirmasi DPI perangkat pengguna.
2. Gunakan PM45 IPL native sebagai baseline.
3. Rekam artefak `label.ipl`, preview `label.png`, checksum, bytes sent, dan status.
4. Bandingkan hasil IPL dengan ZSim2/ZPL pada label, barcode, posisi, darkness, speed, dan multi-copy.
5. Uji disconnect sebelum write, saat write, setelah write, restart agent, duplicate `request_id`, expiry, dan cancellation.
6. Gunakan printer profile lokal tanpa alamat IP di repository.

### Produksi

Produksi memerlukan enrollment agent, rotasi credential, HTTPS certificate validation, audit retention, observability, dead-letter/manual review untuk `delivery_unknown`, backup metadata job, release/rollback plan, dan uji kompatibilitas per model/firmware. Semua itu belum diimplementasikan pada fase ini.

### Batas Local Print Agent offline

Fondasi `backend/app/local_print_agent/` masih memakai model `PrintJob` dari backend sebagai shared contract sementara. Sebelum agent dipaketkan menjadi proses executable terpisah, model dan kontrak ini perlu dipisahkan atau diterbitkan sebagai package bersama dengan versioning yang jelas. `run_once` pada fase ini hanya menjalankan satu siklus offline dengan API client yang dapat diinjeksi dan `MemoryPrinterTransport`; belum ada polling, heartbeat, executable, atau koneksi printer.

### Ambiguitas request mutasi agent

`begin_delivery` mengubah state job sehingga hasil timeout, transport error, 5xx, atau response sukses yang malformed tidak membuktikan apakah server sudah masuk ke `sending`. Penolakan definitif (401, 403, 404, 409, 410, 422, atau 429) berhenti tanpa recovery callback. Hasil ambigu tidak memanggil transport dan mencoba tepat satu callback `failure_before_send` dengan `bytes_sent: 0`; callback sukses berarti `failed_before_send`, sedangkan callback gagal berarti `uncertain`. Tidak ada retry otomatis.

Artifact response diperlakukan sebagai boundary tidak tepercaya. Client membaca chunk secara bounded, memeriksa media type, ukuran, checksum, dan `Content-Disposition` yang harus persis berupa `attachment; filename="label.ipl"` atau `attachment; filename="label.zpl"`. Header invalid tidak meneruskan `ValidationError` mentah dan tidak pernah mencapai `begin_delivery` atau transport.

Respons `report_result` juga merupakan boundary yang tidak tepercaya. Client mem-parse object `job`, `outcome`, dan `bytes_sent` dengan model strict; property tambahan, bentuk malformed, outcome/bytes yang berbeda dari request, status akhir yang tidak sesuai, atau inkonsistensi pada snapshot immutable job (termasuk claim dan `attempt_count`) membuat hasil menjadi `uncertain`. Untuk callback normal setelah pengiriman berhasil/gagal, `final_job.attempt_count` harus persis sama dengan `sending_job.attempt_count`. Untuk recovery `failure_before_send` setelah begin ambigu, keberhasilan callback membuktikan bahwa server telah mengeksekusi `begin_delivery`, sehingga `final_job.attempt_count` wajib tepat bernilai `claimed_job.attempt_count + 1`; response recovery dengan `attempt_count` yang tidak bertambah (sama dengan claimed) atau melompat tidak wajar ditolak sebagai `uncertain`. Recovery hanya dicoba satu kali pada begin yang ambigu; response recovery yang valid menghasilkan `failed_before_send`, sedangkan response malformed atau tidak konsisten menghasilkan `uncertain`. Setelah transport dipanggil, callback yang tidak dapat divalidasi tidak boleh memicu pengiriman ulang payload.

## 11. Kekurangan batch legacy sebagai baseline

Batch legacy membaca seluruh byte `DATA.DAX`, membuka TCP lokal port 9100, menulis byte, lalu menutup stream dan koneksi. Baseline ini tidak cukup untuk sistem job modern karena:

- IP hardcoded.
- `status.txt` tunggal selalu ditimpa.
- Tidak ada `job_id` atau `request_id` idempotent.
- Tidak ada timeout eksplisit yang terkoordinasi.
- Tidak aman untuk job paralel.
- Tidak ada checksum.
- Tidak ada pembatasan ukuran payload.
- Tidak ada allowlist printer.
- Sukses socket tidak membuktikan label tercetak.

Local Print Agent dirancang untuk menutup kekurangan tersebut tanpa mengubah keputusan bahasa PM45 pada pilot.

## 12. Asumsi dan open questions

- DPI PM45 belum dikonfirmasi.
- Model dan firmware PM45 harus dicatat sebelum uji ZSim2.
- Detail autentikasi agent, enrollment, dan penyimpanan credential belum dipilih.
- Media, darkness, speed, cutter, dan perilaku multi-copy perlu acceptance test.
- Kontrak v1 belum production-ready sampai lifecycle job dan audit store diimplementasikan.
