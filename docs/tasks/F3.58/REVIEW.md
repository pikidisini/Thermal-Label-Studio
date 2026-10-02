# F3.58 Review — Shared API and Transport Boundary

## Review scope

Independent review covered shared API-base ownership, Auth CSRF helper ownership, endpoint-module import changes, retained transport facade boundaries, removed compatibility adapters, structural coverage, and quality gates.

## Findings

### 1. Shared and feature state concerns are separated correctly

`API_BASE` is a stateless transport primitive and is consumed through `shared/api`. CSRF header/token acquisition reads Auth Zustand state and may refresh through `authApi`; it is therefore correctly owned by Auth and publicly exposed through `features/auth`.

### 2. The Auth dependency avoids a barrel cycle

The Auth store imports `authApi` from its implementation path rather than the feature barrel. This is a deliberate internal exception: importing the barrel would cycle through `csrfHeaders.ts`, which itself reads the Auth store. The resulting graph preserves the public API for external consumers without a runtime cycle.

### 3. Transport contracts remain intact

Templates, Render, Print, SAP, Safe Demo, and Graphics consume the Auth public CSRF helper. Existing endpoint modules and `apiClient` remain cross-domain facades; the inspected patch does not alter endpoint URLs, methods, credentials, request bodies, header merge order, errors, fallback behavior, or fail-closed branches. Legacy Auth and Simulation utility paths are retained as compatibility re-exports where they still have consumers.

### 4. Removed adapters have no active consumers

The exact-path search found no active source or test import of `utils/api/apiConfig` or `utils/api/csrfHelper`. Both were removed after all callers migrated to the shared/Auth owners.

## Independent quality gates

| Check | Status | Evidence |
| --- | --- | --- |
| Legacy import search | PASS | No active source/test match for the deleted `apiConfig` or `csrfHelper` paths. |
| Frontend tests | PASS | `npm.cmd test`: 148 passed, 0 failed. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed successfully. |
| Production build | PASS | `npm.cmd run build`: 1,891 modules transformed. |
| Diff whitespace | PASS | `git diff --check`: exit code 0; existing CRLF normalization notices only. |

## Evidence limits

- No request, render, export, print, spooler, or hardware operation was invoked.
- Browser manual regression was not run because the work changes internal imports only.
- Existing Fabric chunking and server-rendered `useLayoutEffect` advisories remain non-failing and outside scope.
- Remote comparison remains blocked by the existing Windows `.git/FETCH_HEAD` permission denial.

## Decision

**APPROVED.** F3.58 clarifies the transport boundary without changing the network contract. The retained endpoint facade is a deliberate, documented boundary rather than unfinished migration.
