# Ringkasan task penerapan universal label pipeline

Diperbarui: 2026-10-10 (Asia/Jakarta).

## Tujuan penerapan

Menyediakan API intake universal untuk menerima JSON dari SAP, MES, atau aplikasi lain menggunakan kontrak terbaru Studio. Pemrosesan data ke template untuk preview dan print Studio serta intake eksternal menggunakan binding server bersama dan engine raster/IPL yang sudah ada. Data Tokens tetap menjadi fitur editor dan tidak menerima request eksternal.

Tabel berikut menjelaskan **tujuan dan capaian yang ditargetkan**, bukan hasil implementasi yang sudah terbukti. Seluruh task masih **PENDING** pada saat ringkasan ini dibuat. Status pelaksanaan terbaru dicatat dalam [STATUS.md](STATUS.md), sedangkan bukti hasil dan review dicatat per task.

## Tujuan dan capaian setiap task

| Task | Fokus | Tujuan dan capaian yang ditargetkan |
| --- | --- | --- |
| [T01](tasks/T01_BASELINE_AND_CONTRACT.md) | Baseline dan kontrak | Memeriksa source terbaru serta menetapkan kontrak request/response, metadata binding, batas sumber daya, dan matriks pengujian kesesuaian. Menghasilkan **BASELINE.md, CONTRACT.md, dan PARITY_MATRIX.md** sebagai acuan task berikutnya, tanpa perubahan perilaku aplikasi. |
| [T02](tasks/T02_CANONICAL_LABEL_DATA.md) | Kontrak JSON bersama | Menyelaraskan validasi backend, parser Studio, dan dataset dengan `mode` berupa `simulation` atau `print`, serta `copies` berupa integer **1–999** per item. Menetapkan aturan data dan penanganan sample lama tanpa mencetak otomatis ketika JSON diimpor. |
| [T03](tasks/T03_TEMPLATE_METADATA.md) | Metadata template | Membaca dan memvalidasi metadata binding dari SVG hasil Studio. Menghasilkan kontrak metadata/manifest yang dikenali server, dengan versi dan batas fitur yang jelas; metadata tidak valid atau fitur yang tidak didukung ditolak secara eksplisit. |
| [T04](tasks/T04_TEXT_AND_COMPOSITION.md) | Binding teks dan komposisi | Mengisi teks, field, literal, komposisi, dan multiline di server sesuai aturan yang disepakati. Mempertahankan nilai data serta geometri yang didukung, membedakan missing/null/empty/zero/false, dan menolak binding wajib yang tidak terselesaikan. |
| [T05](tasks/T05_BARCODE_AND_QR.md) | Binding barcode dan QR | Membentuk ulang barcode/QR dari data aktual melalui metadata template dan dependency yang dipilih. Membuktikan kesesuaian payload, opsi, dan hasil render dengan Studio; tidak menggunakan gambar atau nilai sample lama sebagai fallback diam-diam. |
| [T06](tasks/T06_STUDIO_SHARED_OUTPUT.md) | Penyatuan output Studio | Membawa preview dan print Studio melalui binding backend bersama menggunakan draft dan data yang dipilih. Membuktikan kesesuaian hasil, mempertahankan alur editor tanpa wajib menyimpan draft terlebih dahulu, serta menjaga print sebagai tindakan eksplisit pengguna. |
| [T07](tasks/T07_INTAKE_SIMULATION.md) | Intake universal untuk simulasi | Memproses JSON eksternal menggunakan template tersimpan berdasarkan `label_code`, mengunci versi/checksum yang dipakai, lalu menggunakan binding dan engine bersama. Memberikan hasil simulasi atau kegagalan yang jelas per item dengan batas batch; belum mengaktifkan print eksternal. |
| [T08](tasks/T08_DURABLE_REQUEST_IDENTITY.md) | Identitas request dan deduplikasi | Membuat ledger persisten untuk identitas sumber/request, digest input, versi template, dan hasil per item. Menangani request berulang, konkurensi, kehilangan respons, dan batas recovery tanpa cetak ulang otomatis setelah kemungkinan pengiriman; penolakan input yang berubah dan kondisi `UNCERTAIN` dinyatakan jelas. |
| [T09](tasks/T09_ADMISSION_AND_TARGET_POLICY.md) | Admission, approval, dan target | Memeriksa sumber serta kemampuan yang diizinkan, versi/checksum template yang boleh dicetak, dan routing printer milik server. Print eksternal ditolak secara default sampai kebijakan dikonfigurasi; JSON tidak dapat memilih tujuan jaringan sembarangan, dan penyimpanan template tidak otomatis menjadi approval. |
| [T10](tasks/T10_INTAKE_PRINT.md) | Print intake dan hasil per item | Menghubungkan `mode=print` setelah validasi seluruh batch, kebijakan, dan ledger memenuhi syarat. Menggunakan satu payload dan satu percobaan submit per item dengan native IPL copies; mengembalikan `SUBMITTED` dengan `confirmed=false`, `FAILED`, `UNCERTAIN`, atau status item tidak dikirim sesuai kontrak. Menghentikan pengiriman berikutnya jika terjadi ketidakpastian. |
| [T11](tasks/T11_SOURCE_AND_RUNTIME_ACCEPTANCE.md) | Acceptance utama perangkat lunak dan runtime | Memverifikasi source, kontrak API, serta kesamaan binding/pixel/payload Studio dan intake. Membandingkan bitmap dengan hasil decode IPL menjadi PNG, menggunakan fixture codec independen, dan memeriksa byte/copies melalui transport uji. Mencatat bukti quality, penyimpanan, restart/recovery, dan runtime paket secara terpisah; pengujian runtime yang memerlukan target dijalankan sesuai otorisasi. |
| [T12](tasks/T12_PHYSICAL_ACCEPTANCE.md) | Acceptance fisik dan integrasi eksternal — **opsional** | Jika diminta dan targetnya diotorisasi, membuktikan jumlah label, ukuran/posisi, keterbacaan, serta hasil scan barcode/QR pada printer tertentu. Mencatat integrasi sumber eksternal secara terpisah dari client sintetis. Task ini menambah bukti perangkat dan **tidak menjadi syarat acceptance perangkat lunak**. |

## Urutan dan batas capaian

- Jalur utama penerapan: **T01–T11**. Jalankan satu task sesuai dependensinya, dengan hasil dan review sebelum task yang bergantung padanya dimulai.
- **T12 opsional**, dijalankan hanya ketika diminta untuk printer atau sumber eksternal yang disebutkan secara eksplisit.
- Kelulusan preview/simulasi IPL membuktikan kesesuaian perangkat lunak dalam cakupan yang diuji. Bukti transport uji memeriksa payload dan jumlah submit tanpa mengirim ke printer fisik.
- Penyimpanan aktual, recovery setelah restart, runtime paket, integrasi eksternal, dan hasil printer fisik memiliki gerbang bukti masing-masing. Gerbang yang belum dijalankan tetap **NOT RUN**.
- `SUBMITTED` berarti pengiriman lokal berhasil dilakukan; status tersebut tidak mengonfirmasi bahwa label sudah tercetak secara fisik.

T01 **DONE**: [baseline source](BASELINE.md), [kontrak yang dibekukan](CONTRACT.md), [matriks parity](PARITY_MATRIX.md), dan [hasil writer](results/T01_RESULT.md) telah melalui [review independen PASS](results/T01_REVIEW.md). T02 siap dikerjakan dan belum dimulai. Dokumen ini tidak membuktikan bahwa intake/binding universal telah diterapkan atau runtime telah diuji.

T02 **DONE**: validasi kanonis bersama, mode wajib/copies 1–999, pemeriksaan JSON mentah dan batas Unicode, serta eksplorasi historis baca-saja dengan salinan kerja eksplisit telah diterapkan. Source gate independen dan [review T02](results/T02_REVIEW.md) **PASS**; intake universal dan T03 belum dimulai. Lihat [hasil T02](results/T02_RESULT.md) untuk batas bukti dan file yang diubah.

Rincian lingkup, dependensi, kriteria penerimaan, dan pengujian terdapat dalam file task yang ditautkan di atas. Lihat [README.md](README.md) untuk gambaran arsitektur dan aturan pelaksanaan.
