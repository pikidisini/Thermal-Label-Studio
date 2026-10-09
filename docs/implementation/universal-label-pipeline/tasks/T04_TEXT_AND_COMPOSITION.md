# T04 — Implement server text and composition binding

TASK_ID: T04
Status: PENDING
Depends on: T03
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Bind supported Studio text/composition from canonical item data into final SVG with deterministic semantics and preserved geometry.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- frontend/src/features/data-tokens/model/fieldPresentation.ts
- frontend/src/features/data-tokens/model/composition.ts
- frontend/src/features/barcode/model/barcodePayload.ts
- frontend/src/components/studio/Studio.tsx
- frontend/src/features/canvas/svg/fabricSvgExporter.ts
- frontend/src/features/canvas/svg/fabricSvgImporter.ts
- backend/app/labels/templates.py
- backend/app/engine/raster.py
- backend/app/svg_safety.py

## In scope

Implement template_binding text/composition/service and semantic data validation; keep raster/encoding/sinks unchanged.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Resolve exact dynamic keys from the supplied raw snapshot; validate required values before emitting output. Use descriptions only in bounded error presentation, not as binding identities.
2. Implement the agreed literal/field composition syntax without eval, arbitrary code or external resources. Preserve literal spacing/line breaks and accepted scalar conversions.
3. Bind into supported Studio text/tspan structures without losing alignment, transforms, physical placement, authored styling or line geometry. Never use the saved sample text as fallback.
4. Reject unresolved, unsupported or over-limit compositions and mixed/conflicting specs. Reject or explicitly clear preview overrides according to CONTRACT.md; stale editor override values cannot replace required data.
5. Validate the resulting SVG with existing safety admission and pass authoritative media metadata onward without rasterizing in the binder.
6. Build actual Studio fixture comparisons and deterministic error-stage results.

## Acceptance criteria

- [ ] Two different valid data snapshots produce the correct different text, not the saved sample value.
- [ ] Missing/null/empty required values fail; 0 and false bind correctly; keys and significant string content stay intact.
- [ ] Multiline/tspan, text alignment, group/rotation and composition fixture placement match the declared Studio contract.
- [ ] Required field failures occur before renderer invocation.
- [ ] Neither legacy ASCII fixture restrictions nor silent aliases/coercions leak into the canonical path.
- [ ] The binder returns SVG/media evidence independently of simulation or print.

## Required validation

- Text/composition golden cases for exact key case, literals, XML escaping, multiline, Unicode, numeric formatting, zero/false, missing/null/empty and malformed expressions.
- Geometry/parity checks against independently captured Studio fixtures at fixed font/media/DPI.
- Failure tests asserting raster/transport is not invoked on invalid binding. Existing fixture regressions remain intact.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Record exact scalar conversion/text-layout rules and parity limits for T05/T06. Do not report complete barcode/QR or Studio output parity.
Write results/T04_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
