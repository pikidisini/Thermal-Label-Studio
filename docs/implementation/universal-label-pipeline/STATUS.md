# Implementation status

Updated: 2026-10-12 (Asia/Jakarta).
This file is the authoritative current implementation status. The current table and latest checkpoint take precedence over dated execution notes and historical result/review reports, which remain unchanged.

Package state: T01, T02 and T03 DONE with independent review PASS. T04 DONE with primary-agent source self-review PASS (no independent second-agent review). T05 DONE with primary-agent source self-review PASS for declared profiles. T06 source implementation and native shared-output parity are complete; current-app mock browser acceptance is BLOCKED. T07 local intake simulation is implemented and source-validated; full resource acceptance is NEEDS_REPLAN, and external admission stays closed. T08 durable identity source/transactional-fake acceptance is DONE with source self-review PASS; local PostgreSQL schema/setup and actual process-restart replay are PASS; broader operational acceptance remains open. T09 source/synthetic policy and preflight are DONE with self-review PASS; default external admission and intake print remain denied.
T10 functional source/fake print is implemented with source gates PASS; overall acceptance is NEEDS_REPLAN for the unchanged mandatory T07 resource boundary. No operational configuration/device effect occurred.
Documentation contract validation is separate from implementation/runtime evidence.
The main implementation sequence ends at T11. T12 is optional and its PENDING/NOT RUN state does not block software acceptance. Live runtime/storage evidence remains a separate gate.

| Task | State | Result | Review | Next action |
| --- | --- | --- | --- | --- |
| T01 | DONE | [T01_RESULT](results/T01_RESULT.md) | [PASS â€” T01_REVIEW](results/T01_REVIEW.md) | Documentation acceptance complete |
| T02 | DONE | [T02_RESULT](results/T02_RESULT.md) | [PASS â€” T02_REVIEW](results/T02_REVIEW.md) | Canonical admission and local exploration acceptance complete |
| T03 | DONE | [T03_RESULT](results/T03_RESULT.md) | [PASS â€” T03_REVIEW](results/T03_REVIEW.md) | Metadata admission and SVG transport acceptance complete |
| T04 | DONE | [T04_RESULT](results/T04_RESULT.md) | [PASS — source self-review](results/T04_REVIEW.md) | Pure supported text preparation complete; raster/output integration remains T06/T11 |
| T05 | DONE | [T05_RESULT](results/T05_RESULT.md) | [PASS - source self-review](results/T05_REVIEW.md) | Supported text/symbol binder complete; explicit re-export/replan limits retained |
| T06 | BLOCKED | [T06_RESULT](results/T06_RESULT.md) | [BLOCKED acceptance; source self-review PASS](results/T06_REVIEW.md) | Run current-app mock browser gate; source/native parity passed |
| T07 | NEEDS_REPLAN | [T07_RESULT](results/T07_RESULT.md) | [CHANGES_REQUIRED - resource execution boundary](results/T07_REVIEW.md) | Implement hard cancellation/deadline and native process memory enforcement; default external admission remains closed |
| T08 | DONE | [T08_RESULT](results/T08_RESULT.md) | [PASS - source self-review](results/T08_REVIEW.md) | Local PostgreSQL schema/role, HTTP replay and process-restart replay PASS; live concurrency, recovery/rotation and packaged runtime remain T11 |
| T09 | DONE | [T09_RESULT](results/T09_RESULT.md) | [PASS - source self-review](results/T09_REVIEW.md) | Policy/preflight source complete; HTTP print source exists in T10; operational config/history remains T11 |
| T10 | NEEDS_REPLAN | [T10_RESULT](results/T10_RESULT.md) | [CHANGES_REQUIRED - hard resource boundary](results/T10_REVIEW.md) | Functional source/fake print PASS; resolve mandatory T07 hard cancellation/native memory before DONE |
| T11 | NEEDS_REPLAN | [T11_RESULT](results/T11_RESULT.md) | [CHANGES_REQUIRED - resource/runtime findings](results/T11_REVIEW.md) | Opt-in standard ledger wiring implemented; mandatory resource limits, policy/credential lifecycle, live runtime and restart evidence remain open |
| T12 | BLOCKED | [T12_RESULT](results/T12_RESULT.md) | [BLOCKED physical; local preparation PASS](results/T12_REVIEW.md) | Nine local cases prepared; name/authorize target, counts and slots; resolve relevant T11 resource/runtime gates before sends |

## Current checkpoint: all-template simulation permission (2026-10-12)

The user authorized selecting any stored template for simulation without a
per-code permission list. `Source.simulation_all_label_codes` is an explicit
strict boolean, default false. Only simulation authorization can use it; sender
identity/mode, stored template validity, bindings and durable ledger remain
required. Print authorization/preflight retain exact code allowlists and grants.

Management/layout regression also PASS (32 tests). Its initial subprocess import
failed because the test command omitted `PYTHONPATH=backend`; rerun with that
environment passed without source changes.

Activated for local `SAP_TEST`, retaining simulation-only mode and existing
credentials/keys. The current runtime uses the persisted Application Management
policy, so the source was updated through its revision-checked, audited API;
existing targets, template approvals and reviews were preserved. Ignored local
environment policy was updated too for launches without management enabled.

Validation: policy/print/runtime regression 121 PASS, covering opt-in/default,
strict field validation, unknown templates, successful out-of-allowlist
simulation, revocation blocking replay, sender and print isolation. Live
SAP-Simulator submission of `label_data.sample-2.json` for existing `30mm_test`
returns HTTP 200 and SIMULATED PNG; identical replay PASS; print remains denied
403. Evidence:
`.tmp/all-template-simulation-49a53b1aeec14b36a03e5e1f3be4b57c/verification.json`.
Earlier attempts still returned 403 while the environment policy was overridden
by management; no intake record was created for those denied attempts. No
template was changed and no printer was contacted. Production gates remain open.

## Stored sample_roll intake simulation checkpoint (2026-10-12)

The user identified the existing stored template as lowercase `sample_roll` and
authorized updating the sample/policy and repeating the trial. The filled JSON
sample now uses that exact code and a new request ID. Local `SAP_TEST` policy was
revised to `LOCAL_SIMULATION_20261012_2`, retaining the same sender credential,
HMAC keys, simulation-only mode and empty printer targets/approval history.

Live PASS: SAP-Simulator forwards the sample to the running standard backend;
the existing stored template produces a `SIMULATED` item and PNG, using the real
PostgreSQL ledger and existing layout storage. Sending the identical request
again returns `replayed: true` with identical results. Studio remains available.
No template was created or modified, and no printer was contacted. Evidence:
`.tmp/sample-roll-intake-205c434c23f8494ea078598e7a69dd24/response.json`,
`replay.json` and `label-1.png`. The earlier uppercase `SAMPLE_ROLL`
`unknown_label_code` observation is historical. This local success does not close
the outstanding resource, deployment, security-lifecycle and operational gates.

## Authorized local PostgreSQL ledger activation checkpoint (2026-10-12)

The user explicitly authorized backup, fresh ledger schema/role/key setup,
development restart with existing storage, and synthetic request/replay tests on
`thermal_label_studio` at `127.0.0.1:5434`. No template creation, data deletion or
printer delivery was authorized or performed.

Completed: a private pre-migration custom-format database backup was created and
its archive inventory was validated (restore NOT RUN). The fresh `label_intake`
schema and five tables were installed transactionally, with a dedicated
`tls_intake_runtime` login. That role has no superuser, database/role creation,
bypass-RLS, ledger-schema CREATE or request DELETE permission. Retained HMAC K1
and dedicated connection settings are in ignored `.env.intake-ledger.ps1`;
`scripts/start-intake-simulation.ps1` loads these alongside the private sender
configuration. The one-time `scripts/activate_intake_ledger.py` refuses to replace
existing schema, role or configuration; it is not an automatic startup migration.

Live validation PASS: actual backend admission stores the synthetic request's
terminal outcome in PostgreSQL; identical replay returns the same results;
changed input with the same identity returns 409 `request_conflict`; print remains
403 `mode_not_allowed`. After an actual development process restart, sending the
same request through SAP-Simulator returns the retained outcome and original
trace. Backend health and Studio return 200. Evidence:
`.tmp/ledger-activation-57b59b3a46794f4ba12753e0494ddf96/verification.json`.
Focused source regression before activation: 61 ledger/runtime tests PASS.

The live sample item is FAILED `unknown_label_code`: `SAMPLE_ROLL` is not an active
stored template. Successful live PNG generation is therefore NOT RUN. Template
setup requires separate scope. This checkpoint establishes local development
ledger activation, not complete production readiness: resource cancellation and
native-memory enforcement, policy lifecycle, live concurrency, key rotation,
crash recovery/maintenance, backup restoration and packaged execution remain open.
T07/T10/T11 remain NEEDS_REPLAN; physical printing remains NOT RUN. Earlier dated
operational NOT RUN statements describe their historical checkpoint.

## Canonical number ownership checkpoint (2026-10-10)

Completed: `number_text` is now defined in `backend/app/label_data/numbers.py`; template composition and intake identity import that common owner directly. Scalar lookup, missing/null/empty errors and composition remain in `template_binding`; request canonicalization/HMAC remain in `label_intake.identity`. The numeric implementation was moved unchanged, without a compatibility wrapper or a second implementation.

Validation: targeted data/text-binding/ledger regression PASS (219 tests). The function AST and the canonical-byte SHA256 for the shared numeric corpus plus nested synthetic data are identical before/after. Importing the number owner in a clean process does not load `template_binding`. Evidence: `.tmp/number-ownership-6c9aebf949`. Full source gate PASS for the current source: backend regression, frontend TypeScript, fresh build and frontend regression. Command: `python -B scripts/check_project.py --run-source-checks`; report: `.tmp/source-checks-0d0c6a85-4836-4896-b09c-01477ddd354a/report.json`. Scope/whitespace checks PASS: four declared existing files changed, one new module, no removals; prior source/configuration outside this scope is preserved. Source self-review PASS; independent review NOT RUN. No historical report was rewritten.

Open issues and next step are unchanged: T07/T10/T11 remain NEEDS_REPLAN for hard storage cancellation/native memory and outstanding runtime lifecycle evidence. Continue with isolated cancellable execution using the existing shared binder/raster/IPL engine; this ownership adjustment does not establish operational readiness.

## Ledger wiring checkpoint (2026-10-10)

Completed source work: `backend/app/label_intake/runtime.py` validates explicit reference-only configuration, dedicated database URL and retained HMAC versions; normal lifespan installs and releases its ledger without importing the driver, connecting or migrating during construction. Missing configuration leaves intake closed; invalid opt-in configuration fails startup safely. Operations use dedicated non-autocommit connections and bounded driver timeouts. Compose forwards blank-by-default ledger settings and K1; Dockerfile includes the reviewed schema artifact without applying it. Existing injection is not overwritten.

Validation: focused ledger/policy/print regression PASS (151 tests); final runtime configuration/startup regression PASS (24 tests) and startup/foundation regression PASS (46 tests, including those 24), covering HTTP simulation/replay without ledger dependency overrides, retained-key rotation, missing schema/connection denial, secret redaction and ownership conflict. Driver/SQL evidence uses a transactional fake, not PostgreSQL. Final full source gate PASS: backend regression, frontend TypeScript, fresh frontend build and frontend regression. Exact command: `python -B scripts/check_project.py --run-source-checks`; final report: `.tmp/source-checks-70e014f2-cac7-4fde-816a-f64b9c4bf2fe/report.json`. The first full run found one outdated composition-root import whitelist (1,486 other backend tests and all frontend gates PASS); the whitelist now explicitly permits only the implemented ledger wiring module. The original FAIL report is retained at `.tmp/source-checks-a110114a-b0e0-43c7-9f15-eadadecf6c06/report.json`; generated evidence is kept in `.tmp/pipeline-runtime-931f886c2b`. The initial fixture failure is retained and corrected; production pin validation was not weakened. Final scope/whitespace checks PASS: 466 initial files, 468 final, 457 unchanged, nine declared modified, two new source/test files and no removals; historical reports and HEAD unchanged. Source self-review only; no independent reviewer was used.

Open issues: T11-R02 is partially addressed in source (standard ledger attachment and schema packaging). Real PostgreSQL schema/roles/concurrency/restart and packaged execution are NOT RUN; policy/source credential forwarding and durable policy history remain unresolved. T11-R01 hard cancellation of storage and enforceable native process memory remain open, so T07/T10/T11 stay NEEDS_REPLAN. Driver SQL timeouts do not establish batch resource acceptance. T06 current-app acceptance and T12 physical/source gates retain their declared scope. No service, container, operational storage, sender or printer action was performed.

Next implementation checkpoint: isolate storage/preparation execution with enforceable cancellation/deadline and native memory controls, preserving the shared binder/raster/IPL engine and durable no-retry send rules. Validate timeout/worker failure with bounded local fakes before any separately authorized live-runtime acceptance. Continue recording current evidence here; preserve historical task reports.

## Update rules

- IN_PROGRESS identifies one active source writer only.
- DONE requires task acceptance evidence and review PASS for that task's scope.
- BLOCKED names the missing input/environment and unaffected work.
- NEEDS_REPLAN identifies a contract/architecture assumption that cannot be met.
- Do not reuse historical pipeline-test PASS as proof for newly modified code.
- Source/mock, browser, live storage, packaged runtime, quality scan, sender integration and physical printer are distinct gates.
- Add exact result/review links only after the files exist.
- Never change a NOT RUN operational gate to PASS based on source or mock tests.

## T07 explicit sequencing and remaining gate

The user explicitly requested T07 on 2026-10-10 after T06 source/native parity PASS; local work proceeded while T06 current-app browser remains BLOCKED. No T06 result/review history was rewritten. T07 local routing, pinning and shared simulation are verified, but the frozen resource requirement is not fully met: synchronous storage cannot be interrupted by the cooperative deadline, and application memory reservation does not enforce native process memory. T07 stays NEEDS_REPLAN. T08 subsequently received explicit source authorization and is now DONE for its source/fake scope; T09/T10 stay PENDING. Tests reproducing these limits are not acceptance PASS.

## T08 explicit sequencing and source completion

The user explicitly requested T08 while T07 remained NEEDS_REPLAN. This authorized source/transactional-fake work only, preserving T07 resource and T06 browser gates. T08 durable identity/replay/claim/recovery/retention source is DONE with self-review PASS. No operational schema/setup, recovery/cleanup, external sender or printer effect occurred. T09/T10 remain PENDING.

## T09 explicit sequencing and source completion

The user explicitly requested T09 while T07 remained NEEDS_REPLAN and T06 browser BLOCKED. Source/synthetic admission, exact approval and numeric server target preflight are DONE with primary-agent self-review PASS. No operational policy/credential provisioning, source/device access or storage/lifecycle action occurred. T10 remains PENDING; HTTP print is still denied. Durable audit history across restart and actual runtime configuration remain T11, and historical T07/T06 results are unchanged.

## T10 explicit source execution and remaining acceptance

The user explicitly requested T10 despite T07 NEEDS_REPLAN/T06 BLOCKED. Actual print intake source, durable outcomes and fake/native parity tests are implemented with functional/source PASS. Overall T10 is NEEDS_REPLAN and review CHANGES_REQUIRED for inherited mandatory hard storage cancellation/native memory. Default runtime credentials/ledger remain unconfigured and denied; no operational target was contacted. T11 remains PENDING, not automatically started. Historical T07/T09/T06 results are preserved.


## T11 explicit acceptance execution

The user explicitly requested T11 despite prior T07/T10 NEEDS_REPLAN and T06 current-app BLOCKED. Local native/source/browser mock checks are executed and reported separately in T11_RESULT. Overall T11 remains NEEDS_REPLAN for mandatory hard cancellation/native memory. Its operational portion is PARTIAL with exact runtime/quality gates NOT RUN and standard ledger/configuration/history gaps recorded. No prior task result is rewritten, named operational action performed or T12 started.


## T12 explicit local preparation and external stop

The user requested T12 on2026-10-10. Nine synthetic cases/eight templates and a bounded proposed22-label paired UAT plan are prepared and native-decoder-validated with zero transport calls. Device/source/count/slot authority is absent and relevant T11 prerequisites remain unmet: T12 is BLOCKED, physical/integration NOT RUN. Historical PM45 evidence is not current authorization. See [plan](T12_UAT_PLAN.md), [manifest](T12_ACCEPTANCE_PLAN.json), [result](results/T12_RESULT.md) and [review](results/T12_REVIEW.md). No operational action or successor was started.

## Current checkpoint: unavailable-data display fallbacks (2026-10-16)

User-approved shared binding now displays ` - ` for present null/empty text and
`N/A` for absent keys. Barcode/QR with an unavailable referenced token uses a
plain outlined box with centered ` N/A ` in the original image area/transforms.
Raw facts and saved templates are preserved. Invalid nonempty data, unsupported
metadata/profiles and resource limits still fail closed. This supersedes earlier
missing/null/empty rejection semantics in dated task/results evidence.

Focused validation PASS: 391 text/symbol tests and 95 shared native output/HTTP
and mocked SAP tests. The latter uses real local renderer/IPL with fake print
transport and fake RFC/storage. Actual bound SVG -> raster -> IPL decode proof
was visually inspected at `.tmp/binding-fallback-proof-20261016/example-label.png`.
Initial sandbox HTTP checks were blocked at Windows asyncio internal socketpair;
the same checks passed outside the sandbox. No live SAP/storage/printer action,
container action, publication or template migration occurred.

Full source gate: FAIL due to one separate existing composition-root whitelist
mismatch: `test_foundation_imports_only_implemented_in_memory_dependencies` rejects
`simulation.design_http` imported by main.py. Neither main.py nor that test was
changed by this fallback task. Backend: 1752 PASS / 1 FAIL. Frontend TypeScript,
fresh build and regression: PASS. Report:
`.tmp/source-checks-920c9717-954f-42d2-892e-982ba6f9d935/report.json`.
The unrelated whitelist was preserved; no global PASS is claimed.
