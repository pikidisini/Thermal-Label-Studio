# F3.49 — Controlled UI migration: Label Simulation

## Goal

Move only the visual presentation of the label-simulation modal surfaces to the established shared UI primitives and semantic Tailwind tokens.

## Scope

- `frontend/src/features/simulation/ui/SapShadowSimulationModal.tsx`
- `frontend/src/features/simulation/ui/SafeDemoModal.tsx`, when its modal and controls use the same visual primitives
- Focused structural coverage and task/handoff evidence.

## Preservation requirements

Keep every endpoint, payload, callback, state transition, test ID, simulation and print boundary, auth/store semantic, and local validation intact. Do not invoke simulation, printer, spooler, ports, database, or external services. Do not install dependencies or change lockfiles. Use English for copy touched by this migration. Retain the dark industrial editor language; no gradients or decorative rounded SaaS treatment.

## Acceptance

Run focused structural coverage and, where practical, full frontend tests, TypeScript, production build, and `git diff --check`. Record PASS, FAIL, BLOCKED, or NOT RUN from evidence.
