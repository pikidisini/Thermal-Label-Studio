# Task result: T09

## Identity and scope

- Task: T09_ADMISSION_AND_TARGET_POLICY.md; date: 2026-10-10 (Asia/Jakarta).
- Executor: primary agent, direct implementation; no delegated writer or independent second-agent review.
- State: DONE for source/synthetic policy and preflight scope, with source self-review PASS.
- Repository: Thermal-Label-Studio, main, HEAD bb639065a3161e9421336913be8327009b4c2ab9 unchanged.
- Authorization: user's explicit “kerjakan T09”. No authorization for operational credentials, storage, source integration, device, deployment or publication inferred.
- Prerequisites inspected: current AGENTS, active five docs, frozen CONTRACT/DECISIONS, package/task/status, T08 source/result/review and current dirty worktree. T07 resource NEEDS_REPLAN and T06 browser BLOCKED preserved.
- Initial snapshot: .tmp/t09-fee1cbcd58/initial.json, 436 tracked/unignored file hashes. No missing initial file; modifications confined to listed T09 source/docs; unrelated engine, frontend, layout/job/ledger/transport and previous results preserved.

## Delivered behavior

Actual HTTP bearer authentication maps a distinct secret to the server-owned source identity and checks body assertion, enabled source, mode and exact label codes before accessing layouts/ledger or replay. Missing/invalid identity returns bounded 401 with Bearer challenge; absent/invalid configuration returns bounded 503; authorization returns bounded 403. Fixed-size constant-time digest comparison does not retain or log raw tokens. Only intake OpenAPI declares security; Studio remains its existing manual local flow.

Strict immutable policy comes from explicitly mapped process environment, not an automatic .env loader. Policy references secret variable names, explicit permissions, numeric server targets and chronological actor/time/approve/revoke events. Environment reload retains audit prefix and requires a different revision for edits. No administrative API or operational credential is created. Audit durability across restart/worker coordination remains T11.

Pure `preflight_print` requires exact sender/code/version/checksum, copies ceiling 1..999 and enabled server target, returning pinned target ID/revision and private numeric destination. Published/newly saved layouts gain no approval automatically. Request data cannot select host/port. Pure `revalidate_claim` denies revoked source/credential/grant/capability or changed original policy revision/target/address/port before T10's next ledger claim. Neither helper renders, writes storage, bypasses ledger or constructs sockets.

Simulation permission does not require a print approval or a target; it still uses the T08 durable coordinator and shared Studio engine. Replays pass current authentication/permissions before exposing retained results. HTTP print stays 403 even for a configured print-capable source, pending T10 all-batch preparation/result/claim/transport integration.

## Files changed

- New backend/app/label_intake/policy.py: immutable models, config parsing, auth/authorization, approval audit/transition, target preflight and revalidation.
- Existing untracked T07/T08 backend/app/label_intake/http.py: replaces closed placeholder with real admission before dependencies, Bearer OpenAPI/challenge, strict default denial, typed admission identity; existing slot/body/ledger integration retained.
- Existing untracked backend/app/label_intake/results.py: bounded mode/approval/target vocabulary only.
- New backend/tests/test_intake_policy.py: synthetic policy/auth/replay/target/audit/pre-claim/ledger/example/security evidence.
- Existing untracked backend/tests/test_label_intake.py: trusted fixture now supplies typed Admission and expected default missing-bearer 401; underlying native processing assertions retained.
- .env.example: opt-in variable documentation only, no usable secret or real destination added.
- New T09_POLICY_OPERATIONS.md: safe structural example, explicit audit limitation, T10 preflight contract and named-authorized T11 checklist.
- Active docs/API_CONTRACT, ARCHITECTURE, PRODUCT_FLOW, DECISIONS, DEVELOPMENT: update current admission and add implemented T09 boundaries.
- Package CONTRACT, DECISIONS, README, SUMMARY, STATUS, selected task and these result/review artifacts: current source evidence/sequencing, preserving historical task results.
- No dependency, manifest, schema, main lifespan, Docker/Compose, frontend, engine, layouts, jobs, print transport or ledger source change.

## Validation evidence

| Gate | Status | Command/target | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Focused final regression | PASS | PYTHONPATH=backend; python -B -m pytest -p no:cacheprovider -p no:tmpdir backend/tests/test_intake_policy.py backend/tests/test_label_intake.py backend/tests/test_intake_ledger.py backend/tests/test_printing_http_transport.py backend/tests/test_foundation_api.py -q --junitxml=.tmp/t09-fee1cbcd58/focused.xml | 213 passed, zero skipped | Synthetic policy/secrets, transactional fake and recorded transport only |
| Full source gate | PASS | python -B scripts/check_project.py --run-source-checks | .tmp/source-checks-717edf42-d4d1-4af4-a316-7471b2dd1401/report.json | Backend/frontend regression, full TypeScript/build; deployment_ready=false |
| Native Studio/intake/IPL regression | PASS | Existing test_label_intake native cases within focused/source suites | Focused XML | Existing renderer/font profile; no new browser/package claim |
| Manual target/no-probe/one-send regressions | PASS | test_printing_http_transport + foundation suite | Focused XML | Fake sockets/transports, unchanged manual route policy |
| Denial before dependencies/render/socket | PASS | New actual HTTP bearer denial and pure preflight cases | Focused XML | Print orchestration unstarted; pure T09 handoff tested |
| Secret-free example/config and audit guards | PASS | New example parse + reload/revision/history tests | Focused XML | Synthetic token literal belongs only to tests; actual ignored .env untouched |
| Diff/whitespace/preservation | PASS | git diff --check; new-file whitespace; initial vs final SHA-256 inventory | .tmp/t09-fee1cbcd58/preservation.json | Existing unrelated dirty work retained; no commit/push |
| Current-app browser | BLOCKED, unchanged | T06 historical acceptance | T06_RESULT/T06_REVIEW | Not rerun or inferred from build |
| Hard cancellation/native memory | NEEDS_REPLAN, unchanged | T07 requirement | T07_RESULT/T07_REVIEW | Cooperative/application reservations still insufficient |
| Live PostgreSQL/MinIO, schema, audit restart, actual credentials | NOT RUN | Requires named-authorized T11 setup | T09_POLICY_OPERATIONS checklist | No operational writes or source access |
| Packaged runtime/TLS/shared-worker setup | NOT RUN | T11 | Source report runtime gates | No lifecycle/deployment changes |
| Sonar quality scan | NOT RUN | Separate current snapshot | None | Source PASS is not quality-scan PASS |
| Physical printer/external sender | NOT RUN | Optional named-authorized T12 | None | No delivery or real integration claim |

The final focused suite includes three handoff/config/example cases added after launching the full source gate; all final implementation source was already present when that gate launched. No production source change followed its launch. Final focused evidence complements the full source report. Two pre-existing TestClient deprecation warnings remain; no test failure or skip.

## Side effects and remaining limits

Changes are source/docs and disposable .tmp test evidence; the standard source gate regenerated ignored frontend dist. Tests use disposable ledger databases and fake transports, never operational DB/object store or printer. No root .env, runtime process/container, SQL migration, credential provisioning, storage maintenance, remote branch or publication was touched.

In-process audit history checks are not tamper-resistant durable audit storage. Protected configuration/history, unique revisions across restarts, coordinated workers and actual entropy/access controls are explicit T11 responsibilities. Trusted app.state policy injection must enforce transitions in its administrator-managed updater; untrusted JSON cannot set it. Finite audit/config capacities are documented and fail closed rather than deleting history. Source capability and grant do not satisfy the outstanding T07 resource gate or automatically activate T10 transport.

## Handoff and stop

T09 acceptance criteria are satisfied for the requested source/preflight scope. See T09_REVIEW.md PASS self-review and T09_POLICY_OPERATIONS.md for exact API integration. T10 remains PENDING and is not started. When explicitly selected, it must preflight all items before render, persist target/revision pins through T08, revalidate before each committed claim and construct the existing one-attempt transport only afterward. Preserve T07/T06 outstanding gates and avoid operational setup without named authorization.

Suggested next-task request: “Execute T10 using T09 policy/preflight APIs and T08 committed ledger claims, with fake transport only. Preserve T07 NEEDS_REPLAN and T06 browser BLOCKED; do not provision storage, credentials or a printer.”
