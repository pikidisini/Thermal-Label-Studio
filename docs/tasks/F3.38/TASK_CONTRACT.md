# F3.38 — Frontend feature-first foundation (Graphics)

## Tujuan

Menetapkan fondasi refaktor feature-first tanpa mengubah perilaku aplikasi. Tahap ini memigrasikan seluruh kepemilikan frontend Graphics ke `frontend/src/features/graphics/` agar library grafik, aksi penempatan Fabric, API, tipe domain, dan Graphic Update Center berada dalam satu feature yang jelas.

## Scope

- Memindahkan `GraphicsSection`, `GraphicUpdateCenterModal`, client API dan tipe Graphics, serta `handleAddGraphic`/aksi canvas Grafik ke `features/graphics`.
- Memisahkan Upload Image/Logo mandiri ke `features/images`; asset ini tetap template-local dan tidak menjadi bagian dari library global Graphics.
- Menyediakan public barrel `features/graphics/index.ts`; shell `LeftToolbox`, `AuthenticatedStudio`, dan agregator canvas hanya mengimpor public API tersebut.
- Menempatkan `API_BASE` yang generik pada `shared/api` dengan re-export kompatibel dari lokasi API lama untuk menghindari migrasi luas yang tidak terkait.
- Memperbarui impor dan tes yang terdampak, dokumentasi handoff dan hasil.

## Di luar scope

- Tidak memindahkan Canvas, Line, Text, Snapping, Barcode/QR, Templates, atau Table pada tahap ini.
- Tidak mengubah desain, workflow, endpoint, payload, metadata asset, atau perilaku Graphics.
- Tidak commit, push, deploy, restart/stop service, mengakses printer, SAP, atau database produksi.

## Kriteria penerimaan

1. Tidak ada source import aktif ke path Graphics lama (`components/.../GraphicsSection`, `components/modals/GraphicUpdateCenterModal`, `utils/api/graphicsApi`, atau `hooks/canvas/useSymbolActions`).
2. `features/graphics` memiliki `api`, `hooks`, `model`, `ui`, dan public `index.ts`; `features/images` memiliki hook dan public API sendiri untuk Upload Image/Logo mandiri.
3. Graphics drawer serta Graphic Update Center tetap memakai kontrak API yang sama; `handleAddGraphic` tetap menanamkan metadata global asset ke Fabric.
4. TypeScript penuh, test frontend relevan, build Vite, dan `git diff --check` selesai atau hasil blocker dicatat secara jujur.
