# F3.58 Result — Shared API and Transport Boundary

## Delivered

- Moved all `API_BASE` consumers from the legacy `utils/api/apiConfig.ts` path to `shared/api`.
- Added Auth-owned `features/auth/api/csrfHeaders.ts` and exported `getCsrfHeaders` / `ensureCsrfToken` through the Auth public barrel.
- Migrated Templates, Render, Print, SAP, Safe Demo, and Graphics transport modules to consume Auth public CSRF headers.
- Moved the unchanged template fallback constants beside `templatesApi`, their sole owner.
- Deleted zero-consumer legacy adapters:
  - `frontend/src/utils/api/apiConfig.ts`
  - `frontend/src/utils/api/csrfHelper.ts`
- Added focused structural coverage for shared base configuration, Auth CSRF ownership, retained endpoint modules, and absence of legacy adapters.

## Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Remote fetch | BLOCKED | `git fetch origin` could not open `.git/FETCH_HEAD` because of Windows permission denial; remote state was not inferred. |
| Legacy exact-path import search | PASS | No active source/test import of `utils/api/apiConfig` or `utils/api/csrfHelper` remains. |
| Frontend tests | PASS | `npm.cmd test`: 148 passed, 0 failed. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` exited 0. |
| Build | PASS | `npm.cmd run build`: 1,891 modules transformed and Vite completed successfully. |
| Diff check | PASS | `git diff --check` found no whitespace errors; it emitted only existing CRLF normalization notices across the dirty worktree. |

## Result status

IMPLEMENTED — all writer quality gates passed; awaiting independent review.

## Remaining warnings

- Vite reports an existing Fabric chunking advisory because QR dynamically imports Fabric while editor features import it statically. The build succeeds.
- The frontend test suite retains the existing non-failing server-rendered `useLayoutEffect` advisory from `features/canvas/ui/StudioCanvas.tsx`; it is unrelated to this transport boundary work.
