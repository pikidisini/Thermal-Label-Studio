# API contract

## Prepared preview artifacts and standalone agent package

Successful SAP/Test Data previews additionally return opaque `print_artifact`
identifiers. Failed, discarded and regression-fixture results do not grant a
print artifact. Artifacts expire after 15 minutes, process restart or eviction
from a 64 MiB/256-entry cache. This preview cache is not an intake/job ledger.

`POST /api/v1/label-print/print-package` accepts `{artifacts: [id, ...], copies:
1..999, target_id}` for 1..100 selected artifacts. It rechecks the registered
printer is enabled and returns its current numeric host/port. Missing/disabled
printer returns 409 `printer_configuration_changed`. Standalone agent clients
can check Ethernet mapping against their agent catalog. The endpoint uses existing
local-preview/origin and bounded JSON admission, returns no-store and never
contacts SAP or a printer. Unknown/expired artifacts return 410 `preview_expired`.
It returns `{language: "IPL", copies, target: {target_id, host, port}, items:
[{payload_base64, sha256}]}`. One copy reuses encoded preview bytes; other copy
counts encode the same bound bitmap with native IPL quantity, without rebinding,
layout lookup or raster. Total encoded payload above 12 MiB rejects with 413;
the operator must select fewer labels. Packages contain label output and must
not be logged or persisted by the browser.

The retained standalone agent accepts one UUID job after a client verifies
payload hashes. It runs on `127.0.0.1:18191`. The current Label Print operator
page instead uses direct server LAN delivery described below. Agent token
pairing is memory-only, exact Origin and loopback Host are required. The agent
owns allowed destination/USB queue mappings; jobs contain no caller-supplied
host/queue. Windows USB is a RAW spool queue, not WebUSB. IPL readable control
markers are converted to wire bytes by the agent. ZPL is not implemented.

Agent SQLite commits job identity before submission, rejects duplicate IDs and
records per-item SUBMITTED/FAILED_BEFORE_SEND/UNCERTAIN/NOT_ATTEMPTED outcomes.
There is no automatic retry; a failure stops subsequent labels. TCP acceptance
or spooler acceptance is not physical print confirmation. Clients must protect pending/uncertain submissions and require operator
checking before another job. The Label Print LAN browser flow uses its own
pending session lock, without depending on this standalone agent ledger.
Demo never calls either print package or agent. Test Data Print is a real
printer action. Agent startup, status and catalog never probe devices.

See `local_agent/README.md` for install/configuration and the agent HTTP contract.
Source/fake acceptance does not establish a plant install, Windows XP support,
browser loopback permission, shared deployment or physical printer readiness.


## Label Print preview diagnostics

Each preview item returns ordered `steps` with `stage` and `status`
(`PASSED`, `FAILED`, `NOT_RUN`). Stages are `FETCH_DATA`, `VALIDATE_DATA`,
`RESOLVE_LAYOUT`, `BIND_TEMPLATE`, `RASTERIZE`, `ENCODE_IPL`, `DECODE_IPL`,
`ACCEPT_PREVIEW`. Success is recorded only after that stage returns. A completed
RFC call is separate from successful status/canonical JSON validation. Failures
include `failed_stage`; later stages remain `NOT_RUN`. `not_attempted: true`
means an earlier fatal failure stopped this batch without another RFC call;
all its stages remain `NOT_RUN`. Request-level admission errors precede item
processing and do not imply any successful stage.

Known label code, template identity/hash and encoded payload hash are retained
as they become available, including on failure. No raw RFC data, credentials,
exception messages or renderer stderr are exposed. Revision conflicts discard
images while preserving completed-stage evidence; previously completed items
fail `ACCEPT_PREVIEW`. UI diagnostics open on failure and report separate ready,
failed and not-attempted counts. A successful HTTP response does not mean every
batch succeeded. These diagnostics neither create jobs nor contact printers.

## Label Print SAP preview

`POST /api/v1/label-print/preview` additionally accepts `source: "sap"`,
`operation_id`, `revision`, `batch_parameter`, `encoder: "IPL"` and 1..100
batch strings. The server validates the saved management revision, operation
and contract before calling SAP. Label Print currently supports `label_json`
operations with exactly one operator parameter of kind string for batch; all
other parameters must be configured constants. Arbitrary function names,
credentials, hosts or caller-supplied field data are not accepted.

Execution shares the same `execute_operation` function with Management's
actual-response action: encrypted saved credentials, explicit runtime/target/
function allowlists, typed inputs, status/response admission and post-call
revision check are preserved. One RFC call is made per batch without retry.
Successful canonical label_code/data resolves a saved layout and uses the
shared binder -> raster -> IPL encoder -> exact-payload PNG decoder. Results
include operation id/revision plus per-item status and template/payload hashes,
never raw RFC exports or credentials. Response uses Cache-Control: no-store.
Readiness/configuration/timeout failures stop subsequent calls; status failures
remain per-item. A detected configuration revision conflict discards all images.
No result falls back to Test Data and no job or printer submission is created.
Cancellation from the browser only prevents stale UI results; it is not proof
of cancellation of an already-running worker. This remains a local-development
route and does not establish shared-deployment authentication or runtime gates.

## Label Print printer catalog

`GET /api/v1/label-print/printers` uses the same management snapshot as
Application Management and the existing local-preview access guard. The
response is `{policy_origin, printers: [{target_id, host, port, enabled,
language: "IPL", connection: "Ethernet", transport: "TCP/RAW"}]}`. It projects
configured targets only; it does not return sender credentials, probe a device,
contact an agent or submit a job. Environment/unconfigured policy fallback is
identical to Management. Storage failures remain failures, not an empty catalog.

## Editable test datasets and saved-layout preview

`PUT /api/v1/studio-sample-datasets/{id}` accepts existing create metadata
(`name`, `original_filename`, canonical `payload`) plus the exact
`expected_updated_at` returned by list/get. It validates the full canonical
envelope and performs one PostgreSQL UPDATE conditioned on id/timestamp.
Conflict returns 409 `dataset_conflict`; no automatic retry is allowed. The
endpoint uses the development management loopback/origin guard, JSON media
and the existing bounded duplicate-aware decoder. It returns updated summary
metadata. No schema migration or old-data deletion is required. Existing
POST/list/get contracts remain valid. Dataset storage is separate from the
managed-policy document; read-only policy does not mean dataset storage is absent.

Label Print preview additionally accepts `source: "dataset"` and `dataset_id`
(UUID string). One dataset snapshot is loaded, canonical payload revalidated,
and batch identifiers matched exactly against `items[].item_id`. Each item's
`label_code` resolves the current saved Studio layout; that version is pinned
for reuse throughout this request. Data keys/values are passed unchanged to
the shared binder. Missing fields fail; no key aliasing or default substitution.
`dataset_updated_at` identifies the source revision. No template source from
the caller is accepted and no fallback to built-in fixture occurs. Missing
layouts produce `layout_not_found`; unavailable/invalid artifacts produce
`layout_unavailable`. Stored checksums are verified by LayoutService. Preview
always uses one copy and creates no job, payload store or printer permission.

## Label Print fixture preview

`POST /api/v1/label-print/preview` accepts only
`{source: "fixture", encoder: "IPL", batches: ["0010245801", ...]}`.
The request is local-development-only (loopback peer/origin, cross-site denied),
JSON-only, byte-bounded by the editor body admission, extra-field-forbidden,
and limited to 1..100 nonblank ASCII batch identifiers of at most 64 characters.
Batch values must already be trimmed. ZPL and SAP sources reject with 422.
One preview request is admitted per process; a concurrent request receives 429
`preview_busy`. This is not a hard runtime or native-memory guarantee.

Known batches are `0010245801` through `0010245804`, explicitly mapped to
synthetic facts and application-owned `FIXTURE_ROLL` / `fixture-ipl-v1` SVG.
The endpoint uses `prepare_draft_output` then `simulate_prepared_output`:
canonical binding -> native SVG raster -> IPL encoding -> exact-payload decode.
It returns `{source: "fixture", encoder: "IPL", items: [...]}` in input order,
preserving duplicate entries. Each item includes `index`, `batch`, and status
`PREVIEWED` or `FAILED`. Success includes label/template identity, template and
payload SHA-256, 640x480 media at 203.2 DPI and `png_base64`. Failure includes a
bounded `error_code` (`batch_not_found`, `binding_failed`, `renderer_unavailable`,
or `preview_failed`) and no image. Unknown batches never manufacture facts.
No raw SVG/IPL, credentials, exception text or renderer stderr is returned.
No operational store, ledger, SAP, printer transport or job creation is used.
No intake token is required or consumed. This is not a shared-deployment auth
contract or physical-print acceptance; real printer submission remains disabled.

## Application Management

`GET /api/v1/management/activity` returns `{enabled, entries}` with the latest
200 operational request records, newest database sequence first, under the local
management access guard. Disabled recording returns `{enabled: false, entries: []}`;
unavailable enabled storage returns 503 `activity_unavailable`. Separate explicit
`004_activity_log.sql` provisioning and `TLS_ACTIVITY_ENABLED=true` enable history;
HTTP/startup never provisions it. Safe stage/item metadata excludes raw business
data, credentials and generated image/protocol bytes. Editor preview accepts optional
`purpose: "preview" | "simulation"` (default preview) for activity attribution only.
SUBMITTED is unconfirmed transport submission; UNCERTAIN never authorizes retry.
See [Activity Log contract](MANAGEMENT_CONTRACT.md#operational-activity-log).

`POST /api/v1/management/sources/{identity}/key` provides revision-checked
create/rotate/revoke/migrate actions and an explicit `reveal` read. Create and
rotate return a new key after acknowledged commit, with `Cache-Control: no-store`.
SHA-256 authenticates the sender; AES-256-GCM ciphertext permits deliberate
show/copy in Details. A persistent server master key stays outside the database.
`PUT /sources` with `create_key: true` atomically creates a new source and key,
including Enabled sources. Reveal requires the current revision and the same
loopback management guard; it does not change policy revision or print claims.
Snapshot/settings responses and audits exclude ciphertext, key digests and
raw credentials. Keys have no automatic expiry; revocation never falls back to
legacy environment credentials. See [key lifecycle](MANAGEMENT_CONTRACT.md#access-keys).

The local `/api/v1/management` endpoints expose policy snapshots, registered
printers/sources, version-pinned template name/code updates, soft deletion and immutable administrative
audit. Mutations require an explicitly provisioned PostgreSQL management snapshot
in `app_management` and the current revision. Schema organization preserves the API,
document shapes and cross-schema template/audit transaction. Login remains deferred. See
[management contract](MANAGEMENT_CONTRACT.md) for commands, limits, failure modes
and the separate activation gate. No management action constructs printer transport.
Review submission/decision routes are retired. Layout version history is available
at `/layouts/{label_code}/versions`; `GET /layouts/{label_code}?version=N` reads
the exact historical artifact. Renames preserve SVG bytes and object keys; source
reference changes and metadata audit commit in the same PostgreSQL transaction.

Current API includes `/layouts` persistence, editor preview and Studio print with action targets. The standard
Compose stack configures persistence; fake-based source tests can leave it disabled.
Without persistence configuration, layout endpoints return bounded 503 errors.
The phase sections describe successive slices; use the P8C section for stored
layout requests. Authentication and production admission controls remain pending.

Status: Phase 7J adds dependency-presence readiness and optional fixture serving.
Phase 7I adds server correlation and bounded diagnostics; Phase 7H adds the
separate fixture simulation route described below.
Phase 7A provides `GET /health` and
`POST /api/v1/labels/process`. The latter validates the request, resolves the
in-memory `roll_80x200` fixture at version `fixture-v1`, and reaches the label
service. It returns HTTP 200 with acceptance evidence only; it does not process
or produce output. Both `simulation` and `print` mode follow this same boundary.

GET /ready returns 200 with {"status":"ready"} when configured renderer/font
files and optional frontend index/assets are present, otherwise 503 with
{"status":"not_ready"}. It does not execute rendering or check external
systems. With TLS_FRONTEND_DIST configured, / redirects to /fixture-simulation;
that page and /assets serve the compiled frontend at the API's origin.
Unknown paths do not fall back to the SPA. /health retains process liveness.

An example acceptance request is:

```json
{
  "label_code": "roll_80x200",
  "mode": "simulation",
  "items": [{"item_id": "fixture-1", "facts": {}}]
}
```

Its response is:

```json
{
  "status": "accepted",
  "label_code": "roll_80x200",
  "layout_version": "fixture-v1",
  "mode": "simulation",
  "item_count": 1
}
```

The implemented request rejects extra fields, limits `label_code` and `item_id`
to 128 characters, and limits `items` to 100. Items remain ordered; omitted
`items` means an empty list, and omitted `facts` means an empty object. Phase 7A
does not validate layout-specific facts. A blank or missing `label_code` returns
422 with `invalid_label_code`; unsupported or missing mode returns 422 with
`invalid_mode`. Malformed items return a bounded 422 error. Unknown codes return
404 with `unknown_label_code`. Errors use `{"detail": {"code": "...", "message":
"..."}}`. Acceptance creates no job, artifact, simulation capture, or delivery.

Phase 7B supplies a direct fixture rendering function separate from this route.
It resolves an injected layout with SVG/media metadata, validates required text
facts, and returns in-memory bitmap bytes. The public HTTP response and its
accepted-only semantics remain as described above; no bitmap is exposed here.

Phase 7C supplies `simulate_label_request(request, registry)` as a direct Python
service only. It requires simulation mode and 1-100 validated ordered items,
with injected fixture SVG/media metadata. It returns an ordered tuple of item
results: zero-based `item_index`, original `item_id`, `CAPTURED` or `FAILED`,
bounded trace, a `RenderedLabel` containing the decoded IPL PNG or `None`,
exact encoded `payload` bytes or `None` (internal Python evidence), and a bounded error
or `None`. Successful PNG bytes are available through `result.bitmap.bitmap_png`
for an in-memory preview. Phase 7H exposes only a fixed development fixture
through a separate route; this does not change the acceptance endpoint.

Each item starts with `RECEIVED`; the renderer reports `RESOLVING_LAYOUT`,
`BINDING_TEMPLATE`, and `RASTERIZING` immediately before those operations.
Success ends with `CAPTURED`; failure ends with `FAILED` at the last attempted
stage, with no bitmap. Later items continue in input order. Unknown layout,
invalid template/media/facts, raster failure, and unexpected processing failure
map respectively to `unknown_label_code`, `invalid_template_or_facts`,
`raster_failed`, and `processing_failed`; messages do not reveal exception text
or raw facts. Invalid request shape/mode or empty items raise
`SimulationRequestError` with code `invalid_simulation_request` before rendering.

Phase 7D permits the direct acceptance/render/simulation services to receive a
`LayoutSource` implemented by `MinioLayoutSource`. Its bucket and approved
code-to-version catalog are supplied by the application, never by request
fields. It loads fixed metadata/SVG keys with an injected client and validates
exact identity/version, bounded UTF-8, schema, SVG digest, media, and declared
bindings before returning a layout. See `ARCHITECTURE.md` for the object format
and limits. Unknown/unsafe codes fail before client calls; unavailable/invalid
objects raise a fixed-message `LayoutStorageError`. Simulation reports these
as `invalid_template_or_facts` with `FAILED` immediately after
`RESOLVING_LAYOUT`, and no bitmap or raster attempt. This is a tested code
boundary with fakes; the HTTP route still uses its original in-memory registry
and accepts neither storage paths nor version/bucket overrides.

The direct Python print boundary consumes shared prepared output, separate from
HTTP. `prepare_editor_output` or `prepare_label_item` chooses the implemented
language, obtains layout dimensions/DPI, rasterizes once and encodes once.
`submit_prepared_output(output, transport)` sends the immutable output payload
once without encoding, rendering or printer profile checks. The result retains
the same prepared output, `SUBMITTED` and `confirmed=False`. Invalid prepared
output fails before submission; transport errors are bounded failure-or-uncertain
outcomes with no retry. Studio and fixture simulation decode the same exact
prepared payload to PNG. The Studio print endpoint uses the configured TCP transport described below;
job orchestration is inactive. The label acceptance endpoint remains acceptance-only.

## Provisional external fixture envelope (Phase 7G)

This is a direct Python adapter, not a new HTTP endpoint or a finalized SAP
wire contract. `adapt_sap_fixture_json(bytes)` accepts exactly `schema`,
`contract_version`, `request_id`, `correlation_id`, and `label_request`.
`schema` is `sap-label-fixture` and `contract_version` is integer `1`.
The nested request requires exactly `label_code`, `mode`, and ordered `items`;
each item requires exactly `item_id` and `facts`. Every field is mandatory;
missing/null values never receive defaults or coercion.

Limit UTF-8 JSON to 65,536 bytes, identities/codes to 128 characters, items to
1-100, and facts to 0-32 scalar entries per item. Fact names follow
`[a-z][a-z0-9_]{0,63}` and exclude the reserved destination/layout/execution
names enumerated in the task contract. Strings have at most 1,024 characters;
integers are signed 64-bit and finite floats have absolute value at most 1e100.
Booleans remain booleans. Nested values/null and Unicode category C characters
are rejected. Empty fact strings remain empty for later layout-specific checks.
Duplicate JSON keys, unknown envelope/request/item fields, invalid UTF-8,
nonfinite/overflow numbers, and unsafe fields fail closed.

The result separates external request/correlation IDs from `LabelProcessRequest`.
No job identity, storage, deduplication, or retry semantics are inferred.
`SapAdapterError` has fixed codes/messages: `invalid_sap_envelope`,
`unsupported_sap_contract`, or `sap_envelope_too_large`, with no raw input.
The full fixture schema and exact reserved names are recorded in
`tasks/PHASE_7_BACKEND_REBUILD/P7G_SAP_INTEGRATION/TASK_CONTRACT.md`.
The exact caller label code passes to later server resolution; the adapter
neither validates catalog membership nor selects a fallback layout.

## Development fixture preview (Phase 7H)

`POST /api/v1/simulation/fixture` requires exactly `{"scenario":"sample"}`
or `{"scenario":"mixed"}`. It accepts no user facts, code/mode, destination,
path, layout override, or SAP envelope. The server owns an inline `roll_80x200`
layout at `fixture-v1` and synthetic facts. Sample runs one valid item; mixed
runs valid/missing-material/valid items. It calls the existing simulation service
and creates no persisted job, output file, or physical delivery.

HTTP 200 returns canonical UUIDv4 `request_id`, `schema_version: 1`, fixed `label_code`/`layout_version`,
and 1-3 ordered `items`. Each has `item_index` (0-2), `item_id` (`fixture-1`
through `fixture-3`), CAPTURED/FAILED `status`, 2-5 ordered `trace` entries,
`preview`, and `error`. Success has null error and a preview with
`media_type: image/png`, `width_px: 640`, `height_px: 1600`, `dpi: 203.2`,
and `png_base64` of the exact captured PNG (at most 65,536 bytes / 87,384
base64 characters). Failure has null preview and a predefined code/message.
Trace/error messages are allowlisted and at most 128 characters; no facts,
SVG, exception text, secrets, or paths. Item failure remains HTTP 200 evidence
and later items continue. The frontend caps response reads at 300,000 bytes.

Invalid fields use the existing bounded HTTP 422 envelope. Unexpected handler
or serialization failure returns HTTP 500 detail
`{"code":"fixture_simulation_failed","message":"Fixture simulation could not be completed."}`.
This development boundary has no production authentication/admission policy,
idempotency, persistence, or delivery readiness. `/labels/process` remains
accepted-only for both modes.

## Input and validation

The remaining requirements below describe the target processing contract for
later phases. Authentication, authorization, CSRF, job identity/retries, and
layout-specific processing are not implemented by this foundation.

- Require a nonblank `label_code` registered by the application. Reject unknown
  codes; do not guess a layout or silently choose a default.
- Resolve the layout, version, SVG, and media settings on the server. Validate
  required raw facts, item identity/order, supported code values, and requested
  output settings before processing.
- Bound request size, item counts, and processing work. Reject malformed data,
  unsupported options, arbitrary filesystem/device paths, and executable rules.
- Enforce server authentication, authorization, and resource ownership for
  protected operations; browser mutations require the applicable CSRF protection.
- Define request identity and duplicate/retry behavior in the implemented wire
  schema. Do not create another output job silently on a duplicate submission.

## Processing and output

The target pipeline, `SAP/API -> validate label_code -> resolve layout -> bind SVG -> raster bitmap`,
will produce one shared bitmap and encoded payload before choosing the final sink.

The local simulation sink decodes that IPL output and never invokes physical transport. Printing
delivers the same processed bytes to a server-approved destination. The output
record must distinguish processed, simulated, submitted, and confirmed delivery;
a timeout must not be represented as confirmed success.

Successful processing must identify the resolved layout/version and output
identity so evidence can be related to the generated payload. Errors use stable,
bounded codes/messages with item context where needed; do not expose secrets,
raw SAP data, internal paths, or stack traces.

Contract tests must cover known/unknown label codes, missing layouts/facts,
malformed/oversized input, access denial, duplicate requests, item order,
processing failure, and identical simulation/transport payloads using fakes.
Phase 7E implements direct metadata-only JobRepository create/get/transition/
events calls using an injected DB-API connection, exclusively fake-tested.
The server creates immutable UUIDv4 identities; RECEIVED -> PROCESSING ends in
SIMULATED for simulation or SUBMITTED for print, or FAILED from an early state.
Errors are predefined bounded pairs; conditional updates and event appends share
one transaction. No job wire response/endpoint, HTTP idempotency, execution
orchestration, live durable persistence, or runtime connection is implemented.
This contract does not authorize DB/MinIO, SAP, or printer operations.

## Correlation and diagnostics (Phase 7I)

Every HTTP request gets a fresh server UUIDv4, ignoring external correlation
headers. X-Request-ID accompanies responses through the middleware. Fixture
success and bounded validation/HTTP/error bodies include request_id; acceptance
success and health shapes stay unchanged. Concurrent contexts are isolated.
The provisional SAP external IDs remain separate and are not trusted as internal
correlation. Unexpected pre-header errors return bounded HTTP 500; failures
following response start are recorded and propagated without a second response.

The existing item trace stays bounded. Structured in-memory diagnostic events
use only server request ID, allowlisted stage/event/error, item index, and HTTP
status; JSON INFO logging configures no sink/handler and never includes raw data,
paths, exceptions, headers, SVG, or bitmap bytes. Deployment must later enable
the appropriate level/output. No persistent telemetry or print/job wiring.


## Phase 8C layout persistence API

`GET /api/v1/layouts` returns published active layout summaries.
`GET /api/v1/layouts/{label_code}` returns the active summary plus `svg`.
Label codes preserve user-entered letter case and are case-sensitive identities:
`A174`, `a174`, and `Ab174` are distinct codes. Codes contain 1–128 ASCII letters,
digits, underscores or hyphens, starting with a letter or digit; they are not
restricted to four characters. Studio submits the code exactly as entered,
without case conversion, trimming or character replacement. Editing the display
name does not change the code. Invalid codes are rejected rather than rewritten.
`POST /api/v1/layouts` accepts exactly the authored layout body and returns the
new version summary with HTTP 201. Image XLink attributes are serialized with
the `xlink` prefix; Studio resolves image sources by namespace before Fabric
import so existing SVGs with renamed prefixes also remain editable.
The server validates safe SVG, assigns the
positive version and object key, writes SVG to the configured MinIO bucket, and
commits PostgreSQL active-version metadata. No request field may choose a bucket,
object key, filesystem path, device, or printer.

`POST /api/v1/simulation/editor-preview` continues to be preview-only: it
returns a bounded base64 `image/png` at requested safe media dimensions. It has
no database write and no printer side effect. P8C runtime errors expose only
stable codes: `invalid_layout`, `layout_not_found`,
`layout_persistence_unavailable`. Immutable object conflicts are handled internally
with bounded fresh-version allocation, rather than exposing a blocked retry as 409.

## Current Studio entry and layout failure recovery

Studio has no login/session/CSRF controls; retired frontend auth is not an API
security boundary. Both Preview view and Label Simulation send the current
draft SVG/media/DPI plus explicit data/encoder/copies to /api/v1/simulation/editor-preview. The Preview panels
share its PNG; no legacy render/parse-raw request is part of this flow.

Layout saves use a per-label transaction lock. Existing immutable object keys
are skipped, with at most 32 probes, so versions may have gaps. A failed response
may reflect a rolled-back transaction or a committed transaction whose response
was lost. Artifacts are preserved in both cases; a later save uses a fresh key.
This is not request idempotency and unreferenced object reconciliation is future
operational work. Clients must not claim a failed save succeeded or automatically
delete artifacts. Allocation exhaustion returns layout_persistence_unavailable.

### Template library management

`PATCH /api/v1/layouts/{label_code}` and `DELETE /api/v1/layouts/{label_code}`
are retired and return 410 `template_management_required`. Studio Explorer and
Application Management both use `POST /api/v1/management/templates/{label_code}`
with policy revision, exact current version/checksum, previous title. Change reason is optional and omitted by the current UI.
Name/code changes and soft deletion commit with source-reference changes and audit
in one transaction. Rename releases the previous code for reuse by another
template. Empty reservations from older renames are reclaimed inside the next
rename/Save transaction; deleted identities with retained versions remain reserved.
Rename copies all SVG versions to `layouts/{new_code}/v{version}/layout.svg`,
verifies checksums, and commits new references plus object-move audit evidence.
SVG bytes, version numbers and historical audit remain intact. A same-code metadata
update normalizes paths left by earlier renames. Unreferenced source copies are
removed only after acknowledged commit and a locked reference/checksum recheck.
Failures or uncertain commits preserve source objects; cleanup failure retains
extra copies without reporting the committed identity change as failed.
Existing destination bytes are never overwritten when a freed code is used again.
See [management contract](MANAGEMENT_CONTRACT.md).
Startup schema initialization adds nullable title_override and deleted_at columns
idempotently to existing layout headers. This requires normal authorized persistence
startup; source tests do not migrate operational storage.


## Canonical label-data admission and local exploration (T02)

`backend/app/label_data` owns canonical validation and typed models; the universal T07 route is now registered with default external admission denied. Local batch simulation is implemented; full T07 resource acceptance remains NEEDS_REPLAN. Fixture facts/acceptance routes are unchanged.

Canonical versionless JSON requires sender:{system}, request_id, mode (simulation|print), and 1..100 ordered items. Each item requires unique item_id, label_code, copies (semantic integral JSON number 1..999), data (0..200 finite scalar/null fields). Optional field_descriptions allows up to200 string entries, 256 Unicode codepoints each. Unknown envelope/sender/item fields reject; exact ASCII identifiers/keys and forbidden prototype keys follow the frozen implementation-package CONTRACT. Required values are never trimmed/coerced. 1, 1.0 and 1e0 copies are the same integral JSON value; boolean/string/fractional/0/1000 reject. Typed models expose copies as int. Strings preserve whitespace/Unicode and are limited to4096 codepoints/16384 UTF8 bytes; NUL and unpaired surrogates reject. Integral data numbers beyond +/-9007199254740991 and nonfinite values reject; fractional JSON numbers parse once into binary64.

Raw file/body bytes are capped at2MiB. UTF8 is strict; BOM, duplicate object members (including escaped equivalent keys), malformed JSON/nonfinite literals and nesting>32 reject before object admission. Object admission uses identical conservative byte reservation in both languages: compact JSON punctuation and escaped UTF8 strings, 32 bytes per number, true4/false5/null4 bytes, total<=2MiB. This reservation may reject a near-limit document smaller than2MiB; it bounds programmatic inputs consistently without relying on different float serializers. The dataset wrapper additionally allows4096 bytes for upload metadata; HTTP maps invalid dataset to bounded422 and streaming overflow to413. Service.create also validates canonical data before DB calls.

Browser canonical tokens preserve exact data keys without legacy SAP aliases or synthesized label_code. Mode/copies/source IDs remain metadata, not token values. Descriptions remain presentation metadata. Missing/null/empty/zero/false remain distinct. ECMAScript number stringification for future binding and JCS digest remains T04/T08 implementation work; T02 proves numeric admission/value parity, not bound output or digest parity.

Historical mode-less versionless data may be opened for read-only local exploration, including historical copies1..1000. It displays a warning, disables token-value edits and all preview/simulation/print output, and is never uploaded automatically. Accessible Simulation working copy / Print working copy controls require explicit copies corrections for each item and create a new in-memory canonical copy; copies1000 is never silently clamped. Original saved rows remain unchanged. Working copies are unsaved until exported/imported as a canonical sample; mode selection/import never submits print. New canonical imports may save a dataset only and switch to Design with stale previews cleared. Existing v1.1/raw-v2 exploration remains a separate parser, cannot be admitted as canonical intake and has no automatic storage/output effect.

Example: {"sender":{"system":"SAP_ECC"},"request_id":"REQ-001","mode":"simulation","items":[{"item_id":"I1","label_code":"A013","copies":1,"data":{"ZZWIDTH":695,"customer_name":"Example Customer"}}]}

### SAP characteristic descriptions in Studio

The versionless local JSON envelope accepts optional request-level `field_descriptions`: an object mapping exact characteristic keys to SAP display descriptions, for example `{"ZZWIDTH":"WIDTH"}`. Every item keeps its scalar values under `data.ZZWIDTH`; descriptions never rename binding keys or become label values. Studio uses these descriptions in field search, selectors, composition chips, layers, and missing-data messages. Missing or blank descriptions fall back to the exact key. Duplicate descriptions include the key, for example `WIDTH (ZZWIDTH)`. Importing a new request replaces all previous description metadata.

The description map allows at most 200 entries, the same safe keys as `data`, and string descriptions of at most 256 characters. The complete `docs/examples/label_data.example.json` includes blank descriptions and values for manual completion, with `ZZWIDTH: WIDTH` as the illustrative description. Descriptions are presentation metadata; the actual bound value appears on the label canvas.

## Studio sample datasets

User-uploaded versionless sample JSON is stored independently from SAP render
requests and template artifacts. `POST /api/v1/studio-sample-datasets` accepts
exactly `{name, original_filename, payload}` and returns a metadata summary (201).
`GET /api/v1/studio-sample-datasets` lists summaries; `GET /api/v1/studio-sample-datasets/{uuid}`
returns the summary and complete original parsed payload. Each upload creates a
fresh UUID; sample request IDs are not unique. Names are nonblank strings up to
160 characters, filenames up to 255. Payload validation matches the versionless
Studio envelope above, bounds payload JSON to 2 MiB, and rejects nonfinite numbers
and JSONB-incompatible NUL/unpaired-surrogate strings throughout preserved metadata.
Errors are bounded: invalid_dataset (422), dataset_too_large (413), dataset_not_found
(404), dataset_persistence_unavailable (503). No update/delete endpoint is provided.


## IPL payload simulation (2026-10-09)

The editor-preview response shape and 72..600 DPI request range remain unchanged.
After the existing SVG rasterization/thresholding, `protocols/ipl/encoder.py` encodes the
processed mode-1 PNG and decodes its exact readable ASCII G/u/U payload. The
returned PNG is decoded evidence; no printer connection or storage operation
occurs. Encoding/decoding failures return the bounded `editor_preview_failed`
500 response. Fixture simulation retains its exact payload internally and reports
codec failure as `processing_failed`, with no bitmap or payload.

Each G graphic is at most 799x799dots, so larger media uses tiles without resizing.
The encoder reserves up to 36 graphic slots 64..99 and format 90, uses fields 0..35,
direction 0, unit scale, sequential six-bit vertical columns, and one RS/US/ETB
print. Sending these bytes would replace those printer-resident IDs and select
Advanced Mode; there is no allocation negotiation. Studio Print sends this payload
through the TCP transport described below.
Only occupied slots are defined; payload generation accumulates no new IDs.
The decoder requires complete columns, white padding, valid references, a single
format and one print command with validated copies 1..999. It supports nonnegative origin and scale 1..10 for
direction 0 only and rejects unsupported directions/commands, clipping, duplicate
IDs, malformed framing and extra prints. It is a bounded subset, not a full IPL
printer emulator. Canvas dimensions/DPI come from validated media metadata.
The PM45 sample proves six-bit bitmap size; full-media physical axis/placement,
tiled printing and slot availability still require authorized physical validation.


### Shared output preparation and action language

Editor-preview accepts optional `encoder: "IPL"` (default `IPL` for existing clients).
The fixture request/SAP envelope retains its existing shape. Direct fixture
simulation selects language through the `simulate_label_request(..., encoder="IPL")`
keyword; unsupported selections fail before rasterization with a bounded
`SimulationRequestError`. Unsupported editor encoder values fail request validation
with 422. Studio Label Simulation displays the implemented IPL choice;
the shared client sends it explicitly. Layout dimensions/DPI are not replaced by
printer settings. The shared engine validates the SVG/media, rasterizes once and
encodes once into immutable `PreparedOutput(bitmap, payload, language, copies)`.
Simulation decodes those bytes to PNG. `submit_prepared_output` consumes the same
object and submits its payload once to an injected transport without rendering or
encoding. Print callers choose language while calling the engine preparation API.
Studio Print uses that boundary through the configured print endpoint below.


## Single-label Studio print with an action target (2026-10-09)

`GET /api/v1/printing/target` returns the optional server default as
`{available, host, port, encoder:"IPL"}`. Host/port are null without a default.
This reads configuration only; no printer probe occurs. A missing/failed default
lookup does not prevent a client from providing an explicit target.

`POST /api/v1/printing/editor` accepts `{draft:{svg,width_mm,height_mm,dpi,binding_version:1},
data,encoder:"IPL",copies,target?:{host,port},field_descriptions?:{...}}`. Copies is required
and must be an integral JSON number1..999 (the UI starts at1). Native IPL `<RS>N`/`<US>1` requests that many identical rendered labels.
The explicit target overrides the optional server default
for this request only. Existing clients may omit `target` to use the default.
Target host must be numeric IPv4/IPv6; DNS names, URLs, scopes, multicast and
unspecified addresses fail closed. Target port is a strict integer 1..65535.
Unknown top-level host/port/profile fields and extra nested target fields
remain rejected. No global target-update endpoint or database setting is added.

SVG is bounded restricted Studio content; dimensions are 10..500 mm, DPI 72..600,
and final pixels remain at most4096 per side /4 million total. Encoder is required
and only IPL is accepted. Layout controls dimensions/DPI without a printer
profile compatibility gate. Target validation precedes raster/transport creation.

Response is `{request_id,template_sha256,binding_version:1,status:"SUBMITTED", confirmed:false, width_px,
height_px, dpi, encoder:"IPL", payload_bytes, target:{host,port}, copies}`. Target is the
effective destination. Local TCP send completion does not confirm physical printing.
One request prepares/encodes one payload and attempts one connection/send for all
copies, without retry,
feedback or idempotency guarantees. Resending may produce a duplicate.

Errors are correlated/bounded: 503 `printer_unavailable` when both targets are
missing before raster; 422 `invalid_printer_target` or `invalid_print_copies` before preparation, or
`invalid_print_layout`/framework `invalid_request`; 500 `print_preparation_failed`
before submission; 502 `print_submission_uncertain` after failed connection/send.
Unknown failures/lost responses are also uncertain. Inspect the printer before
another explicit request. Browser-local target memory is a client preference and
does not change server defaults.

## T03 local template metadata

Implemented local metadata and immutable semantic admission are described in [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md). New Fabric7 exports preserve exact binding specs, explicit symbol options and marked nested groups. T04/T05 implement replacement text/symbol preparation and T06 integrates the editor output routes; runtime/storage remain separate gates. Legacy incomplete dynamic metadata fails closed without a stored migration. Dynamic rich text/wrapped Textbox require NEEDS_REPLAN if required before output integration.


## T04 local text preparation

The pure `app.template_binding.bind_text_template` owner now resolves validated canonical scalar fields/compositions into an immutable final SVG/media result. New Studio metadata preserves text origins and character spacing. Output text uses `N/A` for missing keys and ` - ` for null/empty values. Unavailable barcode/QR sources use plain centered ` N/A ` boxes. Unsupported font/shaping/symbol profiles and invalid nonempty values still fail closed. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) for semantics, budgets and the 84 actual Fabric geometry fixtures. T05 completes symbols; T06 integrates this owner into the existing editor output routes. SVG geometry checks do not prove raster/IPL/device or packaged-font parity.


## T05 complete local binding

The pure `app.template_binding.bind_template` owner now regenerates text, Code128, Code39, EAN13 and QR from exact canonical values. Independent actual Studio module/pixel fixtures and Fabric placement fixtures validate the declared profiles; explicit options, effective QR version/mask and asset/media hashes remain available in immutable results. Studio symbol refresh preserves painted bounds and uses declared options; invalid input cannot fall back to a sample or another type. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) and [generator notices](SYMBOL_GENERATOR_NOTICES.md) for exact dependencies, limits and unsupported profiles. Editor output APIs now accept explicit draft/data requests and use this binder before the shared raster/IPL engine (T06). This slice creates no intake endpoint or operational side effects.


## T06 shared Studio output

Both editor output routes now require `draft:{svg,width_mm,height_mm,dpi,binding_version:1}`, `data`, `encoder:"IPL"` and `copies:1..999`; optional `field_descriptions` is presentation metadata only. Print retains optional numeric `target:{host,port}`; simulation rejects it. The old top-level composed-SVG request is rejected. Unsaved drafts need no storage operation. A static template with no dynamic metadata accepts empty data; incomplete dynamic metadata never falls back to static/sample processing.

`engine/editor_request.py` admits streamed JSON up to2MiB, rejects duplicate members/invalid UTF8/media type, and validates bounded canonical scalar data. `prepare_draft_output` checks exact root mm dimensions and `viewBox="0 0 width*4 height*4"`, calls `template_binding.bind_template`, then the existing `prepare_editor_output`/resvg/IPL preparation. Preview decodes that exact prepared payload; print submits it once. Both responses add original `template_sha256` and `binding_version:1`. Stable binding errors are422 and prevent raster/transport; print failures with uncertain effects retain the client lock.

Studio captures immutable draft/data/media at action time. Local dynamic samples, preview overrides and stale local symbol errors are not output data authority. Unsupported metadata/crop/filter/font profiles still fail closed; local sample refresh remains responsive. Superseded requests are aborted and late results ignored; stale PNGs are cleared. JSON import with mode=print does not choose a sink or submit. The two Preview panels reuse one decoded PNG.

The renderer loads the same trusted regular/bold/italic/bold-italic font siblings used by binding. The authored dynamic font family must match the server profile; Windows Arial evidence does not establish packaged Liberation Sans/Arial equivalence. Design Canvas and SVG coordinate rounding are separate from exact shared-output raster/IPL parity. See [T06 result](implementation/universal-label-pipeline/results/T06_RESULT.md) for actual gates and limits; no sender/device/storage/package readiness is implied.

## T07 universal stored-template intake

POST `/api/v1/label-intake` is registered with distinct `IntakeRequest`, `IntakeResponse` and `AdmissionResponse` OpenAPI models. It accepts the frozen versionless canonical envelope above; stream admission enforces 2 MiB before parsing, strict UTF-8 JSON and duplicate-member rejection. Canonical validation precedes storage or output processing. The external request ID is separate from the server UUID returned as `trace_id` and `X-Request-ID`.

**External admission is configured explicitly:** T09 authenticates bearer credentials independently of `sender.system`, checks enabled source and allowed mode before storage/ledger or replay. Missing/invalid bearer returns 401 `unauthenticated`; recognized bearer with absent/invalid server policy returns 503 `policy_unavailable`; source and mode denial return bounded 403 errors. The default configuration remains denied. T10 routes print-capable sources through explicit source destinations and copies limits, durable all-batch preflight/preparation and committed claims; default missing policy/ledger still denies processing. Missing storage returns 503 `intake_unavailable` after authorized admission.

The local service pins the exact stored SVG bytes, version, SHA-256 and media once per unique label code before any preparation, then uses `prepare_draft_output` and `simulate_prepared_output`, the same owners as Studio. It returns HTTP 200 ordered item results `SIMULATED`, `FAILED` or `SKIPPED`, template evidence, bounded public errors and complete zero-inclusive summary counts. Only SIMULATED includes PNG and payload hash/size. COMPLETED means every item finished simulation; PARTIAL means mixed results; FAILED means none simulated. There is no accepted-only success, fixture fallback or dataset mutation. The original T07 pure service is a local preparation primitive. Current HTTP processing uses the T08 durable coordinator described below, including stored replay.

Unknown/deleted templates map to `unknown_label_code`; unavailable reads to `layout_unavailable`; checksum/unsafe artifacts to `invalid_template`; binding, raster and codec failures have distinct stages/codes. Batch pixels/copies are preflighted before raster; one process-wide slot covers body buffering through response completion, with no queue and 429 `intake_busy`. Output/aggregate PNG, IPL and response reservations fail rather than truncate. 128 KiB result metadata is reserved, exceeding the frozen minimum 64 KiB to account for 100 maximal identifiers and pins.

**T07 remains NEEDS_REPLAN:** the 60-second deadline is checked between synchronous calls and discards late results, but cannot interrupt a blocked stored-layout read. The 128 MiB application working reservation bounds admitted buffers/work estimates; it is not an enforced OS memory limit on the native renderer. A cancellable, bounded execution boundary is required before full resource acceptance. The default external denial stays in place. See [T07 result](implementation/universal-label-pipeline/results/T07_RESULT.md).

## T08 durable identity and replay

Intake simulation now requires an injected durable ledger after current source admission. Missing/unavailable ledger yields 503 ledger_unavailable before new layout processing; no process-memory fallback exists. Canonical HMAC identity/digest includes the authenticated sender namespace, request ID and all normalized request values. Changed input for an existing identity yields 409 request_conflict; active identities yield 409 request_in_progress; expired identities yield 409 request_expired. The process-wide slot can reject excess traffic as 429 before identity admission.

An identical terminal simulation replay returns the stored PNG/results and original template pins, with replayed=true, a new trace_id and original_trace_id preserved. It does not resolve current active templates or invoke binding/raster. Source authorization is checked before replay disclosure. A corrupt/missing retained result fails closed without recomputation. Print now consumes T09 authorization and T10 orchestration. Default missing bearer is 401 unauthenticated; missing policy with recognized bearer is 503 policy_unavailable. No operational schema/ledger is automatically configured.

The source PostgreSQL ledger exposes committed preparation/claim/outcome and explicit quiesced recovery APIs for T10. No transport is constructed. Proposed schema, retention/key rotation/quota and crash boundaries are documented in [ledger operations](implementation/universal-label-pipeline/T08_LEDGER_OPERATIONS.md) and [crash matrix](implementation/universal-label-pipeline/T08_CRASH_MATRIX.md). T07 resource replan and T06 browser gates remain unchanged.

## T09 admission and preflight source

Only POST `/api/v1/label-intake` declares HTTP bearer security in OpenAPI. `TLS_INTAKE_POLICY_JSON` and source-referenced `TLS_INTAKE_TOKEN_<NAME>` are explicitly mapped server environment, with no automatic .env loader or runtime bypass. Duplicate Authorization headers, invalid/missing identity, disallowed source/mode and unavailable config are denied using static admission errors; 401 includes WWW-Authenticate: Bearer. Exact asserted identity is required. Current source permission is rechecked before ledger replay.

Print authorization requires an enabled authenticated source and print mode. All valid stored templates are available; no per-source template allowlist is enforced. Each source declares `allowed_print_target_ids` (unique logical IDs, default empty) and `print_max_copies` (1..999). Both simulation and print requests must select an explicit permitted target; there is no default route. See the 2026-10-18 contract below. The selected target must exist and be enabled. Historical approve/revoke records remain retained but do not participate in authorization. Preflight pins the actual stored immutable template version/checksum, policy revision, destination and copies before render. Each durable send claim rechecks credentials, permissions, routing and the original revision; changes deny sending rather than silently rerouting. POLICY errors include `template_not_allowed`, `copies_not_allowed` and `target_not_allowed`. Request data cannot choose an address/port. Simulation requires enabled source identity, mode authorization and an explicit enabled permitted target, and can use every valid stored template without printer transport. See [configuration and routing](implementation/universal-label-pipeline/T09_POLICY_OPERATIONS.md).

## T10 print results and uncertainty

All sources can use every valid stored template for their allowed simulation/print
modes. Legacy `label_codes` and `simulation_all_label_codes` fields remain readable
in stored policy documents but do not restrict admission or replay. Management UI
sends no template-scope fields and requires no change reason. Disabling sources,
removing modes or rotating credentials still denies unauthorized replay access.
POST /api/v1/label-intake now exposes a simulation/print outcome union. For mode=print, current T09 source/mode authorization precedes T08 lookup; replay returns original pinned outcomes without rendering or constructing transport. New requests resolve/preflight all stored templates and targets, commit admission before preparation, prepare every item before any send, and revalidate the original policy/credential/target before each durable claim. Missing policy, ledger or layout service is denied without sending. Default runtime remains unprovisioned.

HTTP 200 returns ordered SUBMITTED/FAILED/UNCERTAIN/SKIPPED, required template/error fields, native copies, complete summary and target_id when resolved; SUBMITTED and UNCERTAIN carry confirmed=false. Print contains no PNG, payload, address, port or raw business data. Preflight offenders are FAILED and all other items SKIPPED/preflight_aborted. Proven pre-send failure stops later items as SKIPPED/batch_stopped. Possible submission is UNCERTAIN and stops later claims. No status confirms physical printing.

Before any claim, ledger failure remains correlated 503 ledger_unavailable and cannot send. After a claim attempt, ambiguous claim/settlement/terminal persistence or response construction returns correlated 503 response_unavailable with explicit possible-submission/no-automatic-resend semantics. The ledger preserves identity; ordinary repeats may return request_in_progress until separately authorized quiesced recovery, or return a committed terminal replay. A lost ACK after an actually committed terminal result can replay that result without resend. No recovery or retry endpoint is added. See [T10 runtime matrix](implementation/universal-label-pipeline/T10_RUNTIME_MATRIX.md). T07 resource and T06 browser gates remain outstanding.


## T11 acceptance boundary (2026-10-10)

Actual Studio and intake routes are compared through the common binder/raster/IPL sinks using synthetic credentials, transactional fake storage and recorded transport. The 68-case native matrix includes all four symbol kinds and changing data at copies1/999. No current live port schema is used as checkout proof. Complete frozen-contract acceptance remains NEEDS_REPLAN for hard cancellation/native memory; standard intake ledger/configuration lifecycle is still incomplete. See [software](implementation/universal-label-pipeline/T11_SOFTWARE_ACCEPTANCE.md) and [runtime](implementation/universal-label-pipeline/T11_RUNTIME_ACCEPTANCE.md) acceptance. SUBMITTED remains unconfirmed; no operational sender/device readiness is claimed.


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


## SAP RFC configuration

Integrations includes SAP Connections and RFC Operations with revision-checked
configuration, encrypted password storage and effect-free sample mapping tests.
`app/sap_rfc` owns bounded typed inputs and declarative result mapping;
`management/integrations/sap_http.py` owns persistence commands and sample endpoints.
The existing management JSONB snapshot stores the configuration without a schema
migration. API source credentials and SAP logon credentials remain separate.
Label Print reads configured operations and runs SAP Get Data through the
shared execution boundary before saved-layout IPL preview preparation. Management can explicitly fetch an actual RFC response through
the opt-in native worker. Sample tests remain local and never become SAP evidence
or print jobs. Saving a connection is not a connectivity test. See the configurable SAP RFC contracts
section in [MANAGEMENT_CONTRACT](MANAGEMENT_CONTRACT.md) for limits and endpoints.


RFC operations support direct JSON label responses through EV_JSON, with
EV_STATUS success gating and EV_MESSAGE validation. New operations use the
Z_TLS_GET_LABEL_DATA contract and IV_CHARG string input. label_code and all data
fields pass through canonical admission without mandatory field mappings.
Direct structure/table and advanced manual mapping modes remain available.
Existing operations keep their previous mode until explicitly edited and saved.
Configuration/sample acceptance does not itself enable the native worker.
Management actual-response testing requires server opt-in; it does not render or print. Details: [management RFC contract](MANAGEMENT_CONTRACT.md#z_tls_get_label_data-response-contract).

## Label Print server LAN delivery (2026-10-16)

The operator Print action uses POST /api/v1/label-print/print with job_id
(UUID v4), target_id, expected_host, expected_port, artifacts and copies (1..999).
The target is resolved exclusively from enabled Application Management targets;
expected_host/port only detect stale UI configuration and cannot override it.
This route retains the existing loopback/local-origin admission boundary.
All artifacts and IPL framing are validated before the first device effect.
Expired artifacts return 410; changed/disabled targets return 409; oversized
packages return 413; concurrent server delivery returns 429 before sending.
The server reuses prepared previews, converts readable IPL controls to wire
bytes and submits once per selected item, stopping on the first failure.
Response: job_id, status SUBMITTED/STOPPED, confirmed=false, and indexed item
statuses SUBMITTED/FAILED_BEFORE_SEND/UNCERTAIN/NOT_ATTEMPTED. Physical printing
is unconfirmed. Browser pending-job protection survives reload in the same tab;
there is no durable server job ledger or global request deduplication.
The server must have network access to the LAN printer. No local agent or token
is needed for this operator path. The retained print-package endpoint and
standalone local_agent package are separate tools, not prerequisites for LAN.
No SAP fetch, preview, printer catalog or Demo action submits to a printer.

## Explicit LAN printer status (2026-10-16)

Label Print offers Check status for the selected enabled Management printer.
Only that button calls POST /api/v1/label-print/printer-status with target_id,
expected_host and expected_port; no caller-controlled destination is accepted.
The route rechecks saved configuration (409 if changed/disabled), uses the same
loopback/origin and bounded JSON admission as LAN Print, returns no-store and
serializes with LAN delivery (429 while busy). There is no background polling,
selection probe, SAP access, print payload, reset or configuration command.
The server sends one IPL ENQ byte (0x05) to the saved numeric TCP target, with
3 seconds for connection and a further bounded 3-second I/O budget, at most
16 initial response bytes and bounded framed-response reads. No retry exists.
RESPONDING indicates a recognized response, never physical completion. Standard
DC1 means ready/printing/skipping; US combines label-path/ribbon faults. The UI
keeps these ambiguous and displays ATTENTION, UNREACHABLE or UNAVAILABLE for
faults, connection failures and missing/unrecognized responses respectively.
A refused/timed-out connection does not prove power-off. Unknown data cannot
become READY. Responses include a server UTC checked_at timestamp, target,
method IPL_ENQ and confirmed=false. The UI clears results on printer changes,
refresh or Demo and ignores late responses. Results are snapshots, separate
from print-job outcomes; status checks neither unlock uncertain jobs nor grant
print permission. Device/firmware/protocol support still requires separate
named-target acceptance. SNMP is not implemented by this feature.
Protocol references: Honeywell IPL Command Reference, Status Enquiry, and ITE
Programmer's Reference, Printer Status Query Responses:
https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf
https://automation.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/discontinued/software/sps-ppr-937-015.pdf

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

## SVG design admission

`POST /api/v1/design/validate` accepts the existing strict `EditorDraft` shape:
`{svg,width_mm,height_mm,dpi,binding_version:1}`. It runs the current template
admission and checks media/viewBox parity, returning `valid`, `binding_version`,
`template_sha256`, `required_keys` and `node_count`. Errors return HTTP 422 with
a bounded code. The editor body middleware also enforces bounded JSON, media
type and duplicate-key admission. No renderer, storage, SAP or printer is used.
This endpoint validates metadata, not resolved binding values or raster output;
use `/simulation/editor-preview` for output preflight.
## Graphics library

The local-only `/api/v1/graphics` list/search/upload and UUID get/content routes
store immutable PNG/JPEG/WebP assets and insert embedded copies into templates.
The request, limits, errors and explicit provisioning procedure are defined in
[GRAPHICS_CONTRACT.md](GRAPHICS_CONTRACT.md). Asset version replacement and bulk
template updates remain unsupported.


## Historical 2026-10-17 - Optional logical print target (superseded below)

Canonical print envelopes may include top-level `target_id` using the existing
ASCII identity syntax (1..128 characters). Explicit null/empty values and IP/URL
addresses are invalid. Simulation forbids this field. Omission preserves the
source default and historical canonical serialization/HMAC for existing requests.

The selected ID must equal the source's `print_target_id` or occur in its
`allowed_print_target_ids`, and resolve to an enabled registered target. An
unpermitted explicit selection returns 403 `target_not_allowed` before ledger
or replay access. Management validates additional references and blocks deleting
a target referenced by either default or additional source permission. The UI
exposes additional printer checkboxes under each source's print permissions.

The target participates in immutable request identity: changing it under an
existing request ID returns 409 `request_conflict`. Identical terminal retry
replays the retained result without sending again. Destination addresses, ports,
permissions and policy revision are rechecked before each durable send claim;
policy changes never silently reroute a retained transaction. `SUBMITTED` with
`confirmed:false` remains transport handoff, not proof of physical output.


## 2026-10-18 - Explicit target in simulation and print

External `POST /api/v1/label-intake` requires top-level `target_id` in both
`simulation` and `print`. Missing, null, empty or malformed targets return 422.
The authenticated source must permit the requested mode and list the exact ID
in `allowed_print_target_ids`; the registered target must exist and be enabled.
Unknown, disabled or unpermitted targets return 403 `target_not_allowed` before
ledger lookup, layout resolution or rendering. Addresses/ports remain server-owned.
There is no target fallback and no implicit permission from `print_target_id`.

The sender (ABAP program or SAP Simulator) owns workstation-to-target mapping.
It must reject a missing/inactive/incomplete station mapping before RFC reads
or HTTP submission, then include the selected target in either mode. The label
server does not discover operator workstations or choose replacement printers.
Simulation validates routing but never constructs/submits a printer transport;
its response includes the validated top-level `target_id`, also retained on replay.
It does not establish printer reachability or physical printing.

Management sources use one `allowed_print_target_ids` list for both modes. A
non-null `print_target_id` is rejected on source writes. This nullable legacy
field remains readable solely for persisted historical configuration; routing
ignores it. Authorized administrators must explicitly move any intended old
default permission into the allowed list and clear the old field. There is no
automatic configuration migration. Empty allowed lists grant no target access.
Printer assigned-source counts and lists include every allowed source reference.

Target remains part of the canonical request/HMAC. Never add a target to an old
request ID silently, mutate ledger entries, or resend an uncertain transaction.
A new target-bearing transaction is distinct from historical targetless requests.
The generic Studio dataset format still accepts targetless data; this mandatory
field belongs to the external intake contract, not editor preview or RFC data.
