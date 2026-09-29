# F3.25 Result

Implemented visual table editing on top of the F3.24 versioned `tableSpec`:

- selected tables show draggable internal row and column handles;
- double-click opens a positioned inline cell editor with Enter/blur commit and
  Escape cancel;
- a cell's token binding is preserved when its literal preview text changes;
- border presets support cell/row/column/table scope, outer/inner/all/selected
  sides, none/solid/dashed style, width, and shared-edge normalization;
- Props controls remain available for exact dimensions, content, and border
  values.

## Checks

- `npm run typecheck:core`: PASS.
- `npm test`: PASS, 105 tests.
- `npm run build`: PASS, Vite transformed 1,848 modules.
- `npx playwright test tests/table_editor.spec.js --project=chromium`: PASS,
  3 tests including authentication setup, resize/border/SVG roundtrip, and
  inline double-click edit/cancel.
- `git diff --check` on the F3.25 paths: PASS; Git only reported the existing
  LF-to-CRLF normalization warning.

The focused browser run used the local authenticated test server. No physical
printer was involved.
