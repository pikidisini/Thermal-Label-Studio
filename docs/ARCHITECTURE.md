# Architecture

## Current application

The local checkpoint scope is Studio without authentication, layout editing,
local SVG import/export, local JSON exploration, versioned layout save/open,
Preview, Label Simulation PNG, fixture simulation and configured IPL
Print. Global graphics, shared
access authentication, SAP intake, job orchestration, physical printer acceptance and
production operations are follow-up work. Planned global graphics, data/protocol
export controls explain their status without calling unavailable APIs.


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
| `jobs/`, `sap/` | Independently tested foundations; not wired live workflows |
| `frontend/src/features/` | Current editor tools, layouts, preview and diagnostics |
| root `engine/` | Retained implementation assets; not imported by the active backend |

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

Both Preview view and Label Simulation export the current Fabric canvas and call
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
font normalization and monochrome conversion for both composed Studio SVG and
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
without a connection probe. `POST /api/v1/printing/editor` accepts current composed
SVG/layout dimensions/DPI, IPL, copies 1..999 (default 1) and a structured
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
