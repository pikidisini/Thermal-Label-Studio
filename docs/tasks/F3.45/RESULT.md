# F3.45 Result — Controlled UI migration

## Before and after rationale

Login no longer uses decorative gradients, rounded accents, or direct slate/cyan/amber/white colors. It now follows the existing zero-radius dark-industrial semantic palette. Canvas Setup replaces undefined `surface-variant` classes with configured semantic surface classes, so active DPI and hover states render consistently. Login uses configured `bg-surface-container`, `bg-surface-container-high`, and `text-tertiary` utilities rather than CSS-variable-only Tailwind class names.

## Changes

- Login uses `Field`, `Input`, `IconButton`, `Button`, and `ErrorState`; username/password IDs, submit disabling, autofocus, error clearing, and password visibility behavior remain unchanged.
- Canvas Setup uses `Dialog`, header/footer, `IconButton`, `Button`, and `Field`; callbacks, DPI selection, dimension inputs, preset selection, and matrix geometry calculations remain unchanged.
- New or changed Login copy is English.

## Validation

| Check | Status |
| --- | --- |
| TypeScript | PASS |
| Focused structural test | PASS — 10/10 |
| Full frontend test | BLOCKED/NOT RUN — native `canvas.node` dependency blocker recorded in F3.42/F3.43 |
| Build | PASS — 1.894 modules; existing Fabric advisory is non-failing. |
| `git diff --check` | PASS — CRLF warnings from existing worktree only. |

No backend, endpoint, auth behavior, store, Docker, Git lifecycle, commit, push, deployment, or restart changed.
