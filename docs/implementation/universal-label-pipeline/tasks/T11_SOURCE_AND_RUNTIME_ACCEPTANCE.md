# T11 — Main software acceptance and separate runtime verification

TASK_ID: T11
Status: PENDING
Depends on: T02, T03, T04, T05, T06, T07, T08, T09, T10
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Independently verify the assembled universal pipeline through the existing IPL-to-PNG simulation and recorded print transport. This is the main software acceptance gate; physical printing is optional under T12. Distinguish software/source/mock evidence from storage/restart/container evidence.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- scripts/check_project.py
- scripts/check_coverage.py
- scripts/sonar_scan.ps1
- Jenkinsfile
- Dockerfile
- docker-compose.yml
- scripts/dev.py
- frontend/playwright.config.js
- docs/DEVELOPMENT.md
- docs/SONARQUBE.md
- docs/ARCHITECTURE.md
- docs/API_CONTRACT.md
- backend/app/engine/pipeline.py
- backend/app/simulation/service.py
- backend/app/printing/service.py
- backend/app/protocols/ipl/encoder.py
- backend/app/protocols/ipl/decoder.py
- backend/tests/test_ipl_codec.py

## In scope

Run the full relevant source gate, assess fresh quality when available, and perform named authorized runtime/storage/container checks. Preserve all operational volumes and existing work.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Review actual implementation diffs against accepted contracts and task evidence; inventory supported/rejected template features and outstanding decisions.
2. Run python -B scripts/check_project.py --run-source-checks. Generate/verify coverage if the quality gate is included, and run a fresh authorized scan rather than reporting stored historical PASS as current.
3. Validate shared-template/data matrices through Studio draft and intake with fixed font/media/encoder/copies. Compare raster pixels and exact payload bytes, then compare each prepared bitmap with pixels decoded from its actual IPL payload by the simulation sink. Use independently specified known IPL fixtures to detect shared encoder/decoder mistakes. Verify fake transport or a non-device recorder receives the exact prepared bytes once, with the native copy command and correct quantity. Semantic-only success or a visually plausible PNG cannot hide mismatch.
4. Run mock browser workflows separately from integration workflows. Reuse one Playwright configuration and existing target; do not start servers or seed legacy auth in tests.
5. Before real persistence/container actions, obtain or locate explicit named authorization: target storage, permitted schema application, retained synthetic artifacts, app/restart/build actions. Check renderer SHA256 before build and preserve existing volumes.
6. With authorization, prove stored template/data integrity, immutable version pinning, duplicate handling, concurrent requests and restart/crash recovery on a disposable or named target. Disable/fake all real printer routes.
7. With authorized image build, prove Linux packaged rendering/font/dependencies and loopback binding, health/readiness/browser behavior. Development reload alone is not image evidence.
8. Update active docs and gate results to match implemented behavior. Report source, quality, mock browser, real storage/restart and package evidence separately.

## Acceptance criteria

- [ ] Full source gate passes on the current working tree; any failure has a concrete resolution or correctly blocks the dependent acceptance.
- [ ] Parity matrix covers real Studio-exported synthetic templates and changing data, not only handcrafted fixture SVG.
- [ ] Prepared-bitmap/decoded-IPL pixels match, independent codec fixtures pass, and recorded transport proves exact bytes, one submit and native copies.
- [ ] Software acceptance requires no physical printer. Unexecuted optional T12 checks do not block this software gate and do not imply device readiness.
- [ ] Runtime/persistence/ledger restart proofs have named targets and evidence, including stale/duplicate/uncertain paths.
- [ ] Packaged image contains required binder/code-generation dependencies and renders the agreed font/media correctly.
- [ ] No printer delivery, LAN publication or operational volume deletion occurs.
- [ ] Fresh quality PASS is distinguished from not-run/unavailable scans.
- [ ] If external authorization is absent, complete local checks and leave this task PARTIAL with exact runtime gates NOT RUN. Report the software gate independently; do not claim runtime acceptance.

## Required validation

- Full source gate, relevant browser mocks, Studio/intake pixel/payload parity, prepared-bitmap versus decoded-IPL comparison, independent codec fixtures, recorded transport/copies and OpenAPI contracts.
- Authorized integration save/open/restart/version/deduplication tests with unique synthetic identities and retained artifact inventory.
- Authorized Docker build/Linux render/loopback health checks; separate operational source/quality gates.
- No physical transport. Simulations and print tests use fake sinks or an explicitly configured non-device recorder.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Write separate software and runtime acceptance results and list remaining gates. T12 is optional and is not a prerequisite for software acceptance; execute it only when requested, relevant T11 runtime gates pass and named physical authorization exists.
Write results/T11_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
