# T11 runtime acceptance

Date: 2026-10-10. Repository HEAD: bb639065a3161e9421336913be8327009b4c2ab9.

## Scope and observed availability

No named storage, schema application, container build/restart, policy/key installation, external sender or physical transport was authorized for T11. The user requested the task, whose scope explicitly separates local acceptance from named operational actions. Root AGENTS.md requires explicit named authorization for those effects. Existing volumes, credentials, services and retained templates were not modified.

Bounded read-only loopback probes found Studio 5173 and standard application 8002 unavailable. Backend 8000 answered health and OpenAPI, but did not serve Studio. This does not identify that process as the current checkout or prove intake readiness. Browser tests use its existing loopback origin solely with current checkout build assets and mocked APIs; no server is started and no storage/device API request is sent.

## Runtime gates

| Gate | Status | Evidence or required work |
| --- | --- | --- |
| Current application Studio availability | BLOCKED | 5173/8002 unavailable; 8000 does not serve Studio |
| Live PostgreSQL/MinIO save/open, immutable version pins | NOT RUN | Named target and permitted retained synthetic artifact inventory required |
| Intake ledger schema, PostgreSQL dialect/locking/concurrent owners | NOT RUN | Named schema authorization and configured connection/HMAC key lifecycle required; SQLite transactional fake is separate evidence |
| Real process crash/restart and duplicate/uncertain recovery | NOT RUN | Named application/restart authorization; quiesced recovery must never automatically resume sending |
| Approval audit history and key/policy rotation across workers/restart | NOT RUN | Persisted accepted policy history and key retention must be configured and verified |
| Linux image build and font/renderer parity | NOT RUN | Named build authorization and verified archive RESVG_SHA256 required before build |
| Packaged loopback, health/readiness and browser behavior | NOT RUN | Authorized image/build/runtime target required; development or mocked assets do not prove packaging |
| Fresh SonarQube/coverage quality gate | NOT RUN | No named scanner/container target authorization; historical stored quality is not current evidence |
| Actual external sender/TLS deployment | NOT RUN | Separate named integration/environment scope required |
| Optional T12 physical printer | NOT RUN | Optional; not a prerequisite for software acceptance |

## Source findings to resolve before runtime acceptance

1. `backend/app/main.py` lifespan initializes layout and dataset services only. `label_intake.http.durable_ledger` reads `app.state.intake_ledger`, but the standard startup does not install it. Even after valid source credentials/approvals are configured, ordinary startup cannot provide a usable intake ledger. Add explicit, fail-closed ledger setup/configuration and test startup without automatically initializing operational schema.
2. `docker-compose.yml` passes persistence/manual-printer settings, but does not provide an explicit intake policy and credential/key lifecycle. `Dockerfile` copies the application and frontend assets, but not the ledger schema. Define the controlled schema application path and runtime configuration before claiming the standard package enables intake. Never silently enable a sender or migrate existing volumes.
3. T09 policy transition history is process-local (`app.state.intake_policy_previous`). Source tests validate transitions during a process lifetime; they do not prove retained acceptance/audit history or consistent revocation across restart/workers. Verify an explicit durable history mechanism on the authorized target.
4. T07/T10 hard deadline/native process memory requirements remain unmet. Synchronous storage is not cancellable at the request deadline; renderer subprocess timeout and application reservations are not a native memory fence. Compose's whole-container 512 MiB limit does not prove the frozen 128 MiB/request bound. This is a required software correction, not merely absent runtime permission.
5. Native acceptance uses Windows resvg/Arial. The package uses Linux resvg/Liberation Sans. Both sinks may agree within one profile without proving cross-platform font/raster equivalence. Record exact renderer and font hashes and compare the agreed profile after an authorized build.

## Concrete operational handoff

Name the PostgreSQL/MinIO target, permitted ledger schema application, synthetic codes/request identities and retained artifacts, application start/restart actions, and image build target. Resolve the source findings first; then run save/open/version/deduplication/concurrency/crash/replay/revocation acceptance with all printer routes fake or disabled. Preserve all existing volumes. Independently authorize and execute a fresh quality scan if desired. None of these gates is replaced by local mocks or optional physical printing.
