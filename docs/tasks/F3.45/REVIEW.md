# F3.45 Review — Controlled UI migration: Login and Canvas Setup

**Reviewer:** Codex (independent review)
**Date:** 2026-10-01
**Verdict:** ACCEPTED FOR THE NEXT UI MIGRATION BATCH — no commit or deployment authorized by this review.

## Scope reviewed

- Login UI migration to shared controls and semantic tokens.
- Label Dimensions Setup dialog and its direct controls.
- Behavior-preserving constraints: test IDs, callbacks, input flow, authentication flow, DPI and dimension handling.

## Review findings and resolution

The initial migration retained decorative gradient/cyan/amber treatment on Login and used CSS variable names that did not correspond to configured Tailwind utilities. This contradicted the agreed quiet industrial direction and could make intended surfaces fail to render.

The writer corrected both points before acceptance:

1. Decorative gradients, glow blobs, rounded treatment, and direct cyan/amber/slate/white accents were removed from Login.
2. Undefined `bg-surface-raised` and `bg-surface-overlay` classes were replaced with configured `bg-surface-container` and `bg-surface-container-high` utilities.
3. The direct success color was replaced by semantic `text-tertiary`.
4. Undefined Canvas Setup surface variants were replaced with configured surface-container utilities, so DPI/preset states render.

No behavioral regression was found in the reviewed source: existing login IDs, form submission, loading, error clearing, password visibility, modal IDs, dimension/DPI inputs, and callbacks are preserved.

## Independent validation

| Check | Status | Evidence |
| --- | --- | --- |
| Full TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed with exit code 0 and no diagnostics. |
| UI boundary test | PASS | `npm.cmd exec tsx --test tests/graphics_feature_structure.mjs`: 10 passed, 0 failed; includes F3.45 contract assertion. |
| Tailwind utility audit | PASS | No residual gradient/cyan/amber/rounded or undefined `bg-surface-raised`/`bg-surface-overlay` class in Login; Canvas Setup surface variants are configured utilities. |
| Vite production build | PASS | `npm.cmd run build`: 1,894 modules transformed and build completed. Existing F3.41 Fabric static/dynamic import advisory remains non-failing. |
| Diff whitespace | PASS | `git diff --check` reported no whitespace error; CRLF conversion notices are pre-existing worktree notices. |
| Frontend full suite | BLOCKED | `frontend/node_modules/canvas/build/Release/canvas.node` is absent; the known Fabric/jsdom loader failure happens before assertions. |
| Browser/manual UAT | NOT RUN | The active local browser session was already authenticated; login page state could not be inspected without altering the user's session. Canvas Setup click automation did not yield a modal state in the available accessibility surface. |

## Boundaries retained

- No backend, endpoint, server auth/authorization/CSRF policy, store, Docker, SAP, MinIO, printer, port, commit, push, deployment, or restart action occurred.
- Existing unrelated dirty files remain preserved.
