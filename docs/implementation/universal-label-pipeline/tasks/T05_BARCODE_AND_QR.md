# T05 — Implement server barcode and QR binding

TASK_ID: T05
Status: PENDING
Depends on: T03, T04
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Generate barcode/QR content from current canonical data and preserve Studio payload semantics/settings and placement.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- frontend/src/features/barcode/model/barcodePayload.ts
- frontend/src/features/barcode/model/barcodePreview.ts
- frontend/src/features/barcode/model/barcodeGenerators.ts
- frontend/src/features/qr/model/qrGenerator.ts
- frontend/src/features/barcode/hooks/useBarcodeTokenActions.ts
- frontend/src/hooks/canvas/useObjectOrderingActions.ts
- frontend/src/features/canvas/svg/fabricSvgExporter.ts
- frontend/src/features/canvas/svg/fabricSvgImporter.ts
- requirements.txt
- frontend/package.json

## In scope

Add template_binding barcode/qr and extend service validation with the approved dependency/metadata contract. Do not change the IPL encoder or printer transport.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Inspect actual Studio barcode/QR options and dependencies, then implement only declared supported types/options. Record dependency changes and reproducibility choices.
2. Resolve payload from raw fields/literals with the same canonical composition rules. Validate type-specific constraints including EAN checksum and supported characters/QR payload limits.
3. Regenerate dynamic codes; do not reuse embedded sample images. Preserve static embedded images unchanged and distinguish them from dynamic codes.
4. Preserve object bounds, aspect behavior, transform/order and declared QR error-correction/margin/code options. Fail unsupported settings instead of substituting defaults.
5. Use deterministic generation with fixed parameters. Add backend/frontend common vectors, scan/decode evidence where feasible, and resulting raster parity tests.
6. Integrate with the full template binder so the entire item succeeds or fails before any final output preparation.

## Acceptance criteria

- [ ] Changing source values changes encoded barcode/QR payload; invalid/missing source produces no successful output.
- [ ] Text plus barcode/QR compositions use exact keys and literal data without arbitrary code.
- [ ] Supported Studio type/options and geometry are preserved; unrecognized types/settings are rejected.
- [ ] Payload-semantic checks and visual/pixel checks are both recorded; a successful scan alone does not prove layout parity.
- [ ] Unsupported features remain explicit failures. No fallback to old embedded dynamic image, invented default URL or data placeholder occurs.
- [ ] Shared renderer/codec/transport remains unchanged unless a demonstrated contract defect is separately reviewed.

## Required validation

- Tests for supported barcode types, EAN check digits, invalid characters, QR length/options, missing/null/empty/zero/false, Unicode according to the chosen type and duplicate bindings.
- Compare synthetic Studio/backend decoded payloads and raster geometry/bytes at fixed parameters; document any nondeterminism before cutover.
- Regression for static images/groups/rotation and no transport side effects.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Provide complete binder feature/parity evidence for T06. If visual parity cannot be satisfied, stop that cutover with NEEDS_REPLAN instead of accepting an unexplained mismatch.
Write results/T05_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
