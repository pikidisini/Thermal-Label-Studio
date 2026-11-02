# Direct-print identity and physical-printer ownership

Studio Print and Label Print require an explicitly configured durable intake
database (`TLS_INTAKE_LEDGER_JSON` and its referenced environment values). Schema
`010_direct_print.sql` is additive and must be provisioned separately, on the
same database used by intake/queue printer ownership. No startup path applies DDL.
Missing schema, configuration or database access denies transport; no in-memory
or queue-disabled bypass exists.

## Request and replay contract

`POST /api/v1/printing/editor` now requires `job_id`, a lowercase UUIDv4 generated
once per deliberate action and retained in tab storage before sending. Existing
Label Print `POST /api/v1/label-print/print` retains its UUIDv4 `job_id`.

The permanent identity is a globally unique job ID plus an account owner, kind,
SHA-256 request fingerprint, canonical physical destination and ordered payload
hashes. The fingerprint covers the exact admitted request, including artifact
identities or editor draft/data, copies and explicit target expectations. Raw
SVG, label data, wire payloads and credentials are never stored in job rows.
IDs/immutable artifacts bind payload identity; hashes additionally record the
actual ordered output prepared before the reservation.

Admission/reservation and every per-item claim commit before transport. Each
item is persisted as `UNCERTAIN` before an attempt and changed only after a known
transport outcome. A lost commit acknowledgement prevents a new send. Response
metadata and permanent terminal outcomes remain available after process restart.

- Identical POST: return the existing outcome, without artifact resolution,
  rasterization or transport. Expired preview cache does not invalidate replay.
- Same ID with a different request: HTTP 409 `print_job_conflict`.
- Different account: HTTP 404, without disclosing job metadata.
- Active/unclosed job: HTTP 202 `PROCESSING`, without claiming it again.
- Completed Label Print: `SUBMITTED` or `STOPPED`, indexed item states and
  `confirmed:false`. Completed Studio success returns its original editor result.
- `GET /api/v1/printing/jobs/{job_id}`: account-owned durable status, no idle
  extension, no rendering, no printer effects; all responses are `no-store`.

New direct identities count toward the existing one-million identity capacity; replay does not consume another slot. Job rows and terminal outcomes cannot be deleted/reset by runtime SQL. Deliberate
reprint uses a new job ID. There is no automatic retry or lease-based reclamation.
The legacy foundation `label_backend.jobs` remains separate because it does not
model permanent request fingerprints or `UNCERTAIN` transport outcomes.

## Shared printer ownership

All actual TCP transports and explicit status probes use
`intake_queue.printers.printer_operation`, regardless of `TLS_QUEUE_ENABLED`.
The physical key normalizes numeric IP (including IPv4-mapped IPv6) plus port.
A session advisory lock covers acquisition, the socket and final settlement;
a durable `printer_owners` row is conservatively held before effects. Distinct
printers have distinct locks. A direct-print batch owns its printer across every
item, not only while individual sockets are open. Nested transport calls inherit
only the same physical address; cross-address nesting is rejected.

Queued worker ownership remains inherited from its existing durable reservation.
Intake transport holds use the durable intake ledger ID for recovery checks.
No acquisition takes over a nonempty owner or bypasses queued jobs. Process loss
releases PostgreSQL session locks but preserves durable ownership. Connection
loss is not proof that a TCP operation or its process has stopped.

## Physical checks and recovery

`GET /api/v1/printing/holds` lists physical owners without secrets. An owner may
still be active, so displaying it is not permission to release it.

- `POST /printing/holds/{owner}/physical-check` (all authenticated roles) records
  actor, time and a nonblank note, only after ownership is available and direct,
  intake or queued work is terminal.
- `POST /printing/holds/{owner}/release-hold` (Admin only) requires that check,
  rechecks that the operation stopped, clears ownership and records an audit.
  It never resends a job or changes its previous outcome.
- Legacy queue hold routes also reject release of active direct/intake work.

An interrupted direct job remains `PROCESSING` with conservative item states;
ordinary HTTP cannot convert this into a terminal/retryable job. On the named
deployment host, an authorized maintainer first proves that the application
container and every app container in the named Compose project are stopped.
`scripts/recover_direct_print.py` verifies that state through read-only Docker
inspection, acquires the physical advisory lock, marks the job terminal without
changing item states, and preserves the printer hold. Physical check and Admin
release follow separately. It never stops services itself. For another topology,
define and verify its fencing procedure before allowing recovery.

## Provisioning and cutover (separate operational authorization)

1. Review the source/tests and exact candidate image. Schema differences continue
   to block automatic deployment; do not disable this gate to release the change.
2. Authorize the exact database/storage target and a maintenance window; stop new
   writers and verify outstanding printer outcomes. Back up the named target and
   preserve retained keys. Stop the named app using the approved operational path.
3. In an administrative Python environment on that host with the existing intake
   ledger configuration, run `python -B scripts/provision_print_safety.py` to view
   its plan. Apply only with `--apply --confirm-host <ledger-host>
   --confirm-database <ledger-database> --confirm-container thermal-label-studio-lan-app-1`.
   It requires schema 002 already provisioned; it neither activates queue nor
   provisions another database. Provision 010 before 009 if queue tables are not
   installed; 009 uses `CREATE TABLE IF NOT EXISTS` for `printer_owners` so it can
   be adopted later without replacing ownership.
4. Grant the existing runtime role schema USAGE, SELECT/INSERT/UPDATE on
   `direct_print_jobs` and `printer_owners`, and SELECT/INSERT plus sequence usage
   on `printer_safety_audit`. Preserve existing intake/queue privileges. No PUBLIC
   grants and no runtime DELETE are required. The permanent-identity trigger also
   rejects terminal mutation/deletion.
5. Deploy the reviewed image through an explicitly authorized schema cutover,
   verify job/status authorization and synthetic transport behavior in isolation,
   then perform only separately authorized physical target/count acceptance.
6. A rollback to an old image reintroduces the old printing behavior. Do not resume
   printing on it as if this safety contract still applied. Prefer holding the
   app stopped pending an approved recovery; do not restore old data or resend jobs.

Recovery is plan-only by default:

```text
python -B scripts/recover_direct_print.py
python -B scripts/recover_direct_print.py --apply --job-id <uuidv4> \
  --confirm-host <ledger-host> --confirm-database <ledger-database> \
  --confirm-container thermal-label-studio-lan-app-1 \
  --actor <administrator-id> --note "Stopped owner verified after inspection"
```

SQLite/fake transport tests are source evidence. Opt-in
`test_direct_print_postgres.py` provisions only a fresh database whose name begins
`tls_p1_print_safety`, using explicit `TLS_TEST_PRINT_SAFETY_DSN` and
`TLS_TEST_PRINT_SAFETY_APPLY=true`. It verifies process crash, cross-process
ownership, replay and PostgreSQL triggers without sockets or operational volumes.
This does not establish physical exactly-once printing: TCP acknowledgement loss
remains uncertain and requires operator inspection.


## Source verification checkpoint ? 2026-11-02

The full local source runner passed backend non-native regression, native parity,
TypeScript, frontend build and frontend regression. A focused final regression
passed 202 tests; two opt-in PostgreSQL tests were skipped without an authorized
fresh target. The direct-print suite was rerun after the final settlement-error
classification change and passed 16 tests. Browser UI checks passed 24 tests in
Microsoft Edge, including the four new status/hold/recovery scenarios. The frontend
unit runner passed 228 tests. Provision/recovery plan commands produced no writes.

Real PostgreSQL multi-process/trigger acceptance is NOT RUN pending approval for
a fresh isolated target. Operational schema provisioning, image cutover and
physical printer acceptance are NOT RUN. These two P1 findings are not marked
operationally closed by source/fake evidence alone. No production configuration,
data, database schema or printer was changed during implementation.
