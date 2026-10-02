# F3.43 Review — Ownership Data Tokens, Diagnostics, dan Auth UI

**Reviewer:** Codex (independent review)
**Date:** 2026-10-01
**Verdict:** READY FOR NEXT REFACTOR BATCH — no commit or deployment authorized by this review.

## Scope reviewed

- Data Tokens/SAP local-import model and toolbox UI.
- Diagnostics recorder, report generator, and dialog.
- Authentication UI and browser API client.
- Feature barrels, legacy adapters, structural test, and documentation.

## Findings

No blocking finding.

1. `features/data-tokens`, `features/diagnostics`, and `features/auth` own their domain implementations and expose public barrels. Shell callers consume those public boundaries.
2. Zustand stores remain shared application state. Keeping the auth and contract stores in `store/` avoids an artificial dependency inversion while preserving the established session/CSRF lifecycle.
3. Legacy utility modules are lightweight re-exports where a generic store still consumes them. This is a compatibility boundary, not duplicated domain implementation.
4. `CanvasSetupModal` correctly remains deferred: its mode and callbacks jointly orchestrate Template and Canvas lifecycle through `AuthenticatedStudio`, so it cannot honestly belong to Canvas alone today.
5. The structural checks remain in the historical `graphics_feature_structure.mjs` file. It now validates eight feature boundaries. Splitting or renaming the test is a future test-organization cleanup rather than a correctness issue.

## Independent validation

| Check | Status | Evidence |
| --- | --- | --- |
| Full TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed with exit code 0 and no diagnostics. |
| Feature boundary test | PASS | `npm.cmd exec tsx --test tests/graphics_feature_structure.mjs`: 8 passed, 0 failed; includes the F3.43 assertion. |
| Vite production build | PASS | `npm.cmd run build`: 1,892 modules transformed and build completed. Existing F3.41 Fabric static/dynamic import advisory remains non-failing. |
| Diff whitespace | PASS | `git diff --check` reported no whitespace error; CRLF conversion notices are pre-existing worktree notices. |
| Frontend full suite | BLOCKED | `frontend/node_modules/canvas/build/Release/canvas.node` is absent. The known full runner failure occurs while loading Fabric/jsdom before assertions. |
| Browser/manual UAT | NOT RUN | This is a behavior-preserving ownership refactor; no browser interaction was performed in this review. |
| Remote synchronization | BLOCKED | `git fetch origin` cannot open `.git/FETCH_HEAD` because of Windows permission restrictions. |

## Boundaries retained

- No backend, endpoint, server auth/authorization/CSRF policy, contract, Docker, SAP, MinIO, printer, physical spooler, or port action occurred.
- No commit, push, PR, merge, restart, or deployment occurred.
- Existing unrelated dirty files remain preserved.
