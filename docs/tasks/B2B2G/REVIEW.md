# Review — B2B2G: Pilot Safety & Network Hardening

- Review status: `APPROVED_FOR_COMMIT_AND_PR`
- Reviewer: `Codex / Principal AI Engineer & Staff Systems Architect`
- Review scope: uncommitted implementation on `codex/b2b2g-pilot-safety-network-hardening`
- Review date: 2026-09-21
- Merge status: **DO NOT COMMIT OR MERGE YET**

## Verdict

The implementation improves the pilot substantially, but it does **not** yet
meet the two core fail-closed guarantees declared by the task contract:

1. a pilot component must not run with the documented placeholder database
   password; and
2. raw physical TCP printing must not be reachable without the explicit
   `PRINT_DISPATCH_ENABLED=true` operator gate.

No physical printer, office network TCP/9100 endpoint, production database,
or production Docker deployment was accessed during this review.

## Verified Strengths

| Area | Status | Evidence |
| --- | --- | --- |
| PostgreSQL LAN exposure | `PASS` | `docker-compose.pilot.yml` binds the host port to `127.0.0.1`. |
| Safe dispatcher defaults | `PASS` | Default mode is `simulator`; `PRINT_DISPATCH_ENABLED=false`. |
| Safe environment template | `PASS` | No prior routable printer IP remains; pilot host is loopback. |
| Simulator behavior | `PASS` | `SimulatorSocketTransport` records metadata and does not create sockets. |
| Seed overwrite protection | `PASS` | Conflicting printer configuration requires `--force-update --reason`; a `print_audit_events` record is written. |
| Whitespace diff check | `PASS` | `git diff --check` exited successfully; only normal Windows LF/CRLF warnings were emitted. |
| Physical hardware verification | `BLOCKED / NOT RUN` | Correctly not attempted. |

## Required Corrections

### P1-1 — Placeholder database credentials are not rejected in every pilot entry point

**Contract affected:** AC 2 and the explicit scope for FastAPI startup and
migration scripts.

`validate_database_credentials()` is called by the dispatcher and seed
script, but the following paths accept a database URL without this validation:

- `backend/app/api/routes_print_agent.py` —
  `PrintAgentSettings.from_environment()` reads
  `PRINT_AGENT_DATABASE_URL` without validating it.
- `backend/app/print_jobs/migrations.py` — `apply_baseline()`,
  `rollback_baseline()`, and `verify_baseline()` call `psycopg.connect()`
  directly.

This leaves a real unsafe path: the default Compose placeholder password is
shared by the `db` and `app` services, so the API can start against PostgreSQL
using the documented placeholder even though the dispatcher refuses it.

**Required fix:**

1. Move validation to a neutral module, for example
   `backend/app/print_jobs/security_validation.py`, so API, migration, seed,
   and dispatcher can share it without importing a runner module.
2. Reject an absent password as well as placeholder/default and short
   passwords.
3. Validate in `PrintAgentSettings.from_environment()` whenever the PostgreSQL
   repository backend is selected.
4. Validate before every `psycopg.connect()` in `apply_baseline()`,
   `rollback_baseline()`, and `verify_baseline()`.
5. Preserve a disposable-test exception only as an explicit test-only
   dependency/argument. It must not be a normal pilot deployment switch that
   accidentally weakens the runtime.
6. Add regression tests proving FastAPI settings and all three migration
   functions reject the placeholder before a connection attempt.

### P1-2 — Raw TCP transport can bypass the physical dispatch gate

**Contract affected:** AC 3 and the hard boundary “Zero Physical Print Without
Explicit Flag”.

The runner guards `transport_mode == "tcp"` in
`backend/app/print_jobs/central_dispatcher_runner.py`, but
`backend/app/print_jobs/socket_transport.py` still permits direct creation of
`RawTcpSocketTransport` and calls `socket.socket()` in `send()` without
checking `PRINT_DISPATCH_ENABLED`.

Any later script or code path that constructs `RawTcpSocketTransport` directly
can therefore bypass the runner gate. The B2B2G test only proves the runner
rejects TCP mode; it does not prove the transport is fail-closed.

**Required fix:**

1. Make `RawTcpSocketTransport` fail closed internally. Before creating a
   socket, require the explicit physical-dispatch authorization.
2. The authorization should be `false` by default and must result in
   `PhysicalPrintDisabledError` before `socket.socket()` is called.
3. The runner may pass the approved gate explicitly, but direct use must not
   be enabled by default.
4. Update socket transport tests so their loopback test server uses an
   explicit test authorization.
5. Add a regression test that patches `socket.socket` and proves it is never
   called when the gate is absent or `false`.

## Test Evidence Status

The executor reports 13 B2B2G safety tests and 241 backend tests passing. This
review did **not** rerun pytest because its purpose was an independent
read-only review and the two P1 gaps are observable from the code paths above.
After the corrections, rerun at minimum:

```text
python -m pytest backend/tests/test_pilot_safety_hardening.py -q -p no:cacheprovider
python -m pytest backend/tests/test_socket_transport.py -q -p no:cacheprovider
python -m pytest backend/tests/test_central_dispatcher_runner.py -q -p no:cacheprovider
python -m pytest backend/tests -q -p no:cacheprovider
git diff --check
```

Report each outcome as `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` in `RESULT.md`.
Physical TCP/9100 printer testing remains `BLOCKED / NOT RUN`.

## Reviewer Instruction to Executor

Implement only P1-1 and P1-2 plus their focused regression tests and the
minimal documentation/result updates. Do not connect to a physical printer,
office LAN endpoint, production database, or production infrastructure. Do
not commit, push, or merge. When complete, update `RESULT.md` accurately and
return the changed-file list, exact test commands/results, and a concise
self-review.

## Re-review Gate

Codex will approve this phase only after both P1 corrections are present,
focused and backend regression evidence is supplied, and there is no route to
open a raw printer socket or start a PostgreSQL-backed pilot using a
placeholder password by default.

---

## Re-review — 2026-09-21

### P1-1 re-review: `PASS`

The requested neutral validation module exists at
`backend/app/print_jobs/security_validation.py`. It rejects missing, empty,
placeholder/default, and short passwords. The validation now runs before the
connection attempt in the FastAPI PostgreSQL settings path and in
`apply_baseline()`, `rollback_baseline()`, and `verify_baseline()`.

The focused regression test also patches `psycopg.connect` and proves all
three migration functions reject insecure credentials before a connection is
attempted. This closes the original P1-1 unsafe default path.

### P1-2 re-review: partially `PASS`; new P1 integration defect found

`RawTcpSocketTransport` now defaults `dispatch_enabled=False` and its
`send()` method raises `PhysicalPrintDisabledError` before creating a socket.
The direct-bypass defect is therefore fixed.

However, `central_dispatcher_runner.main()` currently constructs the transport
without forwarding the already-approved configuration value:

```python
transport = RawTcpSocketTransport(write_timeout=config.socket_timeout_seconds)
```

Because `RawTcpSocketTransport` defaults to `dispatch_enabled=False`, even an
operator who deliberately sets both:

```text
DISPATCHER_TRANSPORT_MODE=tcp
PRINT_DISPATCH_ENABLED=true
```

will still receive `PhysicalPrintDisabledError` on the first delivery. This is
not a physical-printer test; it is a deterministic constructor/configuration
integration defect observable without opening a socket.

**Required P1 fix:** construct the transport with the already-validated gate:

```python
transport = RawTcpSocketTransport(
    write_timeout=config.socket_timeout_seconds,
    dispatch_enabled=config.print_dispatch_enabled,
)
```

Add a unit test that patches `RawTcpSocketTransport` in the runner and proves
the constructor receives `dispatch_enabled=True` only when the environment
explicitly sets `PRINT_DISPATCH_ENABLED=true`. The existing test for `false`
must remain.

### P2 — Test-only bypass documentation does not match code

`RESULT.md` says insecure credential bypass is available only through an
explicit test-fixture argument. But `DispatcherRunnerConfig.from_environment`
and `seed_pilot.main()` still read `ALLOW_INSECURE_TEST_CREDENTIALS` from the
normal process environment and forward it as a bypass.

This does not weaken the safe default because the variable is absent from the
pilot Compose/template configuration, and the task contract permits an
explicit disposable-test exception. It must nevertheless be documented
accurately. Either remove the normal-environment bypass as originally
requested, or revise `RESULT.md`, code comments, and runbook to say that it is
an explicit environment-controlled disposable-test exception which must never
be set in pilot deployment.

## Current Re-review Verdict

`CHANGES_REQUIRED — DO NOT COMMIT OR MERGE YET`.

The executor must fix the runner-to-transport gate propagation (P1), add the
focused constructor wiring test, resolve the P2 documentation/code mismatch,
run the prescribed focused tests plus the full backend suite, and update
`RESULT.md`. Physical TCP/9100 testing remains `BLOCKED / NOT RUN`.

---

## Final Re-review — 2026-09-21

### Final status: `APPROVED_FOR_COMMIT_AND_PR`

The runner now constructs `RawTcpSocketTransport` with:

```python
dispatch_enabled=config.print_dispatch_enabled
```

so the operator's explicit `PRINT_DISPATCH_ENABLED=true` authorization reaches
the transport's internal fail-closed gate. The reverse case remains protected:
without the flag, runner initialization fails before creating the raw TCP
transport; direct transport use also fails before `socket.socket()`.

The documented disposable-test credential exception is now described
consistently in `RESULT.md`, code comments, and the pilot runbook. It is absent
from the pilot Compose/template defaults and is explicitly prohibited for pilot
deployment.

### Independent verification

| Check | Status | Evidence |
| --- | --- | --- |
| Code path review for P1-1 | `PASS` | API settings, migration operations, dispatcher, and seed use shared credential validation before connecting. |
| Code path review for P1-2 | `PASS` | Runner forwards the approved gate; raw transport itself defaults closed. |
| Focused pytest re-run by Codex | `PASS` | `37 passed, 4 skipped, 2 dependency warnings` across B2B2G safety, socket transport, and runner suites. |
| Full backend pytest | `PASS (executor evidence)` | Executor reported `250 passed, 2 skipped, 2 warnings`. Codex's sandboxed re-run required elevated temporary-directory access; its captured stream was incomplete, so the exact final count is attributed to executor evidence. |
| `git diff --check` | `PASS` | Exit code 0; line-ending warnings only. |
| Physical printer TCP/9100 | `BLOCKED / NOT RUN` | No physical printer or office-network endpoint was accessed. |

No P0 or P1 findings remain in the reviewed B2B2G scope. The phase is ready
for the executor to create a focused commit, push the feature branch, and open
a pull request. This approval does **not** authorize merging into `main`.

### Required commit boundary

Stage only the B2B2G implementation, tests, task artifacts, and directly
updated pilot documentation. Exclude generated test reports, `.env` files,
credentials, caches, local simulator output, and temporary directories.
