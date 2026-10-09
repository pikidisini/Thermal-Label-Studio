# T10 — Connect universal intake print with durable outcomes

TASK_ID: T10
Status: PENDING
Depends on: T06, T07, T08, T09
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Process authorized external print items through the shared binder/engine and exactly one transport submission attempt per claimed item, with honest outcomes.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- backend/app/printing/service.py
- backend/app/printing/transport.py
- backend/app/printing/http.py
- backend/app/engine/pipeline.py
- backend/app/engine/output.py
- backend/app/simulation/service.py
- backend/tests/test_printing_http_transport.py
- backend/tests/test_physical_printing.py
- frontend/src/features/printing/api/printingApi.ts

## In scope

Enable intake mode=print only after canonical validation, template/policy preflight and durable identity gates. Implement response and batch semantics with fake transport.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Preflight the whole batch according to CONTRACT.md before any physical send: canonical data, template version/spec, required values, aggregate budget, approval and target. Pin all needed versions.
2. Prepare each item's bound SVG through the same engine used by Studio; carry item copies 1–999 into native IPL quantity without raster/transport loops.
3. Commit durable pre-send/SENDING intent before transport. If that gate fails, do not send. Invoke the existing submit_prepared_output once and persist the resulting state.
4. Return SUBMITTED confirmed=false only for successful local submit. Return FAILED for proven pre-send failures and UNCERTAIN for possible delivery/response-loss/terminal-commit ambiguity.
5. Stop later sends on uncertainty and mark unsent items explicitly according to the agreed batch policy. Never hide partial delivery behind a blanket failed/accepted response.
6. Implement duplicate and retry behavior through T08's ledger; do not add automatic fallback targets, transport retries, spooler paths or count loops.
7. Preserve simulation isolation and document which global errors happen before any item vs which per-item outcomes can include side effects.

## Acceptance criteria

- [ ] An authorized valid request creates one payload and one submit per item; copies affects IPL quantity, not the number of submits.
- [ ] Equal stored template/data/parameters match the Studio server output pixels/payload.
- [ ] Validation/policy/ledger/preparation failures never call transport.
- [ ] Ambiguous send/terminal persistence failures cannot unlock automatic resend or send later batch items.
- [ ] Replay/concurrent duplicate cannot send again; result exposes chosen version, copies, effective target and confirmation limit.
- [ ] All results reflect actual processed/submitted/skipped items. No response claims physical printing succeeded.
- [ ] Only injected fake targets/transports are exercised in this task.

## Required validation

- Fake transport tests for exact bytes/count, copies boundaries, batching, partial preparation failures and stop-on-uncertain behavior.
- Duplicate concurrency, lost-response, crash-after-SENDING and terminal-commit failure tests across T08/T10 boundaries.
- Studio/intake parity tests at fixed parameters and simulation no-transport regression.
- OpenAPI/error contract checks plus relevant backend/frontend regressions; no real socket destination.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Provide full source/fake evidence and runtime matrix for T11. Physical acceptance is still NOT RUN.
Write results/T10_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
