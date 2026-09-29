# F3.31 — Urutan implementasi dan handoff

Status: T01–T07 implemented and automated gates passed; manual UAT/reviewer decision pending. Pengguna mengotorisasi mulai pada 2026-09-26. Luna 5.6 medium mencapai usage limit dan peralihan dilaporkan; writer tunggal berlanjut dengan gpt-6-luna medium. Sol 6 read-only reviewer. Tidak memakai Astra.
Requirement pengguna ada di TASK_CONTRACT.md. Tiap checkpoint harus berjalan end-to-end pada behavior yang sudah masuk.

## T01 — Model kerangka v2 dan invariant (AC01, AC07–AC11)

- Definisikan tipe/model tanpa isi sel, partisi merged region, shared edge matrices dan validator bounded.
- Implementasikan operasi murni create, select/expand region, merge, split, resize global/internal, styling, insert/delete/distribute.
- Tetapkan remap edge/region saat struktur berubah dan rollback invalid command.
- Gunakan geometry helper bersama; hilangkan duplikasi hit testing yang menyebabkan posisi overlay berbeda.
- Unit test invariant: total dimensi tetap, region complete/non-overlap, split reversibility, minimal dimensions, malformed metadata.
- Checkpoint: model/unit/full tsc lulus; jangan menghubungkan UI v1 ke model setengah selesai.

## T02 — Renderer vektor dan serialisasi dasar (AC01, AC06, AC11–AC13)

- Render shared segments sekali, hide interior merge berdasarkan region, dukung solid/dashed/dotted/none/color.
- Jaga bounding box tetap sebesar dimensi model, termasuk jika semua border none; jangan bergantung pada bounding box child text/garis.
- Preview dan commit mempertahankan ketebalan garis terhadap zoom dan global scale.
- Update tableVersion, daftar properti Fabric, exporter/importer dan draft validator agar konsisten v2.
- Jangan memasukkan helper invisible bounds/handles ke hasil cetak.
- Checkpoint: render fixture dan SVG round-trip awal lulus; tidak ada binding dalam tabel.

## T03 — Picker dan penempatan (AC02–AC04)

- Buat React grid picker 10 × 8 dengan indikator jumlah, keyboard dan Escape.
- Hubungkan tool ke state placing: drag preview, empat arah, fallback click, ukuran mm, batas sheet, snap.
- Listener dipasang sekali dan dibersihkan saat cancel/unmount/tool switch.
- Checkpoint: browser create/cancel/default-click/keyboard lulus sebelum gesture editing ditambah.

## T04 — Mode objek, resize dan edit kerangka (AC05–AC08, AC14–AC16)

- Implementasikan mode objek vs edit; prioritaskan handle/internal line/body secara eksplisit.
- Global handles dan internal divider mengubah model mm, commit satu history entry.
- Tambah seleksi rentang drag/Shift+klik dan klik merged region tanpa memindahkan tabel.
- Terapkan inverse transform untuk zoom/pan/rotation; hit slop dalam CSS px.
- Pointercancel/Escape/blur/unmount memulihkan lock dan menutup overlay; tidak ada stale callback ke objek yang sudah diganti.
- Checkpoint: browser drag/resize/selection dan unit koordinat lulus. Review khusus cleanup serta history.

## T05 — Merge, split, style dan struktur (AC07–AC11, AC16)

- Hubungkan command model ke satu menu kontekstual dengan label jelas dan inspector ringkas.
- Merge/split wajib berfungsi melalui seleksi visual; tidak hanya memilih nomor cell dari dropdown.
- Pilihan styling menunjukkan sasaran; pembedaan click segment dan drag divider sesuai threshold.
- Insert/delete/distribute mengikuti aturan total size dan merged spans pada kontrak.
- Hapus kontrol font/text/token dan inline editor tabel v1 yang sudah tidak terpakai; tidak menghapus tool Text/QR/Barcode global.
- Checkpoint: unit + browser merge/style/structure serta undo/redo lulus.

## T06 — Integrasi persistence dan render (AC12–AC17)

- Uji template lokal/server, draft refresh, duplicate, Layers, SVG import/export dan preview/render lokal.
- Dua tabel dan teks/barcode mandiri di template yang sama tidak saling terpengaruh.
- Legacy v1 boleh ditolak dengan pesan; tidak ada migrasi/destructive storage reset.
- Backend tetap memvalidasi SVG sesuai batas keamanan existing. Bila format baru memerlukan perubahan renderer/guard, batasi perubahan dan tambah tes relevan.
- Test server memakai storage disposable, bukan koleksi MinIO pengguna.
- Checkpoint: uji end-to-end serialisasi dan backend render contract lulus tanpa printer.

## T07 — Review dan QA pengguna

- Jalankan gate akhir, audit diff berdasarkan perubahan task dibanding snapshot awal, periksa untracked files.
- Buka UI hasil dengan template baru dan jalankan skenario UAT di TEST_MATRIX.md.
- Cek 100%, 50%, 200% zoom; panel sempit; menu tidak keluar viewport.
- Perbarui RESULT.md, REVIEW.md, docs/AI_HANDOFF.md dan status fase.
- Stop setelah hasil lokal reviewable. Commit/push/deployment mengikuti instruksi terpisah.

## File kandidat; konfirmasi ulang sebelum edit

| Area | Kandidat |
|---|---|
| Model/renderer/editor/UI | frontend/src/features/table/** |
| Legacy re-export | frontend/src/utils/tableSpec.ts |
| Entry tool | frontend/src/hooks/canvas/useTableActions.ts; frontend/src/hooks/useCanvasActions.ts |
| Toolbox integrasi | frontend/src/components/layout/LeftToolbox.tsx; komponennya yang meneruskan onAddTable |
| Canvas lifecycle | frontend/src/hooks/useFabricCanvas.ts; frontend/src/components/canvas/StudioCanvas.tsx |
| Generic property update | frontend/src/hooks/canvas/useObjectOrderingActions.ts |
| Inspector/Layers | frontend/src/components/layout/inspector/ObjectPropertyForm.tsx; LayersTab.tsx |
| Studio wiring | frontend/src/components/studio/AuthenticatedStudio.tsx |
| Metadata/SVG/draft | frontend/src/types/fabric-custom.ts; frontend/src/utils/fabricSvgExporter.ts; fabricSvgImporter.ts; editorDraftRecovery.ts |
| History/tool state | frontend/src/store/useHistoryStore.ts; useStudioStore.ts, hanya bila integrasi membutuhkan |
| Test/check config | frontend/tests/table_spec.mjs; table_editor.spec.js; frontend/package.json; tsconfig terkait |
| Render contract | backend/tests/test_renderer_table_contract.py; engine/renderer.py dan SVG guard hanya jika ada kebutuhan terbukti |

Nama file boleh disesuaikan agar mengikuti struktur aktual. Model/UI/editor harus tetap memiliki tanggung jawab terpisah.
Jangan mengubah auth, SAP, print-dispatch, MinIO config atau deployment untuk merombak tabel.

## Arahan reviewer/writer

- Satu writer aktif; reviewer boleh membaca dan menjalankan pemeriksaan independen.
- Sebelum setiap langkah: tulis kandidat file, risiko dan acceptance yang ditargetkan.
- Hasil writer harus mencakup implementasi terhubung; file baru tanpa caller atau wrapper children kosong bukan penyelesaian refaktor.
- Jangan menaruh return sebelum implementasi lama sebagai pengganti penghapusan duplikasi.
- Jangan menutup pekerjaan karena typecheck:core lulus; full src dan modul baru harus dicakup.
- Jika check terkena spawn EPERM, bedakan kegagalan environment dari error kode dan gunakan mekanisme izin yang tersedia. Jangan mengklaim test lulus.
- Jika kontrak tidak dapat dipenuhi, catat blocker spesifik dan bukti; jangan mengurangi scope secara diam-diam.

## Prompt mulai siap pakai

> Lanjutkan F3.31. Baca AGENTS.md serta docs/tasks/F3.31/TASK_CONTRACT.md, IMPLEMENTATION_PLAN.md dan TEST_MATRIX.md. Kerjakan T01 sampai T07: tabel hanya kerangka garis, merge/split wajib, tanpa isi sel/font/placeholder/formula dan tanpa migrasi template lama. Writer aktual gpt-6-luna medium karena Luna 5.6 mencapai usage limit; Sol 6 tetap reviewer read-only. Jangan gunakan Astra. Pertahankan perubahan lokal yang ada, verifikasi behavior dan update RESULT/REVIEW. Jangan commit, push atau deploy.
