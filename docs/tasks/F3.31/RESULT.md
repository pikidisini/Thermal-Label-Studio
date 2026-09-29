# F3.31 — Result

Status: implementation and automated acceptance gates complete for local review. Manual UAT remains available to the user. No commit, push, merge, PR, deployment, printer, SAP, or production storage operation was performed.

## Scope and decisions

- Replaced the active v1 table editor path with an editable v2 vector frame: bounded immutable model, merged regions and shared edge matrices, with no cell content/font/token/placeholder/formula model.
- Integrated grid placement, object/edit modes, global and internal resize, visual range selection, merge/split, line styling, relative track operations, Layers/history, SVG import/export, draft recovery, server templates, and render paths.
- Existing template contents were preserved. No migration or deletion was attempted.
- Browser server save/load used `STORAGE_BACKEND=filesystem`, a unique test-only template directory under `web_app/tmp`, an isolated E2E auth database, and an ephemeral template ID deleted by the test after readback. No user template collection or production storage was accessed.
- Writer configuration: gpt-6-luna medium. The planned Luna 5.6 medium writer hit its usage limit; after it was reported, work resumed with gpt-6-luna medium. No Astra was used. Sol/root provided read-only review.

## Implementation

- T01 model v2 includes a bounded parser/validator, complete non-overlapping region partition, edge matrices, merge expansion, reversible split, validated partial edge patches, perimeter styling, global/internal resize, relative track insert/delete, and equalize. No-op commands preserve model identity.
- T02 renderer uses vector lines and exact table geometry with thick/dotted edges; bounded canonical metadata covers every v2 table, including all-none tables. Import restores model, pose, z-order and rejects malformed or oversized metadata. Editor bounds geometry is excluded from SVG.
- T03 picker is 10×8 with keyboard, preview, drag in all four directions, short-click default size, center placement, cancellation and history. Draft scheduling filters transient previews.
- T04/T05 provide object/edit modes, normalized 8-handle resize, inverse-transform divider/edge hits, drag and Shift-click ranges, merge/split, edge color/weight/style/scope, pixel/mm input, selected-track add/delete and equalize. Gestures cancel on Escape, blur, pointercancel, tool switch, and unmount. Inspector commands live in `features/table/editor/TableFrameInspector.tsx` under one compact `Opsi tabel` menu.
- T06 round-trip supports multiple v2 tables and independent text/barcode objects. Draft refresh and disposable server save/load preserve v2 metadata. Backend render tests exercise merged SVG, PNG rasterization and PDF encoding.

## Verification evidence

All commands below were run against the current working tree. Node/esbuild/Playwright subprocesses and pytest temp cleanup returned sandbox `EPERM`/permission errors on initial unprivileged attempts; the corresponding gates were rerun with escalation and passed.

- `npx tsc --noEmit -p tsconfig.json` — PASS, exit 0.
- `npm run typecheck:core` — PASS, exit 0.
- `tsc -p frontend/tsconfig.strict-table.json` — PASS with `strict` and `noImplicitAny` enabled across v2 model, renderer, importer, editor, inspector, grid picker, and the Fabric integration declarations.
- `npm test` — PASS, 122/122, exit 0.
- `npm run build` — PASS, Vite built 1,853 modules, exit 0.
- `npx playwright test tests/table_editor.spec.js` — PASS, 21/21 including auth setup, exit 0. Coverage includes renderer geometry and malformed/oversized import; 3-table merged SVG round-trip with caption/barcode; keyboard picker; all four drag directions; outside, undersized, too-small-sheet and short-click placement; undo/redo; draft refresh; disposable save/reload; merge/split, perimeter/none/px styling, selected-track insert/delete; hidden divider rejection; object movement/lock restore; Shift-click; side resize at 50/100/200%, proportional corner resize; rotated edge/divider; no-op history; Escape/blur/pointercancel/tool-change/reload cleanup.
- `python -m pytest backend/tests/test_renderer_table_contract.py -q --basetemp=tmp/f331-pytest-pdf` — PASS, 2/2. Retains v1 placeholder behavior and exercises v2 merged vectors through `render_svg`, PNG rasterization and PDF encoder. PDF page is parsed and dimensions checked.
- `git diff --check` — PASS, exit 0 on the current tracked diff; Git emitted only expected LF→CRLF working-copy notices. The full tree contains substantial unrelated pre-existing dirty/untracked work; it was preserved. F3.31 files and visual artifact were checked directly.
- Browser visual artifact: [f331-table-edit-options.png](../../../tmp/f331-table-edit-options.png), captured at 1440×900 with a selected frame in edit mode and `Opsi tabel` open. Table-specific generic stroke input is hidden; status summary reads `TARGET: TABLE`; inspector content scrolls vertically.

The final strict-table gate runs with `noImplicitAny` enabled. Fabric 5 typings were recovered from the existing local npm cache and added as the normal `@types/fabric@^5.3.11` development dependency; focused runtime API extensions are declared in `frontend/src/types/fabric-custom.ts`. The independent final reviewer reran all listed gates after the typing changes, including Playwright 21/21; all passed.

## Acceptance mapping

| AC | Status | Evidence |
|---|---|---|
| AC01 | PASS | v2-only frame model and SVG fixture; no cell text/token fields. |
| AC02 | PASS | Browser grid 10×8, hover 5×4, keyboard, Escape and focus behavior. |
| AC03 | PASS | Four drag directions, sub-threshold click, default 60×24 mm and center placement. |
| AC04 | PASS | Outside start, undersized grid drag and 5×5 mm sheet rejection all produce no invalid layer. |
| AC05 | PASS | Side resize and proportional corner resize commit dimensions into model tracks; tested across 50/100/200% zoom for side resize. |
| AC06 | PASS | Model dimensions and transformed pose/order survive canonical SVG round-trip; resize checks remain in mm. |
| AC07 | PASS | Internal divider drag preserves outer bounds; min/total and hidden merged-divider behavior are covered. |
| AC08 | PASS | Object drag moves the frame; edit drag/Shift-click selects; returning to object mode restores movement. |
| AC09 | PASS | Model region partition/auto-expand and visual 2×2 merge hide only internal lines; merged topology survives round-trip. |
| AC10 | PASS | Split restores topology/styles; undo/redo and bounds assertions pass. |
| AC11 | PASS | Model and browser cover solid/dotted/none, edge color, perimeter scope, mm↔document-pixel width and hidden edges. |
| AC12 | PASS | Export/import keeps three separate v2 tables (one merged), text caption, editable barcode payload, z-order and transforms. |
| AC13 | PASS | Draft refresh and isolated server save/load pass; malformed and oversized metadata are rejected. |
| AC14 | PASS | Escape, blur, pointercancel, tool switch and reload while a gesture is active leave no stale selection. |
| AC15 | PASS | Placement undo/redo and cancellation pass; production history depth stays unchanged after no-op equalize. |
| AC16 | PASS | Model tests cover merged-span insertion/deletion; browser covers insert-before, selected-row delete and equalize. |
| AC17 | PASS | Backend merged-v2 SVG passes SVG render, PNG raster and PDF page checks without editor overlays. |
| AC18 | PASS | 1440×900 screenshot, keyboard picker, viewport-safe popup, scrollable inspector and rotated/zoomed targeting. |

## Boundaries

- Manual UAT in `TEST_MATRIX.md` is not claimed as executed; automated acceptance and local render checks above are the evidence in this task.
- Full backend suite, save/load against any user server, physical printer, live SAP, remote synchronization and deployment were not run.
- Working tree includes substantial pre-existing uncommitted work. This task leaves it intact and creates no commit.
