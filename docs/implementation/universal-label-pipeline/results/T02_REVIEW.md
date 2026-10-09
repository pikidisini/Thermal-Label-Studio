# Task review: T02

- Task/result: [T02](../tasks/T02_CANONICAL_LABEL_DATA.md) / [writer result](T02_RESULT.md).
- Reviewer/date: primary Codex agent, 2026-10-10 (Asia/Jakarta), independent of the GPT-6.1 Sol writer.
- Outcome: **PASS** for the implemented canonical admission and local exploration scope.
- Snapshot: main, HEAD 7ba184a014b8f58ccc1423208be4a369964e450e, with pre-existing dirty work and concurrent changes preserved.

## Independent assessment

Reviewed actual new validators/models, raw JSON admission, dataset HTTP/service gates, parser/adapter boundary, feature-owned upload action, store, Studio/LeftToolbox/Data Tokens wiring, preview hook, shared fixtures, tests and documentation. Compared changed content against the initial file copies in `.tmp/t02-review-2f340c8eb9/before`, rather than treating the whole dirty Git diff as T02 work.

| Acceptance criterion | Evidence inspected/reproduced | Outcome |
| --- | --- | --- |
| Copies boundaries and required mode | Shared cases, typed int normalization, independently generated copies/identifier cases and HTTP rejection before fake storage | PASS |
| Historical missing-mode policy | Read-only parsing preserves copies 1000; explicit mode/copies working copy; original input unchanged; no automatic save or output | PASS |
| Exact data and distinct scalar states | Canonical path bypasses legacy alias synthesis; case-sensitive keys, original whitespace, zero/false/null/empty and Unicode boundary tests | PASS |
| Backend/frontend agreement | 52 shared raw JSON fixtures plus 70 independent admission cases on both implementations | PASS |
| Upload print isolation and offline exploration | Executable importDataset action consumed by Studio; mocked requests permit dataset persistence only, no output; HTTP no-transport tests and offline callback behavior | PASS |
| One backend validation owner | label_data owns canonical validation; dataset validation owns upload metadata only; HTTP and direct service.create both validate | PASS |

## Independently reproduced checks

- Full source gate **PASS**: `python -B scripts/check_project.py --run-source-checks`. Report: `.tmp/source-checks-48d45741-3ac1-498d-a520-717feab7ac78/report.json`; reviewer log: `.tmp/t02-review-2f340c8eb9/source-gate.log`. Backend regression, full TypeScript, fresh frontend build and frontend regression all passed. This gate does not start services or establish deployment readiness.
- 70 reviewer-created expected positive/negative cases **PASS** in both Python and TypeScript: strict identifier/key endings, copies variants, safe integers, exact strings, Unicode codepoint boundaries, descriptions, item/field limits. Executed TypeScript with local tsx; initial sandbox esbuild spawn EPERM was resolved by a bounded reviewed local rerun.
- The same 70 cases through dataset HTTP with fake storage **PASS**; invalid requests made zero create calls. Duplicate upload-wrapper/payload members also rejected. Canonical documentation example and typed model serialization roundtrip **PASS**.
- Source review verifies output gating on preview hook and both output modals. Executable hook tests cover blocked historical output and a delayed old response crossing into a historical context. Actual browser runtime remains NOT RUN.
- Package links, JSON, fences and writer-owned whitespace checked; git diff --check scoped to T02 paths passed. Repository-wide whitespace has an unrelated concurrent preferences browser-spec EOF finding, which was preserved and is outside this review's PASS.

Disposable independent evidence: `.tmp/t02-review-2f340c8eb9/{independent-cases,frontend-differential,backend-differential}.json`, initial `hashes.json`, and `final-task-diff.txt`. Writer final gate independently inspected: `.tmp/source-checks-8842de81-a4b6-42db-a627-9b86231cc689/report.json`.

## Findings resolved during review

Writer repaired oversized numeric handling, optional-description model roundtrip, canonical alias leakage, historical copies-1000 exploration and explicit correction, stale historical gate release on unknown sample selection, strict JavaScript end-of-string matching, and stale delayed preview responses. Meaningful import-action and hook tests were added; strict copies examples and Unicode fixtures were aligned.

Accepted technical clarification: copies are semantic integral JSON numbers (1, 1.0 and 1e0 equivalent), with typed int normalization. A common conservative object byte reservation supplements the raw 2 MiB cap, avoiding differing Python/JavaScript numeric serialization sizes; near-limit input can be rejected earlier and this is documented. ECMAScript binding number rendering and JCS digest serialization remain explicit T04/T08 consumer gates; T02 does not claim they are implemented.

## Preservation and scope limits

At final source review, 335 initial files were byte-identical; 43 changed/new paths included both T02 changes and concurrent work. Concurrent main/foundation/preferences edits were identified with the writer and preserved, not attributed to T02. Initial copies and task-specific hunks were reviewed, including already-dirty shared files. No source reset, operational data rewrite or publication occurred.

No universal intake route, template binder, durable ledger, source policy or print orchestration is implemented by T02. Browser target runtime, live PostgreSQL/MinIO, restart/recovery, packaged runtime, quality scan, real sender and printer checks are NOT RUN. Output/codec parity is PENDING for later tasks; T12 remains optional.

## Next action

T02 is **DONE** with this review PASS. T03 is eligible and remains PENDING. Execute only a subsequently selected task; do not infer permission for operational targets from source acceptance.
