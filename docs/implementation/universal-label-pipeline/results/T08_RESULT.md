# Task result: T08

## Identity and scope

- Task: T08 durable request identity and safe replay boundaries.
- Task file: tasks/T08_DURABLE_REQUEST_IDENTITY.md.
- Date: 2026-10-10 (Asia/Jakarta).
- Executor: primary agent; no delegated writer/reviewer.
- State: DONE for the authorized source/transactional-fake slice, with source self-review PASS. Operational PostgreSQL/schema/security/restart acceptance remains NOT RUN for T11.
- Repository/branch/HEAD: Thermal-Label-Studio / main / bb639065a3161e9421336913be8327009b4c2ab9.
- Initial working tree: 425 tracked/non-ignored files snapshotted in `.tmp/t08-461ec0ce4f/initial.json`. Earlier T03-T07 work preserved. No reset, commit or publication.
- Prerequisites: frozen T01 contract and implemented T07 local simulation. The user explicitly requested T08 while T07 remains NEEDS_REPLAN (hard deadline/native memory) and T06 browser remains BLOCKED. These historical results/reviews were not rewritten.

## Delivered behavior

The new concrete PostgreSQL ledger uses a fresh injected transaction connection per operation. It is independent of the older jobs metadata model. Domain-separated canonical HMACs identify the stable trusted sender/request and the entire normalized envelope. UTF-16 object-key sorting and T04 ECMAScript binary64 rendering are verified against Node. No plaintext external request identity, raw business data, authored SVG or credentials is stored as ordinary ledger metadata.

Atomic admission serializes on a permanent capacity row and persists immutable version/checksum/media pins plus ordered item metadata before preparation. Existing identities yield stored terminal replay, request_in_progress, request_conflict or request_expired; they never acquire a new owner. Existing simulation HTTP now commits preparation metadata and protected terminal PNG/result storage before success. Identical replay returns original pins/PNG without resolving current templates or rendering; it uses a new trace_id, preserves original_trace_id and sets replayed=true. Current source authorization precedes disclosure. Missing ledger/result storage and ambiguous commits fail closed.

Internal API boundaries for T10 persist PREPARED payload digest/size/copies and pinned target ID/policy revision, then atomically transition to SEND_CLAIMED. Eligibility is returned only after commit acknowledgment. Claim order and target/revision pins cannot change; duplicate/post-uncertainty claims are denied. No transport is constructed. SUBMITTED/UNCERTAIN preserve unconfirmed delivery semantics. Explicit quiesced recovery never sends and never resumes; possible claims become UNCERTAIN and later work SKIPPED. Before-claim crashes fail safely.

Simulation results expire after 24 hours; print metadata after 90 days. Authorized explicit cleanup removes details while preserving permanent keyed identity/digest/version/timestamps/outcome tombstones. Expired identities cannot be reused even before cleanup. One million permanent identities deny new admission without eviction. Permanent key-version verifiers deny forgotten keys or replacement secrets under an existing version; rotation with all old keys retained cannot permit identity reuse.

Default external source admission still returns policy_unavailable until T09. The app does not automatically instantiate a ledger or apply schema; after trusted admission, an absent ledger returns ledger_unavailable. HTTP intake print remains denied until T10. No runtime bypass or in-memory idempotency fallback was added. T07 resource limits were not silently relaxed.

## Files changed

- New `backend/app/label_intake/identity.py`: canonical serialization and immutable server-injected HMAC keyring.
- New `ledger.py`: concrete PostgreSQL transactions, quota/key registry, identity/pins, committed claim/outcome, retention and explicit recovery.
- New `ledger_models.py`: bounded retained print outcome validation, without enabling HTTP print.
- New `durable_service.py`: lookup/admission/preparation/result integration with existing simulation.
- Existing untracked T07 `http.py`, `results.py`, `service.py`: ledger dependency/coordinator, replay/error validation, two persistence hooks; existing binder/raster/codec ownership preserved.
- New `backend/schema/002_label_intake.sql`: review-only bounded ledger schema and PUBLIC privilege revocation. Never applied.
- New `backend/tests/intake_ledger_fake.py`, `test_intake_ledger.py`: disposable SQL transaction adapter and identity/claim/recovery/retention tests.
- Existing T07 `backend/tests/test_label_intake.py`: injected transactional fake ledger for HTTP tests.
- Five active docs and implementation package CONTRACT/DECISIONS/PARITY_MATRIX/README/STATUS/SUMMARY/T08 task plus new T08_LEDGER_OPERATIONS.md/T08_CRASH_MATRIX.md/results/review.
- No frontend, manifests/dependencies, old jobs schema/repository, operational configuration or service lifecycle changes.

## Validation evidence

| Gate | Status | Command/target | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Focused source regression | PASS | PYTHONPATH=backend; python -B -m pytest -p no:cacheprovider -p no:tmpdir backend/tests/test_intake_ledger.py backend/tests/test_label_intake.py backend/tests/test_job_persistence.py -q --tb=short --junitxml=.tmp/t08-461ec0ce4f/focused.xml | 149 passed, zero skipped; focused.xml | Disposable SQL adapter, not live PostgreSQL |
| Canonical/HMAC semantics | PASS | Shared scalar golden values plus Node Unicode/key/numeric differential and changed-field tests | Focused suite | Existing T04 numeric profile consumed, not a new serializer |
| Atomic duplicate admission/claim | PASS | Separate connections/repository objects and competing threads | Focused suite | SQLite BEGIN IMMEDIATE simulates PostgreSQL locking |
| Crash/repository restart/retention | PASS | Before/after-commit fault matrix, new repository objects over retained fake DB, recovery, expiry/rotation/quota tests | T08_CRASH_MATRIX.md and focused suite | No real process/container/PostgreSQL restart |
| Native shared bitmap/IPL parity | PASS | Existing six stored intake vs Studio cases, copies1/999, now through ledger integration | Focused suite | Windows resvg/Arial, fake storage/admission/ledger |
| Full project source gate | PASS | python -B scripts/check_project.py --run-source-checks | .tmp/source-checks-227520a7-65bb-4ecd-899b-9a0f29ec4315/report.json | Backend/frontend regression, full TypeScript and build; no deployment claim |
| Diff/preservation | PASS | git diff --check; initial/current hash comparison | .tmp/t08-461ec0ce4f/preservation.json and diff-check.txt | Primary-agent actual-source self-review; independent second-agent review NOT RUN |
| Browser | NOT RUN | No browser/UI work | T06 remains BLOCKED | Source tests do not replace its browser gate |
| Live ledger/schema/concurrency/restart/security | NOT RUN | No named PostgreSQL operation performed | Operations doc | Required authorized T11 target |
| Quality scan | NOT RUN | No fresh Sonar scan | None | Source gate is not quality-scan evidence |
| Actual external sender / printer / T12 | NOT RUN | No access or delivery | None | Internal claim tests are not device acceptance |

Final preservation: 409 initial files remain byte-identical; 16 existing files have scoped T08 edits, 11 new files belong to T08, no initial file is missing and HEAD is unchanged. Earlier T03-T07 result/review files and all frontend/jobs/engine files remain byte-identical.

## Side effects

Only source/document edits, disposable unique .tmp SQL fake databases/reports, local installed renderer/font/Node reads and standard source gate build/tests were performed. No operational PostgreSQL/MinIO access/write/init/migration, maintenance/recovery, sender request, printer send, service/container start/stop, commit or push occurred. Test keys/values are fixed synthetic inputs. No operational credentials/raw data are present in generated documentation or public errors/logs.

## Decisions, risks and blockers

The independent ledger is necessary because old jobs lacks external keyed identity, durable send claims, permanent tombstones and protected replay outcomes. Operational factories/keys/schema/permissions are intentionally unapplied, so source implementation is not an assertion that the running app has a usable durable ledger.

The capacity row serializes admissions across key versions; permanent key verifiers prevent silently replacing an old secret. This may reject a stale/misconfigured instance during key rotation; coordinate all instances and retain old keys rather than weakening reuse protection.

Quiesced recovery is a privileged internal maintenance API, not an automatic retry/lease takeover. Calling it while a live owner is active is outside its contract; authorized runtime recovery must prove all owners stopped. It conservatively treats unfinished SUBMITTED evidence as uncertain. No exactly-once physical delivery claim is made.

Process-slot overload can produce 429 before identity parsing; identities reaching the ledger produce their 409/terminal outcomes. Raw input is transient; protected simulation PNG/result JSON requires actual deployment access/retention/security controls. The SQL adapter does not establish PostgreSQL dialect/locking/permissions behavior.

T07 hard batch deadline/native-memory acceptance remains NEEDS_REPLAN, T06 browser remains BLOCKED. T08 completion does not repair or bypass either. T09/T10 remain PENDING; no successor was started.

## Handoff

All seven T08 source/fake acceptance criteria are satisfied, with actual PostgreSQL concurrency/process-restart validation still required in T11. Review PASS applies to this slice only. Reviewable setup instructions are in T08_LEDGER_OPERATIONS.md and explicit failure windows in T08_CRASH_MATRIX.md.

Next task may be selected explicitly: finish the T07 resource replan or implement T09 source admission/policy while preserving existing gates. T10 requires T08/T09 and the unresolved T07 execution boundary before operational acceptance. No operational side effect is authorized by this report.
