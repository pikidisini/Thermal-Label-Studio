# T02 — Implement the canonical label-data contract

TASK_ID: T02
Status: DONE — independent review PASS; see ../results/T02_REVIEW.md
Depends on: T01
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Make backend intake/sample storage and Studio local parsing agree on the latest JSON envelope, including required mode and copies 1–999.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- backend/app/studio_datasets/validation.py
- backend/app/studio_datasets/http.py
- backend/app/studio_datasets/service.py
- backend/app/labels/models.py
- frontend/src/features/data-tokens/model/localSapJsonParser.ts
- frontend/src/features/data-tokens/model/sapContractAdapter.ts
- frontend/src/features/data-tokens/index.ts
- frontend/src/components/studio/Studio.tsx
- docs/examples/label_data.example.json
- backend/tests/test_studio_datasets.py
- frontend/tests/test_frontend.mjs

## In scope

Add backend/app/label_data models/validation; align existing Studio parser and dataset boundaries; update examples/tests and implemented contract documentation.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Implement the canonical request/item model and bounded JSON admission from CONTRACT.md. Require mode and strict copies 1–999; reject malformed envelopes, duplicates and disallowed scalar/key values before persistence.
2. Reuse canonical data validation in studio_datasets while keeping dataset upload metadata (name/original_filename/payload) feature-owned.
3. Align frontend parsing with backend semantics, preserve request mode/item copies as metadata, and keep exact technical keys and descriptions distinct from values.
4. Implement the T01 policy for historical mode-less sample data and legacy local formats. Do not silently relax external admission or bulk-rewrite saved datasets.
5. Keep import/read actions free of print effects. Do not route imported mode to automatic submission, switch the user's dataset from external intake, or treat a dataset request_id as globally unique.
6. Update canonical synthetic examples and active API/data documentation around the behavior actually implemented.

## Acceptance criteria

- [ ] Copies 1 and 999 are valid; 0, 1000, booleans, strings and fractional values fail in the canonical contract.
- [ ] Absent/invalid mode fails external canonical validation. Local historical exploration follows the documented explicit policy.
- [ ] 0 and false remain available values, null/empty/missing stay distinguishable; source identifiers remain text.
- [ ] Frontend/backend agree on item uniqueness, key case, scalar values, safe key names and required fields.
- [ ] Uploading mode=print never contacts transport or triggers output. Dataset storage errors keep local exploration available.
- [ ] Shared validation has one backend owner; no generic compatibility forwarding layer is introduced.

## Required validation

- Backend contract and dataset tests for valid/invalid mode, copies boundaries, UTF-8/JSON/size bounds, finite scalars, unsafe keys, exact case, duplicates and missing/null/empty values.
- Frontend parser tests using the same synthetic cases and an upload behavior test that asserts no print request.
- Relevant source regression/typecheck; no live persistence writes.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Record precise legacy behavior, contract fixtures and tests for T03/T06/T07. Do not claim intake processing exists yet.
Write results/T02_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
