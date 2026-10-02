# F3.45 — Controlled UI migration: Login and Canvas Setup

## Tujuan

Menerapkan primitive `shared/ui` pada Login dan Canvas Setup untuk hierarchy visual industrial gelap yang konsisten, tanpa mengubah behavior.

## Scope

- Hanya `features/auth/ui/LoginPage.tsx`, `components/modals/CanvasSetupModal.tsx`, serta child UI langsung `components/modals/canvas-setup/*`.
- Gunakan Button, Dialog, Field/Input, Select, Badge/Status, Empty/Error state dan token semantic bila sesuai.
- Pertahankan test IDs, focus/submit/error Login, callback modal, lifecycle template/canvas, dan input dimensi/DPI.

## Batas

- Tidak memindahkan ownership feature, mengubah endpoint/backend/store/security, Docker/Git, atau menyentuh dialog Print/Simulation/Templates.
- Copy baru/diubah berbahasa Inggris.
- Tidak commit, push, deploy, restart/stop service.

## Acceptance criteria

1. Login dan Canvas Setup memakai primitive shared yang relevan.
2. Seluruh prop/callback/test ID dan behavior input tetap sama.
3. Tsc, structural coverage, full test, build, diff check dicatat aktual.
