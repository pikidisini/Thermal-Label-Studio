# F3.56 — Data Tokens Boundary Completion

## Goal

Complete the Data Tokens feature boundary by migrating active frontend callers and tests away from legacy `utils` re-exports to the public `features/data-tokens` API.

## Scope

- Inventory active imports of `utils/sapContractAdapter` and `utils/sapTokenValue` in frontend source and tests.
- Migrate only those callers to `features/data-tokens/index.ts`.
- Remove the two legacy re-export files only after a zero-import check.
- Preserve adapter semantics for absent, null, empty scalar, aliases, raw SAP contracts, local JSON import, and token binding.

## Constraints

Do not change backend/API/auth/store semantics, Canvas/Table/UI flow, dependencies, Git lifecycle, Docker, services, printer, spooler, or hardware. Preserve the existing dirty worktree. All touched user-visible copy remains English.

## Acceptance criteria

- No active source or test import remains under `utils/sapContractAdapter` or `utils/sapTokenValue`.
- `useContractStore` and frontend regression tests consume the Data Tokens public barrel.
- Both compatibility re-export files are deleted only with conclusive import evidence.
- Run `npm.cmd test`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run build`, and `git diff --check`.
