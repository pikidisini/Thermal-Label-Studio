# F3.18 Result

Implemented in `frontend/src/components/layout/TopMenuBar.tsx` and `frontend/src/hooks/useRulers.ts`.

- Top menu header now establishes a positioned `z-40` stacking context, keeping dropdowns above the ruler layer (`z-20`).
- Ruler major interval uses an adaptive 1/2/5 progression based on zoom and keeps major labels at least about 44px apart.
- Minor ticks follow the selected interval and both axes retain support for negative/panned ranges.
- Ruler geometry now uses each ruler canvas' local coordinate system, including the 24px/20px corner offsets, so cursor markers and active-label blocks align with the sheet.
- Ruler canvases receive explicit CSS dimensions and redraw after committed zoom, pan, and label-size changes.
- Fabric canvas dimensions and zoom stay synchronized with toolbar zoom changes, preventing the rendered sheet from lagging behind its outer container.

Verification:

- `npm run typecheck:core` PASS.
- `npm run build` BLOCKED in sandbox: Vite/esbuild failed with `spawn EPERM` while starting its config bundler.
- Runtime browser verification NOT RUN in this subtask.

Alignment addendum verification (root reviewer):

- `npm run typecheck:core` PASS.
- `npm run build` PASS.
- `npm test` PASS (96/96).
- `git diff --check` PASS.
- Browser checks at 20%, 90%, and 220% zoom PASS; ruler block tracks the canvas and the blue marker aligns with the cursor drag endpoint.
