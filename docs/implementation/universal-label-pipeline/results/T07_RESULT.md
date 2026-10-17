# Task result: T07

## Identity and scope

- Task: T07, universal stored-template intake simulation.
- Task file: tasks/T07_INTAKE_SIMULATION.md.
- Date: 2026-10-10 (Asia/Jakarta).
- Executor: primary agent; no delegated writer/reviewer.
- State: NEEDS_REPLAN (local functional implementation delivered; strict resource gate outstanding).
- Repository: Thermal-Label-Studio, branch main, HEAD bb639065a3161e9421336913be8327009b4c2ab9.
- Initial worktree: 417 tracked/non-ignored source files snapshotted in `.tmp/t07-00c231b981/initial.json`; earlier T03-T06 changes preserved. No reset/commit/publication.
- Prerequisites: T02 canonical admission, T03 metadata, T04 text, T05 symbols and verified T06 source/native parity. T06 current-app browser remains BLOCKED. User explicitly requested T07; this permits this local implementation but does not convert the earlier browser gate to PASS.

## Delivered behavior

POST `/api/v1/label-intake` has distinct OpenAPI request/results/error schemas, bounded streamed canonical JSON admission and a non-queued process-wide request slot. External admission defaults to 503 policy_unavailable until T09. There is no environment bypass; sender.system is never a credential. Synthetic tests inject trusted admission and fake existing-layout storage. Trusted print requests fail 403 mode_not_allowed; storage absence fails 503 intake_unavailable.

The service snapshots canonical item values, resolves each unique stored label code once, validates exact artifact SHA-256/media/version, and freezes all pins before preparing any item. It invokes the same prepare_draft_output and simulate_prepared_output owners as Studio. Simulation PNG represents the decoded prepared IPL, with native copies 1..999, payload digest/size and template evidence. Item order is retained with SIMULATED/FAILED/SKIPPED, bounded public error stage/code, complete zero-inclusive summary counts and truthful COMPLETED/PARTIAL/FAILED. Failed items have no PNG; there is no fixture fallback or dataset mutation.

Raw body, SVG reads, item and batch output sizes, pixels/copies, response reservation and estimated working reservation are bounded. Deadline checks discard late completed work and skip subsequent items. These checks are useful but do not satisfy the hard execution gate described below. Replayed remains false; no T08 durable ledger/deduplication/restart guarantee is implemented.

## Files changed

- New `backend/app/label_intake/__init__.py`, `http.py`, `service.py`, `results.py`: HTTP admission, pinning/ordered simulation, distinct public schemas/vocabulary.
- `backend/app/layouts/service.py`: bounded 512 KiB + 1 object read, artifact-specific error subtype, exact validated artifact bytes returned without reserialization.
- Already-dirty `backend/app/main.py`: only T07 imports/router/middleware/error-handler registration added; existing T06 edits preserved.
- Already-dirty `backend/tests/test_foundation_api.py`: exact implemented intake HTTP/result owner allowlist entries added; foundation service isolation retained.
- New `backend/tests/test_label_intake.py`, `test_layout_artifact_read.py`: fake admission/storage, native parity, corruption/limits, process slot, and explicit deadline-limitation evidence.
- Five active docs and package CONTRACT/DECISIONS/PARITY_MATRIX/README/STATUS/SUMMARY/task: current behavior, gates and honest handoff.
- No frontend, dependency/manifest, migration/schema or operational configuration changes in T07.

## Validation evidence

| Gate | Status | Command/target | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Focused source regressions | PASS | python -B -m pytest -p no:cacheprovider -p no:tmpdir backend/tests/test_label_intake.py backend/tests/test_layout_artifact_read.py backend/tests/test_layout_service_recovery.py backend/tests/test_foundation_api.py -q --tb=short --junitxml=.tmp/t07-00c231b981/focused.xml (PYTHONPATH=backend) | 84 passed, zero skipped; focused.xml | Fake admission/storage; native renderer explicitly selected in parity tests |
| Native binding/raster/IPL parity | PASS | Six static/text/Code128 cases, copies 1/999; intake HTTP versus Studio HTTP/direct engine/decoded IPL | Focused suite, six native cases | Windows resvg/Arial only; not all symbol/media/package profiles |
| Full project source gate | PASS | python -B scripts/check_project.py --run-source-checks | `.tmp/source-checks-a732f701-3055-4981-8389-b538b4ea37ab/report.json`; backend regression, frontend TypeScript/build/regression all PASS | Source only, no runtime readiness |
| Diff and work preservation | PASS | git diff --check; hash comparison to initial snapshot | preservation.json | Existing dirty changes are retained; no independent reviewer |
| Hard batch deadline | FAIL | Blocked fake resolver exceeds shortened deadline until explicitly released | test_blocked_resolution_exposes_cooperative_deadline_limit | Pytest PASS reproduces the defect, not hard-deadline acceptance |
| Native OS memory enforcement | FAIL | Source inspection: subprocess capture/timeout, no OS memory fence | engine/raster.py + label_intake/service.py | 128 MiB reservation is an estimate, not process RSS enforcement |
| Browser | NOT RUN | No UI changed/started | T06 remains BLOCKED | No current-app browser PASS claimed |
| Live storage/restart/package | NOT RUN | No database/object-store/container operations | None | Fake storage is not persistence evidence |
| Quality scan | NOT RUN | No fresh scan | None | Source gate is not SonarQube evidence |
| External sender/printer/T12 | NOT RUN | No access or delivery | None | No sender/device acceptance claimed |

402 initial files remain byte-identical, 15 existing files have scoped T07 edits, no initial files are missing, and HEAD is unchanged. Eight new files belong to T07 (four package source files, two tests and result/review). Final hash comparison is in preservation.json.

## Side effects

Only repository edits, local fake tests, installed renderer/font reads and source-gate build/tests were performed. Reports remain in unique `.tmp` children. No SAP/external sender request, printer transport, storage initialization/write, service/container start/stop, migration, commit or push occurred. Tests used protected synthetic inputs, not operational data; public errors/logs contain no raw business values/private exception text.

## Decisions, risks and blockers

T07-R01: the existing synchronous get_layout call cannot be interrupted by the cooperative 60-second deadline. A blocked read can hold the process slot beyond that time. Late output is discarded, but the caller still waits for the blocking operation to return. The fake blocking test reproduces this without contacting storage.

T07-R02: admitted buffer/media reservations do not enforce an OS memory cap on the native renderer or prove total peak working memory. Existing resvg has a 15-second subprocess timeout; that is a time bound, not a memory bound. Strict frozen resource acceptance therefore remains FAIL. Default external admission stays denied. No requirement was weakened to mark DONE.

Result metadata reserves 128 KiB instead of the frozen minimum 64 KiB for 100 maximal identifiers/pins. The 12 MiB response limit is unchanged. This is a more conservative technical reservation, not a business-contract change.

## Handoff

Six functional acceptance criteria are verified. The aggregate/resource criterion is partially implemented and remains unchecked due to R01/R02. Review outcome is CHANGES_REQUIRED; no successor begins. T08/T09/T10 stay PENDING. T06 browser remains BLOCKED independently.

Next scoped prompt: Complete the T07 resource replan with a cancellable isolated execution boundary, hard 60-second batch deadline and enforced combined memory limit. Preserve exact pinned templates and the existing shared binder/engine/simulation sink. A timed-out worker must terminate and be reaped before the process slot can admit another request. Add never-returning storage, native memory/timeout/crash and subsequent-admission recovery evidence. Keep external admission closed and do not start T08/T09/T10 or operational services.
