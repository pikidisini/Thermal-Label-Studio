# Task review: T03

- Task/result: [T03](../tasks/T03_TEMPLATE_METADATA.md) / [writer result](T03_RESULT.md).
- Reviewer/date: primary Codex agent, 2026-10-10 (Asia/Jakarta), independent of the GPT-6.1 Sol writer.
- Outcome: **PASS** for the implemented metadata admission and SVG transport scope.
- Snapshot: main; start HEAD 7ba184a014b8f58ccc1423208be4a369964e450e, final HEAD bb639065a3161e9421336913be8327009b4c2ab9. Concurrent publication was not performed by this task.

## Independent assessment

Reviewed actual backend models/spec decoding/semantic validation, safety changes, creation hooks, custom serialization properties, exporter/importer, synthetic fixtures, tests and documentation. Compared initial file copies and hashes in `.tmp/t03-review-39a84a5a2d` against final source; the current Git diff alone is not the initial dirty-work baseline.

| Acceptance criterion | Evidence inspected/reproduced | Outcome |
| --- | --- | --- |
| Deterministic owners, exact keys and immutable manifests | Real Fabric fixture consumed independently by backend, static-only admission, ordered field/composition/symbol specs and immutable scalar options | PASS |
| Strict metadata and conflicting declarations | Reviewer-created positive/negative metadata cases, aliases/case/unsafe keys, malformed base64/JSON/UTF8, duplicate members, versions, numeric slots and font metric conflicts | PASS |
| Static templates without fixture facts | Independently authored static SVG admitted without binding version or required data; empty manifest keys/objects | PASS |
| Actual export/import transport | Fabric7 tests exercise nested marked groups, source order, multiline/tspan, rotated/skewed/scaled geometry, world matrices and refreshed bounds, exact image sources, four symbol options and ordinary SVG coordinates without Fabric profile | PASS |
| Separate security and semantic gates | Safety preflight precedes XML normalization; semantic allowlist validates geometry, reference types/cycles, bounded decoded images and dynamic owners | PASS |
| Legacy behavior and no sample inference | Invalid/incomplete dynamic imports reject before canvas mutation; export rejects invalid metadata; historical stored artifacts are untouched | PASS |

## Independently reproduced checks

- Final full source gate **PASS**: `python -B scripts/check_project.py --run-source-checks`; report `.tmp/source-checks-3028f8ce-eb1b-4397-8c20-7ac79af87edb/report.json`. Backend regression, full TypeScript, fresh frontend build and frontend regression all passed after the final CSS correction.
- **46 reviewer-created cases PASS** through Python admission: `.tmp/t03-review-39a84a5a2d/independent.py`, `independent-cases.json` and `independent-backend.json`. Cases include valid static/field/composition templates, strict metadata, semantic integral versions, geometry/resource limits, reference cycles and escaped external CSS resource syntax. Invalid cases raised bounded TemplateAdmissionError, with no unexpected exceptions.
- **38 metadata cases PASS** through the frontend validator with actual DOMParser: `independent.mjs` / `independent-frontend.json` in the same review directory. Geometry/security cases are backend authority, not claimed frontend validation.
- Actual Fabric transport tests are included in the independently executed full frontend suite. Focused writer checks inspected: nine Fabric tests and 65 safety/semantic tests, with post-correction writer full gate `.tmp/source-checks-9d105ae2-9044-4941-98bd-c6247bbdad47/report.json`.
- `git diff --check` **PASS**. Final documentation verification checked 13 documents and 65 relative links with no broken targets.

The first reviewer sandbox run failed frontend process spawning with EPERM while backend/typecheck passed. A bounded approved local rerun resolved the environment restriction; the final PASS above supersedes it. No services or operational targets were started to run these checks.

## Findings resolved during review

The writer corrected complete creation-option ownership, alias-only symbol serialization, strict malformed-source handling, metric conflicts, nested group reconstruction, explicit Fabric coordinate provenance, bounded compounded transforms and reference traversal, path/scalar validation, fully decoded images and conflicting image sources. Symbol owners are explicitly one immediate leaf image, so import cannot duplicate their cardinality. Unsupported prepared graphic metadata fails explicitly rather than being silently stripped.

Independent review subsequently found two escaped external CSS resource forms admitted despite the source gate passing. The reviewer reproduced both failures without rendering or fetching. The writer rejected unsupported escapes/comments/control syntax in CSS-bearing attributes, added regressions, and reran checks. Both cases now reject, exact local references still pass, and authored literal text/encoded metadata is preserved. This finding is resolved; no open acceptance blocker remains for T03.

Accepted technical refinements are explicit: metadata integral numbers use the T02 semantic-number convention; the root Fabric coordinate profile is separate from binding-version semantics; current QR automatic segmentation is recorded accurately and is not represented as a proven byte-profile raster. T05 must prove/align generation parity before T06.

## Preservation and scope limits

No initial file was removed. Of the initial 379 files, 360 remain byte-identical and 19 contain inspected T03 source/documentation changes. Existing T01/T02 and preferences/printing work was preserved through the concurrent HEAD change. Disposable review evidence includes initial copies/hashes, preservation inventory and task diff in `.tmp/t03-review-39a84a5a2d`.

T03 introduces an admission owner, not a server binder or intake endpoint. Current output routes do not yet call the new semantic admission. Replacement text and symbol module/pixel parity, bitmap/IPL parity and shared output integration remain PENDING for T04–T06/T11. Actual browser/runtime, live storage, restart/package validation, quality scan, external sender and printer checks are NOT RUN.

Dynamic rich per-character styling and wrapped Textbox remain explicitly unsupported until a proven metric profile; this was already a frozen contract boundary. If subsequently required, record NEEDS_REPLAN before cutover. No stored template migration or defaults inferred from captured previews occurred. Optional T12 physical acceptance does not block this metadata/source acceptance and is not established by it.

## Next action

T03 is **DONE** with independent review PASS. T04 is eligible and remains PENDING; T05 still waits for T04 as well. Only a subsequently selected task may begin. This review does not authorize operational storage, external delivery or deployment.
