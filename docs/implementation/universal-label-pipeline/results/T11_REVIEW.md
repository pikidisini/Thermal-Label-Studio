# Task review: T11

- Task/result: T11_SOURCE_AND_RUNTIME_ACCEPTANCE.md / T11_RESULT.md.
- Reviewer/date: primary-agent source/diff self-review, 2026-10-10; independent second-agent review NOT RUN.
- Outcome: CHANGES_REQUIRED. Complete software acceptance NEEDS_REPLAN; operational portion PARTIAL/NOT RUN.
- Snapshot: initial `.tmp/t11-5e6d617bd2/initial.json`; main HEAD bb639065a3161e9421336913be8327009b4c2ab9 preserved.

## Assessment

| Criterion | Evidence | Outcome |
| --- | --- | --- |
| Shared engine, real template regeneration and actual HTTP owners | 34 original/changed-data combinations at copies1/999 through draft, simulation and recorded print | PASS tested native profile |
| Exact pixels, actual IPL bytes, quantity and replay | Prepared bitmap equals decoded pixels and both preview routes; each deliberate action/item recorded once, replay adds zero calls | PASS synthetic |
| Independent codec expectations | Preserved known IPL + expected preview and origin; malformed/quantity/tiling/duplicate-print fixtures | PASS |
| Frozen input/policy/claim/failure semantics | Full source regression evidence in result; inspect actual main/intake/policy/ledger/print/engine and prior dirty diffs | PASS source/fake |
| Built-assets browser workflow | UI-only project, explicit build/mock routes and API denial; historical current-app availability kept separate | PASS built-assets mocks |
| Mandatory cancellation/native memory | Synchronous get_layout and renderer subprocess with timeout but no OS memory enforcement | FAIL / T11-R01 |
| Standard intake runtime wiring | Lifespan installs layout/dataset only; HTTP reads absent intake_ledger; policy/key/schema deployment incomplete | CHANGES_REQUIRED / T11-R02 |
| Durable accepted policy history | Process-local previous snapshot, no retained cross-worker/restart proof | NOT RUN / T11-R03 |
| Live storage/package/quality/device | No named authorization; operational effects not performed | NOT RUN, not PASS |

## Findings

1. T11-R01 (mandatory, inherits T07/T10): `backend/app/label_intake/service.py:110`, `print_service.py` resolution, and `backend/app/engine/raster.py:70` do not implement the frozen hard cancellation/native memory boundary. A blocked storage call can outlive the budget; renderer memory is not fenced per request. Implement isolated cancellable/reaped execution with OS limits and prove exhaustion/cancellation cleanup, no overlapping owner, immutable pins and no send resumption.
2. T11-R02 (runtime): `backend/app/main.py:31` and `backend/app/label_intake/http.py:105` have no standard ledger installation path. Dockerfile/Compose also lack controlled intake schema/configuration/key provisioning. Define opt-in, fail-closed setup and lifecycle without automatic operational migrations/enabling senders; validate on an explicitly named target. This is an actual wiring gap as well as missing runtime evidence.
3. T11-R03 (runtime): `backend/app/label_intake/http.py:84` retains the previous policy only in app.state. Verify durable policy audit/revocation/key history across restart and coordinated workers before claiming lifecycle readiness.

No new production binder/encoder/renderer/transport is introduced. Data Tokens stays local editor exploration; intake neither relies on its state nor accepts draft SVG/printer targets from external requests. Exact keys, missing/null/empty rejection and zero/false preservation remain backend authorities. Actual bearer/approval/preflight/committed claim and conservative uncertainty tests remain distinct from browser mocks. SUBMITTED never claims physical delivery. No authored business payload is used as operational evidence.

T11 tests preserve earlier fake/native assertions and extend actual owners and QR/EAN/Code39/change-data coverage. Browser changes isolate current build and all APIs; they do not remove safety/workflow assertions or fake a current application startup. T06 Canvas/expected-SVG edge differences and Windows/Linux font distinction remain visible. Unsupported profile acceptance is not silently widened or narrowed.

## Required checks and stop

Final full-source, browser, whitespace and initial/final hash evidence is recorded in T11_RESULT. Any local failure must be resolved or reported before finalizing that gate. Passing regressions do not remove these required changes. Stop at T11, retain T07/T10 NEEDS_REPLAN, keep T12 optional and unstarted; do not operate storage, services, source systems or printers through this review.


## Final reproduced checks

Full source gate PASS (backend/frontend regression, typecheck and fresh build); 110 focused native/codec tests; final 57 browser mock tests; final 203 frontend regression tests. Browser corrections retain binding/copies/failure assertions, wait for actual import completion and match T02 exact canonical data. No production source changes follow the full source gate. Final inventory: 446 initial, 451 final, 429 unchanged, 17 declared modified and five new acceptance files, no removals; prior production/schema/config/result history intact. Whitespace and file/link/evidence inventory checks PASS. Complete acceptance remains CHANGES_REQUIRED for the findings above.
