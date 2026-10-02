# F3.51 Review — Top Menu and Status Bar UI migration

## Review scope

Reviewed the Top Menu, its directly coupled action bar, the Status Bar, the shared `Badge` compatibility change, structural coverage, and independent frontend quality gates. No application service, browser action, hardware path, or Git lifecycle action was run.

## Findings

### 1. Menu and toolbar interaction contracts are retained — PASS

The reviewed sources retain the menu trigger, click-away handling, Escape handling, callback routing, ARIA menu attributes, simulation visibility gate, logout action, and existing test IDs. The visual controls now use shared primitives and configured semantic dark-industrial tokens.

### 2. Status calculations and zoom controls are retained — PASS

`StatusBar` still reads the same stores and retains target-summary, engine-status, and zoom control wiring. The batch changes only its shared control presentation and semantic tokens.

### 3. Shared Badge compatibility is narrow — PASS

`Badge` now forwards standard span HTML attributes. This is needed to retain the existing role badge `data-testid`; it does not change badge state, tone calculation, user identity, or authentication behavior.

### 4. English copy and stale test contract are aligned — PASS

Scoped user-facing labels are English, including `Download data SVG`, `Label Simulation`, and `Sign out`. The authentication flow test now asserts the active `Sign out` text rather than the retired Indonesian label.

### 5. Quality gates — PASS

| Check | Result | Evidence |
| --- | --- | --- |
| Full frontend suite | PASS | `npm.cmd test`: 141 passed, 0 failed. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` exited 0. |
| Production build | PASS | `npm.cmd run build` completed, 1,894 modules transformed. |
| Diff whitespace | PASS | `git diff --check` has no whitespace error; only existing CRLF notices were emitted. |

The pre-existing Vite advisory about Fabric's mixed static/dynamic imports and React SSR `useLayoutEffect` warnings remain non-failing and outside the batch scope.

## Evidence limits

- Browser menu and zoom interaction regression: NOT RUN in this batch.
- Docker, printer, spooler, TCP port, database, SAP, external-service, commit, push, pull request, merge, deployment, and restart actions: NOT RUN.

## Decision

**APPROVED.** F3.51 unifies the top-level workspace chrome with the shared UI foundation while preserving menu, session, simulation-gate, status, and zoom behavior.