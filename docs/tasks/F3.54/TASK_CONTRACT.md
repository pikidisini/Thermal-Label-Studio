# F3.54 — Template Explorer global modal layering repair

## Goal

Render the Template Explorer modal at the document root so it uses the global modal layer and cannot be covered by chrome, the ribbon, toolbox, or inspector stacking contexts.

## Scope

- `frontend/src/features/templates/ui/TemplateSelector.tsx`
- Direct shared layering test/documentation support only.

## Preservation requirements

Preserve the Templates trigger, modal close/click-outside/Escape behavior, select/open callbacks, folder/subfolder management, search, preview, move flow, ARIA, test IDs, auth/session behavior, and all API calls.

Do not change backend, API/store/auth semantics, Docker, hardware, database, dependencies, lockfiles, Git lifecycle, or other modals.

## Acceptance

Add focused coverage proving the Template Explorer uses a document-body portal and global modal tier. Run full tests, TypeScript, build, and diff check with exact status evidence.
