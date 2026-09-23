# Task Contract — B2B2N: Uji Mandiri Safe Demo dengan SAP DEV

## Status dan tujuan

- Status: `PLANNED`. Level 3 karena menyentuh akses data SAP dan PDF lewat browser.
- Baseline: `origin/main` commit `0f2cf82` setelah PR #24 (B2B2M) merged.
- Branch: `codex/b2b2n-self-service-safe-demo`.
- Planner/reviewer akhir: Codex. Executor tunggal setelah checkpoint: Gemini Flash 3.8 High via Antigravity.
- Hasil bisnis yang dituju: pengguna menjalankan proses label dari SAP DEV, lalu **melihat sendiri** batch, urutan item, dan PDF simulasi pada aplikasi. Tidak ada cetak fisik.

## Fakta yang sudah ada

- Backend sudah menerima Raw SAP Snapshot v2 melalui endpoint simulasi, memproses N001 development-only, dan menghasilkan PDF evidence.
- Endpoint SAP saat ini memakai `X-SAP-Simulation-Token` sebagai kredensial **machine-to-machine**.
- UI `SapShadowSimulationModal` saat ini sengaja fail-closed untuk monitoring karena belum ada login pengguna/role PPIC. Token SAP tidak boleh dipindahkan ke browser.
- N001 adalah profile development sementara; aktivasi produksi, format barcode/QR final, dan layout bisnis PPIC belum disetujui.
- `docs/PROJECT_STATUS.md` dan riwayat `docs/AI_HANDOFF.md` memuat snapshot lama; verifikasi kondisi Git dan kode aktual sebelum bertindak.

## Vertical slice yang dikerjakan

1. **Akses operator pilot yang aman.** Sebelum membuka data di UI, rancang dan terapkan batas autentikasi pengguna terpisah dari token mesin SAP. Untuk slice ini boleh memakai mode developer/operator pilot yang eksplisit, default-off, terbatas dan dapat dimatikan; jangan mengklaimnya sebagai SSO/RBAC perusahaan. Secret tetap server-side, browser hanya menerima sesi terbatas yang aman. Jika tidak dapat membuat batas akses yang dapat dipertanggungjawabkan, berhenti dengan `BLOCKED`—jangan mengaktifkan UI anonim atau menaruh `X-SAP-Simulation-Token` di JavaScript, localStorage, URL, atau screenshot.
2. **Layar uji mandiri.** Setelah login pilot, pengguna dapat melihat daftar batch simulasi, status, waktu, jumlah/urutan item, alasan gagal yang aman, serta membuka/mengunduh PDF evidence. Tampilkan keadaan kosong, loading, error, expired/failed, dan restart. Jangan tampilkan seluruh raw snapshot/customer text pada daftar umum.
3. **Alur data SAP DEV.** Pertahankan endpoint penerimaan yang sekarang; dokumentasikan konfigurasi yang perlu dilakukan ABAP/IT untuk SAP DEV mengirim JSON ke URL intranet Linux dengan TLS dan token server-side. Uji end-to-end dengan data SAP DEV **hanya** bila host, jaringan, token, dan izin operasional benar-benar tersedia. Jangan mengarang data nyata atau menyebut test sintetis sebagai bukti pengiriman SAP DEV.
4. **Uji dari sudut pandang pengguna.** Tulis panduan pendek berbahasa awam: jalankan aplikasi mode pilot, buka layar simulasi, jalankan tcode label di SAP DEV, tunggu batch muncul, periksa urutan, buka PDF. Sertakan cara mengetahui bahwa simulasi tidak mengakses printer. Jika SAP DEV belum dapat mengirim ke host, berikan satu daftar prasyarat konkret untuk IT/ABAP dan status `BLOCKED` pada langkah live saja.

## Keputusan desain dan batas keamanan

- Jangan membuat editor komposisi/layout PPIC penuh dalam slice ini. Fokus pada pembuktian alur **SAP DEV → aplikasi → PDF** yang dapat dilihat pengguna; editor draft profile adalah subfase berikutnya setelah alur ini teruji.
- Tidak boleh memakai data sintetis sebagai bukti UAT lapangan. Fixture sintetis tetap boleh untuk automated test dan tidak boleh disamakan dengan data SAP DEV nyata.
- Jangan menaruh payload SAP nyata, nama pelanggan, customer text, token, PDF nyata, atau screenshot UAT di Git, log, error publik, atau test fixture. Ikuti kebijakan perusahaan untuk menyimpan data DEV pada komputer lokal.
- Tidak ada printer fisik, TCP 9100, Windows Spooler, eksekusi batch legacy, database production, atau perubahan SAP DEV melalui MCP. MCP SAP DEV/SANDBOX hanya read-only untuk konteks.
- Jangan mengubah kontrak Raw SAP Snapshot v2, idempotency, ordering, versi profile, approval gate N001, atau template kanonikal untuk membuat demo terlihat berhasil.
- Jangan membuka endpoint operator ke intranet tanpa autentikasi, TLS, pembatasan akses, dan review keamanan. Jika konfigurasi IT/identitas belum tersedia, implementasi UI boleh siap secara default-off, tetapi live rollout tetap `BLOCKED`.

## Acceptance criteria

1. Browser tanpa sesi tidak bisa membaca daftar/status/PDF; token SAP mesin tidak berada di frontend bundle, storage browser, URL, atau response operator.
2. Sesi operator pilot hanya dapat membaca data simulasi yang diizinkan; mutasi, raw snapshot sensitif, dan unduhan PDF memiliki otorisasi server-side. Uji logout, expiry, CSRF untuk mutasi, dan error generik.
3. UI dapat menampilkan batch dan urutan item dari API nyata secara in-process/e2e, lalu membuka PDF B2B2M; empty/loading/failure state dapat dipahami pengguna awam.
4. Endpoint SAP DEV machine-to-machine tetap menerima request valid dan menolak token salah/hilang, duplikasi yang tidak sah, serta input malformed tanpa jalur printer.
5. Bila lingkungan SAP DEV siap, jalankan satu UAT nyata menggunakan label code N001 development-only dan data yang diizinkan: catat request ID/batch ID teredaksi, urutan item, status, serta PDF yang **diperiksa manusia**, tanpa memasukkan data asli ke Git. Bila belum siap, tandai live UAT `BLOCKED` dan jangan klaim selesai end-to-end.
6. PDF tetap jelas bertanda simulasi; test dan inspeksi visual tidak menemukan placeholder mentah, overlap, atau pita yang menutupi konten.
7. Backend/frontend test terarah, TypeScript, build, dan E2E relevan lulus atau dilabeli `NOT RUN`/`BLOCKED` dengan alasan. Secret scan, `git diff --check`, dan pemeriksaan generated artifact dilakukan sebelum checkpoint.

## File kandidat dan handoff

- Backend: route/operator-session terpisah dari route SAP machine-to-machine; adapter read-only ke `SapShadowService` bila perlu.
- Frontend: `SapShadowSimulationModal`, client API operator tanpa token SAP, test UI/E2E.
- Dokumentasi: `docs/tasks/B2B2N/RESULT.md`, panduan UAT singkat, `docs/AI_HANDOFF.md`; `REVIEW.md` diisi Codex setelah review independen.
- Gemini mengerjakan pada branch ini sebagai satu-satunya writer, mencatat command dan bukti aktual di `RESULT.md`, lalu berhenti sebelum merge. Commit/push checkpoint hanya setelah staged diff diperiksa dan tanpa data SAP nyata/generated PDF.
- Bila auth pilot, host/TLS, atau akses SAP DEV memerlukan keputusan pengguna/IT, laporkan pertanyaan dan berhenti pada boundary tersebut; jangan menyiasati dengan menonaktifkan keamanan.
