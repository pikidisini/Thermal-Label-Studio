# T08 ledger setup and retention boundaries

Source implementation only. No schema, connection, initialization, recovery or cleanup operation was applied to an operational target during T08.

## Storage and connection contract

`backend/schema/002_label_intake.sql` is a reviewable fresh PostgreSQL schema. It intentionally fails if names already exist; inspect/plan drift before any authorized migration. Existing `001_jobs.sql`, job state and layout/dataset schema are unchanged. Never use jobs as an external-print receipt.

`PostgresLedger(connection_factory, LedgerKeys(active_version, retained_keys))` consumes a fresh dedicated idle non-autocommit DB-API connection per operation. The factory must return a usable connection, never a shared request/session transaction. Connections are committed/rolled back and discarded on every path; a lost commit acknowledgment is an unavailable outcome, never eligibility to send. Drivers and connections are not created on import. The app currently neither constructs this ledger nor runs the schema.

The HTTP dependency reads `app.state.intake_ledger`; an absent/unavailable ledger returns 503 ledger_unavailable after trusted admission, before new template reads/preparation. There is no in-memory fallback. Default authentication still denies external intake until T09. Installing a ledger does not grant admission. Studio output and Data Tokens are unaffected.

For an explicitly authorized named T11 setup, review the SQL, backup/rollback requirements, dedicated application role, protected-result access, HMAC key provisioning and maintenance role before applying it. Inject the reviewed ledger instance into the standard app's state through the eventual authorized lifecycle composition. T08 adds no separate launcher, runtime toggle or automatic migration.

## Identity and keys

Sender is the stable server-authenticated namespace, verified against the asserted sender.system; it is never obtained from body trust alone. Admission/replay always follows the current authorization dependency. T09 must enforce current per-label/source policy before returning any retained response.

Keys are server-provisioned random secrets of at least 32 bytes; never payload values or committed credentials. Key version IDs are immutable. Canonical bytes use UTF-16 object-key ordering, compact UTF-8 strings and T04 ECMAScript binary64 spelling. Mode/data/copies/descriptions/ordered items are included; optional empty descriptions are normalized through the canonical model. Integral copies 1/1.0/1e0 and zero/-0 are semantically equivalent. Identity and payload use domain-separated HMACs. External request IDs and raw business values are not stored as plain ledger identity.

The permanent key_versions registry stores a keyed verifier, never secret material. Missing old keys or changing a secret under an existing version denies all ledger use rather than making old request IDs reusable. Rotation adds a new version while retaining every prior registry/tombstone key. Coordinate configuration across instances before new admissions; a stale instance fails closed if it cannot verify the new version.

## Transactions and result protection

The permanent capacity row is locked for atomic admission. It serializes quota checking and identity matching across retained key versions before new identity/pins/items are inserted. Unique constraints are additional protection. At one million permanent identities, new admission denies with ledger_unavailable; terminal replays are still possible. Never delete tombstones or decrement capacity to permit resends. Monitor capacity well before exhaustion.

All template resolution/pinning occurs before the admission commit; all binding/raster work occurs after it. Concurrent duplicate resolvers may do read-only resolution, but only one committed owner may prepare. Process-slot saturation can return 429 before JSON/identity admission; once the ledger is reached, a duplicate active identity returns 409 request_in_progress and a changed digest returns 409 request_conflict. Identical terminal replay returns stored outcomes without resolving active templates or invoking the renderer.

A prepared record includes payload digest/byte count and copies. Print admission additionally pins server target ID/policy revision; claim must match these pins, follow earlier submitted items and commit SEND_CLAIMED before socket construction. The claim API does not authorize a sender or create a transport. T09/T10 must revalidate policy immediately before each claim. No raw IPL or print PNG is stored. UNCERTAIN stops subsequent claim eligibility.

Protected simulation_results stores bounded response JSON/PNG for 24 hours from admission; print terminal metadata is retained for 90 days. Ordinary request/item metadata contains no raw data, authored SVG, credential or PNG. PUBLIC privileges are revoked in the proposed schema. Authorized deployment must grant only required schema/table privileges to dedicated roles, protect backups/results and configure transport/storage security. Source revocation tests and SQL REVOKE statements do not prove deployed access controls.

Retained outcomes are validated before disclosure; corrupt/missing result storage denies with ledger_unavailable without recomputation. Replay uses current trace_id, original admission trace_id and original pins, with replayed=true.

## Recovery and cleanup

`recover_quiesced(ledger_id)` is a source-level maintenance API, not a user-facing retry endpoint and not an automatic startup loop. Invoke only after all owners for that identity are proven stopped across instances. It takes an exclusive row lock, preserves pins, never binds/renders/sends, marks possible claims UNCERTAIN and later work SKIPPED. A received/prepared pre-claim crash becomes FAILED/SKIPPED. An unacknowledged SUBMITTED state in an unfinished batch is conservatively UNCERTAIN. Terminal batches remain unchanged.

`expire(ledger_id)` requires retention to have elapsed and refuses unresolved RECEIVED batches, preserving possible-send evidence until explicit recovery. Cleanup deletes protected results and item details, clears terminal response metadata and keeps the permanent keyed identity/digest/version/timestamps/outcome tombstone. Lookup already denies expired identities even before cleanup runs. Never re-create an expired identity or silently rerender its response.

Recovery and cleanup schedules/grants, migrations, real concurrent sessions and real process-restart behavior remain authorized T11 work. No cleanup, reconciliation or recovery against operational storage was executed here.

## Disposable validation

`backend/tests/intake_ledger_fake.py` runs the repository's SQL through a disposable SQLite transaction adapter. BEGIN IMMEDIATE simulates PostgreSQL locking; syntax/schema adaptation is explicit. Each test receives a unique project .tmp child. Tests reproduce rollback, post-commit acknowledgment loss, duplicate concurrency, key rotation, expiry and repository reinstantiation. This is transactional fake evidence, not PostgreSQL dialect/permissions/process-restart acceptance. T11 must test those on the named authorized PostgreSQL target.

T07 hard deadline/native-memory requirements remain NEEDS_REPLAN and T06 current-app browser remains BLOCKED. T08 source completion does not alter these gates. Physical print is not enabled by this work.
