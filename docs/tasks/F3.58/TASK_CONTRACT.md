# F3.58 — Shared API and Transport Boundary

## Goal

Clarify frontend transport ownership by moving shared base configuration to `shared/api`, making Auth-owned CSRF acquisition available through the Auth public API, and removing only zero-consumer legacy transport adapters.

## Scope

- Audit `utils/apiClient.ts`, `utils/api/*`, `shared/api/*`, and feature API callers.
- Move the API base callers from `utils/api/apiConfig.ts` to `shared/api`.
- Move CSRF header acquisition from a utility adapter into the Auth feature public API.
- Preserve endpoint methods, headers, credentials, request bodies, error semantics, simulation fail-closed behavior, and print/spooler safeguards.

## Constraints

No network, render/export, print, spooler, or hardware action. Do not change backend/API contract, auth/store semantics, UI, Canvas/Table, dependencies, Docker, services, or Git lifecycle. Preserve the dirty worktree. Delete a module only after source/test import evidence is zero.

## Acceptance criteria

- Shared `API_BASE` is consumed from `shared/api` rather than a legacy config adapter.
- CSRF header acquisition is Auth-owned and exposed through `features/auth` public API.
- Legacy `apiConfig.ts` and `csrfHelper.ts` are deleted only after zero-import evidence.
- Existing endpoint modules retain their request transport behavior and `apiClient` remains an explicit cross-domain facade.
- Run tests, TypeScript, Vite build, and diff whitespace checks.
