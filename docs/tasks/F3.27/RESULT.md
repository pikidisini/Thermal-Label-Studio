# F3.27 Result

Implemented direct rectangular range selection with visible canvas highlight and Escape cleanup; internal row/column divider hit areas replace circular handles and retain the unrotated constraint. Added an accessible contextual toolbar for bounded row/column insertion and deletion plus all/outer/inner/top/right/bottom/left/clear border presets. Shared `tableSpec` remains the source of truth and merge/split controls are intentionally absent.

## Checks

- `npm run typecheck:core`: PASS.
- `npm test`: PASS, 107 tests. This includes table range borders with shared
  edge synchronization and bounded row/column structural operations.
- `npx playwright test tests/table_editor.spec.js --project=chromium`: PASS,
  4 tests including authentication setup, SVG roundtrip, direct divider
  resizing, inline editing, range toolbar visibility, Row below, border
  command availability, and Escape cleanup.

The direct full TypeScript command still reaches the existing unrelated
`AuthenticatedStudio.tsx` two-argument `handleAddTable` mismatch. No new
diagnostics originated in F3.27.
