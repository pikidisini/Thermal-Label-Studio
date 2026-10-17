# Task result: T10

## Identity and scope

- Task: T10_INTAKE_PRINT.md; date: 2026-10-10 (Asia/Jakarta).
- Executor: primary agent, direct implementation and actual-source self-review; no delegated writer or independent second-agent review.
- State: NEEDS_REPLAN for full frozen acceptance. Functional source/fake implementation and source checks PASS; mandatory T07 hard deadline/native memory boundary remains unmet.
- Repository/branch/HEAD: Thermal-Label-Studio / main / bb639065a3161e9421336913be8327009b4c2ab9, unchanged.
- Authorization: explicit user “kerjakan t10”, scoped source/fake transport. No authorization for real source, printer, storage initialization/migration, credentials, lifecycle, deployment or publication inferred.
- Initial inventory: 441 tracked/unignored file hashes, .tmp/t10-0b15f3b957/initial.json. Unrelated dirty T03–T09 work preserved; no initial file removed. Final inventory .tmp/t10-0b15f3b957/preservation.json.
- Context inspected: current task/package/AGENTS, active five docs, frozen contract/parity, T07/T09 reviews, actual T08 ledger/pins/recovery, T09 auth/policy, shared engine/output/simulation, existing print sink/transport/tests and frontend manual print API. T06 browser BLOCKED and T07 NEEDS_REPLAN retained.

## Delivered behavior

The universal HTTP route now branches mode=print through existing T09 source/mode/code authorization and T08 durable identity lookup. Identical terminal requests replay original pins/results without storage reads, raster or transport; conflicting input is rejected. Default missing credential/policy/ledger remains closed; nothing is operationally configured by this task.

New print_service resolves each unique stored version once with existing pin_layout and preflights all approval/target/media/aggregate reservations before rendering. Every ordered pin, including target ID/revision, is committed before preparation. The unchanged Studio prepare_draft_output produces one PreparedOutput/native IPL payload per item with copies1..999. All preparation and bounded outcome reservation finish before any transport. Any preflight/preparation offender fails and every other item is skipped; no transport is constructed.

Before each claim, T09 revalidates current credential/capability/code/grant/original policy revision/address/port. The acknowledged SEND_CLAIMED transaction precedes factory construction and one submit_prepared_output invocation. SUBMITTED has confirmed=false and means local acceptance only. Possible write/close failure becomes UNCERTAIN and atomically skips later items. Current policy denial or proven no-submit failure stops later claims; there is no retry, fallback address, spooler or background resumption.

The existing TCP class now raises PrintBeforeSendError only for socket construction/connect/timeout setup before entering sendall. Factory construction is pure by contract, as in existing TcpRawTransport. Only trusted no-submit proof can settle a claimed item FAILED. Manual Studio still catches PrintSubmissionError superclass and retains its conservative uncertain UI behavior.

After any claim attempt, uncertain claim/settlement/terminal commit failures return correlated 503 response_unavailable with explicit possible-submission/no-automatic-resend semantics. Final HTTP serialization failure after terminal commit also uses that code. The durable identity prevents resumption. Quiesced recovery is explicit and never invoked automatically; fake tests preserve possible-send UNCERTAIN. A lost terminal ACK with a committed terminal record can return that record on same-identity replay without another submit.

## Files changed

- New backend/app/label_intake/print_service.py: stored resolution, all-batch preparation, resource retention/reservation, policy recheck, committed claims, existing one-attempt sink and bounded durable outcomes.
- Existing untracked T07–T09 http.py: print/simulation response union, transport constructor dependency, current-policy callback and post-terminal response ambiguity; existing slot, body admission, auth and simulation remain.
- Existing untracked ledger.py: nullable unresolved print target pins, detailed bounded pre-send error persistence, proven-not-sent claim settlement, resolved target IDs on failed/skipped results, return terminal metadata after commit ACK. No schema/driver/lifecycle change.
- Existing untracked ledger_models.py/results.py: PrintOutcome wire representation/unique item identity, static response_unavailable vocabulary.
- Existing printing/service.py and transport.py: explicit trusted pre-send error subclass/classification; existing one-attempt sink and numeric IP/timeout/quantity flow retained.
- New backend/tests/test_intake_print.py: actual HTTP auth/policy, recorder, transactional faults, policy changes, native parity, concurrency, crash/lost-response/replay evidence.
- Existing test_intake_policy.py/test_label_intake.py: replace obsolete unconditional-print-denied assertion with missing-ledger gate; keep simulation free of transport and universal flow free of fixture/data-set imports.
- Existing test_printing_http_transport.py: expect new explicit connect-before-send classification while retaining timeout/count/close/destination assertions.
- Active five docs, package CONTRACT/DECISIONS/PARITY_MATRIX/README/SUMMARY/STATUS/selected task, new T10_RUNTIME_MATRIX and result/review artifacts: implemented behavior and strict acceptance/resource limits.
- No dependency/manifest/schema/main lifecycle/engine/binder/layout/job/frontend/config/.env/Compose change. Previous task result/review files remain unchanged.

## Validation evidence

| Gate | State | Command/target | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Final focused regression | PASS | PYTHONPATH=backend; python -B -m pytest -p no:cacheprovider -p no:tmpdir backend/tests/test_intake_print.py backend/tests/test_intake_policy.py backend/tests/test_label_intake.py backend/tests/test_intake_ledger.py backend/tests/test_printing_http_transport.py backend/tests/test_physical_printing.py backend/tests/test_foundation_api.py -q --junitxml=.tmp/t10-0b15f3b957/focused.xml | 267 passed, zero skipped | Synthetic credentials, disposable ledger and recorded/fake transport |
| Full source gate | PASS | python -B scripts/check_project.py --run-source-checks | .tmp/source-checks-f7cfa3bb-8f07-4036-b437-36006f4e33c9/report.json | Backend/frontend regression, TypeScript and build; deployment_ready=false |
| Copies/bytes/count/whole-batch preparation | PASS | Recorder asserts PREPARED/claim states and one exact payload per item | Focused XML | No physical quantity claim |
| Studio/intake/shared sink parity | PASS | Six native Windows resvg/Arial static/Fabric text/Code128 cases, copies1/999; actual Studio editor-preview, exact recorded IPL, bitmap vs decoded IPL | Focused XML | Chosen native renderer/font profile; no browser Canvas/Linux package proof |
| Fake crash/concurrency/replay | PASS | Before/after admission/preparation/claim/settlement/terminal commit, claimed crash, serialization loss, competing workers and explicit recovery | Focused XML | SQLite transaction adaptation is not live PostgreSQL/process-restart evidence |
| Simulation/manual print boundaries | PASS | No simulation factory invocation; existing numeric target/no-probe/manual uncertainty/independent codec regressions | Focused/source suites | Actual current-app browser remains unexecuted |
| Diff/whitespace/preservation | PASS | git diff --check, new-file whitespace and initial/final SHA-256 inventory | .tmp/t10-0b15f3b957/preservation.json | Unrelated changes/HEAD retained |
| Hard storage deadline/native memory | FAIL against frozen requirement; NEEDS_REPLAN | Same synchronous T07 storage/renderer boundary, cooperative checks/reservations only | T07 result/review plus inspected print_service resolution/preparation | Mandatory acceptance gap, not waived by source PASS |
| Current-app browser acceptance | BLOCKED, unchanged | T06 existing gate | T06_RESULT/T06_REVIEW | Not rerun or promoted by build |
| Live schema/storage/keys/policy/credentials/restart | NOT RUN | Named-authorized T11 operations | T10_RUNTIME_MATRIX | No operational writes or maintenance |
| Packaged runtime/TLS/audit worker coordination | NOT RUN | T11 | Source report runtime gates | No image/lifecycle/deployment effect |
| Quality scan | NOT RUN | Separate current snapshot | None | Source gate is distinct |
| Real sender/device | NOT RUN | Optional named-authorized T12 | None | No physical delivery or integration claim |

Initial development runs exposed obsolete connect exception expectations and mistakes in new test fixture filenames/rejected-admission assertions. These were corrected without relaxing the behavioral assertions; final focused/full source reports are the acceptance evidence. Two existing TestClient deprecation warnings remain. No failing or skipped source test remains.

## Side effects and constraints

Only source/docs and disposable .tmp evidence changed; the standard gate regenerated ignored frontend dist. Fake databases use their own unique child directories. No actual .env read/edit, secret provisioning, PostgreSQL/MinIO operation/schema migration, source/device access, runtime service/container lifecycle, commit/push or deployment occurred.

T10-R01 inherits mandatory T07-R01/R02: synchronous storage cannot be interrupted by the cooperative 60-second check and native renderer memory lacks an OS fence. Existing actual-size/128MiB application reservations are enforced but do not satisfy hard execution requirements. Full T10 acceptance therefore remains NEEDS_REPLAN, rather than claiming DONE for a narrowed requirement. T06 browser and T09 durable audit/restart coordination remain distinct outstanding gates.

## Handoff and stop

Functional criteria have source/fake evidence, with a source self-review PASS for that behavior. Overall review is CHANGES_REQUIRED for T10-R01 and overall task is NEEDS_REPLAN. Resolve the hard cancellable storage/render execution boundary while preserving immutable pins, common binder/engine and ledger ownership; rerun affected resource/crash/parity gates, then reassess T07/T10 acceptance. T11 is not started. See T10_RUNTIME_MATRIX.md for software/native/browser/PostgreSQL/restart/package/optional device separation.

Suggested next request: “Resolve the mandatory T07/T10 hard deadline and native memory execution boundary with disposable tests, preserving the shared engine, pins, ledger and no automatic resend. Do not change operational services/storage or send to a printer.”
