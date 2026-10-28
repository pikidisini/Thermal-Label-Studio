# Asynchronous intake and production operations

Source implementation: 2026-10-22. Production acceptance remains **NO-GO** until
the named Ubuntu, PostgreSQL/MinIO, HTTPS, SAP and physical-printer gates below
are executed. This document does not authorize any external operation.

## Deployment model

Use `deploy/compose.production.yml` as a standalone Compose project. Do not merge
the local-development Compose file: its host storage ports are inappropriate for
this deployment. There is one API container, two separately named worker services,
PostgreSQL, MinIO and an internal HTTPS nginx proxy. Only the proxy publishes a
LAN port (443). No Docker socket, privileged container or public worker API exists.

Supply the variables listed in `deploy/.env.production.example` using an ignored
private file. Require digest-pinned tested images, a non-overlapping container
subnet, the proxy's exact numeric internal address, internal DNS hostname, trusted
certificate chain, and existing explicitly authorized volume names. The nginx
image must support the supplied config and the certificate must be readable by
its runtime identity. Validate certificate/hostname/trust with both SAP and browsers.
No certificate authority or external hosting vendor is selected by this source.

The API and workers use separate private environment files based on
`deploy/.env.runtime.example`. Workers receive read-only access to stored layouts,
Management policy and MinIO objects, and the dedicated ledger/queue runtime role.
They do not need account-management write access or the Management key-encryption
secret. The API receives only its required application privileges. A privileged
database bootstrap role is reserved for approved offline provisioning.

Each worker mounts a private 1 MiB tmpfs at `/run/tls-queue-health`, owned by
UID/GID 10001 with mode 0700. Its committed heartbeat probe file is
`/run/tls-queue-health/heartbeat.json`; it is not stored in the shared temporary
directory. The existing 128 MiB worker memory limit remains unchanged. The new
mount must pass exact-image Linux runtime checks before release acceptance.

Review/apply `backend/schema/009_intake_queue.sql` after a verified backup on the
named database, following the already-required auth/Management/ledger setup.
Grant the dedicated ledger role SELECT/INSERT/UPDATE on queue/owner/worker/audit
tables, SELECT/UPDATE on queue_control, and USAGE/SELECT on the new sequences.
Retain the existing ledger grants. Do not grant schema CREATE or table DELETE to
ordinary runtime identities. A separate approved retention role needs deletion
rights on expired simulation/item rows and queue metadata rows. No queue DDL runs at startup.
Production sets `TLS_STORAGE_INITIALIZE=false`, so existing Studio layout/dataset
initializers also do not execute startup DDL or create buckets. Provision these
separately before activation. Local development retains its existing behavior.

`python -B scripts/check_production_config.py <private-compose-env>` is read-only
and never prints values. A PASS confirms input presence/shape only. Do not print
`docker compose config` with resolved secret environment values into evidence.

## SAP protocol

Use POST `/api/v2/label-intake` with the current canonical body and exactly one
bearer Authorization header. `target_id` is mandatory in both print and simulation.
The source identity, mode, enabled registered target and allowed target IDs are
checked before admission. Unknown/unavailable configuration fails closed.
Per-template resolution, binding and copies preflight run asynchronously; accepted
requests can subsequently fail without any printer delivery.

An accepted request returns HTTP 202 **only after** one transaction commits the
shared ledger identity and encrypted queue payload:

```json
{
  "request_id": "SAP-001",
  "trace_id": "11111111-1111-4111-8111-111111111111",
  "status": "QUEUED",
  "status_url": "/api/v2/label-intake/SAP-001"
}
```

The response includes `Location`, `Retry-After: 5`, and `Cache-Control: no-store`.
SAP polls GET of status_url with the same source credential every five seconds.
GET returns HTTP 200 with QUEUED/PROCESSING while active, or the existing full
simulation/print terminal outcome. Terminal replay returns HTTP 200. Repeating
the POST with the same sender/request ID and canonical body never creates a new
job; a changed body conflicts. A lost POST response must be reconciled using the
same request ID/body, never a newly generated ID. A queue-full 429 or paused 503
does not acknowledge admission. A lost commit acknowledgement can follow a real
commit, so even after such a failure retain the original identity.

Only the authenticated sender can read its requests. A valid different sender
gets 404. Revoked/disabled credentials cannot read status. The API exposes no
printer address, payload or authored business data in print status.

The same HMAC identity namespace and keyring protect synchronous v1 and queued v2.
An in-progress v1 identity is not enqueued; completed v1 work returns its original
outcome. A queued identity cannot be processed by v1. After sandbox validation,
set the source's **Request processing → Queued API only** (`async_only=true`) in
Management. That revision/audit change denies synchronous v1 for this source.
Pause/drain or deliberately fail pending jobs before changing policy revisions:
queued work pins the admission revision and refuses later policy changes rather
than silently acquiring new permissions or rerouting a printer.

The application repository supplies this contract and test requests; it does not
contain or activate an ECC outbound ABAP implementation. The SAP team must map
the agreed payload, retain request IDs, configure certificate trust, implement
five-second status polling and distinguish acceptance from terminal outcome.

## Queue, ownership and resource limits

The queue starts paused. Its default pending capacity is 1,000 requests; each
body is bounded at 2 MiB and encrypted storage at 3 MiB. Capacity is shared across
both workers, and includes PROCESSING jobs. Plan storage for the configured worst
case before activation; these limits are not a measured production throughput.

Two worker containers claim PostgreSQL rows transactionally using
`FOR UPDATE SKIP LOCKED` and a durable printer-owner record. They select the
oldest eligible request per physical address; later requests cannot overtake a
QUEUED/PROCESSING predecessor for that printer. A busy destination does not block
selection of another destination. Do not scale an individual worker service:
worker-1 and worker-2 must retain distinct identities.

The destination key uses normalized numeric IP and TCP port, so printer ID aliases
share ownership. The actual TCP transport for Studio, Label Print and synchronous
intake also uses this guard when the queue is enabled. Explicit printer-status
checks use the guard too. Opening/selecting/refreshing never probes a printer.
Manual requests do not jump ahead of already queued work. This coordinates
application-owned operations; third-party programs that send directly to the
printer remain outside this application's control.

The supervisor launches one isolated child/process group per job. Resolution and
preparation have a 60-second deadline; the renderer and all descendants are killed
and reaped before recovery. Heartbeat database operations run separately from the
deadline loop. The transport phase has a separate finite 2,400-second safety cap
for up to 100 sequential items and bounded ledger operations. It does not retry.
Each container has a 128 MiB aggregate cgroup memory ceiling with swap disabled;
the worker checks cgroup v2 enforcement before taking jobs. This bounds supervisor,
execution child and native renderer together. Windows and unfenced Linux execution
are rejected. If the shared engine cannot run within this budget, leave the gate
BLOCKED; do not silently increase memory or declare the old resource gap closed.

Container health checks read a small private tmpfs marker published by the PID-1
supervisor only after its database heartbeat commits. Identity and monotonic age
must match, with a 20-second freshness limit. A failed database heartbeat does not
refresh the marker. The probe imports only the standard library; loading another
application/driver stack during rendering can exceed the same 128 MiB budget.
Database heartbeat rows remain the operational view's authoritative source.

The existing binder/raster/IPL pipeline, immutable per-request template pins,
all-item preparation before sending, committed per-item claims and one-attempt
transport remain authoritative. Simulation uses the same output engine but never
constructs printer transport. Before claims, print revalidates the original
credential, policy revision, source permissions and target. Copies remain 1..999.

Heartbeat loss does not transfer ownership. An exited child is killed/reaped by
its supervisor before quiesced recovery. If an entire container or supervisor
dies, the request stays PROCESSING and its printer stays owned until an approved
offline recovery confirms all old owners stopped. Never run a second instance
over an unverified old owner, and never use a lease timeout as proof of death.

Before-send recovery fails work without sending. A durable claim or uncertain
submission is retained conservatively as UNCERTAIN; later items are skipped.
Terminal results are read from the ledger and the encrypted queue body is erased.
Queued work that has not started expires after 24 hours; the worker housekeeping
path erases its payload even while processing is paused. Status/admission reject
stale queued work even before housekeeping catches up. Outages can delay physical
erasure and must be monitored. Its payload is erased
and its identity cannot be reused. Print metadata retention remains 90 days;
simulation responses retain the existing 24-hour boundary and permanent HMAC
tombstones remain. Explicit retention removes the queue row and its public request
metadata after the ledger retention boundary; GET then returns unknown/404 while
POST still rejects the permanent identity. Runtime identities cannot perform this
privileged deletion. Retention is an explicit operation, not startup cleanup.

## Encryption and operator actions

`TLS_QUEUE_KEYS_JSON` maps a version to a `TLS_QUEUE_KEY_*` secret environment
reference. Each key is 32 cryptographically random bytes encoded as unpadded
base64url. AES-256-GCM uses a fresh nonce and ledger ID as authenticated context.
Keys never reside in queue tables and are separate from retained HMAC identity
keys. Retain old decryption versions while pending work/backups still depend on
them. Missing/corrupt keys fail work without constructing transport. Protect the
runtime files and retain a separately encrypted off-server recovery copy.

The `/sap-requests` page shows recent request status, target, timestamps, item
outcomes, worker health, queue age, storage checks and held destinations. Refresh
is explicit. Account role and CSRF admission protect all operator writes.
Operator/Designer/Admin can record physical checks. Only Admin can release a hold
with a nonblank resolution note after a physical check. These actions are audited
and send no printer bytes. There is no Retry/Reprint button.

Uncertain queue jobs release only after the execution child has stopped and the
supervisor records terminal completion. Manual transport failures also retain
a shared printer hold, available in the Held printers section. A stale owner
without a completed hold requires offline investigation; do not unlock it merely
because a worker no longer reports a heartbeat.

GET `/api/v1/sap-requests/operations` checks the database, a bounded read-only
MinIO bucket request, both expected worker heartbeats, queue depth/oldest age,
stalled work and uncertain holds. These are separate from `/health` and `/ready`.
The worker healthcheck reads only its own heartbeat. Missing/unhealthy workers,
stalled work or holds require operator attention; no monitoring action sends.

Lifecycle utilities are plan-only unless `--apply` and the exact database host
and name are confirmed. Run from the application root with `PYTHONPATH=backend`:

```text
python -B scripts/queue_operations.py status
python -B scripts/queue_operations.py pause
python -B scripts/queue_operations.py resume
python -B scripts/queue_operations.py recover --job-id <UUID>
python -B scripts/queue_operations.py expire --job-id <UUID>
```

Applied mutations require a nonblank `--note`. Applied recovery and restore-pause
also require `--owners-stopped`, after stopping both worker containers and every
other application printer owner. Resume only after reconciliation. No utility
automatically provisions a schema, generates a key or retries a physical send.

## Backup and isolated restore drill

Agree an off-server destination, retention, acceptable data loss and maximum
recovery time with the operational owner. These remain required unset gates.
The supplied first implementation uses an approved maintenance window: pause
intake, finish/resolve active work, stop workers and prevent all template,
configuration, account and dataset writers. `--quiesced` is an explicit operator
assertion, not a programmatic claim that the application has stopped writers.

`scripts/production_backup.py create` is plan-only by default. Applied operation
requires named PostgreSQL host/database and MinIO endpoint/bucket confirmations,
an absolute pg_dump executable, a private existing output root, at least one
`--configuration-file`, and a separate 32-byte binary `--backup-key-file`.
Include app/worker configuration, all referenced HMAC/encryption versions and the
certificate recovery material in the approved configuration sources. Do not put
the backup encryption key beside its encrypted bundle. Use Linux private file
permissions and protect the off-server destination. Output/extraction roots must
remain outside source repositories. Run applied utilities on an approved
maintenance host with the application Python dependencies and PostgreSQL client
tools compatible with the server; the application image does not install those
client executables automatically.

The utility reads a custom-format PostgreSQL dump and all immutable MinIO objects,
builds a SHA-256 inventory, encrypts the bundle with AES-GCM, authenticates and
verifies the actual written bundle, then publishes its unique `.tlsbackup` name
atomically. Raw files exist only inside a private generated staging directory
and are cleaned after the operation. No database/object-store write or printer
connection is performed by backup. An interrupted final copy must not be treated
as a verified backup. Capacity, duration and off-server delivery require testing.

`verify` authenticates/decrypts in private scratch and checks all hashes; it proves
integrity only. `extract` writes a new generated `restore_<UUID>` folder and rejects
absolute/traversal/duplicate/symlink archive entries. It does not connect to storage.

`scripts/production_restore.py` is also plan-only. Applied operation requires an
explicit isolated PostgreSQL host/MinIO endpoint, `--isolated`, the verified
extracted directory and an absolute pg_restore executable. It creates a new
`tls_restore_<UUID>` database and `tls-restore-<UUID>` bucket, restores the dump
transactionally, restores objects using the encrypted manifest's original keys,
and forces the restored queue paused. It never reuses/deletes an existing target,
starts a worker, configures a printer or claims application acceptance. Preserve
scratch targets for inspection and separately authorize cleanup later.

Keep printer egress blocked during the entire drill. Verify layout reads, object
checksums, accounts, policy, encrypted payload access and terminal ledger history
against the isolated targets. Reconcile accepted SAP requests with the restored
ledger, especially the interval after the backup. Missing identities from that
interval must not be interpreted as proof that printing never occurred. Do not
start restored workers until reconciliation and authorization are complete.

## Acceptance and rollout

1. Source/fake: full source gate, queue transaction/identity/fault cases,
   simulation/output parity, role/CSRF checks and built-assets browser scenarios.
2. Named PostgreSQL: apply additive schema after backup; prove true concurrent
   SKIP LOCKED/FIFO/alias behavior, lost commits, database disconnects and restart.
3. Named Ubuntu containers with fake receivers: prove cgroup memory/OOM, blocked
   storage cancellation, process-group cleanup, both heartbeats and shutdown.
   Use 20 concurrent requests across two fake targets and record queue wait,
   throughput, peak memory and database connections. SQLite tests are not this gate.
4. Quality: fresh coverage and Sonar analysis for the exact candidate fingerprint.
   An old project gate status is not current acceptance.
5. HTTPS/SAP sandbox: certificate trust, source credentials, polling, identical
   retry and changed-body conflict; simulate first without printer effects.
6. Backup/restore: execute the isolated drill, measure loss/recovery objectives,
   and retain evidence outside Git.
7. Physical printer: approve exact target/count/slot; check quantity, dimensions,
   barcode readability and uncertainty handling before production activation.

Source implementation alone does not close historical T06/T07/T10/T11 acceptance.
Retain their statuses until the corresponding evidence is current. T12 remains
optional for general software acceptance; the named device gate is required for
this requested production-printing rollout. `SUBMITTED` always has
`confirmed=false` and never claims physical completion.
