# F3.27 Review

Status: **PASS for the requested spreadsheet-style table editing foundation.**

The implementation uses the existing table rebuild path, preserving object
grouping, transforms, table metadata, and token-bearing cells. Structural
operations enforce the 1–20 dimensions. The range model is explicitly
rectangular by row and column, rather than a linear cell-index interval. This
ensures border commands affect only the selected visible rectangle and keep
each touched shared edge synchronized with its adjacent cell. Divider hit
areas are layered so a column drag at a row intersection cannot be mistaken
for a row resize.

Merge/split is intentionally absent because `tableSpec` v1 has no safe span
representation to preserve through SVG import/export.

Evidence: core typecheck passed; 107 frontend tests passed; and the focused
authenticated Playwright table suite passed 4/4. The full TypeScript command
still reports only the pre-existing `AuthenticatedStudio.tsx` call-site issue.
