# Review independen — B2B2L

Status: `CHANGES_REQUIRED` (2026-09-23). Reviewer: Codex Level 3.

Scope review adalah perubahan **working tree lokal yang belum di-commit** di
branch `codex/b2b2l-profile-composition-engine`, bukan hanya diff commit
`origin/main...HEAD`. Jangan membuat PR atau merge sebelum temuan di bawah
dikoreksi dan diuji ulang.

## Bukti yang diperiksa

- Membaca model, composer, N001 adapter, integrasi Safe Demo, test, dan task
  contract. `git diff --check` lulus untuk file tracked; file baru perlu
  diperiksa juga sebelum checkpoint.
- Test B2B2L dijalankan ulang: `23 passed, 2 warnings` dengan temporary
  directory yang dapat diakses. Percobaan awal tanpa akses temporary yang
  diperlukan gagal karena `PermissionError` Windows, bukan assertion aplikasi.
- Diagnostic probe read-only di Python membuktikan kasus yang tidak
  tertangkap suite executor. Probe tidak mengakses SAP, printer, Docker,
  atau database.
- Gabungan 116 test dilaporkan PASS oleh executor di `RESULT.md`; reviewer
  **belum menjalankan ulang** gabungan tersebut.

## Temuan wajib diperbaiki

### P1-1 — Provenance audit dapat dicetak pada QR

`backend/app/models/profile_composition_v1.py` memasukkan
`production_date_provenance` ke allowlist field label. Resolver pada
`backend/app/services/profile_composer.py` mengubah nilai dictionary itu
menjadi string untuk QR. Probe membuktikan payload QR menjadi
`{'source': 'Z_GET_PRODUCTION_DATE'}`. Kontrak B2B2K menyatakan provenance
hanya untuk audit dan tidak boleh muncul pada label atau tampilan operator.

Koreksi: keluarkan semua metadata provenance/audit dari namespace field yang
bisa dipilih elemen label, dan uji penolakan referensinya. Periksa field
tambahan yang bersifat audit dengan aturan yang sama.

### P1-2 — Versi profile tidak immutable dan registry tidak thread-safe

`ProfileRegistry.register()` menyimpan instance Pydantic mutable dan `get()`
mengembalikan instance yang sama; tidak ada lock meskipun docstring mengklaim
thread-safe. Probe mengubah literal pada hasil `get('N001','0.1.0-dev')`, lalu
`get()` untuk versi yang sama mengembalikan literal baru. Dengan demikian,
konfigurasi satu versi dapat berubah diam-diam dan batch baru memakai aturan
berbeda dengan identitas versi lama. `clear_for_tests()` juga memutasi
registry global, termasuk bila dipanggil melalui `SapShadowService`.

Koreksi: simpan snapshot yang benar-benar immutable/deep-copied, kembalikan
view/copy yang tidak dapat memutasi state registry, lindungi operasi registry
yang shared, dan isolasikan registry dalam test tanpa reset global service.
Test harus mencoba mutasi nested segment dan memastikan hash/config yang
terdaftar tetap sama serta version pin tetap stabil.

### P1-3 — Hasil komposisi teks N001 hilang; jenis slot bisa tertukar

`N001DevelopmentAdapter.adapt_item()` hanya meneruskan `comp_result.codes`;
`comp_result.fields` tidak digabung ke `SapCanonicalFields`. Probe mendaftarkan
elemen `text` untuk slot `batch_text` berisi `COMPOSED-TEXT`, namun hasil
canonical tetap `B260901`. Ini melanggar tujuan teks configurable dan AC 4.

Selain itu, `validate_template_compatibility()` menerima slot bila ID hanya
muncul sebagai substring di `raw_svg`, bahkan jika atributnya milik jenis
elemen lain. Probe menargetkan `qr_payload` sebagai `barcode` Code128 dan
validasi tetap lolos, padahal template memakai `data-qr="qr_payload"`.

Koreksi: terapkan teks hasil composer pada data render dengan mapping slot
yang eksplisit; validasi slot harus membandingkan tipe dan ID atribut yang
diparse, bukan substring SVG. Tolak slot kode yang tidak dapat disalurkan
oleh kontrak renderer. Uji hasil SVG/raster/PDF yang benar-benar memuat
komposisi, bukan hanya jumlah/ukuran halaman PDF.

### P1-4 — Format angka dapat diam-diam mengubah atau melewatkan data invalid

`apply_field_formatting()` untuk `round_decimal` menghapus semua karakter
selain angka, titik, dan minus, lalu memakai `float`; parse yang gagal malah
mengembalikan input mentah. Contoh `12kg34` berubah menjadi `1234.00`, sedangkan
`not-a-number` lolos sebagai teks yang tidak diformat. Ini tidak memenuhi
aturan deterministik fail-closed untuk nilai pengukuran pada label.

Koreksi: definisikan format numerik input yang eksplisit, parse secara ketat
(misalnya Decimal), tolak nilai invalid/non-finite dan parameter format yang
tidak sesuai operasi, lalu uji kasus campuran huruf, separator, dan overflow.

## Temuan tambahan

### P2-1 — Pemilihan versi dari payload SAP belum memenuhi kepemilikan aplikasi

`RawSapItemSnapshotV2` dan `RawSapBatchSnapshotV2` menerima
`profile_version` dari pengirim. Service memprioritaskan nilai itu, sedangkan
versi default registry berubah mengikuti urutan `register()`. Keputusan
proyek menempatkan pemilihan profile/rule pada aplikasi. Tetapkan kebijakan
server-side yang jelas tentang siapa boleh memilih versi; jangan membuat
versi yang dipilih SAP otomatis berlaku tanpa otorisasi/kebijakan aplikasi.
Uji replay dengan perubahan default versi dan mismatch batch/item.

### P2-2 — Bukti PDF test lebih sempit dari klaim RESULT

Test AC 4 hanya memeriksa PDF header, jumlah halaman, watermark, dan ukuran
halaman. Test itu belum membuktikan teks hasil komposisi, nilai barcode, atau
isi QR pada gambar halaman. Tambahkan assertion pada hasil renderer atau
decode barcode/QR dari evidence agar kegagalan silent fallback terdeteksi.

## Keputusan dan langkah koreksi

`CHANGES_REQUIRED`: AC 3, 4, 5, dan 6 belum terbukti terpenuhi, dan boundary
provenance B2B2K dilanggar. Gemini tetap menjadi executor tunggal untuk
koreksi pada branch yang sama. Setelah koreksi, jalankan test B2B2L,
regression B2B2K/B2B2I, `git diff --check`, serta audit file baru/secret.
Perbarui `RESULT.md` dengan hasil aktual, lalu kembalikan branch kepada
Codex untuk review ulang. Belum ada commit/push/PR/merge untuk implementasi.

## Review ulang Codex — 2026-09-23 (setelah remediasi Gemini)

**Verdict: CHANGES_REQUIRED.** Empat temuan P1 awal pada provenance, registry,
mapping teks/slot, dan parsing numerik sudah diperbaiki pada kode yang ditinjau.
Namun, satu kebocoran data pada jalur error dan dua celah acceptance criteria
masih tersisa. Implementasi tetap uncommitted; jangan commit/push/PR/merge dahulu.

### P1 — Nilai raw SAP muncul dalam error HTTP publik

`profile_composer.py` pada `apply_field_formatting()` memasukkan `val_str`
ke pesan `ProfileCompositionError` ketika `round_decimal` menerima nilai
non-numerik atau non-finite. `ProfileCompositionError` adalah turunan
`ValueError`; `routes_sap_shadow.py` meneruskan `str(exc)` ke HTTP 400 pada
`POST /raw-batches`. Probe lokal memakai nilai sintetis
`SYNTHETIC_PRIVATE_TEXT` dan pesan exception mencetak nilai itu utuh.
Konfigurasi profile dapat menunjuk `customer_text` atau fakta SAP lain,
sehingga ini melanggar AC 7 (raw/customer text tidak boleh berada di error
publik). Gunakan kategori/identitas field yang aman tanpa nilai raw, lalu
uji response HTTP tidak memuat sentinel sintetis.

### P2 — Payload SAP masih dapat memilih versi profile di luar pin aplikasi

`SapShadowService.ingest_raw_batch()` masih mendahulukan
`it.profile_version or batch_req_version` daripada
`ProfileRegistry.get_active_version()`. `set_active_version()` hanya
menentukan default jika SAP tidak mengirim versi. Karena SAP adalah sumber
fakta mentah sementara aplikasi memilih profile/rules, ini belum menutup
temuan P2-1. Test baru hanya memeriksa mismatch batch/item dan pemilihan
default; belum menguji request SAP yang meminta versi terdaftar tetapi tidak
aktif. Tetapkan kebijakan server-side eksplisit (misalnya reject versi yang
berbeda dari versi aktif untuk endpoint SAP ini) dan uji kasus tersebut.

### P2 — Test PDF belum memverifikasi isi yang dikomposisikan

`test_p2_2_deep_evidence_composed_text_and_code_inspection` mengirim literal
`VERIFIED-TEXT-INSPECTION` serta payload barcode/QR, tetapi assertions hanya
memeriksa PDF dua halaman, satu gambar berukuran 1600x640, dan adanya piksel
gelap/terang. Gambar label lama tanpa teks/QR yang diminta pun dapat lolos.
AC 4 mensyaratkan hasil render/evidence benar-benar mencerminkan komposisi.
Tambahkan assertion pada `final_svg` hasil jalur render nyata atau decode
simbol dari image/PDF; bandingkan nilai teks, Code128, dan QR yang diharapkan
secara eksplisit. Jangan hanya menguji ukuran/non-blank.

### Bukti verifikasi review ulang

- Regresi lokal B2B2L + B2B2K + B2B2I:
  `127 passed, 2 warnings` dengan `--basetemp` terisolasi.
- Perintah awal review salah menamai dua test file dan menghasilkan
  `file or directory not found`; perintah diperbaiki lalu lulus.
- PostgreSQL, SAP, printer fisik, dan frontend: `NOT RUN` pada review ini.
- Hasil test yang lulus tidak menghapus tiga temuan di atas karena skenario
  tersebut belum diassert oleh suite saat ini.

## Review ulang Codex — 2026-09-23 (remediasi putaran berikutnya)

**Verdict: CHANGES_REQUIRED, tersisa satu celah bukti P2.** Dua temuan
sebelumnya sudah tertutup: `round_decimal` tidak lagi memasukkan nilai raw
ke exception dan test HTTP memastikan sentinel sintetis tidak bocor;
`ingest_raw_batch()` kini menolak versi yang diminta SAP bila berbeda dari
versi aktif yang dipin aplikasi. Test untuk kedua kasus lulus.

Test render juga kini memeriksa teks persis di `rendered_svg`, keberadaan
path Code128/QR pada SVG hasil pipeline nyata, serta PDF image yang tidak
kosong. Akan tetapi, test Code128/QR baru membandingkan **jumlah** bar/run
(`path.d.count("Z")`), bukan pola atau payload yang dikodekan. Probe lokal:
`BATCH-INSPECT-99` dan `WRONG-INSPECT-99` masing-masing menghasilkan 58
bar Code128, tetapi bit pattern keduanya berbeda. Jadi assertion saat ini
dapat lolos bila barcode memuat nilai yang salah. Klaim `RESULT.md` bahwa
bit pattern cocok masih lebih kuat daripada bukti test. Untuk menutup AC 4,
bandingkan geometri/path lengkap terhadap hasil generator dari payload yang
diharapkan, atau decode Code128 dan QR dari output; pertahankan assertion
PDF yang ada. Perbaiki pula deskripsi bukti di `RESULT.md` agar tepat.

Verifikasi mandiri putaran ini:

- B2B2L + B2B2K + B2B2I: `129 passed, 2 warnings`.
- Seluruh backend: `367 passed, 21 skipped, 2 warnings`.
- `git diff --check`: PASS (hanya warning LF/CRLF); direct whitespace scan
  tiga file baru: PASS.
- Secret high-signal scan pada kode baru/diff: tidak ada temuan.
- `git fetch origin`: BLOCKED oleh izin tulis `.git/FETCH_HEAD`; review
  dilakukan terhadap branch lokal dan working tree yang terlihat.
- SAP, printer, database production, frontend: NOT RUN dalam review ini.

Gemini tetap satu-satunya writer kode. Setelah assertion isi simbol dan
klaim evidence diperbaiki, jalankan test terkait lalu minta review ulang.
Jangan commit/push/PR/merge sebelum verdict berubah menjadi siap.

## Review akhir Codex — 2026-09-23 (koreksi bukti simbol)

**Verdict: READY_FOR_CHECKPOINT.** Satu celah P2 tersisa pada review sebelumnya
sudah ditutup. Test sekarang membandingkan seluruh geometri `path d` Code128
dan QR dengan generator untuk payload yang diharapkan, membedakannya dari
payload salah, lalu merekonstruksi bit Code128 serta matriks boolean QR dari
SVG hasil pipeline render. Test juga tetap memeriksa teks tepat di SVG dan
gambar raster dalam PDF evidence. Ini memenuhi bukti AC 4 untuk slice Safe
Demo development, tanpa mengklaim hasil cetak fisik atau persetujuan PPIC.

Pemeriksaan mandiri pada branch lokal:

- B2B2L + B2B2K + B2B2I: `129 passed, 2 warnings` (dijalankan ulang dalam
  review ini dengan temporary storage terisolasi).
- `git diff --check`: PASS; hanya warning LF/CRLF Git pada Windows.
- Direct whitespace scan tiga file baru: PASS. Scan secret high-signal file
  baru: tidak ada temuan.
- Seluruh backend `367 passed, 21 skipped, 2 warnings` adalah hasil review
  sebelumnya sebelum perubahan test simbol terakhir; tidak dijalankan ulang
  pada putaran ini karena perubahan terakhir hanya pada test dan dokumentasi.
- Frontend, SAP live, printer fisik, dan database production: NOT RUN.
- `git fetch origin` pada review sebelumnya terhalang izin tulis
  `.git/FETCH_HEAD`; kesiapan ini berlaku untuk working tree lokal yang
  diperiksa. Sebelum PR, executor harus memastikan remote/upstream terbaru.

Tidak ada blocker P0/P1/P2 yang tersisa dalam scope B2B2L. `RESULT.md`
memetakan bukti terbaru; frasa kelulusan 100% di sana harus dibaca sebagai
hasil suite yang dijalankan, bukan status production-ready. Profile N001
tetap development-only; persetujuan PPIC, konfigurasi production, dan printer
nyata masih di luar scope.

**Langkah checkpoint:** Gemini sebagai satu-satunya writer branch boleh
mereview staged diff, commit dan push file B2B2L yang relevan. Codex dapat
mereview PR setelah push; jangan merge ke `main` sebelum review PR.
