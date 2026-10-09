# T01 — Baseline and freeze the universal pipeline contracts

TASK_ID: T01
Status: DONE — independent review PASS; see ../results/T01_REVIEW.md
Depends on: None
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Produce a source-backed implementation baseline and exact contracts that let later tasks run independently without reconstructing this conversation.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and current source.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- AGENTS.md
- docs/ARCHITECTURE.md
- docs/API_CONTRACT.md
- docs/PRODUCT_FLOW.md
- docs/DECISIONS.md
- docs/DEVELOPMENT.md
- backend/app/main.py
- backend/app/engine/pipeline.py
- backend/app/labels/templates.py
- backend/app/layouts/service.py
- backend/app/jobs/repository.py
- frontend/src/components/studio/Studio.tsx
- frontend/src/features/data-tokens/model/localSapJsonParser.ts
- frontend/src/features/canvas/svg/fabricSvgExporter.ts
- frontend/src/features/canvas/svg/fabricSvgImporter.ts
- frontend/src/features/printing/api/printingApi.ts

## In scope

Read current source and prepare design/evidence documents inside this implementation package. No application behavior or operational data changes.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Record repository/branch/HEAD, initial dirty files and the route/consumer inventory. Trace Studio draft binding/export, save/open, both preview entry points, manual print, fixture acceptance and jobs foundations. Verify changes since the 2026-10-09 analysis.
2. Create BASELINE.md in this package with implemented/unwired boundaries and current source pointers. Do not treat historical test counts as a current source gate.
3. Create CONTRACT.md specifying the universal intake URL, request/response schema, editor draft+data schema, media authority, response statuses, HTTP mappings and explicit resource budgets. Resolve every applicable choice in DECISIONS.md with rationale and distinguish user requirements from selected technical defaults.
4. Specify missing-mode handling for historical local sample datasets without silently defaulting an external request to print or modifying operational records. Preserve clearly separate legacy v1.1/raw-v2 local exploration; new intake must accept only the canonical contract.
5. Inventory binding metadata, static objects, text/multiline/tspan, group/rotation/scaling, barcode types and QR options. Define the supported server subset, metadata versioning and fail-closed unsupported-feature behavior.
6. Select a minimal dependency approach for server barcode/QR generation, with parity evidence required before Studio cutover. Do not assume the existing Python fixture binder handles Fabric output.
7. Define durable request identity/replay/crash states, source authentication, version-specific approval and server target policy. Define batch preflight and stop-on-uncertain behavior. Choose response retention and aggregate limits that can be enforced before printing.
8. Create PARITY_MATRIX.md with synthetic template/data cases and comparison levels: binding semantics, Studio/intake raster pixels and IPL bytes, prepared-bitmap versus decoded-IPL pixels, independently specified codec fixtures, recorded transport/copies and browser behavior. Record same-input parameters, expected failures and evidence owners. Keep live runtime/storage gates separate and physical device acceptance optional under T12.

## Acceptance criteria

- [ ] BASELINE.md, CONTRACT.md and PARITY_MATRIX.md are sufficient to begin T02 without hidden chat context.
- [ ] All accepted decisions remain intact; any unresolved consequential choice is identified with its exact blocked dependency. Reversible internal choices have a recorded implementation decision.
- [ ] Exactly one universal intake contract/path and an explicit fixture boundary are documented.
- [ ] Both Studio preview/print and external intake will use the same server binding and engine; draft vs stored-version semantics are explicit.
- [ ] Contract includes mode, copies 1–999, bounded ordered results, source identity, pinned template version and uncertainty/replay semantics.
- [ ] No source edits, storage operations, external calls, new service startup or printing occur.

## Required validation

- Inspect real source routes and call sites; optionally read loopback health/OpenAPI without storage operations if already running.
- Validate sample JSON schemas and all document links. Do not execute a full build just to validate design documents.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Write results/T01_RESULT.md, obtain a contract review, and then make T02 eligible. Do not start T02 in the same task.
Write results/T01_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
