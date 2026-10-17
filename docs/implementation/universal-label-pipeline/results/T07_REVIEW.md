# Task review: T07

- Task/result: T07_INTAKE_SIMULATION.md / T07_RESULT.md.
- Reviewer/date: primary-agent actual-source/diff self-review, 2026-10-10. Independent second-agent review NOT RUN.
- Outcome: CHANGES_REQUIRED; T07 overall NEEDS_REPLAN.
- Scope: intake HTTP/schema, stored pinning/integrity, ordered results, shared engine/simulation, budget controls and side-effect boundaries.
- HEAD: bb639065a3161e9421336913be8327009b4c2ab9; initial hashes `.tmp/t07-00c231b981/initial.json`.

## Assessment

Actual source and tests were inspected; no writer narrative or delegated report was relied on. Earlier dirty T03-T06 work remains preserved. Shared main/foundation hunks only add exact intake owner registrations/allowlist entries. Layout reader changes are exercised with concrete fake SQL/streams.

| Acceptance criterion | Evidence | Outcome |
| --- | --- | --- |
| Two items/two stored codes, correct order/evidence | HTTP tests and complete zero-inclusive summary | PASS |
| No transport including denied print | Default/trusted admission tests, no printing ownership/import | PASS |
| No fixture fallback; missing/deleted/corrupt/unavailable | Fake layouts plus concrete bounded reader tests | PASS |
| Freeze versions before preparation | Storage mutation and repeated-code test; all reads precede preparation | PASS |
| Canonical/shared engine parity | Six native static/Fabric text/Code128 cases, copies1/999, Studio HTTP and IPL decoded pixel/digest equality | PASS |
| Aggregate limits / hard execution resource boundary | Copies/pixels/PNG/IPL/response reservation tests PASS; blocked resolver exceeds deadline; no OS native-memory fence | FAIL |
| Honest admission/readiness boundary | Default503 policy_unavailable; test-only trusted override; no runtime bypass | PASS |

## Required checks

Canonical schema/strict body/data rules, preserved missing/null/empty/zero/false binding semantics, ordered item-level failures, static bounded messages and no sample writes were reviewed. New processing invokes the existing T06 draft pipeline and IPL simulation sink; no alternate raster/codec was created. Prepared IPL digest/native quantity and decoded raster compare with Studio. Existing independent IPL fixture regressions are part of the full source gate, not replaced with encoder/decoder roundtrip alone.

Focused suite: 84 PASS, zero skipped. Full source gate: PASS for backend/frontend regressions, full TypeScript and build; `.tmp/source-checks-a732f701-3055-4981-8389-b538b4ea37ab/report.json`. Diff check/preservation PASS. Browser/live storage/package/quality/external sender/device are unexecuted and cannot be inferred from fake/native evidence. T06 browser remains BLOCKED. No print delivery/replay safety claim is made because print/default external admission are denied.

## Findings

- T07-R01, `backend/app/label_intake/service.py`: synchronous `layouts.get_layout` runs before the next deadline check. A blocked resolver exceeds the wall deadline and cannot be interrupted. The explicit blocked-resolution regression reproduces this. Required correction: a cancellable bounded execution boundary, with termination/reaping and no overlapping replacement worker.
- T07-R02, `backend/app/engine/raster.py` and `label_intake/service.py`: working reservations and output sizes do not fence native process memory. Existing subprocess timeout is insufficient for the frozen process-memory requirement. Required correction: enforce and test the combined process/working memory limit, including exhaustion cleanup and admission recovery.

These are accepted-contract gaps, not missing target authorization or optional T12 acceptance. Keep T07 NEEDS_REPLAN rather than converting these gates to PASS or deferring mandatory requirements silently.

## Next action

Finish the T07 execution-resource replan before marking DONE or starting dependent implementation. Default external intake remains denied. T08/T09/T10 stay PENDING; no successor or operational action is authorized by this review.
