# F3.35 — Feature boundary canvas dan ruler

## Tujuan

Memindahkan kepemilikan aktual shell canvas, lifecycle Fabric, gesture viewport, dan ruler ke `frontend/src/features/canvas/`, tanpa mengubah perilaku editor.

## Ruang lingkup

- `StudioCanvas` dan `CanvasViewport` menjadi UI milik feature canvas.
- `CanvasRuler`, perhitungan skala ruler, dan `useRulers` menjadi submodul `canvas/ruler`.
- `useFabricCanvas`, auto-fit, wheel zoom, dan touchpad/space-pan menjadi `canvas/editor`.
- `AuthenticatedStudio` memakai public API feature canvas.
- Export kompatibilitas hanya dipertahankan bila import lama masih bernilai bagi konsumen internal.

## Di luar ruang lingkup

- Tidak ada perubahan pada `features/snapping`, tool garis/tabel, backend, printer, SAP, atau deployment.
- Tidak ada perubahan test ID atau perilaku zoom, pan, canvas, dan ruler.

## Acceptance criteria

1. Implementasi tinggal di `features/canvas/{ui,ruler,editor}` dan memiliki public `index.ts`.
2. `AuthenticatedStudio` tidak lagi mengimpor StudioCanvas dari `components/canvas`.
3. Ruler tetap memakai sumber viewport yang sama untuk zoom/pan dan mendapat test murni bagi skala major.
4. TypeScript penuh, frontend test, Vite build, dan `git diff --check` lulus.
