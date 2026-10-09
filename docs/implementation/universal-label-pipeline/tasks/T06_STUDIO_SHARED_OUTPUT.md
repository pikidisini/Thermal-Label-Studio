# T06 — Move Studio output to the shared server binding path

TASK_ID: T06
Status: PENDING
Depends on: T02, T04, T05
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Make Studio preview and manual print bind current draft data on the same server service that external intake will use, while retaining responsive local design.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- frontend/src/components/studio/Studio.tsx
- frontend/src/features/canvas/svg/fabricSvgExporter.ts
- frontend/src/features/simulation/hooks/useThermalSimulation.ts
- frontend/src/features/simulation/ui/EditorSimulationModal.tsx
- frontend/src/features/simulation/api/editorPreviewApi.ts
- frontend/src/features/printing/api/printingApi.ts
- frontend/src/features/printing/ui/EditorPrintModal.tsx
- backend/app/simulation/editor_http.py
- backend/app/printing/http.py
- backend/app/engine/pipeline.py
- frontend/tests/studio_preview.mjs
- frontend/tests/browser/ui/printing.spec.js
- frontend/tests/browser/ui/studio.spec.js

## In scope

Update existing editor endpoint/client request contracts atomically for current draft+explicit data; call the shared template binder and existing engine; add parity/browser regressions.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Replace reliance on client-composed dynamic sample output with a complete immutable draft+selected-data snapshot at action time. Include authoritative width/height/DPI and explicit output parameters per CONTRACT.md.
2. Keep local canvas binding for fast design feedback. Server binding is authoritative for preview/print; make async image generation/late client updates unable to substitute stale sample output.
3. Use the shared backend binder in both existing editor-preview and printing/editor handlers. Preserve a documented safe static-SVG case; invalid/missing dynamic data cannot silently take the old composed-SVG path.
4. Retain both preview entry points, one decoded PNG for the two Preview panels, cancellation/generation protection and stale-image clearing. Do not introduce legacy render/inspection routes.
5. Keep manual print target entry, copies 1–999, explicit action, one submit and uncertain-response lock. Import mode=print never selects/executes transport. Preview overrides cannot bypass server required-data validation.
6. Run same draft/data/parameters through binder and output services used by future intake and compare bound semantics, raster pixels and payload bytes. Separate Design display differences from actual output mismatch.
7. Update implemented API/product documentation and test mocks/selectors as needed without touching unrelated editor geometry/preferences.

## Acceptance criteria

- [ ] Studio preview and manual print invoke the same template_binding service and existing engine pipeline.
- [ ] Editing data, then immediately previewing/printing cannot use an older embedded dynamic image or captured sample text.
- [ ] Unsaved draft changes are respected; no save is required for preview/print and no storage writes are introduced.
- [ ] Backend rejects missing/invalid binding even when UI checks are bypassed.
- [ ] Same-input parity covers multiline/composition/barcode/QR/group/rotation and null/empty/zero/false cases.
- [ ] Print opens without network effects; uncertain delivery stays locked and no automatic retry is introduced.
- [ ] Existing preview URLs and manual output UX remain functional under the revised contract.

## Required validation

- Frontend client/hook tests with mocks for draft/data snapshots, cancellation, stale response, quantity/target, malformed success and uncertain delivery.
- Backend editor HTTP tests with server binding, type/safety/media errors and fake transport assertions.
- Mock browser tests on the existing authorized running target for dynamic field changes, draft output, both preview entry points and explicit print; never physical transport.
- Meaningful pixel/payload parity tests and relevant TypeScript/build/regressions; all operational gates remain separate.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Write parity evidence that T07 can reuse. Do not call an external sender or deliver to a real printer.
Write results/T06_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
