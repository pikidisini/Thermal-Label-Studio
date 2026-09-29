# F3.30 — Table feature boundary refactor

## Scope

- Move the versioned pure table model into `frontend/src/features/table/model`.
- Keep `frontend/src/utils/tableSpec.ts` as a compatibility re-export.
- Keep Fabric rendering and table replacement commands behind the table feature boundary.
- Extract inline cell editor DOM lifecycle into the table editor boundary.
- Add pure geometry coverage for coordinate and cell hit testing.

## Out of scope

Full React menu/inspector migration and complete selection/resize controller extraction remain follow-up work because they require browser regression coverage.
