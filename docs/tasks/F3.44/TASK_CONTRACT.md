# F3.44 — Shared UI foundation

## Tujuan

Membuat primitive UI publik dan token desain semantik berdasarkan visual editor gelap saat ini, tanpa redesign aplikasi.

## Scope

- Audit `index.css`, Tailwind, dan shared UI existing.
- Tambahkan primitive public untuk Button, IconButton, Dialog shell, Field/Input, Select, Badge/Status, EmptyState/ErrorState.
- Konsolidasikan token semantic surface/text/border/primary/status/focus/spacing/radius.
- Migrasikan paling banyak dua dialog risiko rendah bila behavior, test ID, dan a11y dapat dipertahankan.

## Batas eksplisit

- Tidak mengubah endpoint/backend/auth/store/Docker/Git, atau melakukan overhaul visual editor.
- Copy baru memakai bahasa Inggris.
- Tidak commit, push, deploy, restart/stop service.

## Acceptance criteria

1. `shared/ui` memiliki public barrel dan primitive yang dapat digunakan feature baru.
2. Token semantik mempertahankan dark industrial editor saat ini.
3. Maksimal dua dialog dipindahkan tanpa perubahan handler/test ID/a11y.
4. Structural test, tsc, test, build, dan diff check dicatat dengan status aktual.
