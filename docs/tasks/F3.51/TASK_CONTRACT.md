# F3.51 — Controlled UI migration: Top Menu and Status Bar

## Goal

Migrate the visual presentation of the application Top Menu and Status Bar to the shared UI primitives and configured semantic dark-industrial tokens.

## Scope

- `frontend/src/components/layout/TopMenuBar.tsx`
- `frontend/src/components/layout/StatusBar.tsx`
- Directly coupled `frontend/src/components/layout/topbar/TopBarActions.tsx` only where needed to complete the same menu visual surface.
- English user-visible copy, focused structural coverage, task evidence, and handoff.

## Preservation requirements

Preserve menu triggers, click-away and Escape close behavior, item callback wiring, `data-testid` and ARIA attributes, auth/logout/session behavior, status calculation, canvas/tool behavior, layering, and feature public API boundaries. Keep template, simulation, and print dialogs out of scope.

Do not change backend, endpoints, auth/store semantics, Docker, hardware, database, dependencies, lockfiles, or Git lifecycle. Do not invoke external services or hardware.

## Acceptance

Run focused structural coverage, the full frontend test suite, TypeScript, production build, and diff check. Record exact PASS, FAIL, BLOCKED, or NOT RUN evidence.
