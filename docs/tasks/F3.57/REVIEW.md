# F3.57 Review — Canvas Composition Boundary

## Review scope

Independent review covered Canvas public-barrel consumption, Fabric lifecycle ownership, cross-tool action aggregation, drawing-listener placement, Table interoperability hold, the composition inventory, and quality gates.

## Findings

### 1. Canvas lifecycle has a clear feature owner

`AuthenticatedStudio` consumes `StudioCanvas` through the `features/canvas` public barrel. `StudioCanvas` consumes `useFabricCanvas` as an internal Canvas lifecycle implementation. Fabric canvas creation, disposal, listener lifecycle, guides, and ready callback remain in that Canvas feature boundary.

### 2. Cross-tool aggregation should remain outside Canvas ownership

`useCanvasActions` wires Line, Text, Barcode, QR, Graphics, Image, ordering, shared placement/history/selection callbacks, and held Table actions. Moving it into Canvas would incorrectly make Canvas the owner of each tool; replacing it with wrappers would retain the same dependency bundle without reducing coupling. The documented retention is therefore correct.

### 3. Table is retained by explicit compatibility evidence

The drawing listener and Fabric lifecycle retain active Table branches. No Table source moved, changed, or was removed. This preserves existing test and editor interoperability while Table disposition remains a later dedicated decision.

## Independent quality gates

| Check | Status | Evidence |
| --- | --- | --- |
| Composition boundary inspection | PASS | Public Canvas shell import, internal lifecycle import, cross-feature action aggregation, one placement-helper caller, and Table hold match the inventory. |
| Frontend tests | PASS | `npm.cmd test`: 147 passed, 0 failed. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed successfully. |
| Production build | PASS | `npm.cmd run build`: 1,893 modules transformed. |
| Diff whitespace | PASS | `git diff --check`: exit code 0; existing CRLF normalization notices only. |

## Evidence limits

- This phase changes documentation and structural regression evidence, not visible Canvas behavior; browser manual regression was therefore not run.
- Existing non-failing Fabric chunking and server-rendered `useLayoutEffect` advisories remain outside scope.
- Remote comparison remains blocked by the existing `.git/FETCH_HEAD` Windows permission denial.

## Decision

**APPROVED — IMPLEMENTED BY DOCUMENTED RETENTION.** The current boundary is intentional and clearer without risky artificial moves. It is safe to proceed to Shared API and Transport Boundary work.
