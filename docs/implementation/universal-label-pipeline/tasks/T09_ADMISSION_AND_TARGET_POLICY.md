# T09 — Implement intake admission, template approval and target routing

TASK_ID: T09
Status: PENDING
Depends on: T01, T07
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Ensure external print uses a trusted source, explicitly permitted template version and server-selected printer target.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- backend/app/config.py
- backend/app/main.py
- backend/app/layouts/models.py
- backend/app/layouts/service.py
- backend/app/printing/http.py
- backend/app/printing/transport.py
- backend/app/observability.py
- .env.example
- docs/DECISIONS.md
- frontend/src/features/printing/model/printerTarget.ts

## In scope

Implement the narrow admission/approval/target policy frozen in T01, using local fake credentials and targets. Preserve the existing manual Studio print policy.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Implement trusted external identity/admission using the selected local policy; separate authenticated identity from descriptive sender metadata. Do not invent a Studio login system.
2. Keep external print disabled/denied by default. Make configured source capabilities explicit for simulation vs print and return bounded denial errors.
3. Resolve server-owned template approval against label_code, version and checksum. Saving/publishing or editing a template does not silently approve its new version.
4. Implement server-owned target routing for authorized sources/templates. Reject unknown/invalid/unapproved targets before rendering/transport. Do not accept arbitrary host/port control embedded in item.data.
5. Validate numeric target/port using existing PrinterTarget rules and distinguish syntax validity from permission to use a target.
6. Preserve manual Studio per-action target behavior unless a separately accepted policy change is necessary. Never allow this public contract to widen LAN exposure.
7. Document configuration, safe examples and revocation/approval behavior without real tokens/IPs/secrets or operational writes.

## Acceptance criteria

- [ ] Missing/invalid identity and unauthorized source/capability are denied without render/send.
- [ ] Published-but-unapproved versions cannot externally print; changed version/checksum requires the selected explicit approval step.
- [ ] External request data cannot control arbitrary destinations.
- [ ] Target resolution is deterministic, server-owned and reflected appropriately in results; unavailable mapping fails closed.
- [ ] Policy failures cannot mutate approved template/sample data or bypass the ledger gate.
- [ ] Existing manual print UX and no-probe target inspection remain intact.

## Required validation

- Policy tests with synthetic source credentials, allowed/denied capabilities, revoked source, version/checksum mismatch and unapproved published template.
- Target mapping tests with numeric IPv4/IPv6 and invalid/missing routes; assert zero renderer/socket operations on denial.
- Tests that payload sender metadata does not authenticate or authorize itself.
- Relevant config/manual print regressions and docs/secret-leak checks; no live credential provisioning.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Provide preflight policy APIs for T10 and an explicit local runtime configuration checklist for T11.
Write results/T09_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
