# F3.46 — Controlled UI migration: Templates

## Scope

Migrate only `features/templates/ui/TemplateSelector.tsx` and `SaveTemplateModal.tsx` to shared UI primitives and configured semantic tokens. Preserve folder/subfolder, search, select/preview/open/move, validation, API, dismissal, save, and test IDs.

## Boundaries

No backend/endpoints/auth/store/Canvas/ownership changes; no other dialog. Copy changed by this task uses English. No commit/push/deploy/restart.

## Acceptance

Configured Tailwind semantic utilities only; focused structural coverage and actual tsc/test/build/diff statuses documented.
