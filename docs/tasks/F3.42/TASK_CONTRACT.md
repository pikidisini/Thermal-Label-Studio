# F3.42 — Feature ownership batch aplikasi dan shell

## Tujuan

Menetapkan owner feature untuk domain aplikasi yang masih tersebar di `components`, `hooks`, dan `utils`, tanpa redesign atau perubahan perilaku.

## Scope

- Audit Template Explorer/template lifecycle, simulation/SAP shadow flow, serta print/export.
- Pindahkan domain hanya bila import graph memungkinkan pemindahan utuh dengan public barrel.
- Generic layout, studio shell, dan editor canvas tetap di lokasi generik.

## Batas eksplisit

- Tidak mengubah warna, layout, UX, endpoint, kontrak backend, security/auth, port, Docker, atau lifecycle Git.
- Tidak memindahkan Canvas, Line, Snapping, Text, Graphics, Images, Barcode/QR, Table, atau Data Tokens.
- Tidak commit, push, deploy, restart/stop service.

## Acceptance criteria

1. Feature yang dipindahkan memiliki public `index.ts` dan caller lintas-feature menggunakannya.
2. UI, test ID, handler, endpoint, dan kontrak data tetap sama.
3. Hasil audit menjelaskan domain yang dipindahkan dan yang ditahan serta alasannya.
4. TypeScript penuh, test frontend penuh, build, `git diff --check`, dan audit import legacy dicatat dengan status aktual.
