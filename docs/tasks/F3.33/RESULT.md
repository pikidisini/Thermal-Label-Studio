# F3.33 Result — Explicit line anchors

Fitur garis menggunakan gesture click-drag satu segmen. Blank drag di area kosong selalu dapat memulai segmen independen; blank click tanpa drag tidak membuat garis. Pengguna dapat memilih endpoint anchor untuk continuation. HUD menjelaskan drag area kosong, klik anchor, Shift snap 45°, dan Escape.

- Preview tidak selectable/evented; selection marquee dan target finding dinonaktifkan selama gesture.
- Anchor editor-only berukuran 16 px, memiliki normal/hover/active state, mengikuti viewport zoom/pan, dan tidak menjadi Fabric object.
- Snap sudut memakai interval 45°; Shift memaksa sudut terdekat. Endpoint dekat anchor tersnap tepat.
- Escape pertama membatalkan preview/armed continuation dengan committed lines tetap; Escape kedua saat idle keluar tool.
- HUD menyediakan instruksi drag area kosong, klik anchor, Shift snap 45°, Escape, serta ketebalan mm `0.05–5`.
- Anchor tidak masuk Fabric serialization, undo payload, SVG export, preview cetak, atau daftar object desain.
- Anchor overlay dideduplikasi berdasarkan koordinat layar dengan toleransi 4 px, sehingga junction beberapa line hanya memiliki satu anchor. Cleanup dinamis menghapus anchor stale saat endpoint digabung atau dipisahkan kembali.

## Reviewer gates

- TypeScript: PASS (`npx tsc --noEmit`).
- Frontend unit suite: PASS (122/122).
- Vite build: PASS (1857 modules).
- Focused Playwright `line_feature.spec.js`: PASS (13/13), termasuk regression dynamic endpoint merge/split dan anchor dedupe.
- Focused browser coverage includes anchor position/16 px size stability after zoom.
- `git diff --check`: PASS.
- Live `http://127.0.0.1:8765/` and `/api/v1/health`: HTTP 200; asset `index-Cc3GqpFF.js` verified.

Manual physical-printer, SAP production, MinIO, and deployment validation remain NOT RUN.
