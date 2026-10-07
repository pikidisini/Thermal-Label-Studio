# Architecture

## Current application

The local checkpoint scope is Studio without authentication, layout editing,
local SVG import/export, local JSON exploration, versioned layout save/open,
Preview, Label Simulation PNG and fixture simulation. Global graphics, shared
access authentication, SAP intake, job orchestration, physical printers and
production operations are follow-up work. Planned global graphics, data/protocol
export and print controls explain their status without calling unavailable APIs.


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
| `simulation/editor_http.py` | Bounded current-canvas SVG to server-rendered 1-bit PNG |
| `simulation/http.py` and `simulation/service.py` | Application-owned synthetic fixture preview |
| `labels/` and `engine/` | Strict label/layout/fact contracts and fixture binding/rasterization |
| `jobs/`, `sap/`, `printing/` | Independently tested foundations; not wired live workflows |
| `frontend/src/features/` | Current editor tools, layouts, preview and diagnostics |
| root `engine/` | Retained implementation assets; not imported by the active backend |

The active processing acceptance route resolves the fixed fixture catalog and
returns acceptance metadata. It does not render, print, invoke SAP or select the
latest persisted Studio layout. Durable layouts and approved processing layouts
are separate implemented boundaries; their integration remains future work.

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
15-second timeout, and returns PNG. Stored authored SVG is unchanged. A one-pixel
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
current preview returns PNG; the IPL boundary is tested with fakes. Shared payload
orchestration, actual SAP contract/intake, physical transport, job orchestration,
access control, migrations, backup/restore and production operations remain
incomplete. Archived phase descriptions are historical reference only.
