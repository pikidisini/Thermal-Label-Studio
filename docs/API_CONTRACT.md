# API contract

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
composed SVG/media/DPI to /api/v1/simulation/editor-preview. The Preview panels
share its PNG; no legacy render/parse-raw request is part of this flow.

Layout saves use a per-label transaction lock. Existing immutable object keys
are skipped, with at most 32 probes, so versions may have gaps. A failed response
may reflect a rolled-back transaction or a committed transaction whose response
was lost. Artifacts are preserved in both cases; a later save uses a fresh key.
This is not request idempotency and unreferenced object reconciliation is future
operational work. Clients must not claim a failed save succeeded or automatically
delete artifacts. Allocation exhaustion returns layout_persistence_unavailable.

### Template library management

`PATCH /api/v1/layouts/{label_code}` accepts only `{ "title": "New name" }`
and returns the updated layout summary. Names must be nonblank strings of at
most 160 characters. The display name override does not change label_code,
version metadata, SVG bytes, checksum, or object key. A later explicit canvas
save publishes a new version with the submitted title.

`DELETE /api/v1/layouts/{label_code}` returns 204 and records a logical deletion.
Deleted layouts are excluded from listing and opening; versions and SVG objects
remain retained. Unknown/already deleted layouts return 404; unavailable storage
returns 503. Saving under a deleted identifier returns 409; use a new label code.
Management and saves share the per-label transaction lock.

Startup schema initialization adds nullable title_override and deleted_at columns
idempotently to existing layout headers. This requires normal authorized persistence
startup; source tests do not migrate operational storage.


## Canonical label-data admission and local exploration (T02)

`backend/app/label_data` owns canonical validation and typed models; there is no universal intake endpoint or orchestration yet. POST /api/v1/label-intake remains a future T07 contract. Fixture facts/acceptance routes are unchanged.

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

`POST /api/v1/printing/editor` accepts `{svg, width_mm, height_mm, dpi, encoder,
target:{host,port}, copies}`. Copies defaults to 1 and must be a strict integer
1..999. Native IPL `<RS>N`/`<US>1` requests that many identical rendered labels.
The explicit target overrides the optional server default
for this request only. Existing clients may omit `target` to use the default.
Target host must be numeric IPv4/IPv6; DNS names, URLs, scopes, multicast and
unspecified addresses fail closed. Target port is a strict integer 1..65535.
Unknown top-level host/port/profile fields and extra nested target fields
remain rejected. No global target-update endpoint or database setting is added.

SVG is bounded restricted Studio content; dimensions are 10..500 mm, DPI 72..600,
and final pixels remain at most 4096 per side / 4 million total. Encoder defaults
to IPL and only IPL is accepted. Layout controls dimensions/DPI without a printer
profile compatibility gate. Target validation precedes raster/transport creation.

Response is `{request_id, status:"SUBMITTED", confirmed:false, width_px,
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
