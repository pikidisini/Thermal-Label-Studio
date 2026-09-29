# F3.18 Review

Status: accepted for local UI use. The header now forms a stacking layer above the canvas ruler, and both ruler axes select a readable label interval from the current zoom.

Reviewer inspected the scoped diff and `git diff --check` (PASS). The initially sandbox-blocked checks were rerun with permission: `npm run build` PASS and `npm test` 96/96 PASS. In the browser at 20% zoom, all four File menu items appeared fully above the ruler and ruler numbers were separated on both axes. The ruler remained legible after resetting to 100% zoom.

This is a local UI fix; no printer or production-path verification was performed. Existing unrelated working-tree changes were preserved. The user's open app tab was left unchanged and may need a refresh to load the new bundle.

Alignment follow-up (2026-09-25): accepted. Ruler origin, active-label shading, and cursor markers now use coordinates local to their respective ruler canvases. Explicit ruler element sizes prevent the default 300 x 150 canvas dimensions from clipping the display. A layout effect redraws rulers after zoom, pan, and label-size changes; the toolbar zoom also synchronizes Fabric's drawing surface with the label sheet. Browser review at 20%, 90%, and 220% confirmed the ruler shading follows the sheet and blue markers follow the cursor drag endpoint. Final build, core typecheck, `git diff --check`, and 96/96 frontend tests passed. The user's app tab was left unchanged for a manual refresh.
