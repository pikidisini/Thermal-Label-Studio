# Task review: T09

- Task/result: T09_ADMISSION_AND_TARGET_POLICY.md / T09_RESULT.md.
- Reviewer/date: primary-agent actual-source/diff self-review, 2026-10-10.
- Independent second-agent review: NOT RUN; no delegated writer requested.
- Outcome: PASS for source/synthetic policy/preflight scope; no runtime/device approval implied.
- HEAD: bb639065a3161e9421336913be8327009b4c2ab9, unchanged; initial inventory .tmp/t09-fee1cbcd58/initial.json.
- Reviewed actual policy models/parser/auth/preflight/revalidation, HTTP dependency order, static result vocabulary, synthetic tests, configuration/example and active doc hunks; prior T07/T08 source shared files were inspected before edits.

## Assessment

| Acceptance criterion | Evidence inspected/reproduced | Outcome |
| --- | --- | --- |
| Missing/invalid/disabled identity and capability deny before effects | Actual bearer route, duplicate header, mismatched body sender, source/mode/code cases with failing storage/ledger/render sentinels | PASS |
| Exact published version/checksum/copies approval | Independent approval audit, mismatch/new-version/unapproved/revoked cases; no layout/save/publish hook | PASS |
| Server-only deterministic target | Numeric IPv4/IPv6 pins, absent/disabled/invalid mapping, scalar host/port injection leaves route unchanged | PASS |
| Policy failures preserve templates and ledger ownership | Immutable snapshots; pure helpers; typed policy pins checked against committed T08 states; approval cannot claim before PREPARED or reclaim | PASS |
| Current auth before replay and claim | Actual HTTP retained replay then source/mode/code/token revocation; helper checks changed revision/address/port/grant/capability | PASS |
| Manual Studio action/no-probe preserved | Printing/configured target untouched; manual transport and foundation regressions; OpenAPI no Studio bearer gate | PASS |
| Auditable changes and explicit revocation | Actor/time/unique-event records, chronology, prefix retention, new revision and static errors; durable-history operational boundary documented | PASS, source scope |

## Checks and scope

Focused final suite: 213 passed, zero skipped, .tmp/t09-fee1cbcd58/focused.xml. Full source report .tmp/source-checks-717edf42-d4d1-4af4-a316-7471b2dd1401/report.json: backend regression, frontend regression, full TypeScript/build PASS. Native Studio/intake/IPL regression and existing fake one-send/native copies tests retained. Source report predates three supplementary test cases, which passed in final focused suite; final production source was unchanged after gate launch.

No source policy helper imports printing or opens a socket; policy owns only numeric target validation from app.config. Credentials remain referenced process secrets with constant-time fixed-size comparisons and no token repr/public exception interpolation. Source/mode/code admission is before FastAPI storage/ledger dependencies; terminal replay cannot bypass current authorization. Immutable approval route is exact-case and cannot be selected by business data. Missing configs/ledger fail closed; HTTP intake print remains explicitly denied until T10.

Actual changed-file inventory and SHA-256 preservation were checked, not inferred from writer narrative. Existing engine/binder/layout/ledger/job/transport/frontend code and previous result/review artifacts were not altered. git diff --check and new-file whitespace passed. No manifest/dependency/schema or operational lifecycle changes.

## Findings and limits

No open actionable defect in the reviewed T09 source/preflight scope. Audit is an administrator-controlled event history with in-process reload guards; restart durability and worker coordination remain explicit T11 evidence, not silently claimed as database auditing. Source secret format does not prove entropy. Published versions need explicit grants; a new grant/revision never permits silently changing an admitted target. T10 must consume policy errors in ordered results and enforce preflight/revalidation placement around ledger claims; helper-only proof does not establish a live print endpoint.

T07 remains NEEDS_REPLAN for hard storage cancellation/native memory enforcement, T06 browser acceptance stays BLOCKED. Live storage migration/restart, protected retained config, TLS/worker setup, quality scan, sender integration and physical printing remain NOT RUN. These source outcomes do not authorize those operations.

## Next action

Mark T09 DONE for source scope, retain T10 PENDING and stop. Future explicitly authorized source work may consume the handoff; operational enablement must retain unresolved gates and named authorization requirements.
