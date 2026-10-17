# Architecture

## Server LAN printing and standalone agent

Label Print retains successful prepared output in a bounded expiring artifact
cache. The operator explicitly submits selected artifacts to /label-print/print.
The server revalidates an enabled Management target and expected host/port,
encodes the selected copy quantity from the bound bitmap, converts IPL controls
to wire bytes and submits once using TCP/RAW. No agent token or mapping is
required for LAN. Preview, catalog and Demo never contact a printer.
Browser pending-job/uncertainty protection is local to the tab; this route has
no durable server job ledger or global replay prevention. It remains separate
from intake identity/ledger and Studio editor printing.
The retained print-package endpoint prepares payloads without transport. The
standalone local_agent package separately supports workstation Ethernet/USB
maps and SQLite job identity. It is not mounted in the operator LAN flow.
See local_agent/README.md for its independent setup and acceptance boundaries.


## SAP operator preview integration

Label Print uses Management's public execute_operation boundary to reuse native
RFC execution, credential recovery and revision validation without calling an
HTTP endpoint internally or duplicating the connector. Management's execute
route and the batch preview route share this function. Only admitted label_json
responses enter the existing saved-layout/shared-engine preparation path.
The UI passes a saved operation id, revision and batch-parameter name; backend
revalidates all of them. No SAP or physical-printer acceptance is inferred from
source tests or browser mocks. Runtime target opt-in is still required.

## Operator printer catalog

`GET /label-print/printers` projects management snapshot targets through the
management package's public `read_snapshot`/`configured_store` boundary. The
operator client has no dependency on the Management UI and loads only target
identity, IP/port, enabled state and implemented IPL/Ethernet/TCP RAW capability.
This read path never instantiates printer transport or an agent connection.
The browser validates the catalog, keeps configured selection separate from
Demo selection, and clears configuration selection on reload/failure.

## Editable test data

`features/management/datasets` owns the typed dataset table, JSON import/export,
explicit save and conflict/uncertain-write lock. It uses existing
`studio_sample_datasets` storage, independently of management policy state.
PUT performs optimistic timestamp concurrency; no schema changes or deletion.
Dataset preview resolves `item_id` as batch and `label_code` through existing
LayoutService, reusing checksum-verified SVG and pinning the loaded version
per code within one request. Canonical binder/engine still owns field admission,
raster and exact IPL decoding. Test data is never an automatic SAP fallback.

## Operator fixture pipeline

`app/label_print` owns fixed batch-to-fact/template resolution and its local-only
preview HTTP contract. It delegates canonical binding/raster/encoding to
`engine.pipeline.prepare_draft_output` and exact IPL decoding to
`simulation.service.simulate_prepared_output`. It does not reuse the retired
text-only fixture binder, contact storage or invoke print transport. Fixture
data is an explicit source, never a fallback. `features/label-print/api` validates
response ordering, provenance/media and PNG headers before displaying images;
page revisions and AbortController prevent stale-response presentation.

## Application entry menu

`features/home` owns the root activity menu; `features/label-print` owns the
operator batch-entry page at `/print`. Batch editing is browser-local. Explicit
Get Data uses configured native RFC operations for SAP or saved datasets/layouts
for Test Data, then prepares output through the shared engine. Successful selected
artifacts can be submitted to a registered LAN printer through the server.
An explicit Demo mode builds browser-local illustrative PNGs and example printer
choices; Demo never executes SAP or transport. Its images are not decoded IPL
or actual SAP results. The operator source menu offers SAP and Test Data only;
fixture data remains backend regression support. Failed SAP never falls back to
sample data. See the operator integration and server LAN sections above.
`app/routes.tsx` selects explicit lazy page modules for Home, Studio, Label Print,
Management and fixture simulation. Unknown client paths render Not found instead
of falling back to Studio. `main.tsx` only bootstraps preferences, shared styles,
startup boundaries and routes. `features/studio` owns the editor page and its
autofit, keyboard shortcuts and initialization hooks; layout and modal components
retain their current editor ownership. Root stores remain cross-feature editor
state consumed by canvas, templates, data tokens and simulation; moving them
through a Studio barrel would risk importing the full editor or closing cycles.
`shared/ui/ApplicationBrand` owns the logo/wordmark and Home action, while
`ApplicationPageShell` and its bootstrap-loaded CSS own chrome used by Home and
Label Print. Feature styles no longer import Home CSS from Label Print.
The route module selects these pages
without importing Studio/diagnostics. The backend serves the frontend shell
at `/` and `/print`; `/` no longer redirects to Studio. Existing editor print
behavior remains owned by `features/printing`. Native RFC and server LAN output
are separate feature boundaries composed by Label Print; durable operator job
orchestration, standalone agent integration and legacy-browser acceptance are
not established by page navigation.

## Application Management

Operational history belongs to `backend/app/activity/` (request-local collection,
explicit PostgreSQL store and output-route ASGI middleware). Management's
`activity/http.py` and frontend `activity/ActivitySection.tsx` provide a read-only
history view. `app_management.activity_log` is separately provisioned and enabled;
configuration audit and durable intake ledger retain their existing ownership.
Collection wraps admission but sits inside server correlation. Safe stages survive
sync endpoint threadpool context copying through the request-local collector;
requests never share collectors. A post-execution best-effort write cannot change
submission results or cause a print retry. See the Activity Log management contract.

Integrations owns access key creation, rotation, revocation and explicit legacy
environment migration, encrypted recovery and atomic new-source/key creation.
`app_management.management_state` stores the management JSONB document, key
hashes and AES-256-GCM ciphertext; `app_management.management_audit` stores audit
history. Templates and their versions remain in `label_studio`. Both schemas
share the existing database and one connection for atomic template/configuration
changes. Explicit provisioning creates management tables directly in
`app_management`; runtime never provisions tables or falls back to another schema.
The persistent `TLS_MANAGEMENT_KEY_ENCRYPTION` server secret is kept outside the
database. Identity and key ID bind the ciphertext; public projections omit hashes
and ciphertext from all responses and audit records. Explicit reveal alone
returns the raw key with no-store caching, without changing policy revision. Intake
uses managed key state before legacy environment references, with no fallback
after revocation. Local development access remains separate from browser login.

Utilities opens `/management`, with feature-owned UI and API under
`features/management` and `app/management`. Local account login is deferred.
The optional PostgreSQL managed-policy snapshot and append-only audit require
explicit schema provisioning; normal startup does not apply it. Default read-only
management preserves environment intake policy. See [management contract](MANAGEMENT_CONTRACT.md)
for scope, activation, local access guard and exact source/runtime boundaries.

Both management boundaries use `overview/`, `templates/`, `printers/`,
`integrations/` and `audit/` ownership directories. Frontend `ui/ManagementPage.tsx`
composes the sections and feature-owned forms; `hooks/useManagement.ts` owns the
shared fetch lifecycle and mutation lock. Template preview belongs to `templates/`.
The feature `index.ts` remains the public page export for external callers.

Backend `router.py` composes feature-owned HTTP routers. `access.py`, `errors.py`
and `middleware.py` provide shared admission. `store.py` retains PostgreSQL
revision locking and the atomic snapshot/audit transaction; feature services
only change the supplied document. Shared `models.py` owns the base command and
document; feature command models stay with their feature. Template `records.py`
is dependency-light so the document and template commands do not form an import
cycle. Intake consumes only the management package's public configured-store and
error exports, without importing its HTTP routers. Intake remains the policy and
execution owner. The ownership-directory split preserves URLs and stored document
shapes. Management storage uses the dedicated `app_management` schema.

## Current application

The local checkpoint scope is Studio without authentication, layout editing,
local SVG import/export, local JSON exploration, versioned layout save/open,
Preview, Label Simulation PNG, fixture simulation and configured IPL
Print, and the local Graphics library with immutable embedded-copy insertion. Shared
access authentication, actual SAP ECC integration, job orchestration, physical printer acceptance and
production operations are follow-up work. Graphic Update Center and data/protocol
export controls explain their status without calling unavailable APIs. Graphics
uses bounded PostgreSQL bytea assets, independently provisioned; it introduces no
render-time lookup or template asset metadata. See GRAPHICS_CONTRACT.md.


One application serves `/studio`, `/fixture-simulation`, compiled frontend assets,
and the active API. Studio has no login, session, CSRF client or simulated user
role. It is a local development application; server authentication, authorization
and admission controls are prerequisites for a future shared deployment.

`backend/app/main.py` composes the API. `config.py` validates server settings,
`runtime.py` serves the frontend and dependency-presence readiness, and
`observability.py` emits bounded correlated events without business payloads.

| Boundary | Current responsibility |
| --- | --- |
| `layouts/` | Direct PostgreSQL metadata/version history and immutable MinIO SVG storage |
| `simulation/editor_http.py` | HTTP admission and decoded prepared-payload PNG response |
| `simulation/http.py` and `simulation/service.py` | Application-owned synthetic fixture preview |
| `labels/` and `engine/` | Strict label/layout/fact contracts and fixture binding/rasterization |
| `printing/` | Studio IPL HTTP entry with action target and TCP RAW transport, unconfirmed delivery |
| `label_data/`, `template_binding/` | Canonical data, versioned metadata admission and bounded text/symbol binding |
| `label_intake/` | Explicit sender/policy admission, durable identity/replay and shared output execution; incomplete resource/runtime acceptance |
| `studio_datasets/` | PostgreSQL JSONB sample datasets, separate from immutable layouts and intake identity |
| `jobs/`, `sap/` | Independently tested foundations; not wired live workflows |
| `frontend/src/features/` | Current editor tools, layouts, preview and diagnostics |
| root `engine/` | Retained implementation assets; not imported by the active backend |

The opt-in `/api/v1/label-intake` is distinct from the older fixture acceptance
route and the unactivated ECC adapter. See the current pipeline STATUS.md for
local sample_roll simulation/replay evidence and unresolved T07/T10/T11 gates.
Dependency-presence readiness alone does not prove storage connectivity,
intake policy/ledger readiness, packaged acceptance or physical delivery.

The active processing acceptance route resolves the fixed fixture catalog and
returns acceptance metadata. It does not render, print, invoke SAP or select the
latest persisted Studio layout. Durable layouts and approved processing layouts
are separate implemented boundaries; their integration remains future work.

## Frontend module ownership

Browser preferences belong to `frontend/src/features/preferences`: its controls
and Zustand store persist language/theme under
`thermal-label-studio.preferences.v1`. Feature-agnostic `shared/i18n` owns the
typed Indonesian dictionary, English fallback and locale subscribers. Semantic
CSS tokens provide dark/light editor palettes; `index.html` applies saved
appearance before paint, and the preference initializer subscribes to OS changes
with cleanup. Authored canvas objects, SVG/PNG pixels and protocol values remain
outside these UI preferences.

Keep feature-specific UI, hooks and helpers inside their owning feature.
Canvas owns Fabric SVG import/export under `features/canvas/svg/` and draft
serialization/recovery under `features/canvas/draft/`. Templates owns local
SVG admission checks under `features/templates/lib/`. Diagnostics owns its
recorder and report generator under `features/diagnostics/model/`.

Production callers outside a feature should use its `index.ts` public exports;
code inside the feature can import its own implementation directly. Reuse
by another feature does not remove the original feature's ownership.
`shared/` holds reusable code without feature-specific responsibilities,
such as UI primitives and the common API base path. Do not introduce global
`utils/` forwarding files for feature-owned implementations. Studio composes
the feature APIs into the editor workflow; this organization does not imply
that all existing root hooks or stores have been migrated.

## Studio preview

Both Preview view and Label Simulation capture the current Fabric draft and explicit selected data, then call
`POST /api/v1/simulation/editor-preview` through one frontend client. The Preview
view makes one render request and uses the same returned PNG in both panels;
its optional display effect is cosmetic, not printer evidence. The cutoff is 128.
Stale images are cleared before a new render; superseded requests are aborted and
late responses are ignored. No legacy `/render`, `/templates/parse-raw`, session,
SAP/operator or print request belongs to this flow.

The server validates restricted SVG, dimensions/DPI and bitmap bounds, normalizes
preview font declarations to the configured renderer font, invokes resvg with a
15-second timeout, encodes the processed one-bit PNG as readable IPL G/u/U,
and decodes that exact payload into the returned PNG. Stored authored SVG is unchanged. A one-pixel
physical-dimension rounding difference is padded with white; larger mismatches
fail closed. Windows source checks use explicit local renderer/font defaults;
the standard image packages resvg and Liberation Sans. Pixel equivalence across
fonts/platforms is not claimed.

## Durable layouts

`app.layouts.LayoutService` uses direct psycopg and MinIO SDK calls. PostgreSQL
schema `label_studio` stores active versions and history. MinIO stores immutable
SVG under server-owned `layouts/{label_code}/v{version}/layout.svg` keys. The server
owns version, checksum and object key; no caller storage path is accepted.

A save acquires a per-label PostgreSQL advisory transaction lock before allocating
its version. Existing immutable object keys are skipped, with at most 32 probes.
Successful saves publish metadata and make the matching version active. Version
numbers may have gaps after failed operations.

The database and object store do not share an atomic transaction. Upload or commit
acknowledgement failures can leave an unreferenced SVG, or metadata that committed
despite a failed response. The writer never deletes a possibly committed artifact
as compensation. A later save allocates a fresh key and cannot overwrite the
uncertain artifact. Failed API responses remain failures; this is not an
idempotency guarantee. Orphan reconciliation is future authorized operational
work. Do not delete objects based solely on an API error.

Storage drivers load only when all persistence settings are configured. Startup
initializes schema/bucket and therefore performs external writes. Unconfigured
layout endpoints return 503; fixture preview does not require storage drivers.
Live P8C save/open/restart evidence is dated in task records; this change uses fakes
and does not repeat those live operations.

## Runtime and quality boundaries

One root Dockerfile, docker-compose.yml and requirements.txt define the standard
application. Compose binds host ports to loopback and preserves explicitly named
external PostgreSQL/MinIO volumes. `/health` is liveness; `/ready` checks renderer,
font and frontend presence, not current database/object-store connectivity.

The local Jenkins job validates a curated source snapshot and runs SonarQube.
It does not check out or deploy code. Source-gate PASS, quality-gate PASS, live
runtime acceptance and production approval are separate evidence categories.
Generated source-gate reports and Playwright artifacts belong to unique `.tmp/`
children. Source tests remain under backend/tests and frontend/tests.

## Target processing contract

`SAP/API -> validate label_code -> resolve layout -> bind SVG -> raster bitmap
-> shared encoded payload -> simulation sink OR print transport`.

Simulation and physical delivery must consume the same processed output. The
current Studio and fixture previews return PNG decoded from the shared IPL codec;
fixture capture retains exact payload evidence. The IPL submission boundary is
tested with fakes. Actual SAP contract/intake, physical transport, job orchestration,
access control, migrations, backup/restore and production operations remain
incomplete. Archived phase descriptions are historical reference only.

## Studio sample dataset storage

`backend/app/studio_datasets` owns user-uploaded example JSON, separate from SAP
processing and layout persistence. PostgreSQL `label_studio.studio_sample_datasets`
has UUID id, name, original_filename, payload JSONB, created_at and updated_at.
One upload is one row, preserving the entire parsed envelope, all items and
field descriptions. There is no MinIO dependency for datasets. Persistence startup
initializes this table only with configured, authorized storage; fixture startup
imports no storage drivers. Schema execution and real roundtrip/restart behavior
require separate named-target authorization and are not established by fake tests.


Frontend visual controls use CSS custom properties in `frontend/src/index.css` as the single source for palette pairs, UI typography, compact/default sizes, spacing, borders, radius, shadows, backdrop and motion. Shared primitives expose semantic `tone`, `variant`, `selected` and disabled treatment; native feature controls use the same `data-ui-*` contract. Keep caller classes for layout and deliberate technical geometry. Use compact/stepper variants for narrow editor fields. Selected colors have paired foregrounds. Planned actions remain native-disabled and use the generic planned hover treatment. Focus-visible stays observable. Reduced motion applies only to marked controls, chrome animations and modal portals; authored SVG, Fabric objects and export pixels remain outside UI styling.


Industrial Dark uses graphite surfaces and muted steel, sage, ochre and brick accents; Industrial Light uses neutral warm-grey surfaces. Selected controls retain dark paired foregrounds. The palette changes application chrome only, including rulers, and preserves the white authored canvas and exported pixels.


Appearance choices are Dark, Light, Industrial Dark, Industrial Light and System. Dark/Light retain their original palettes; the industrial choices use graphite/steel and warm-grey with muted status accents. System follows the original Dark/Light palettes. Browser-local preferences retain the v1 key and accept all explicit theme IDs; theme selection changes UI chrome only.


The pure codec in `backend/app/protocols/ipl/` owns six-bit vertical G/u columns
and the supported U/format/print parser. Shared `engine/pipeline.py` prepares an
immutable bitmap/payload/language output; layout dimensions and DPI remain authoritative.
`simulation` decodes that payload and `printing/service.py` submits its exact bytes
once through an injected transport. Neither sink rasterizes or encodes.
Tiles at most 799dots per side preserve the full 4096-dot side / 4 million pixel canvas
bounds. Up to36 graphics use reserved IDs64..99 and format 90. Decoder placement
uses canvas x/y with direction 0 and bounded origin/scale; unsupported commands
fail closed. This logical placement needs full-media PM45 physical verification.
See `print_guide/IPL` for the successful 160 x 96 dot baseline and state effects.


Shared preparation lives in `engine/pipeline.py`; `engine/raster.py` owns resvg,
font normalization and monochrome conversion for both server-bound Studio SVG and
resolved/bound fixture layouts. Fixture output dimensions remain strict; Studio
permits its existing one-pixel viewport edge normalization. `engine/output.py`
provides immutable bitmap, language and payload metadata. `protocols/registry.py`
selects the implemented IPL encoder/decoder and rejects unsupported languages
before rasterization. IPL encoding, decoding and errors live under `protocols/ipl/`.
Simulation owns decoded capture; printing owns only submission semantics through
an injected transport. Print has no dependency on simulation or codec modules.


## Studio printing with an action target

`printing/http.py` owns print HTTP requests/default inspection; it does not import
simulation models. `GET /api/v1/printing/target` reads the optional server default
without a connection probe. `POST /api/v1/printing/editor` accepts current draft SVG/media,
explicit data, IPL, required copies1..999 (the UI starts at1) and a structured
`target:{host,port}`. The explicit
action target takes priority; clients omitting it may use the optional environment
default. Invalid target fails before raster or transport construction. No global
server configuration mutation or database write is involved.

The server prepares once and submits its immutable payload to `TcpRawTransport`.
Prepared output retains copies metadata. Native `<RS>N` quantity with `<US>1`
requests N identical labels through one payload/connection; the raster/encoder
are not repeated per copy. Decoder captures one logical canvas regardless of quantity.
One numeric IPv4/IPv6 TCP socket uses a 3-second connect timeout and 10-second send
timeout, sends exact bytes once, then closes on success/failure. It reads no feedback
and retries nothing. Targets reject DNS names, URLs, scoped IPv6, multicast and
unspecified addresses; port must be an integer 1..65535. Response echoes the effective
target. Missing both explicit/default targets returns 503 before rasterization.

The feature-owned Print dialog exposes IP/port (default 9100), prefills last valid
browser target before optional server default and remains usable if default loading
fails. `features/printing/model/printerTarget.ts` validates target fields and stores
only the last valid target under `thermal-label-studio.print-target.v1`; invalid or
unavailable storage falls back safely. Late default responses never overwrite user
edits. Opening, editing and remembering target never contacts the printer.

Print uses current SVG rather than stale preview pixels and validates existing
bindings. A synchronous lock blocks duplicate clicks; close/fields are disabled
while a request is running. Success unlocks the fields/Print button for another
deliberate action. Known pre-submission validation/preparation failures also unlock;
uncertain outcomes stay locked until inspection and dialog reopening. `SUBMITTED` with `confirmed=false` means local socket acceptance, not
physical printer acceptance. Unknown/lost responses are uncertain; inspect the
printer before a new explicit attempt. Real PM45 delivery remains NOT RUN for
this integrated feature.


## T02 canonical data owner

label_data owns strict envelope/scalar/raw JSON admission; studio_datasets owns upload metadata and persistence only. Frontend data-tokens owns matching validation and explicit historical working-copy policy. No intake endpoint, binder, ledger or approval policy is wired by this slice.

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

## T07 intake ownership and unresolved execution boundary

`backend/app/label_intake/{http,service,results}.py` owns canonical HTTP admission, stored-version pinning, sequential batch simulation and public results. It delegates draft binding/raster/IPL preparation to the existing engine and IPL decoding to the existing simulation sink. It imports no fixture registry, dataset writer or printing transport. Studio remains unchanged. The concrete layout reader now reads at most 512 KiB + 1, distinguishes artifact corruption from storage unavailability, and returns exact checksum-verified SVG bytes.

The route is registered and T09 server-owned bearer/source policy fails closed by default; durable identity/replay is T08. A single process slot plus finite source/output reservations is implemented. T07 hard resource acceptance remains NEEDS_REPLAN because synchronous storage calls cannot be interrupted by the cooperative batch deadline and the renderer has no OS memory fence. An isolated cancellable execution boundary must preserve pinned input and shared binder/engine semantics; it must not leave unbounded background work or permit a second worker while a timed-out worker still runs. See [T07 review](implementation/universal-label-pipeline/results/T07_REVIEW.md).

## T08 ledger ownership

`label_intake/identity.py` owns canonical domain-separated HMACs; `ledger.py` owns PostgreSQL transactions through a fresh injected connection factory; `ledger_models.py` validates retained print metadata without enabling a print sink; `durable_service.py` coordinates existing pinning/preparation with atomic admission and protected terminal simulation storage. Shared engine/raster/codec/Studio paths are unchanged. The old metadata-only jobs foundation is not used as external identity or send eligibility.

Review-only `backend/schema/002_label_intake.sql` defines permanent capacity/key-version/request tombstones, bounded item states and protected simulation results. No startup migration or operational factory is wired; external admission remains closed. The durable service commits pinned admission before preparation and committed terminal output before reporting success. A claim returns eligibility only after commit acknowledgment; recovery never sends and cleanup never deletes identity tombstones. Live PostgreSQL locking/restarts/security/runtime remain T11 gates.

## T09 policy ownership

`label_intake/policy.py` owns immutable source/capability policy, credential verification, explicit per-source print routing/copies limits, retained historical approval events and deterministic numeric server targets. HTTP admission precedes stored-layout/ledger dependencies and retained-result disclosure. `preflight_print` freezes target ID/revision/address; `revalidate_claim` checks current credential, source, grant and original target/revision before T10 claims. These APIs perform no render, storage mutation or transport. Existing layouts publishing, Studio per-action targets, jobs, engine and Data Tokens remain separate and unchanged. Environment reload retains audit prefix and requires a new revision for changes; durable audit history across restart is T11, not a database claim. See [policy operations](implementation/universal-label-pipeline/T09_POLICY_OPERATIONS.md).

## T10 intake print owner

`label_intake/print_service.py` resolves immutable stored versions with existing pin_layout, authorizes every target/version/checksum/copies before rendering, commits T08 ordered pins, then prepares all items through the unchanged prepare_draft_output and PreparedOutput owners. It retains bounded IPL/PNG transiently and validates/reserves public response before claims. Every current policy recheck precedes committed SEND_CLAIMED; the existing TcpRawTransport is constructed afterward and submit_prepared_output is invoked once. There is no second raster/codec, fixture fallback, retry or spooler. Simulation has no transport invocation.

T08 ledger gains detailed static pre-claim failure metadata, nullable unresolved target IDs, proven no-submit settlement of claimed items, and terminal metadata returned only after acknowledged commit. Pre-connect failures are classified by the existing TCP transport as PrintBeforeSendError; sendall or close ambiguity remains uncertain. Manual Studio still catches the same submission superclass and preserves its conservative uncertainty flow. T10 is NEEDS_REPLAN for the same outstanding hard cancellation/native-memory boundary as T07, not accepted operational print readiness.


## T11 assembled-pipeline review (2026-10-10)

The assembled native HTTP acceptance uses the same prepare_draft_output/PreparedOutput/IPL codec for Studio and stored intake; only the final simulation or recorded transport sink differs. Identical parameters produce exact shared output in the tested profile. Mandatory storage cancellation/native memory enforcement remains unmet. Standard lifespan installs layout/dataset services but no intake ledger; controlled ledger/schema/key/policy lifecycle and cross-restart audit history remain required runtime work. See [T11 software](implementation/universal-label-pipeline/T11_SOFTWARE_ACCEPTANCE.md) and [T11 runtime](implementation/universal-label-pipeline/T11_RUNTIME_ACCEPTANCE.md). No second engine or automatic operational setup was introduced.


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

## AI design authoring

The optional `tools/mcp/design_server.py` STDIO sidecar exposes the current
binding contract and delegates template reads, SVG admission and PNG preview to
the loopback application API. Opt-in save preflights through the shared preview
before publishing a version via LayoutService. It has no direct database/object
store access or editor session synchronization. See `tools/mcp/DESIGN.md`.


## Studio keyboard ownership (2026-10-17)

`features/studio/model/studioShortcuts.ts` defines bindings, help descriptions,
Design scope and repeat policy. The Studio keyboard hook and feature-owned help
UI consume this catalog. Studio wires callbacks to existing canvas actions;
keyboard handlers do not duplicate edit logic. Shared keyboard context guards
are used by Studio, line cancellation and viewport Space panning. Local dialog
and menu keyboard behavior remains owned by those components.


Object clipboard state belongs to `useObjectOrderingActions`, alongside its
selection actions. It serializes with `CANVAS_SERIALIZE_PROPS`, enlivens only
its own in-memory snapshot, and shares transactional insertion with Duplicate.
Studio connects keyboard and Edit-menu callbacks to these same actions. No
clipboard API permission, server storage or printer effect is involved.


## 2026-10-17 - Sender-selected logical destinations

External print intake accepts optional `target_id`, restricted to the authenticated
source's default plus `allowed_print_target_ids`. The policy owns numeric network
addresses. A sender may map plant/station context to a logical ID; workstation
IP addresses and local printer pairing are not required for server TCP delivery.
The sibling SAP Simulator persists this mapping locally and freezes the selected
ID into each transaction. It does not administer the receiving printer registry.
Absent target IDs retain existing canonical digests. Selected IDs enter the
request digest and preflight/claim pin. No label storage migration is required:
additional permissions use the existing Management policy document.
