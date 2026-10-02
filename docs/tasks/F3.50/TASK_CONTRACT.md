# F3.50 — Controlled UI migration: Diagnostics and Shortcut Help

## Goal

Migrate only Diagnostics UI and Keyboard Shortcut Help visual surfaces to shared UI primitives and configured semantic dark-industrial tokens.

## Scope

- `frontend/src/features/diagnostics/ui/` including the AI diagnostics modal.
- `frontend/src/components/modals/ShortcutHelpModal.tsx`.
- English user-visible copy, focused structural coverage, task evidence, and handoff.

## Preservation requirements

Preserve all diagnostics APIs, recorder/session/report behavior, Copy and Download behavior, keyboard shortcut semantics, test IDs, callbacks, modal accessibility, and overlay layering. Do not modify backend, auth/store behavior, Docker, hardware, database, dependencies, lockfiles, or Git lifecycle. Do not invoke external services or hardware.

## Acceptance

Run relevant structural coverage, full frontend tests, TypeScript, production build, and diff check. Record exact PASS, FAIL, BLOCKED, or NOT RUN evidence.
