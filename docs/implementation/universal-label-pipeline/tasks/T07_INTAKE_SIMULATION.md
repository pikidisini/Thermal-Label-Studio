# T07 — Implement universal intake with stored-template simulation

TASK_ID: T07
Status: PENDING
Depends on: T02, T03, T04, T05, T06
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Expose canonical JSON intake that resolves exact stored Studio templates, binds each item on the server and returns clear simulation results.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- backend/app/main.py
- backend/app/layouts/service.py
- backend/app/layouts/models.py
- backend/app/labels/resolver.py
- backend/app/labels/service.py
- backend/app/engine/pipeline.py
- backend/app/simulation/service.py
- backend/app/observability.py
- backend/app/studio_datasets/http.py
- backend/tests/test_foundation_api.py
- backend/tests/test_layout_service_recovery.py

## In scope

Add backend/app/label_intake HTTP/service/results using the frozen API contract and injected existing layout storage. Implement simulation only; print requests fail closed until T10.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Register the universal route chosen in T01 with distinct OpenAPI models and no competing same-path fixture contract. New contracts/modules must not be named after SAP.
2. Bound/validate the envelope before item processing. Keep external request_id separate from server trace_id; do not trust payload identity as an authentication credential.
3. Resolve each label_code through the stored layout service, capture version/checksum/media, and freeze the mapping before execution. Do not fallback to roll_80x200 or any fixture catalog.
4. Use template_binding then the existing engine and simulation sink. Same label/data/copies parameters must produce the same output as the Studio server path.
5. Return ordered per-item results with actual status, chosen template evidence, bounded PNG/output and error stage/code; apply aggregate budgets and failure/continuation rules from CONTRACT.md.
6. Handle unknown/deleted template, artifact/checksum invalidity, storage unavailable, binding failure and render/codec error distinctly. Never return accepted as proof of completed output.
7. Keep Data Tokens/sample dataset selection unchanged and avoid sample writes for intake requests. Document print as unavailable until the later gates are implemented.

## Acceptance criteria

- [ ] A synthetic request can simulate two items/two label codes using injected stored templates with correct order and evidence.
- [ ] Simulation never creates a transport or contacts a printer, including a denied mode=print request.
- [ ] Unknown/deleted/invalid template does not fallback; item-specific failures follow the documented batch policy.
- [ ] Concurrent template changes do not alter the already-pinned versions used within a request.
- [ ] Canonical data, geometry and output parity match T06 under equal inputs.
- [ ] Request/response aggregate limits stop resource-heavy batches before violating the documented budget.
- [ ] Source authentication/admission readiness is accurately reported and no LAN/production claim is made.

## Required validation

- HTTP/schema tests for external envelope rejection and clear per-item response/error fields.
- Fake-layout tests for immutable version pinning, corruption, deletion, missing code and unavailable storage.
- Batch order/partial failure/resource-budget tests plus end-to-end local binding/engine/simulation parity.
- Regression ensuring intake does not modify Studio contracts/state/sample storage or use fixture acceptance.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Provide the stable intake/result service boundary for T08/T09/T10. Live PostgreSQL/MinIO verification remains for authorized T11.
Write results/T07_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
