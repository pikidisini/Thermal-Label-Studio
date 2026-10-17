# Task review: T08

- Task/result: T08_DURABLE_REQUEST_IDENTITY.md / T08_RESULT.md.
- Reviewer/date: primary-agent actual-source/diff self-review, 2026-10-10.
- Independent second-agent review: NOT RUN.
- Outcome: PASS for the requested source/transactional-fake scope; operational acceptance NOT RUN.
- Scope reviewed: identity/canonical/HMAC, schema, SQL transactions, pin integration, send eligibility, retained responses, recovery/expiry/key rotation/quota and preservation.
- HEAD: bb639065a3161e9421336913be8327009b4c2ab9; initial source hashes .tmp/t08-461ec0ce4f/initial.json.

## Assessment

Actual new source/schema and changed T07 hooks/HTTP/result models were inspected. The writer narrative was not used as sole evidence. The prior pipeline, native generator profiles, jobs foundation and frontend remain unchanged. The schema is unapplied and the connection factory is injectable, with no import/startup operation or process-memory fallback.

| Acceptance criterion | Evidence | Outcome |
| --- | --- | --- |
| One owner for duplicate admission/send claim; collisions rejected | Competing connections/threads; capacity/request row transaction locks; semantic digest mutations | PASS |
| Success/claim/uncertainty replay never reclaims | Committed-state guards, original owner token, terminal replay and no automatic recovery/send path | PASS |
| Original pinned templates on replay | HTTP test changes active versions/disables storage; returned original PNG/pins and prepare call count unchanged | PASS |
| Crash windows before/after claim/send/terminal commit | Ten before/after-commit fault cases plus explicit recovery; T08_CRASH_MATRIX | PASS |
| SQL/rollback/acknowledgment failure denies eligibility | Fault injection, discarded connections, claim returns only after acknowledged commit | PASS |
| No memory-only deduplication, expired reuse or old-job shortcut | Concrete PostgreSQL SQL, file-backed transactional fake, permanent tombstone/key verification/quota | PASS |
| Schema reviewable without operational application | 002_label_intake.sql, T08_LEDGER_OPERATIONS, no initialization/lifecycle wiring | PASS |

## Required checks

Canonical key/numeric/Unicode serialization matches the Node differential and shared goldens. Authenticated sender namespace must match the asserted body sender; current authorization precedes retained-result disclosure. Data/mode/copies/descriptions/item order are covered in digest identity. No secrets/raw values/SVG/print payload are persisted in ordinary metadata. Source public errors use only the static vocabulary; corrupt stored results deny rather than leak/recompute.

Atomic admission stores ordered immutable pins before raster. Item PREPARED records include native copies/payload digest/size; print pin target/revision must match the committed claim. Earlier item state guards and UNCERTAIN skipping prevent later claims. No printing/socket module or device is called. Shared T07/T06 engine and sink remain the actual preparation/PNG owners.

Terminal simulation response commit precedes HTTP success. Original/current traces and replay flag are validated; result counts, order, item IDs, pins and payload evidence are checked against durable metadata. Protected result retention is bounded. Expiry cannot erase unresolved claims; permanent outcome/identity tombstones and key-version verifiers block expiry/rotation-based reuse.

Focused source suite: 149 passed, zero skipped. Full source gate PASS: .tmp/source-checks-227520a7-65bb-4ecd-899b-9a0f29ec4315/report.json (backend/frontend tests, full TypeScript/build). Old jobs regressions and six native intake/Studio/IPL cases passed. Diff-check and source preservation evidence are recorded under .tmp/t08-461ec0ce4f.

## Findings resolved

- An overwritten secret under an existing version could otherwise produce a fresh identity HMAC. Permanent keyed key-version verification now denies it; missing retained keys also deny.
- Retained print/simulation metadata is validated before disclosure, preventing corrupt/private result text from being passed through.
- Unacknowledged item/batch state cannot expose a fresh send owner; quiesced recovery is conservative and never resumes.
- Simulation failure after preparation preserves the committed PREPARED boundary and denies ordinary retry; explicit recovery returns failure without another renderer call.
- Cleanup refuses active unresolved batches and never decrements identity capacity or removes keyed tombstones.

No open actionable defect was found within the reviewed T08 source/fake scope. PostgreSQL-specific SQL/locking/permissions, actual restarts, backup protection and maintenance scheduling remain required T11 validation, not inferred from SQLite adaptation or source REVOKE clauses.

## Next action

T08 source task is DONE with self-review PASS. T07 stays NEEDS_REPLAN and T06 browser stays BLOCKED. T09/T10 stay PENDING until selected/eligible; no operational action or successor is started. The app's default external admission/print remain closed. Installing the proposed schema requires named authorization and is not a consequence of this review.
