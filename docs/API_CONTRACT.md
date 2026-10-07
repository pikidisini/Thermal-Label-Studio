# API contract

Current API includes `/layouts` persistence and editor preview. The standard
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
bounded trace, the exact `RenderedLabel` object or `None`, and a bounded error
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

Phase 7F adds a direct Python bitmap-only IPL/fake submission boundary, separate
from HTTP. `submit_processed_bitmap(bitmap, profiles, transport)` accepts an
existing `RenderedLabel`, resolves a server-owned profile by its label code,
validates exact PNG dimensions/mode/DPI, encodes once, and submits exact bytes
once. The result retains source bitmap, profile ID, payload, `SUBMITTED`, and
`confirmed=False`; invalid input fails before submission and transport errors
are bounded failure-or-uncertain outcomes with no retry. There are no request
destination fields, active profiles, real transport, print endpoint, or job
orchestration. Simulation still captures PNG only; its same object is accepted
as this encoder's input. HTTP accepted-only semantics remain unchanged.

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

The future simulation sink will capture that output and never invoke physical transport. Printing
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
`POST /api/v1/layouts` accepts exactly the authored layout body and returns the
new version summary with HTTP 201. The server validates safe SVG, assigns the
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
composed SVG/media/DPI to /api/v1/simulation/editor-preview. The Preview panels
share its PNG; no legacy render/parse-raw request is part of this flow.

Layout saves use a per-label transaction lock. Existing immutable object keys
are skipped, with at most 32 probes, so versions may have gaps. A failed response
may reflect a rolled-back transaction or a committed transaction whose response
was lost. Artifacts are preserved in both cases; a later save uses a fresh key.
This is not request idempotency and unreferenced object reconciliation is future
operational work. Clients must not claim a failed save succeeded or automatically
delete artifacts. Allocation exhaustion returns layout_persistence_unavailable.
