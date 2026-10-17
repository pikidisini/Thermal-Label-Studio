# Task review: T10

- Task/result: T10_INTAKE_PRINT.md / T10_RESULT.md.
- Reviewer/date: primary-agent actual-source/diff self-review, 2026-10-10; independent second-agent review NOT RUN.
- Overall outcome: CHANGES_REQUIRED for mandatory hard resource boundary T10-R01. Functional source/fake behavior: PASS.
- HEAD: bb639065a3161e9421336913be8327009b4c2ab9 unchanged; initial snapshot .tmp/t10-0b15f3b957/initial.json.
- Scope: actual HTTP/policy/ledger orchestration, preparation/retention/response reservation, TCP no-submit proof, ordered outcomes, replay/crash/uncertainty, source tests and current contract/document changes.

## Assessment

| Criterion | Actual evidence | Outcome |
| --- | --- | --- |
| One preparation/payload/submit per claimed item, native copies1..999 | Recorder asserts all later PREPARED and current SEND_CLAIMED before construction, exact bytes and quantity | PASS |
| Shared Studio/stored output | Six actual native static/Fabric text/Code128 cases at1/999; actual editor-preview pixel equality and exact recorder IPL | PASS chosen native profile |
| Whole-batch preflight/preparation denies before transport | Unknown/unapproved/invalid target/binding/copies/pixels/memory/size/deadline cases; zero construction | PASS cooperative/application gates |
| Immutable original policy/target and revalidation | Mid-batch revision/grant/target/credential/source changes stop next claim, no rerouting | PASS synthetic |
| No resend after uncertain send/commit/response loss | Before/after-commit fault matrix, claimed crash, lost serialization response, terminal replay and fake recovery | PASS transactional fake |
| Concurrent duplicate cannot create second worker | Two competing orchestration threads plus original ledger/HTTP slot regression | PASS fake |
| Honest ordered outcomes/confirmed limit/target ID only | Outcome union/schema/counts, SUBMITTED false, UNCERTAIN stops later, proven no-submit FAILED; no PNG/data/network address | PASS |
| Manual Studio/simulation isolation | Existing manual target/no-probe/conservative superclass remains; simulation never constructs print sink | PASS regression |
| Hard cancellable deadline/native process memory | Actual new resolve calls synchronous get_layout; same existing renderer boundary has no OS memory enforcement | FAIL frozen requirement / NEEDS_REPLAN |

## Verified checks

Final focused 267 passed, zero skipped: .tmp/t10-0b15f3b957/focused.xml. Full source gate PASS for backend/frontend regression, TypeScript and build: .tmp/source-checks-f7cfa3bb-8f07-4036-b437-36006f4e33c9/report.json. git diff --check, new-file whitespace and initial/final inventory verified actual preservation. No later implementation source change followed those gates.

The new coordinator uses existing pin_layout/prepare_draft_output/PreparedOutput/submit_prepared_output/TcpRawTransport, with no alternate bitmap or codec and no loops based on copies. All approved pins commit before raster; all payload preparation and public response reservation precede the first claim. Current policy checks occur immediately before committed claims. The ledger returns terminal metadata only after acknowledgment, retains exact identity on ambiguity and prevents restart/replay from becoming an automatic resume path.

Trust-sensitive exception review: factory construction remains pure; trusted PrintBeforeSendError is raised only before sendall, while write/close remain possible submission. Only that proof or pre-invocation constructor/input failure permits claimed FAILED settlement. A lost persistence acknowledgment after a claim attempt yields response_unavailable and stops all later sends. Lost terminal HTTP response replays committed results without transport. No private exception text is persisted or returned. Credentials, SVG/data/PNG/IPL do not enter ordinary print ledger metadata.

Actual source test updates retain the independent timeout/count/destination/close assertions while adding explicit pre-connect proof. The old unconditional-print-denied and module-import guard are revised narrowly to allow the new HTTP/print owner; simulation and policy still have no print dependency, and no fixture/data-set fallback is introduced. Unrelated pre-existing engine/layout/binding/frontend/job/schema/config and earlier result/review files remain unchanged.

## Required change

T10-R01 (inherits T07-R01/R02): `backend/app/label_intake/print_service.py` resolution/preparation and existing storage/native renderer boundary still provide cooperative deadline and application reservation, not hard cancellation/native memory fencing. Consequence: blocking storage or native memory growth may exceed the frozen execution budget even though all later send eligibility remains fail-closed. Implement an isolated cancellable/reaped execution boundary with tested OS memory limit, preserving immutable pins, common binder/engine and no overlapping replacement worker or send resumption. Reproduce exhaustion/timeout cleanup and rerun resource/crash/parity gates before marking T07/T10 DONE.

This required correction is not an optional physical test, missing user permission or source test failure. Source/fake functionality PASS does not waive it. Live PostgreSQL dialect/locks/restart, retained policy audit across workers, packaged font/renderer, TLS, quality scan and actual sender/device remain NOT RUN; T06 current-browser remains BLOCKED.

## Next action

Record T10 NEEDS_REPLAN and source functional PASS, preserve T07 NEEDS_REPLAN/T06 BLOCKED, leave T11/T12 unstarted and stop. No operational action, credential installation or printer effect is authorized by this review.
