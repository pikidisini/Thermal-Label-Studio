# F3.42 Review — Feature ownership batch aplikasi dan shell

**Reviewer:** Codex (independent review)
**Date:** 2026-10-01
**Verdict:** READY FOR NEXT REFACTOR BATCH — no commit or deployment authorized by this review.

## Scope reviewed

- `features/templates`: template lifecycle hook, selector, and save dialog.
- `features/simulation`: thermal preview hook, Safe Demo/SAP Shadow APIs and dialogs.
- `features/print`: print/export dialog and its UI tabs.
- Public feature barrels, shell callers, compatibility re-exports, task documentation, and structural test.

## Findings

No blocking finding.

1. `AuthenticatedStudio` and `TopMenuBar` consume moved domain code through public feature barrels. The generic studio shell remains outside feature folders.
2. Compatibility re-exports for `safeDemoApi` and `sapShadowSimulationApi` preserve legacy caller/test imports while keeping the implementations owned by Simulation.
3. `renderApi`, `printApi`, and `apiClient` appropriately remain shared transport/hardware boundaries. Moving them into `features/print` would give one UI feature ownership of APIs used across the application and would expand the printer-risk scope.
4. The F3.42 structural assertion was added to the existing `frontend/tests/graphics_feature_structure.mjs`. The filename is historical, but the assertion is functional and verifies all seven current feature-ownership boundaries. Rename or split the test only as a later test-organization cleanup; it is not needed for correctness.

## Independent validation

| Check | Status | Evidence |
| --- | --- | --- |
| Full TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed with exit code 0 and no diagnostics. |
| Feature boundary test | PASS | `npm.cmd exec tsx --test tests/graphics_feature_structure.mjs`: 7 passed, 0 failed; includes F3.42 assertion. |
| Vite production build | PASS | `npm.cmd run build`: 1,887 modules transformed, build completed. Existing F3.41 Fabric static/dynamic import advisory remains non-failing. |
| Diff whitespace | PASS | `git diff --check` completed without whitespace errors; only pre-existing CRLF conversion notices were emitted. |
| Frontend full suite | BLOCKED | `frontend/node_modules/canvas/build/Release/canvas.node` is absent. The runner fails while loading Fabric/jsdom before assertions; this is a local dependency-state blocker, not a test failure attributed to F3.42. |
| Browser/manual UAT | NOT RUN | Architecture-only refactor; no browser interaction was performed in this review. |
| Remote synchronization | BLOCKED | `git fetch origin` cannot open `.git/FETCH_HEAD` because of Windows permission restrictions. |

## Boundaries retained

- No endpoint, authentication, authorization, CSRF, backend, contract, Docker, SAP, MinIO, printer, physical spooler, or port action was taken.
- No commit, push, PR, merge, restart, or deployment was performed.
- Existing unrelated dirty files remain preserved.
