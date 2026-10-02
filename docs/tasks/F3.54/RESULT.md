# F3.54 Result — Template Explorer global modal layering repair

## Delivered

- `TemplateSelector` now renders its open Template Explorer overlay through `createPortal(..., document.body)`.
- The overlay retains `--ui-layer-modal` but now belongs to the global document stacking context, allowing it to cover the Top Menu, Property Ribbon, Right Inspector, and Left Toolbox.
- Added `template-explorer-modal-overlay` as a stable overlay test ID.
- Folder error fallbacks and the touched create-folder ARIA copy are professional English.
- Trigger, click-outside, Escape, selection, folder/search/preview/move/open flows, APIs, and callback wiring remain unchanged.

## Validation

| Check | Status | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npx tsc --noEmit` completed with exit code 0. |
| Focused structural coverage | PASS | `npx tsx --test tests/graphics_feature_structure.mjs`: 18 passed, 0 failed. |
| Frontend tests | PASS | `npm test`: 144 passed, 0 failed. |
| Build | PASS | `npm run build` built 1,894 modules. The existing Fabric mixed dynamic/static import advisory is non-failing. |
| Diff check | PASS | `git diff --check` found no whitespace error; it printed existing CRLF notices only. |

## Known warning

The server-rendered auth-flow test continues to print the existing React `useLayoutEffect` SSR warning from `features/canvas/ui/StudioCanvas.tsx`. It does not fail the suite and is unrelated to this modal portal repair.

## Scope confirmation

No backend, API, auth/store semantic, Docker, hardware, database, dependency, lockfile, Git lifecycle, other modal, browser, service, or external action changed.
