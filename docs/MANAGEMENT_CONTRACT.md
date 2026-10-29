# Application Management

## Operational Activity Log

`/management?section=activity` is separate from configuration Audit Log. It reads
`GET /api/v1/management/activity` under the existing loopback/cross-site guard.
The response is `{enabled: boolean, entries: [...]}` with the latest 200 completed
request records ordered by database sequence descending. Search matches trace,
external request, original trace, authenticated source and label code; mode,
request status and local date/time filters apply to that loaded window only.
Details expose safe request/item metadata and chronological stage timestamps
with elapsed milliseconds. Refresh explicitly reloads; no polling or mutations.

The Activity Log table separates origin (Studio, Label Print, API Intake) from
authenticated sender (`source`, or an em dash when absent). Target printer shows
distinct recorded item/request target IDs, falling back to a recorded Studio
host:port; it never resolves historical records against current configuration.
Batch count counts `SUBMITTED` items once each, independent of copies, with a
recorded summary count fallback when items are absent. Non-print and replay
requests show zero new submitted batches; print records without count evidence
show an em dash. This count does not confirm physical printing or identify
distinct SAP batch values, which are not retained in activity history.

## Log inspection UI

Audit and Activity use a side detail panel that slides in from right to left
(shared motion tokens, disabled for reduced motion), and slides back out to the
right before unmounting on Close or Escape. Reduced/zero motion closes without
an animation delay.
The global `frontend/src/index.css` tokens `--ui-panel-slide-duration: 300ms`
and `--ui-panel-slide-easing: ease-in-out` control both directions, independently
of the 120ms small-control transition. These are source settings, not preferences.
Clicking a row or pressing
Enter/Space opens or switches details without a separate Details button.
Copy controls do not trigger row selection. The panel has a fixed header, independent
scroll, selected-row feedback, Escape/Close and return focus to the invoking
control without scrolling the list. The panel fills narrow screens. Compact
tables have sticky headers and local pagination (25/50 rows). Timestamp cells
separate date/time in the browser's declared time zone; durations use seconds
above 1000 ms and retain exact milliseconds in a tooltip. IDs can be copied;
technical JSON is initially collapsed. No polling or operational action is added.

Audit search covers object/action/actor/note and supports object type, exact
action and local date/time filters. Details show event identity, revision and
changed fields before/after, distinguishing absent values from JSON null/empty.
Unchanged fields remain available in full JSON. Technical action codes and the
development unauthenticated actor attribution remain visible.

Activity adds source, mode, status and local date/time filters, request/item
outcomes, per-item metadata and events grouped by item or stage. Elapsed event
time remains cumulative since request start. COMPLETED refers to processing;
SUBMITTED remains unconfirmed transport handoff. Recording disabled, unavailable
storage, no records and no matching records have distinct states.

Filters, page and page size are bookmarkable using `audit_*` / `activity_*`
query parameters and survive section navigation/refresh. Reset clears only the
current log filters. Filtering and pagination never extend the latest-200 loaded
window; result counts describe loaded records only. Full-history search/export
and historical reconstruction are outside the API contract.

`TLS_ACTIVITY_ENABLED=false` is the default. Recording requires existing Studio
PostgreSQL configuration and separately provisioned `backend/schema/004_activity_log.sql`.
`app_management.activity_log` has an identity sequence and bounded JSONB event.
Normal startup never creates it. `scripts/provision_activity.py` is PLAN ONLY
without `--apply`; applying requires named-target authorization and matching
`--confirm-host` / `--confirm-database` with explicitly configured `TLS_DATABASE_URL`.
Provisioning preserves existing records/configuration and never seeds management
policy. Grant only schema USAGE, table SELECT/INSERT and sequence USAGE/SELECT to
the runtime role. No audit changes, deletion, retention job or export is added.

Recording covers POST label-intake, editor-preview and printing/editor, including
admission/validation failures before handlers. A request-local collector keeps
at most 1024 stage entries and the stored record is capped at 256 KiB. It records
server-generated trace UUID, UTC time, duration, HTTP status, outcome, allowlisted
error codes, binding/raster/preparation stages and, for authenticated intake,
source identity, external request ID, policy revision, replay/original trace,
safe per-item label code, copies, version/checksum and outcome. Studio preview
and explicit simulation share the endpoint but use the bounded `purpose` field
(`preview` default or `simulation`) to identify the action. This field grants no
capability and does not change rendered output. Print outcome includes target,
copies and `confirmed: false`; SUBMITTED never asserts physical printing.
Response/commit uncertainty stays UNCERTAIN. Rejected unauthenticated sources
are not trusted or attributed to their asserted sender identity.

No request body, SAP business values, item business identifiers, SVG, PNG/base64,
IPL bytes, bearer tokens, key digests/ciphertext, headers or private exception text
enter history. Raw outcome images are never buffered by the recorder. The intake
ledger remains the authority for durable claim/replay; history is a separate
observational write after request execution, not an atomic ledger transaction.
Disabled recording produces no database connection. Configured write failures
emit a bounded `activity_write_failed` server diagnostic without changing an
already returned result or retrying printing. Reads fail with 503
`activity_unavailable` on unavailable storage. This best-effort history can have
gaps on process termination/storage failures and is not a durable delivery audit.
Activity failures remain local to the Activity Log page and do not disable
configuration editing. No actual SAP/printer/database acceptance is implied.

Management source checkpoint: 2026-10-13. The previous account deferral is
superseded by the 2026-10-21 local-account implementation in AUTH_CONTRACT.md.
Users management and configuration/log access require Admin; Designer receives
only template identity revision metadata plus permitted design resources.

## Navigation and page

Studio Utilities -> Application Management opens `/management`. The page has
Overview, Templates, Graphics / Images, Printers, Integrations, Audit Log,
Activity Log and Test Data. The selected
section is bookmarkable using `?section=templates`, `printers`, `integrations`,
`audit`, `activity`, `graphics`, `datasets` or `overview`. Back to Studio uses the existing `/studio` entry and its
existing draft recovery. The shared Preference control, language dictionary,
semantic CSS tokens and custom palette apply to management chrome.
The compact toggle inside the sidebar collapses its labels into a 52px icon rail
or expands the labels again. Menu icons remain usable and have accessible names
and tooltips. Width and label transitions use shared motion tokens and respect
reduced motion. This page-local state preserves the selected section and template
preview, and resets on reload. Narrow screens retain a wrapping horizontal menu.

Overview uses actual stored-template counts and policy configuration. `/health` indicates
application reachability; successful layout listing indicates metadata access.
Neither asserts MinIO artifact reads, successful rasterization, operational intake
readiness or printer readiness. MinIO artifact reads stay Not checked in Overview.
No synthetic dashboard data is shipped in application code.

Overview presents three compact count cards above paired service-status and
recent-change panels. Below 1100px the panels stack; below 640px the cards stack.
Count placeholders and neutral checking badges distinguish loading from results.
Failed count sources show unavailable rather than zero; audit read failures
remain distinct from an empty history. Only the latest three loaded audit events
are shown, with original action/object identifiers and browser-local timestamps.
Status tones are specific to Overview and add no service or device checks.

## Persistence and activation

`TLS_MANAGEMENT_ENABLED=false` is the default. The page reads the validated
environment intake policy and stored layout summaries; mutation actions are
unavailable. It does not write browser-local operational configuration or invent
an in-memory management store. Missing/invalid policy displays no grants.

`TLS_MANAGEMENT_ENABLED=true` selects the Studio PostgreSQL management snapshot
as the intake policy authority. It requires the existing complete Studio storage
configuration plus **separately provisioned** `backend/schema/003_management.sql`
and one seeded `management_state` Document. Normal startup and HTTP handlers never
apply this migration or seed a document. Managed storage failure denies intake;
the service does not fall back to an older environment policy.

Management tables live in `app_management.management_state` and
`app_management.management_audit`, including the audit identity sequence and
associated indexes. Template metadata/versions remain in `label_studio`; cross-schema
template changes and management audit still commit on one database connection.
Access-key ciphertext, hashes, policy revision and all audit records are retained.

This local development project provisions management tables directly in
`app_management`; no upgrade path from a previous schema is maintained.
If provisioning uses a separate owner from the runtime role, explicitly grant
that role USAGE on `app_management` and the required table/sequence privileges.

`scripts/provision_management.py` is PLAN ONLY without `--apply`. After explicit
named-target authorization, it can apply the schema and import the existing
validated environment policy with:

```powershell
python -B scripts/provision_management.py --apply --confirm-host <authorized-host> --confirm-database <authorized-database>
```

Provisioning applies `003_management.sql` directly in `app_management`.
It resolves the DSN from explicitly supplied `TLS_DATABASE_URL`, without printing
it or loading .env. If `TLS_INTAKE_POLICY_JSON` is absent, the initial policy is
empty/default-denied. Invalid supplied policy fails. Repeated provisioning preserves
the existing snapshot using ON CONFLICT DO NOTHING. Enable management only after
checking the imported sources, targets and audit history. Legacy credential
environment references remain usable until explicitly migrated, replaced or revoked.
Compose and dev forwarding include the opt-in flag; startup generates no keys.

The runtime management endpoints require a loopback client and reject cross-site
browser requests. Origin, when present, must identify a loopback/localhost origin.
This guard is not authentication. A container's bridge peer is not loopback;
packaged management proxy/access design remains a separate acceptance task.

## APIs

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/v1/management/snapshot` | Writable flag, policy origin and document |
| GET | `/api/v1/management/audit` | Latest 200 immutable audit entries, newest first |
| PUT | `/api/v1/management/printers` | Upsert validated numeric IPL TCP target |
| PUT | `/api/v1/management/sources` | Upsert settings; `create_key: true` atomically creates a new identity and access key |
| POST | `/api/v1/management/sources/{identity}/key` | Revision-checked create, rotate, revoke, migrate or explicit reveal |
| POST | `/api/v1/management/templates/{label_code}` | Update name/code or soft-delete; exact active version/checksum and policy revision required |
| GET | `/api/v1/layouts/{label_code}/versions` | List historical version metadata |
| GET | /api/v1/layouts/{label_code}?version=N | Read exact checksum-verified historical SVG |

All mutations require the current policy `revision`. Change reason is not required or shown in the UI. The optional legacy `note` member defaults to an empty string and remains bounded to 500 characters. Commands reject unknown members and duplicate JSON members. HTTP
commands are bounded to 256 KiB; persisted document is capped at 2 MiB. Existing
policy registry limits remain in effect. PostgreSQL SELECT FOR UPDATE plus revision
comparison prevents stale updates. State and audit commit in the same transaction.
Connection/statement/lock timeouts are bounded. Commit acknowledgement failure is
not retried automatically. Input validation errors (400/422) retain the editable form so the user can correct and submit again. Conflicts, unavailable storage and ambiguous network/commit failures disable subsequent mutations until explicit refresh.

Each mutation generates a fresh revision, retains the complete intake approval
audit prefix, and records before/after state, object, time and
`DEVELOPMENT_UNAUTHENTICATED`. No caller-provided actor can impersonate a user.
Audit mutation/deletion APIs do not exist. Provision runtime database grants with
no UPDATE/DELETE permission on audit records; the source artifact does not establish
that operational permissions have been applied.

## Templates and print policy

The Templates page replaces the review workflow. Review submission/decision HTTP
routes and UI controls are retired. Existing review records and intake approval
evidence remain intact as historical records. API/intake print uses the enabled
authenticated source, print mode, configured
`print_target_id` and `print_max_copies` (1..999). Historical approval events do not
authorize or reject printing. Resolved immutable version/checksum and policy revision
are pinned and rechecked before each durable claim. Manual Studio Print remains its
separate workflow.

Name and label code are editable identity fields. Template updates lock the active
version and reject stale names/checksums/versions/revisions or a code belonging to
another active template or a deleted template with retained versions. Renaming a
code copies every version to `layouts/{new_code}/v{version}/layout.svg`, verifies
its SHA-256 and updates its database reference without changing SVG bytes or
version numbers. Configured source permissions update in the same transaction.
External callers must use the new code. After a successful rename, the old code
is available for another template, including a rename back to the original code.
An external request using a reassigned code resolves its current template.
Empty reservations left by earlier renames are released transactionally when that
code is selected for rename or Save; no bulk cleanup or schema migration is needed.
The code lock, revision check, source-reference update and audit remain atomic.
Version records, SVG bytes/checksums and historical audit events are preserved.
The audit records each source/destination object key. A metadata update with the
same code also normalizes paths left by earlier renames. Destination objects are
never overwritten; only identical unreferenced copies from an interrupted action
can be reused. Conflicting bytes or another version's reference reject the update.
After an acknowledged database/audit commit, cleanup locks both prefixes,
rechecks references and both checksums, then removes unused source objects.
Readers hold the code lock until their SVG download completes. Copy/commit failures
or ambiguous acknowledgements retain original objects; no automatic retry or
rollback deletion occurs. Cleanup failure leaves extra copies and emits a bounded
server warning while the committed new references remain valid. Object-key
allocation on a subsequent Save still skips any retained objects.

Deletion removes the template and its versions from application listing/resolution
through a tombstone; it does not destroy version files. The UI asks the user to type
the exact label code and shows the name and version count. Name/code updates and
deletion commit together with the managed snapshot and before/after audit evidence.
Studio Explorer rename/delete call the same management command and carry the selected version, checksum and previous title. Retired direct layouts PATCH/DELETE routes return 410 template_management_required without storage mutation. All operations use the same PostgreSQL target, and failed audit insertion rolls back
layout and source changes. No mutations are retried after an ambiguous acknowledgement.

Version history lists the original names, creation dates and versions. Selection
reads the requested historical SVG with the existing checksum and safety checks.
Open in Studio passes the selected template/version to the existing import flow;
subsequent saving creates a new version. Metadata editing always checks the current
active version, even when the user is previewing a historical one. Active-version
selection and template duplication remain follow-up features.

Stored templates occupy the left column and template details the right
column on desktop, with a narrower list and a wider detail panel. At widths of 900 px or less, the panels stack with the list
first and preview below. The empty right panel prompts selection; its position
remains stable when details open or close. The isolated
preview has compact zoom controls, pointer drag, wheel zoom anchored at the
pointer, keyboard pan/zoom and Fit to view. Fit preserves the label aspect ratio
and recenters the complete image; viewport resizing and changing the selected
artifact reset fit. Metadata and management controls sit below the preview. Stored
templates use native selectable buttons with name, code, active version,
dimensions and DPI in their own scrolling container, with
search outside its scrolling body. Preview transformations never modify stored
SVG, label dimensions, retained history or print output.

The stored-template scrolling body is 600 px tall. Clicking a template button,
or pressing Enter/Space on a focused button, selects its template and brings the
preview without programmatically scrolling or moving focus to it. Selection
preserves the page and list scroll positions on desktop and stacked narrow layouts.
The detail header displays its current identity and
marks the selected artifact Latest or Historical. Version selection and Open in
Studio sit above the preview; identity editing remains below and always modifies
the active template even while inspecting a historical artifact. Changing versions
does not discard unsaved identity edits. Artifact details collapse the selected
version, version count and full checksum. The footer shows dirty state, Cancel,
Save changes and an icon-only Delete template control with an accessible label;
deletion still requires typed label-code confirmation.
Selection is disabled while a management mutation is in progress.

Integrations does not restrict templates for either simulation or print. Simulation templates, Allowed templates and their table columns are removed. Authenticated enabled sources may use every valid stored template for their allowed modes. Legacy label_codes and simulation_all_label_codes remain readable in old snapshots but no longer affect admission, print preflight or replay access. A print-capable source must choose an existing destination and its maximum copies. Enabling a print source requires an enabled destination. Missing routing denies print until explicitly configured; no route is inferred from historical approvals.

Printers are registered server targets used by assigned integration sources.
The page presents a searchable, configuration-filtered list beside its configuration
panel; the panels stack at 1050 px or less. Assigned sources are derived from the loaded
policy's print_target_id references. New destinations default to Disabled and TCP
port 9100; existing IDs cannot be edited. The form indicates unsaved changes and
only enables Save for a changed or new destination. Communication method and print
format use dropdowns with TCP/RAW and IPL as the implemented values. USB (planned),
Ethernet (planned) and ZPL (planned) are native-disabled options. These selectors
add no wire members: mutations retain the existing numeric IPL TCP target contract.
Opening, filtering and editing do not probe or print.

Studio's per-action Print
dialog remains its existing separate workflow; this slice does not enforce a new
printer selector or copies policy on manual Studio Print. Printer connection
probes/test print, identity roles, operator permissions, recovery/reprint,
retention, export and backup/restore remain follow-up work. Access key lifecycle
is implemented below.

## Access keys

Integrations presents a compact source list and an adjacent source detail panel.
Search, configuration and allowed-mode filters live in the source list header
and combine locally over the loaded snapshot. Selecting a source uses a native
button with keyboard support, a neutral surface and a global primary accent edge.
At viewport widths of 1050 px or less, details stack below the list. General
settings and conditional print permissions remain visible. The Access key
button in the key summary expands or collapses an inline region underneath,
using aria-expanded/aria-controls and native keyboard activation. Collapsing
the region unmounts displayed keys, aborts pending reveal requests and clears
pending key confirmation without discarding unsaved source settings.
Show/Hide, Copy, Replace and Revoke key use one horizontal row of shared icon
buttons with translated accessible labels and tooltips. Available legacy
migration and key creation use the same shared controls. No icon initiates a
request until deliberately activated; existing confirmation rules remain.
The settings footer compares form values to the loaded source and indicates
unsaved changes without persisting a separate draft or transmitting requests.
Enabled describes configuration permission, not live sender connectivity.
Filtering the selected source out, switching sources, closing or cancelling
details, and Escape clear displayed key values. Issued keys remain available
after the successful mutation refresh closes the source form, until dismissed
or the existing navigation/page lifecycle clears them. Filters also dismiss an
issued key. These presentation changes add no backend or storage operations.

Integrations displays Access key status and provides Create key, Replace key,
Revoke key, Show/Hide key, Copy key and, for a valid legacy credential, Manage
previous key. Add source uses `create_key: true` to save a new identity and its
key in one transaction, with one audit event. Enabled may be chosen immediately.
A duplicate identity is rejected rather than replacing another source's key.
The ordinary settings API also supports Disabled drafts without a credential.
Enabling a
source requires a valid unique key and, for print mode, an enabled destination.
Disabling a source does not require a working credential or destination.

For example, the key command body is `{ "revision": "<current revision>",
"action": "create" }`. Other actions are `rotate`, `revoke`, `migrate` and `reveal`.
Key commands accept no caller-selected secret, hash or reason.
Source settings commands cannot replace managed key state. Key mutations use the
existing `management_state` JSONB document and transaction, so no additional SQL
table or startup migration is needed. Older snapshots remain readable.

Create/rotate generate 32 random bytes with `secrets.token_urlsafe(32)` on the
server. SHA-256, AES-256-GCM ciphertext, key ID, state and timezone-aware lifecycle
timestamps are persisted. A random 12-byte nonce is used for each encryption;
associated data binds the version, source identity and key ID. A decrypted value
must also match its stored hash. High entropy generated keys are credentials, not human passwords.
The API returns `{ document, source, key }` after acknowledged state/audit commit,
with `Cache-Control: no-store`. `key` is the raw new value only on create/rotate;
migration/revocation return null. Explicit `reveal` returns the current key after
checking loopback admission, the current revision and active recoverable state.
Reveal is a read: it does not increment revision, interrupt prepared sends or
create a configuration-change audit event. All ordinary management responses
exclude ciphertext and digests. Audit records contain status/ID/timestamps,
recovery availability and source settings, never raw keys, ciphertext or digests.

The UI keeps displayed values only in React memory, offers deliberate show/copy and
clears it on Close, Escape, acknowledgement, Refresh, navigation or page unload.
It does not use URL parameters, localStorage or sessionStorage for credentials.
Copy writes to the user's clipboard on their explicit action. If a response is
lost after commit, no automatic retry occurs: refresh, inspect current status,
then open Details and explicitly show/copy the committed key. Unsaved source settings
are discarded by a successful key mutation; its confirmation explains this.

Keys have no automatic expiry in this slice. Replacement invalidates the old key
immediately on subsequent admission; revocation clears its digest and ciphertext and prevents
environment fallback. No grace period or second active key is installed. A send
already delivered cannot be cancelled; prepared print sends recheck credentials
and policy revision before durable claim. Replay still requires current source,
mode and credential admission; durable ledger identity and HMAC remain unchanged.

Manage previous key hashes and encrypts the existing validated process credential inside the
revision-checked transaction, removes its environment reference from the source,
and leaves the sender's existing raw key usable. It does not reveal or generate a
new key in the migration response; subsequent explicit reveal can retrieve it.
After migration the environment variable is no longer consulted for that
source, even after revocation. Remove its old secret configuration separately when
no longer needed. An absent/malformed credential affects that source only; healthy
sources continue to authenticate. Ambiguous duplicate credentials are denied.

`TLS_MANAGEMENT_KEY_ENCRYPTION` must be the base64url encoding of 32 random bytes.
It is configured outside PostgreSQL, forwarded by Compose/dev, and never generated
as a transient startup fallback. The authorized local development configuration
keeps it in ignored root `.env`. Preserve it securely with database backups:
changing/losing it prevents recovery of existing ciphertext. Missing/invalid
configuration blocks new encryption and reveal without changing stored state.
Wrong master, damaged ciphertext or a mismatched identity/key/hash fail recovery
with bounded errors. Sender authentication still uses the independent hash.
Existing hash-only records remain usable but cannot be recovered; replace once
deliberately to enable show/copy. No old source key is automatically rotated.

The sending application supplies `Authorization: Bearer <access key>` on
`POST /api/v1/label-intake` and its matching source identity in `sender.system`.
Configure the new key in the sending HTTP client; changing it in this application
does not change SAP automatically. Actual SAP setup and HTTPS/network deployment
remain separately scoped. This server-side source credential is independent of
browser account login/roles. Management now requires authenticated role/CSRF
admission; named-target HTTPS LAN deployment acceptance remains separate.

## Evidence boundary

### Feature ownership

Frontend and backend both separate `overview`, `templates`, `printers`,
`integrations` and `audit`. Feature sections and editing forms own their UI;
feature HTTP routers, command models and services own their backend behavior.
Shared page lifecycle remains in `hooks/useManagement.ts`, while backend
`store.py` owns the single transaction for revision-checked configuration and
append-only audit. `access.py` and `middleware.py` apply shared admission to all
management commands. `router.py` only composes the feature routers.

The shared document references the dependency-light `templates/records.py`;
template commands depend on the shared command model without a circular import.
Intake uses the package public configured-store/error boundary, not management
HTTP modules. Schema, wire payloads and policy semantics are unchanged by this
directory refactor. See [architecture](ARCHITECTURE.md) for module boundaries.

Source tests use synthetic policies and a transactionally isolated fake database.
Browser checks intercept every API and use current-checkout compiled assets. These
checks do not establish operational PostgreSQL migration/permissions, actual sender,
printer acceptance, packaged runtime or login readiness. Operational activation is
a separate, explicitly authorized step from source development.

### Local activation checkpoint — 2026-10-12

After explicit user authorization, schema `003_management.sql` was applied to
`127.0.0.1:5434/thermal_label_studio` and the existing local simulation policy was
imported. Ignored root `.env` now enables `TLS_MANAGEMENT_ENABLED=true`. The trusted
`scripts/start-intake-simulation.ps1` launcher loads the existing ignored simulation
and ledger configuration; credentials remain server-side.

Live checks passed for writable management, an unchanged-source save with an audit
record, stale-revision rejection (409), fresh PostgreSQL reads matching the API,
and persistence of the saved revision/audit after development-server restart.
The Vite management API proxy and layouts API also passed. Existing non-management
table row counts matched the baseline recorded after provisioning.

The imported policy has one simulation-only source, zero printer targets and zero
print approval events. Verification retained one `source.upsert` audit event with
identical before/after source permissions. No intake request, SAP call or printer
delivery was performed. Approval execution, runtime database grant hardening,
packaged deployment and login remain outside this checkpoint.

Disposable evidence: `.tmp/management-activation-1aeb59a1a4de4055b140ad24096b9dea/report.json`.


### Integration source deletion

`DELETE /api/v1/management/sources/{identity}` accepts the current revision and
an optional note. The Integrations details offer Delete source with typed identity
confirmation. Deletion removes the source from public lists, disables it and
clears managed and environment credential references in the same snapshot/audit
transaction (`source.delete`). A deleted identity remains as a private tombstone
for historical references and cannot be reused or modified through source/key
commands. Audit and intake history remain intact; printers and templates are
unaffected. Old credentials no longer authenticate, and pending print claims must
still pass current-policy revalidation. No automatic retry or device send occurs.


### Printer deletion

`DELETE /api/v1/management/printers/{target_id}` requires the current revision
and accepts an optional note. Printer details offer Delete printer with typed ID
confirmation. Any non-deleted integration referencing the destination, including
a disabled source, blocks deletion with 422 `printer_in_use`. Reassign or clear
those destinations first. Removal and `printer.delete` audit commit atomically;
existing audit/intake history and templates are retained. Missing printers return
404, stale revisions return 409, and uncertain commits are not retried. This
configuration action never connects to a printer or sends a print job.


## Configurable SAP RFC contracts (development)

Integrations separates API Sources, SAP Connections and RFC Operations. RFC
configuration is stored in `management_state.document.sap_rfc` and shares the
existing revision-locked transaction and administrative audit. Missing configuration
on an existing document defaults to empty lists; startup applies no schema or data
migration. API source access keys remain independent of SAP logon credentials.

Connections configure application server, two-digit system number, three-digit
client, username, logon language and optional encrypted password. Empty password
on update preserves the existing password. Password ciphertext is AES-256-GCM
with a unique nonce and domain-separated connection-ID context, using the existing
server `TLS_MANAGEMENT_KEY_ENCRYPTION`. Public responses and audits exclude the
ciphertext and raw password. Draft connections can be saved without credentials.

Operations configure a connection, editable function-module name, up to 32 typed
parameters and up to 64 scalar output mappings. Supported input kinds are string,
32-bit integer, finite decimal (preserved as decimal text), ISO date, boolean
(ABAP X/empty), and up to 100 strings. Values come from operator input or a
configured constant; callers cannot override constants or supply unknown inputs.
String lists describe data values only; future RFC table row metadata still needs
a real SAP contract. Function/parameter identifiers currently support ordinary
unqualified ABAP names, not namespace slash syntax.

Result paths use dot-separated dictionary field names, never executable code,
array indexing or expressions. Response mode is table (1..100 structures) or one
structure; mappings preserve exact target names and scalar types including 0 and
false. Missing required paths, null/empty required fields and nonscalar values
fail closed. Samples are limited to 64 KiB and are not saved as configuration,
audit or operational results. Test sample feedback is explicitly synthetic and
does not change the policy revision or establish SAP verification.

Endpoints under `/api/v1/management`:
- PUT `/sap-connections`, DELETE `/sap-connections/{identity}`
- PUT `/sap-operations`, DELETE `/sap-operations/{identity}`
- POST `/sap-operations/{identity}/sample` with revision, values, response
- GET `/sap-operations` returns the operator catalog and runtime_available (server configuration readiness, not SAP connectivity)
- POST `/sap-operations/{identity}/execute` takes revision and values; explicitly calls the saved RFC only when server runtime and allowlists permit it. Otherwise fails closed.

All endpoints use the existing local management guard. Commands use the current
revision; stale versions return 409. A connection referenced by an operation
cannot be deleted. Delete confirmation requires typing its ID in the UI.
Label Print can load the configured operation catalog explicitly; Get Data does
not call SAP or turn sample results into real label output.

Native execution is opt-in through TLS_SAP_RFC_ENABLED=true, TLS_SAP_RFC_PYTHON
(an operator-installed Python executable with PyRFC/SDK), TLS_SAP_RFC_TARGETS
(semicolon-separated host/client pairs), and TLS_SAP_RFC_FUNCTIONS
(semicolon-separated function names). Default packaging contains no native SDK;
container runtime acceptance is separate. The local installed worker runtime can
be independent of the application's Python version. The app invokes its own worker,
not the MCP service, using saved application credentials through stdin only.

An optional private Linux/amd64 runtime can be built with
[`tools/sap-rfc-runtime`](../tools/sap-rfc-runtime/README.md). It packages a separate
Python 3.12/PyRFC interpreter into the application image without enabling SAP
execution. The default image remains SDK-free. CI can pin the private base image
by identity and checks its import/version offline before candidate acceptance;
that check does not establish SAP connectivity or function acceptance.

The worker verifies the SAP client, calls the allowed function once and closes the
connection. It never retries or issues a commit. Restrict allowlists to functions
whose read-only behavior has been inspected; arbitrary RFCs may have SAP effects.
Two worker slots and a 30-second process timeout bound concurrency/waiting; this is
not a general native memory guarantee. A timeout does not prove SAP cancellation.
Errors exclude native exception details. Configuration revision is checked again
after execution; a concurrent change discards the result without retry.

The execute response is no-store and includes evidence=sap, sap_contacted=true,
target SID/client, submitted parameters, raw RFC response and validated items/rows.
The response is not stored in management configuration or audit. Raw responses are
bounded to 4 MiB for admission; label JSON decoding is bounded to 2 MiB. Native
worker output is limited to 8 MiB after collection. SAP runtime failure never
falls back to demo data. Configuration not_verified labels do not claim every
saved connection has been tested. PyRFC/SDK compatibility and packaged deployment
still require their own acceptance.



The Add RFC operation form can open before a SAP connection has been configured.
Its fields are editable, but Save remains disabled until a configured connection
is selected. The empty-state notice explains that this is a configuration
prerequisite, not a requirement for a live SAP connection or an existing SAP FM.


## Z_TLS_GET_LABEL_DATA response contract

The SANDBOX interface was inspected through sap-mcp-local on 2026-10-15:
IV_CHARG is CHAR(10); exports are EV_STATUS, EV_MESSAGE and EV_JSON (STRING).
The returned JSON has exactly `label_code` and a flat `data` object. RFC transport
verification via MCP is separate from native application RFC runtime acceptance.

New operations default to `response_mode=label_json`, the function name
Z_TLS_GET_LABEL_DATA, and a required string input IV_CHARG. No field mapping is
required. JSON/status/message parameter paths and the success status remain
editable; defaults are EV_JSON / EV_STATUS / EV_MESSAGE / S. A preset button
lets users explicitly apply this contract to an existing operation, then Save.
Stored operations without a response_mode retain their previous manual mapping
behavior; no stored configuration is silently rewritten.

Response modes:
- label_json: check status before decoding JSON; validate label_code/data using
  canonical label_data admission, and return both routing code and all data fields.
- direct: select a structure/table using result_path/result_kind and preserve all
  flat scalar field names and values without renaming.
- mapping: apply explicit selected-field mappings; at least one mapping is required.

Failed/missing statuses, malformed or duplicate JSON members, invalid label codes,
forbidden keys and nested data fields fail closed. Sample processing stays bounded
by the existing 64 KiB sample-response limit and does not write sample business
data to configuration or audit. String spelling, leading zeros, spaces, empty,
null, numeric zero and boolean false remain intact when canonical data permits them.
Successful label_json samples include `items:[{label_code,data}]` and the existing
rows projection. This processing does not resolve templates, render, print, contact
SAP or enable the native RFC runtime. The separate execute endpoint requires
explicit server opt-in and uses real SAP responses.


Sample validation distinguishes missing required input (`sap_input_required`),
invalid input names/types (`sap_input_invalid`), unsuccessful configured RFC
status (`sap_status_failed`) and invalid JSON/result data (`sap_response_invalid`).
The UI names a missing operator parameter before submitting and explains that
placeholders are not values. Synthetic response admission is retained in backend
automated tests, independent of SAP execution.


In RFC Operations, Test RFC operation takes the saved operator inputs and the
Fetch from SAP action calls execute. Unsaved edits or disabled configurations
block this action. The operator UI exposes no local JSON sample editor or test
action. Actual results include validated label data and an expandable raw RFC
response. This action does not render or print labels. No automatic retry is made.

## Label Print operational history (2026-10-16)

Existing opt-in Activity Log now covers POST /api/v1/label-print/preview,
/label-print/print and /label-print/printer-status. It reuses the provisioned
app_management.activity_log JSONB table with no migration or startup DDL.
Records include server-generated trace ID, UTC request time, HTTP status,
duration, origin label_print, preview/print/status mode and allowlisted errors.
Preview logs retain source kind, item count, indexed stages and outcome counts;
HTTP 200 can still contain FAILED/PARTIAL preview results. Print logs retain
registered target ID, copies, indexed submission outcomes and confirmed=false.
Status logs retain fixed device state/reason codes; CHECKED means the query
completed, including UNREACHABLE/UNAVAILABLE, not physical device readiness.
Never record batch identifiers, SAP fields, raw request/response bodies, tokens,
artifact IDs, SVG, PNG or IPL. Log-write failure never changes delivery or retries.
Global HTTP error sanitization preserves preview_busy/print_busy and other
explicit Label Print admission codes with static messages and correlation ID.
Activity Log lists Label Print as source and offers preview/status mode filters.
Recording remains completion-time and best-effort: a running/hung request is
not yet a persisted row; this is not a live job monitor or durable request queue.
Past unrecorded requests cannot be reconstructed from these new records.
