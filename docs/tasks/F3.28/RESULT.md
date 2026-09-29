# F3.28 Result

Implemented optional `rowSpan`/`colSpan` fields in tableSpec v1 with bounded validation, overlap rejection, merge and split helpers, and legacy normalization. Table rendering draws anchor text and span-sized outer borders while retaining covered cells. The contextual toolbar uses compact accessible icon buttons with title tooltips and conditionally exposes Merge cells / Split cell.

Range selection now takes precedence over Fabric group movement: pressing inside a table cell temporarily locks table movement, so drag selects a rectangular cell range instead of moving the table. The selection overlay records its bounds for browser verification.

Validation on 2026-09-26:

- `npm run typecheck:core` — PASS.
- `npm test` — PASS, 21 tests including merge/split model coverage.
- `npx playwright test tests/table_editor.spec.js --project=chromium` — PASS, 5 tests. The new browser case drags a `2 × 2` range, asserts `Merge cells`, merges it, then asserts and runs `Split cell`.
- `git diff --check` — PASS; output contains only pre-existing line-ending notices.
