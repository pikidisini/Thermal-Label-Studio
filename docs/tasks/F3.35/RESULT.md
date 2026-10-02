# F3.35 — Hasil

Status: DONE — ready for independent review

## Perubahan

- Kepemilikan canvas sekarang berada di `frontend/src/features/canvas/` dengan `ui/`, `ruler/`, dan `editor/`.
- Public API feature mengekspos shell canvas, ruler, lifecycle Fabric, dan hooks viewport.
- `AuthenticatedStudio` memakai public API tersebut.
- `getMajorStepMm` dipisahkan sebagai fungsi murni dan diberi test untuk progresi ruler 1/2/5.

## Validasi

- PASS — `npm.cmd run typecheck:core`.
- PASS — `npm.cmd exec tsc -- --noEmit`.
- PASS — `npm.cmd test`, 126 test lulus. Percobaan awal di sandbox diblokir `spawn EPERM`; rerun di luar sandbox lulus.
- PASS — `npm.cmd run build`, 1,864 modul ditransformasi. Percobaan awal di sandbox juga diblokir `spawn EPERM`; rerun di luar sandbox lulus.
- PASS — audit import: tidak ada import produksi yang masih merujuk ke `components/canvas`, `hooks/useRulers`, `hooks/useFabricCanvas`, atau hook viewport lama di `hooks/canvas`.
- PASS — `git diff --check`.

## Batas dan risiko

- `features/snapping` tidak diubah; ruler tetap hanya menggambar skala dari geometri viewport.
- Browser/E2E UAT tidak dijalankan dalam writer pass ini. Validasi membuktikan type/build/test lokal, bukan interaksi visual ruler saat zoom dan pan.
