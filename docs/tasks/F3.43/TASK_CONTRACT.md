# F3.43 — Ownership Data Tokens, Diagnostics, dan Auth UI

## Tujuan

Merapikan owner frontend untuk domain berisiko rendah yang masih tersebar tanpa mengubah perilaku aplikasi, endpoint, atau security boundary server.

## Scope

- Audit dan, bila graph siap, pindahkan Data Tokens/SAP contract UI serta helper import JSON lokal ke feature domain yang jelas.
- Pindahkan AI diagnostics UI, session recorder, dan report ke Diagnostics.
- Pindahkan authentication UI/API/store-facing action hanya bila adapter publik dapat mempertahankan server behavior.
- Audit Canvas Setup; hanya pindahkan bila owner Canvas terbukti dari import graph, selain itu dokumentasikan sebagai deferred.

## Batas eksplisit

- Store Zustand tetap shared kecuali benar-benar feature-owned.
- Layout shell, generic APIs, keyboard accessibility, UI/desain, backend/endpoints/security, Docker, dan Git lifecycle tidak diubah.
- Tidak commit, push, deploy, restart/stop service.

## Acceptance criteria

1. Feature yang dipindahkan memiliki public `index.ts`, dan caller lintas-domain memakai public API.
2. Test ID, handler, API contract, session/auth server behavior, dan UI tidak berubah.
3. Keputusan Canvas Setup dan domain yang ditahan dicatat dengan alasan import graph.
4. Tsc, test, build, diff check, serta audit import legacy dilaporkan dengan status aktual.
