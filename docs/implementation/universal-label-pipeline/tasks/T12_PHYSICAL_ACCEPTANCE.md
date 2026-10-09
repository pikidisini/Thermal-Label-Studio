# T12 — Optional named printer and external-sender acceptance

TASK_ID: T12
Status: PENDING
Depends on: T11
Classification: OPTIONAL; outside the required software acceptance sequence. Execute only when requested.
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Prove physical behavior on explicitly authorized targets without conflating SUBMITTED, simulation parity and actual printer results.
T11 already provides the software acceptance gate through IPL simulation and recorded transport. This task adds named-device/integration evidence; leaving it PENDING/NOT RUN does not block software acceptance.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- AGENTS.md
- docs/print_guide/IPL/PRINT_PROCESS.md
- backend/app/printing/transport.py
- backend/app/protocols/ipl/encoder.py
- backend/app/protocols/ipl/decoder.py
- docs/API_CONTRACT.md
- docs/DEVELOPMENT.md

## In scope

Execute bounded external-sender/printer acceptance only for named targets and explicitly authorized counts/actions. If authorization is absent, prepare reviewable test cases and leave physical gates NOT RUN.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Record the exact device/IP/port/model, approved label codes/versions, media/DPI, authorized copy counts and external-source/system boundary. Identify approved reserved IPL graphic slots 64–99 and format 90 effects before sending.
2. Prepare synthetic acceptance templates/data: text baseline/multiline, rotation/groups, barcode/QR, edge/axis placement, tile boundaries and copies. Define measurements and pass tolerances before delivery.
3. Compare Studio and intake using the same saved version/data/output parameters and target settings; avoid comparing a changed unsaved Studio draft to an older stored template.
4. Perform only the authorized deliberate sends and count physical labels. Measure dimensions/placement/legibility and scan barcode/QR payloads; record consumables/device settings that affect results.
5. Exercise a safe authorized duplicate request check without intentionally creating uncontrolled uncertain sends. Uncertain conditions require inspection/reconciliation, not automatic retry or destructive fault injection.
6. If live SAP or another actual external system is included, record separate source-access/request authority; a synthetic HTTP client does not prove live integration.
7. Document outcomes, photos/scans when permitted, observed limits and go/no-go for the named target. Do not infer universal printer compatibility or production readiness.

## Acceptance criteria

- [ ] Every external effect has an explicit named target and bounded user-authorized action/count.
- [ ] Physical quantities/placement/payloads match approved expectations, or deviations are measured and reported.
- [ ] Studio/intake same-input parity is established through the named physical target without replacing logical evidence with visual intuition.
- [ ] Duplicate handling does not print twice; ambiguous results remain unresolved until inspection, never hidden as confirmed success.
- [ ] External-system acceptance and synthetic-client evidence are labeled separately.
- [ ] Missing authorization leaves physical tests NOT RUN and does not claim successful device readiness.

## Required validation

- Bounded named-target UAT cases with exact template/data/version/copies and observed physical quantities.
- Barcode/QR scan and dimension/axis/tile measurements under fixed documented settings.
- Approved request replay and source-response checks; no automatic retry, unapproved printer reset or slot/data cleanup.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Write optional device/integration acceptance evidence and target-specific limitations. Do not hold software acceptance open solely because this optional task was not executed. Leave production deployment, backup/recovery operations and wider exposure pending unless separately authorized.
Write results/T12_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
