# F3.35 — Review feature boundary canvas dan ruler

Status: PASS — siap untuk checkpoint Git; belum di-commit, dipush, atau dideploy.

## Keputusan review

Refaktor memindahkan kepemilikan implementasi aktual ke
`frontend/src/features/canvas/`, bukan sekadar menambah wrapper. Struktur
`ui/`, `ruler/`, dan `editor/` menjaga ruler sebagai visualisasi viewport,
sementara `features/snapping` tetap terpisah dan tidak diubah.

Path lama dihapus setelah audit memastikan tidak ada import produksi yang
masih bergantung pada `components/canvas`, `hooks/useRulers`,
`hooks/useFabricCanvas`, atau hook viewport lama. `AuthenticatedStudio` hanya
mengakses `StudioCanvas` melalui public API `features/canvas`.

## Bukti reviewer independen

- PASS — audit import path lama tidak menemukan referensi produksi.
- PASS — `npx tsc -p tsconfig.json --noEmit`.
- PASS — `npm run typecheck:core`.
- PASS — `npm test`, 126 lulus dari 126.
- PASS — `npm run build`, 1.864 modul ditransformasi.
- PASS — `git diff --check`.
- PASS — pemeriksaan visual lokal pada `http://127.0.0.1:8765`: ruler tetap
  mengikuti sheet setelah zoom, dan interval major tetap terbaca.

## Batas

- Warning SSR `useLayoutEffect` pada `StudioCanvas` telah ada sebelum
  perpindahan file; warning tidak menyebabkan test gagal.
- Tidak ada browser E2E otomatis untuk kombinasi zoom/pan/resizing label.
- Tidak ada perubahan backend, SAP, printer, container utama port 8000,
  commit, push, atau deployment.
