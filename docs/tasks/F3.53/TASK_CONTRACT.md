# F3.53 — Controlled UI migration: Right Inspector, Layers, and Align

## Goal

Migrate only the Right Inspector, Layers, and Align presentation surfaces to shared UI primitives and configured semantic dark-industrial tokens.

## Scope

- `frontend/src/components/layout/RightInspector.tsx`
- Direct `layout/inspector` UI: InspectorTab, LayersTab, ObjectPropertyForm, TransformMatrixTab, and PropField.
- English copy, focused structural coverage, task evidence, and handoff.

## Preservation requirements

Preserve transform and property-update math, object selection, layer order, visibility and locking, alignment callbacks, dynamic token binding, Fabric behavior, test IDs, ARIA, panel switching, and feature public boundaries. Keep Table cell content/formulas and Rectangle/Circle controls hidden.

Do not modify backend, API, auth/store semantics, Docker, hardware, ports, database, dependencies, lockfiles, or Git lifecycle. Do not invoke browser, services, hardware, commits, deployment, or restart.

## Acceptance

Run focused structural coverage, full frontend tests, TypeScript, production build, and diff check with exact status evidence.
