# Task result: T11

## Identity and scope

- Task: T11_SOURCE_AND_RUNTIME_ACCEPTANCE.md, explicitly requested by the user.
- Date: 2026-10-10 (Asia/Jakarta).
- Executor: primary agent; source/diff self-review, no second-agent review.
- State: NEEDS_REPLAN for mandatory hard resource requirements; runtime portion PARTIAL with unexecuted gates NOT RUN.
- Repository: Thermal-Label-Studio, main, HEAD bb639065a3161e9421336913be8327009b4c2ab9 unchanged.
- Initial worktree: previous T02..T10 changes preserved; initial hashes `.tmp/t11-5e6d617bd2/initial.json`. Final preservation inventory is recorded below.
- Prerequisites: T06 browser availability BLOCKED; T07/T10 NEEDS_REPLAN; T08/T09 source/fake PASS. Those historical results are not rewritten.

## Delivered behavior

Expanded assembled-pipeline acceptance to the actual Studio and intake HTTP owners with real native raster/codec and fake-only persistence/transport. The 68-case matrix includes actual Fabric templates, all four symbol kinds, six changing-data combinations and copies 1/999. It compares prepared pixels, decoded IPL, Studio preview/manual print, intake simulation/print and terminal replay. Current-build browser mocks are explicit; source tests do not activate credentials, storage or printers.

Separate results: [software acceptance](../T11_SOFTWARE_ACCEPTANCE.md), [runtime acceptance and findings](../T11_RUNTIME_ACCEPTANCE.md). Functional evidence does not establish full frozen-contract acceptance, current application availability or packaged readiness.

## Files changed

- `backend/tests/test_pipeline_acceptance.py`: assembled native/HTTP parity, changing-data output, quantity, claims and replay acceptance.
- `frontend/tests/browser/helpers/studio.js`: serve current build assets locally inside Playwright and deny unmocked APIs/external fonts.
- `frontend/tests/browser/ui/printing.spec.js`, `studio.spec.js`, `align.spec.js`, `text_roundtrip.spec.js`: use explicit current-build mocks, retaining prior workflow assertions. Studio also waits for asynchronous Fabric reopen and expects canonical tokens from data only.
- T11 software/runtime/result/review documents; package status, task, summary/readme/matrix/contract/decisions and five active docs: current gate evidence and remaining requirements.
- No production implementation, manifest, schema or operational configuration is changed by T11.

## Validation evidence

| Gate | Status | Command/target | Evidence/result | Limit |
| --- | --- | --- | --- | --- |
| Focused assembled native parity and independent codec | PASS | `PYTHONPATH=backend python -B -m pytest -p no:cacheprovider -p no:tmpdir backend/tests/test_pipeline_acceptance.py backend/tests/test_ipl_codec.py --junitxml=.tmp/t11-5e6d617bd2/software.xml -q` | 110 passed, zero skipped; 68 matrix + 42 codec | Synthetic data/storage/credentials, native Windows profile; final changed-output assertions rerun by full gate |
| Full source gate | PASS | `python -B scripts/check_project.py --run-source-checks` | .tmp/source-checks-e3077d3c-9745-44bb-a723-54fc5d1f43cf/report.json: all four checks PASS | Backend/frontend regression, typecheck and fresh build; no runtime effects |
| Browser UI mocks | PASS | `E2E_BASE_URL=http://127.0.0.1:8000 node node_modules/@playwright/test/cli.js test --project=ui` from frontend | 57 passed, zero skipped; .tmp/playwright-6f792ed0-e5a8-42c8-8713-c79cb49a81eb/playwright-report/index.html | Current built assets, all APIs mocked, existing loopback origin; integration project excluded |
| Exact current OpenAPI/data/admission/outcomes | PASS | Backend schema/contract regression | Full gate evidence | Live port8000 schema is not used as current checkout proof |
| Hard storage cancellation/native memory | FAIL / NEEDS_REPLAN | Actual storage/renderer source and existing limitation tests | T11-R01, inherited T07/T10 | Frozen requirement unmet; regression PASS does not waive it |
| Current application Studio | BLOCKED | Bounded loopback probes | `.tmp/t11-5e6d617bd2/runtime-probes.json`: 5173/8002 unavailable; 8000 Studio404, health/OpenAPI200 | No process identity/current implementation inferred |
| Live storage/schema/restart/package | NOT RUN | No named target authorization | Runtime acceptance checklist | Startup/configuration gaps also need source correction |
| Fresh quality/coverage scan | NOT RUN | No named scanner/container target | No historical quality PASS reused | Optional quality run not included in executed local source gate |
| Optional T12 sender/physical device | NOT RUN | Not requested | No device or sender contacted | Does not block software parity acceptance |

## Side effects and preservation

Native local renderer processes, local regression/build/browser execution, disposable fake ledger and generated unique reports only. No server/container start/restart/build, SQL schema application, operational layout/data write, policy/key provisioning, external request, real socket transport, commit or push.

Renderer/font hashes: `.tmp/t11-5e6d617bd2/native-profile.json`. Unique browser/source report locations and final initial-to-final hash inventory appear in final verification evidence. Previous source, configuration and historical result/review files are preserved outside the declared T11 hunks.

## Decisions, risks and blockers

- T11-R01: hard cancellable storage deadline and OS native memory fence are mandatory and still missing. Complete software acceptance is NEEDS_REPLAN.
- T11-R02: standard startup does not install the intake ledger; Compose policy/key forwarding and controlled schema/package setup are incomplete. No runtime readiness is claimed.
- T11-R03: policy transition history is process-local; cross-restart/worker audit/revocation and key retention remain separate required evidence.
- Same template/data/font/media implies exact shared output in the tested profile. Windows Arial vs packaged Linux Liberation Sans, and Canvas vs backend rasterization are separate unproven comparisons. Preserve T06's 16 exact/11 differing expected-SVG observations.
- Dynamic rich text/Textbox and undeclared old/fractional symbol profiles reject explicitly; no silent requirement reduction, fixture fallback or stored migration.

## Handoff

Review outcome CHANGES_REQUIRED for mandatory resource and runtime-wiring findings; primary-agent self-review only. Fix the resource boundary while keeping the common engine and conservative no-resend semantics, rerun relevant resource/crash/parity gates, then implement/verify controlled runtime configuration on a named authorized target. T12 remains optional and unstarted; no successor starts automatically.


## Final verification evidence

- Full source: all four checks PASS, `.tmp/source-checks-e3077d3c-9745-44bb-a723-54fc5d1f43cf/report.json`. Final backend acceptance source, production source, manifests and build were checked; subsequent edits affect browser fixtures/documentation only.
- Initial UI run: 54 passed/3 failed, `.tmp/playwright-f308e565-9a56-4272-8d36-af822941c232/playwright-report/index.html`. Causes were missing Align HTML mock, an asynchronous Fabric-import test race, and obsolete synthesis of label_code as canonical token data. No assertion of binding reactivity was removed.
- Focused corrected UI: 3 passed, `.tmp/playwright-92de4c71-73b8-4401-b06e-53a609c12f88/playwright-report/index.html`.
- Final full UI: 57 passed/zero skipped, `.tmp/playwright-6f792ed0-e5a8-42c8-8713-c79cb49a81eb/playwright-report/index.html`; final browser fixture source verified.
- Subsequent `npm test`: 203 passed/zero failed/zero skipped, exit0; frontend regression rerun after browser corrections. No production/manifest/backend test changes followed the full source gate.
- Final whitespace and preservation: git diff --check plus new-file whitespace PASS; `.tmp/t11-5e6d617bd2/final.json` and `verification.json`. Initial446/final451, 429 existing files unchanged, 17 declared test/doc files modified, five new acceptance files, zero removals, same HEAD. Earlier implementation/config/schema and historical result/review files unchanged.
