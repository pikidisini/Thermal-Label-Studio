# Frontend table editor: modularisation plan

> Product direction update (2026-09-26): F3.31 replaces the content-bearing table requirements with a line-only table frame with merge/split. See [F3.31 task contract](../tasks/F3.31/TASK_CONTRACT.md). The module boundaries below remain useful, but cell text/font/token behavior and legacy content migration are not F3.31 requirements. F3.31 implementation has not started.

## Why this is needed

The table editor currently spreads one feature across `utils/tableSpec.ts`,
`hooks/canvas/useTableActions.ts`, `hooks/useFabricCanvas.ts`, and
`components/layout/inspector/ObjectPropertyForm.tsx`. The canvas hook also
creates and positions table menu elements directly. A visual change therefore
touches pointer handling, model mutations, Fabric rendering, and history code.

The user-visible symptom was a long menu over the canvas. Its former `hidden`
attribute conflicted with inline `display:grid`, so the menu appeared open even
when the code intended it to be closed. The first bounded change moved the
floating menu builder to `features/table/floatingMenu.ts` and kept the actions
behind one `Tabel ▾` trigger with grouped commands.

## Target ownership

```text
frontend/src/features/table/
  model/tableSpec.ts           pure model, validation, merge, border and format rules
  canvas/tableRenderer.ts      Fabric objects created from a valid TableSpec
  editor/tableGeometry.ts      coordinate mapping and hit testing
  editor/useTableEditor.ts     selection, resize, inline edit, keyboard and history actions
  ui/TableMenu.tsx             accessible React menu and focus behaviour
  ui/TableInspector.tsx        table properties shown in the right inspector
```

The table model must not import React, Fabric, browser DOM, or API clients.
Rendering consumes the model but does not mutate it. Pointer handling maps a
gesture to a typed table command. The editor controller applies that command,
records history once, then asks the canvas renderer to rebuild the table. The
menu and inspector receive state and command callbacks; they do not call Fabric
directly. SVG export/import continues to serialize the versioned table model.

## Safe migration order

1. Extract table geometry and hit testing from `useFabricCanvas.ts`, retaining
   the current selection and double-click browser tests.
2. Extract table commands and replacement/history logic into the table editor
   controller. Keep one active table writer and compare SVG round trips.
3. Move the pure model and Fabric renderer behind the feature boundary, using
   temporary re-export modules for existing callers.
4. Replace the imperative DOM menu with a React component and test keyboard
   focus, Escape, outside-click dismissal, and viewport placement.
5. Move table-only inspector controls into `TableInspector.tsx`.

Each step should leave template loading, draft recovery, SVG export/import,
preview, and print contract unchanged and pass the targeted table Playwright
suite, the frontend typecheck, and the production build before the next step.

## Current implementation status (F3.30)

The model implementation now lives under `features/table/model/tableSpec.ts`; the old `utils/tableSpec.ts` path is a compatibility re-export. Fabric construction is owned by `features/table/canvas/tableRenderer.ts`, table replacement by `features/table/editor/tableCommands.ts`, geometry helpers by `tableGeometry.ts`, inline cell editor DOM cleanup by `attachTableEditor.ts`, resize handles by `createTableResizeOverlay.ts`, range selection and its listener lifecycle by `editor/attachTableRangeSelection.ts`, and table-only inspector state/JSX by `ui/TableInspector.tsx`. The canvas hook now only orchestrates callbacks and retains floating-menu integration through the range controller. Remaining refinement is the imperative menu migration to React plus other minor hook extractions. Verification: table Playwright 6/6 PASS, npm test 110/110 PASS, Vite build 1856 modules PASS, and full TypeScript PASS.
