# F3.59 Review — Legacy Table Retirement and Removal

## Review scope

Independent review covered the Table retirement inventory, feature/source deletion, active-tool and toolbox removal, Canvas/Fabric listener and lifecycle cleanup, serializer/draft behavior, remaining core tools, structural coverage, and full frontend quality gates.

## Findings

### 1. Table has no frontend production entry point

The `features/table` directory, `useTableActions`, `tableSpec`, `TableGridPicker`, Table active-tool member, and dedicated Table test suite are absent. The post-removal search finds only intentional F3.59 retirement assertions, not runtime imports or active test imports.

### 2. Canvas no longer owns retired Table behavior

`useCanvasActions` now aggregates Line, Text, Barcode, QR, Graphics, Image, ordering, and shared placement callbacks only. `useDrawingTools` and `useFabricCanvas` no longer contain Table gesture, preview, cursor, frame-editor, resize, selection, rehydration, or lifecycle branches. The core editor tools remain present in the aggregation boundary.

### 3. Historical metadata has an explicit, bounded outcome

No official legacy templates need migration. Generic Fabric SVG/draft paths no longer reinterpret retired Table metadata and do not synthesize a fake Table fallback. A historic document may deserialize generic Fabric objects where supported, but cannot recreate an editable Table. This matches the approved retirement decision.

### 4. The reduced test count is expected

The suite changed from 148 to 129 active tests because the 19 removed tests belonged to the retired Table model/spec/editor behavior. Retaining those tests would preserve a feature that the application no longer ships. Structural regression coverage now ensures the retired production paths do not return while core tool modes remain available.

## Independent quality gates

| Check | Status | Evidence |
| --- | --- | --- |
| Retired-path search | PASS | No runtime source or active test import for `features/table`, `useTableActions`, `tableSpec`, `TableGridPicker`, Table active-tool branches, or Table Fabric metadata paths. |
| Frontend tests | PASS | `npm.cmd test`: 129 passed, 0 failed. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed successfully. |
| Production build | PASS | `npm.cmd run build`: 1,885 modules transformed. |
| Diff whitespace | PASS | `git diff --check`: exit code 0; existing CRLF normalization notices only. |

## Evidence limits

- Browser manual regression was not run in this review. Automated tests, typecheck, build, and source-path checks pass; a future manual smoke test can confirm the running UI does not expose a Table tool.
- No template migration was performed because there are no official templates to preserve. Historic third-party documents containing retired Table metadata will not regain editable Table behavior.
- Existing Fabric chunking and server-rendered `useLayoutEffect` advisories remain non-failing and outside scope.
- No backend/API/auth/transport/network/render/export/print/spooler/hardware/dependency/Docker/Git lifecycle action occurred.

## Decision

**APPROVED.** F3.59 fully retires Table from the frontend and is consistent with the product decision not to use this feature. F3.56–F3.59 are now complete.
