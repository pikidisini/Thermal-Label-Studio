# F3.59 — Legacy Table Retirement and Removal

## Objective

Retire the unused Table feature from the frontend runtime and source tree. The product owner confirmed that Table will not be used and that there are no official legacy templates that require Table migration.

## Scope

- Remove the Table feature, its legacy adapters, toolbox entry point, active-tool state, canvas listeners, inspector behavior, serialization metadata, and dedicated tests.
- Keep Text, Line, Barcode, QR, Graphics, Image, Canvas lifecycle, and generic SVG/draft import paths working.
- Permit generic import/draft handling of objects carrying unknown legacy metadata. No Table renderer or compatibility fallback is retained.
- Add a structural regression assertion that the retired feature has no frontend production entry point while core tool modes remain available.

## Explicit exclusions

- Backend, API, authentication, stores unrelated to the removed active-tool state, print/spooler/hardware, Docker, dependencies, Git lifecycle, and deployment.
- Template migration: none is required because no official legacy templates exist.

## Validation

Run the full frontend test, typecheck, build, and whitespace gates from `frontend`. Record actual results in `RESULT.md`.
