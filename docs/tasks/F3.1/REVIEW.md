# Fase 3.1 — Review Independen Codex

Tanggal: 2026-09-23

Commit ditinjau: `bcf3556` pada `codex/f3-1-simulasi-label-terpadu`

Verdict: `CHANGES_REQUIRED` sebelum PR/merge.

## Yang sesuai

- Dokumen rancangan `docs/architecture/simulation_experience_plan.md` sudah masuk commit dan tertaut dari kontrak task.
- Satu tombol `btn-label-simulation` menggantikan dua tombol lama. Matriks empat kombinasi capability diuji; tombol mengarah ke modal operator yang memiliki alur impor JSON, batch/item, dan PDF.
- Backend Safe Demo lama tidak dihapus. Tidak ada perubahan backend, kontrak JSON, atau transport printer pada diff F3.1.
- Bukti ulang reviewer: `npm.cmd test` menghasilkan 74 passed; `npm.cmd exec tsc -- --noEmit` exit 0. Percobaan unit test pertama terhalang `spawn EPERM` sandbox sebelum test berjalan, lalu lulus dengan akses environment yang diperlukan. Playwright/backend/build dilaporkan lulus oleh executor di `RESULT.md`, tetapi tidak dijalankan ulang oleh reviewer ini.

## Temuan yang perlu diperbaiki

1. **P2 — Jalur developer-only terbuka pada bundle pengguna.** `frontend/src/App.tsx` menambahkan `?dev_safe_demo=true` dan `window.__openSafeDemoModal` tanpa pembatasan environment. Setiap pengguna browser dapat membuka modal lama dengan URL atau console. Ini tidak menjadikan API lebih terbuka daripada flag backend yang sudah ada, tetapi bertentangan dengan tujuan F3.1 bahwa Safe Demo lama tidak menjadi pintu pengguna. Jangan mengandalkan tombol yang disembunyikan sebagai authorization. Hapus hook publik dari build biasa; regression test lama sebaiknya menguji komponen/API melalui harness test atau akses yang benar-benar dibatasi ke development. Hindari `as any` baru pada jalur ini.
2. **P2 — Klaim lokasi pemrosesan terlalu pasti.** `frontend/src/components/modals/SapShadowSimulationModal.tsx` menyebut berkas diproses oleh “server lokal” dan tidak dibagikan ke jaringan publik. Aplikasi juga dapat di-host di server intranet Linux, sehingga “lokal” dapat dipahami sebagai komputer pengguna dan tidak selalu benar. Ubah menjadi kalimat yang akurat untuk deployment lokal maupun intranet: berkas diunggah ke server aplikasi yang sedang digunakan untuk simulasi/PDF; tidak dikirim ke printer fisik. Jangan menjanjikan batas jaringan yang tidak dibuktikan UI.
3. **P3 — Bukti handoff stale sesudah commit.** `docs/tasks/F3.1/RESULT.md` masih mengatakan “Siap untuk di-commit dan di-push”, padahal `bcf3556` sudah menjadi HEAD dan sama dengan upstream saat review. Perbarui status checkpoint dengan hash aktual. `docs/AI_HANDOFF.md` perlu memastikan snapshot teratas konsisten setelah koreksi.

## Verifikasi sesudah koreksi

- Jalankan ulang unit test, TypeScript check, build, dan E2E simulasi/legacy Safe Demo terkait. Jika mengubah jalur keamanan/backend, jalankan backend regression relevan.
- Pastikan tidak ada `dev_safe_demo` atau `__openSafeDemoModal` yang dapat dipakai pada bundle biasa; test tetap bisa memverifikasi fasilitas legacy tanpa pintu pengguna baru.
- Periksa `git diff --check`, diff final, dan status Git. `output/` yang sudah ada sebelum fase ini jangan ikut commit.
- Executor mencatat bukti baru di `RESULT.md`, commit/push perbaikan di branch yang sama, lalu berhenti sebelum PR/merge untuk review ulang Codex.

## Review ulang commit `f32334d` — 2026-09-23

Verdict: `READY_FOR_PR` dengan satu catatan dokumentasi P3 non-blocking. Belum berarti siap merge atau production-ready; PR tetap perlu ditinjau terhadap target branch yang benar.

- P2 akses modal lama: **teratasi untuk production bundle**. Hook global dan `as any` baru dihapus. Parameter `dev_safe_demo` dibatasi oleh `import.meta.env.DEV` dan capability Safe Demo. Reviewer membangun ulang frontend dan memindai `dist/assets/`; tidak ada string `dev_safe_demo` atau `__openSafeDemoModal`. Pada Vite development server, parameter itu memang tetap dapat dipakai bila Safe Demo aktif; jangan jalankan dev server dengan flag tersebut untuk pengguna bersama. Endpoint Safe Demo lama sendiri tetap hanya dijaga oleh `SAFE_DEMO_MODE` (risiko existing di luar perubahan UI ini), sehingga flag tersebut harus OFF pada deployment yang bukan lingkungan developer/test.
- P2 klaim privasi: **teratasi**. Teks kini menyatakan berkas diunggah ke server aplikasi yang sedang digunakan, tanpa klaim bahwa server selalu berada di komputer pengguna atau janji perimeter jaringan publik.
- P3 status checkpoint: **masih stale, non-blocking**. `RESULT.md` bagian akhir masih berbunyi “Siap di-commit dan di-push” walau commit `f32334d` sudah menjadi HEAD dan sama dengan upstream saat review ini. Rapikan sebelum/di PR, tetapi tidak perlu mengulang implementasi atau test karena hanya metadata dokumentasi.
- Verifikasi ulang reviewer setelah koreksi: `npm.cmd test` **74 passed**, `npm.cmd exec tsc -- --noEmit` **PASS**, `npm.cmd run build` **PASS**, scan bundle dev hook **0 matches**, `git diff --check 0b3de08..HEAD` **PASS**. Playwright E2E (8 test) dan backend regression (24 test) adalah bukti dari executor di `RESULT.md`; reviewer tidak menjalankannya ulang. UAT SAP DEV/printer **NOT RUN**.
- Folder `output/` tetap untracked dan tidak masuk commit. Jangan stage artefak itu.

## Koreksi putusan setelah refresh baseline Git — 2026-09-23

Status final: `F3.1_CODE_REVIEW_PASS; PR_TO_MAIN_NOT_YET_CLEARED`. Bagian `READY_FOR_PR` di atas hanya berlaku untuk kualitas perubahan F3.1 dan **tidak** berarti branch ini siap diajukan sebagai PR F3.1 tunggal ke `main`.

Setelah `git fetch origin`, `origin/main` tetap `0f2cf82` (PR #24). Branch ini membawa checkpoint B2B2N `35f9cb5` dan B2B2O `8d895a9` **selain** commit F3.1. `git diff origin/main...HEAD` mencakup 34 file, termasuk backend auth/upload dan ABAP; area itu tidak dicakup oleh review F3.1 ini. Membuat PR ke `main` dengan judul F3.1 saja akan menyamarkan scope dan bukti review.

Sebelum PR/merge, pilih salah satu jalur yang jelas: (a) review dan merge dependency B2B2N/B2B2O lebih dulu, lalu perbarui F3.1 terhadap `main`; atau (b) ajukan satu PR gabungan dengan judul/scope B2B2N+B2B2O+F3.1 dan lakukan review seluruh 34 file. Jangan menganggap review ini sebagai persetujuan atas dependency tersebut. Tidak ada rebase, reset, merge, atau perubahan dependency yang dilakukan dalam review ini.

## Review Level 3 gabungan B2B2N+B2B2O+F3.1 — 2026-09-23

Baseline: `origin/main` pada `0f2cf82`; head ditinjau: `e5d70e5`; diff gabungan 34 file. Verdict gabungan: **CHANGES_REQUIRED sebelum PR/merge ke main**. Persetujuan kualitas F3.1 di atas tetap berlaku untuk slice UI, tetapi tidak menutup temuan pada dua dependency.

### Temuan blocking

1. **P1 — Batas upload dan autentikasi dievaluasi setelah multipart diparsing.** `backend/app/api/routes_sap_shadow.py:579-580` memakai parameter `file: UploadFile = File(None)`, sedangkan pemeriksaan `Content-Length`, sesi/CSRF, rate limit, dan batas baca 2 MiB berada di dalam dependency/handler (`:594-653`). Pada FastAPI/Starlette yang terpasang, request form diparsing sebelum dependency/handler dijalankan; file part ditulis ke `SpooledTemporaryFile` saat parsing, dan batas `max_part_size` tidak membatasi file part. Karena tidak ada batas ukuran body di tingkat ASGI/proxy yang dapat diverifikasi pada branch, request multipart besar (termasuk tanpa/berbohong pada `Content-Length`) dapat menghabiskan disk/temp sebelum guard 2 MiB atau autentikasi bekerja. Terapkan batas total request body sebelum parsing (middleware/route/proxy tepercaya, dengan tes tanpa/invalid `Content-Length` dan client tanpa sesi), lalu pertahankan pemeriksaan 2 MiB isi file sebagai lapisan kedua. Bukti: kode lokal `fastapi.routing.get_request_handler` memanggil `request.form()` sebelum `solve_dependencies`; `starlette.formparsers.MultiPartParser` menulis file chunk tanpa pemeriksaan `max_part_size` untuk file. Dokumentasi resmi: [Starlette Requests](https://www.starlette.io/requests/) menjelaskan batas file part dan opsi `max_body_size`/middleware body limit.
2. **P1 — Ekspor ABAP tidak memenuhi semantik `SELECT-OPTIONS P_CHARG` dan ambiguity fail-closed.** `docs/tasks/B2B2O/abap/ZMMR_LABEL_JSON.abap:113-127` melakukan `LOOP AT P_CHARG` tetapi query selalu `WHERE CHARG = P_CHARG-LOW`, mengabaikan `SIGN`, `OPTION`, dan `HIGH`. Input range `BT`, pengecualian, atau pola tidak diproses sesuai pilihan pengguna. `SELECT SINGLE CHARG MATNR FROM MCH1 WHERE CHARG = ...` juga memilih satu material arbitrer jika nomor batch ada pada beberapa material, padahal kontrak B2B2O mensyaratkan ambigu ditolak. Perbaiki dengan ekspansi selection table yang benar dan deteksi jumlah pasangan material+batch, atau batasi UI/kontrak secara eksplisit ke satu nilai `EQ` dan tolak semua varian lain sebelum query. Buktikan dengan test/aktivasi di SAP SANDBOX/DEV sebelum menyebut ABAP siap dipakai; status aktivasi saat ini tetap `NOT RUN`.

### Temuan lain

3. **P2 — `request_id` dapat bertabrakan dalam satu detik.** Report ABAP baris 138-139 membangun key hanya dari `SY-SYSID`, `SY-DATUM`, dan `SY-UZEIT`. Dua ekspor dari sistem yang sama dalam detik yang sama mendapat key identik; service simulasi menggunakan `(producer_namespace, request_id)` sebagai idempotency key dan menolak payload berbeda dengan `409 Conflict` (`backend/app/services/sap_shadow_service.py:682-700`). Gunakan identitas eksekusi yang unik namun tetap stabil untuk replay file yang sama, dan pertahankan batas panjang/pola kontrak. Uji dua ekspor berdekatan sebelum UAT nyata.
4. **P3 — Bukti status masih tertinggal.** `docs/tasks/F3.1/RESULT.md` tetap mengatakan siap commit/push walau commit sudah ada. Teks komentar client API juga masih menyebut `X-Pilot-Session-Token` meski autentikasi browser telah cookie-only. Rapikan pada koreksi, tanpa menyajikannya sebagai masalah runtime utama.

### Bukti dan batas review

- Reviewer menjalankan `python -m pytest backend/tests/test_pilot_operator_session.py backend/tests/test_pilot_operator_import_json.py -q -p no:cacheprovider`: **50 passed**, 2 warning dependency. Test yang lulus tidak membuktikan guard sebelum parsing karena skenario request tanpa batas body belum diuji.
- Reviewer telah menjalankan ulang unit frontend **74 passed**, TypeScript **PASS**, dan production build **PASS** pada review F3.1 sebelumnya; tidak diulang lagi pada putaran gabungan karena belum ada perubahan kode setelahnya. Delapan E2E adalah bukti executor di `RESULT.md`, bukan rerun reviewer.
- Static diff/`git diff --check origin/main...HEAD` **PASS**. Tidak ada file `output/` yang ter-track. ABAP activation, SAP DEV/SANDBOX runtime, PDF UAT manusia, printer fisik, dan deployment intranet **NOT RUN**.
- F3.1 tidak boleh dibuat PR/merge sebagai paket gabungan sampai P1 diperbaiki dan bukti baru dicatat. Tidak ada kode runtime atau ABAP yang diubah oleh reviewer ini.
