# T08 — Implement durable request identity and safe replay boundaries

TASK_ID: T08
Status: PENDING
Depends on: T01, T07
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Prevent duplicate external-print effects across concurrent requests, response loss and restarts using a minimal durable request ledger.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- backend/app/jobs/repository.py
- backend/schema/001_jobs.sql
- backend/app/layouts/service.py
- backend/app/config.py
- backend/app/observability.py
- backend/tests/test_job_persistence.py
- backend/tests/test_layout_service_recovery.py

## In scope

Implement the agreed label_intake ledger/schema and service identity handling with transactional fakes. Do not blindly wire the old metadata-only jobs model or initialize operational schema.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Confirm T01's authenticated source/request identity, canonical input digest and retention policy. A body-provided sender.system alone cannot impersonate another source.
2. Implement durable atomic admission/claim for repeated identities, preserving canonical digest, pinned template versions and bounded item states/results. Reuse consumed existing foundations only if their actual contract fits.
3. Reject a repeated identity with changed mode/data/copies/items. An identical replay returns stored outcome/in-progress/uncertain according to CONTRACT.md, with no new irreversible effect.
4. Represent per-item durable pre-send/SENDING/terminal state boundaries. A crash or lost commit acknowledgment after a potential send must not release the item for automatic resubmission.
5. Make ledger unavailability fail closed for print. Store no secrets; retain sensitive source snapshots/results only under the selected bounded policy. Do not use process memory alone as deduplication.
6. Write schema/change instructions and disposable test setup in source. Keep actual operational initialization/migration/recovery exercises for named authorization.
7. Integrate request identity into simulation/result behavior as specified without making unsupported exactly-once physical delivery claims.

## Acceptance criteria

- [ ] Concurrent duplicate claims have one owner; changed-input collision is rejected.
- [ ] Replay after success cannot repeat a print; replay after SENDING/UNCERTAIN cannot automatically retry.
- [ ] Pinned template versions are reused on replay even if current active versions change.
- [ ] Crash windows before/after claim, before send, after send and during terminal commit are documented and tested.
- [ ] Database failure/rollback uncertainty produces bounded errors and no unsafe transport eligibility.
- [ ] No in-memory-only idempotency, arbitrary expiry-based resend or old job-state shortcut is presented as durable safety.
- [ ] Schema edits are reviewable without applying them to operational storage.

## Required validation

- Transactional fake tests for compare-and-claim, digest collision, duplicate concurrency, pinned version replay and bounded retained outcomes.
- Crash/restart recovery simulations asserting no automatic re-send after possible delivery.
- Failure/commit acknowledgment tests and old jobs foundation regression.
- A real restart/concurrency ledger test is required later in T11; fake PASS alone does not prove it.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Expose the durable claim/outcome API and crash matrix for T10. Record all unapplied schema requirements for T11.
Write results/T08_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
