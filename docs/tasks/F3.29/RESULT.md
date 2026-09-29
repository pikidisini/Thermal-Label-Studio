# F3.29 Result

Implemented per-cell text format fields in `tableSpec` with safe defaults and bounded validation. Table rendering now applies alignment, font family, font size, bold, and italic to the cell text. The contextual toolbar now exposes one compact `Tabel ▾` button; its dropdown groups structure, merge/split, text, and border actions. Right-clicking the selected range opens that same menu.

The toolbar is placed outside the selected range so the first click of a double-click cell edit cannot be intercepted by the format menu. The existing dynamic token and SVG metadata paths remain unchanged.

After operator feedback, the long icon strip and always-visible format panel
were replaced by one `Tabel ▾` trigger. Commands are grouped into structure,
merge/split, text, and borders. The menu starts closed, has bounded height,
and is positioned inside the canvas area. Its presentation builder now lives
in `frontend/src/features/table/floatingMenu.ts`; the rest of the editor will
move by the staged plan in `docs/architecture/frontend_table_feature_plan.md`.

Validation on 2026-09-26:

- `npm run typecheck:core` — PASS.
- `npm test` — PASS, 109 tests.
- `npx playwright test tests/table_editor.spec.js --project=chromium --workers=1 --grep "double-click"` — PASS, 2 tests including setup.
- `npx playwright test tests/table_editor.spec.js --project=chromium --workers=1 --grep "merge|format menu"` — PASS, 3 tests including setup.
- Existing table browser cases for SVG round-trip, inline editing, row actions, and merge/split passed in the targeted runs.
- `npm run build` — PASS, 1,849 modules transformed after the compact-menu update.
- `git diff --check` — PASS; only existing line-ending notices were emitted.
- After the compact-menu update: `npm run typecheck:core` PASS; targeted
  Chromium cases for merge/split and text formatting PASS (3 including setup).
