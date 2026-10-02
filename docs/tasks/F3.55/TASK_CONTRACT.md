# F3.55 — Frontend Legacy Cleanup and Boundary Completion

## Goal

Audit remaining frontend compatibility layers after feature-first migration, then remove only files with no active source or test consumer.

## Scope

- Evidence-based inventory of `frontend/src/utils`, `frontend/src/hooks`, and `frontend/src/components`, including all `frontend/src` and `frontend/tests` references.
- Small safe cleanup only when zero-consumer evidence is conclusive.
- Task evidence and handoff.

## Constraints

Do not alter backend, APIs, auth/store/canvas/table/UI behavior, dependencies, or Git lifecycle. Preserve the existing dirty worktree. Do not revive hidden Rectangle, Circle, or Table tools. Keep uncertain and legacy Table ownership in place.

## Acceptance

Record path, reference count, category, owner/reason, and action for every candidate family. Run `npm.cmd test`, `npm.cmd exec tsc -- --noEmit`, `npm.cmd run build`, and `git diff --check`.
