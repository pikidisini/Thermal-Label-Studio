# F3.52 — Controlled UI migration: Property Ribbon and Left Toolbox

## Goal

Migrate only the Property Ribbon, Left Toolbox, and directly coupled layout controls to shared UI primitives and configured semantic dark-industrial tokens.

## Scope

- `frontend/src/components/layout/PropertyRibbon.tsx`
- `frontend/src/components/layout/LeftToolbox.tsx`
- Direct `layout/ribbon` and `layout/toolbox` controls needed for the same presentation surface.
- English user-visible copy, focused structural coverage, task evidence, and handoff.

## Preservation requirements

Preserve tool selection and drawing modes, keyboard shortcuts, line/text/barcode/QR/graphics/image/template callbacks, Fabric canvas behavior, test IDs, ARIA, layering, dynamic values, and public feature boundaries. Do not reintroduce or expose the hidden Table, Rectangle, or Circle controls.

Do not modify backend, API payloads, auth/store semantics, Docker, hardware, ports, database, dependencies, lockfiles, or Git lifecycle. Do not invoke real services, hardware, or browser actions.

## Acceptance

Run focused structural coverage, the full frontend test suite, TypeScript, production build, and diff check. Record exact PASS, FAIL, BLOCKED, or NOT RUN evidence.
