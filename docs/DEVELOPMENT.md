# Development

## Optional MCP tooling

`tools/mcp/` provides a separate local STDIO inspection server for AI clients.
It uses its own virtual environment and ignored local credentials, exposes only
bounded table/column inspection and reads, and does not initialize storage.
See [MCP setup and reader provisioning](../tools/mcp/README.md). Creating its
dedicated database role is a separate authorized administrative action.
The separate [MinIO MCP server](../tools/mcp/MINIO.md) reads layout object lists,
metadata and bounded SVG text. It uses a dedicated reader policy and its own
ignored `.env.minio`, with no bucket initialization or object writes.
The [Jenkins MCP server](../tools/mcp/JENKINS.md) reads allowlisted job metadata,
existing build status and opt-in bounded logs. Its dedicated account provisioning
is a separate authorized admin action; server startup uses only the reader token.
The [SonarQube MCP launcher](../tools/mcp/SONARQUBE.md) also lives under `tools/mcp/`.
It uses the pinned SonarSource STDIO container and a separate ignored `.env.sonar`.

## Current source and launch

Work from README.md, AGENTS.md and the five active contracts. Source lives in
backend/app and frontend/src. `.archive/` contains retired source and dated
prototype instructions; never import it or use it as a launch path.

One root Dockerfile and docker-compose.yml run the app, PostgreSQL and MinIO.
Root requirements.txt supplies pinned Python runtime dependencies plus test tools;
frontend/package.json and package-lock.json define frontend dependencies. Tests
use existing local tools. Install dependencies only within an authorized task.

Compose uses ignored root .env, populated from .env.example. The application does
not load .env itself. Fill the independently verified renderer SHA256 and local
storage credentials; use a URL-safe database password for the Compose DSN.
The image uses non-root UID 10001 and packaged resvg/Liberation Sans. Current
MinIO image thermal-minio-source:2025-10-15 must be available before launch.

After authorization for the named local target and prerequisite checks:

```powershell
docker compose up --build -d
```

The app binds 127.0.0.1:8002 by default, PostgreSQL 5434 and MinIO 9002/9003.
`/studio` has no authentication. Do not expose this local application as a shared
service before implementing server access controls. `/fixture-simulation` is
another page in the same application, not a separate deployment mode.

Configured persistence initializes PostgreSQL schema/MinIO bucket on startup.
Starting it is an external write action. Unconfigured layout endpoints return
503 and storage drivers are not loaded. Source tests use fakes and synthetic data.

## Editing with live reload

The Docker stack remains the standard packaged application. During source editing,
use one local command from the repository root:

```powershell
python -B scripts/dev.py --check
python -B scripts/dev.py
```

Install root requirements.txt into the selected Python environment and run `npm ci`
in frontend once before using this command. The launcher installs nothing.
It checks that ports 8000 and 5173 are free and never stops an existing service.
Open http://127.0.0.1:5173/studio. Vite HMR updates frontend code; Uvicorn reload
restarts the API when backend/app Python files change. Both bind loopback only.
The frontend proxies /api, /health and /ready to the local API on port 8000.
Ctrl+C stops both servers; if either exits, the launcher stops the other.

By default the launcher uses existing authorized Compose storage for Save/Open.
Use `--no-storage` explicitly to remove persistence settings from its child
environment; layout save/open returns 503 in that case. Default startup
(also selectable with `--compose-storage`) resolves root .env through Docker Compose
and translates published loopback storage ports for the local backend. It requires
existing PostgreSQL/MinIO services to be running and rejects a running Compose app
to prevent competing application writers. It never prints the resolved credentials.

After authorization for the existing storage target, stop the packaged app only,
then use the storage-enabled editing command:

```powershell
docker compose stop app
python -B scripts/dev.py --compose-storage
```

This leaves storage services and external volumes intact. With the local launcher
stopped, return to packaged validation with `docker compose up --build -d app`.
An installed `engine/bin/resvg.exe` is automatically selected by the launcher;
TLS_RENDERER_PATH may override it. The binary and root .env remain ignored by Git.
Preview/simulation still requires a native renderer: set TLS_RENDERER_PATH to an
absolute path to your installed resvg executable. The Windows font default is
C:/Windows/Fonts/arial.ttf; on Linux configure TLS_FIXTURE_FONT_PATH and
TLS_FIXTURE_FONT_FAMILY=Liberation Sans. Renderer binaries are not supplied by
this source repository. The packaged Linux renderer cannot run directly on Windows.

To use existing, authorized PostgreSQL/MinIO services, set TLS_DATABASE_URL,
TLS_MINIO_ENDPOINT, TLS_MINIO_ACCESS_KEY, TLS_MINIO_SECRET_KEY and TLS_MINIO_BUCKET
in the current shell, then run `python -B scripts/dev.py --persistence`.
For the standard Compose host ports use database host 127.0.0.1:5434 and MinIO
endpoint 127.0.0.1:9002 rather than Docker service names. This opt-in permits
startup schema/bucket initialization and subsequent UI storage writes. Select
and authorize the named storage target first; never run competing application
writers against operational storage. The launcher starts no Docker services,
provisions no volumes and does not read or print credentials.

Dependency edits require reinstalling the affected local manifest and restarting
the launcher. Vite configuration changes may also require a restart. After the
source iteration passes, use the standard authorized `docker compose up --build -d`
and smoke-test http://127.0.0.1:8002/studio to validate packaging. Source reload
does not validate the image. Playwright still starts no servers; E2E_BASE_URL
may select http://127.0.0.1:5173 for an explicitly authorized development target.

## Source validation

From web_app:

```powershell
python -B scripts/check_project.py
python -B scripts/check_project.py --run-source-checks
```

The first command prints a process-free plan. The second runs backend regression,
full TypeScript, a fresh frontend build, then frontend regression. It saves its
bounded JSON report to `.tmp/source-checks-<unique-id>/report.json`; the report
path appears in its output. It does not install dependencies or start services.
`deployment_ready` remains false even when all source checks pass.

For measured quality evidence, install the pinned requirements and frontend
lockfile dependencies, then run `python -B scripts/check_coverage.py`. It adds
backend branch coverage and combines unit/browser frontend coverage using a
fresh sourcemapped build. Its unique `.tmp/coverage-*` directory contains the
logs, portable XML/LCOV and passing source/report fingerprint. Feed that
directory to `scripts/sonar_scan.ps1 -CoverageDirectory <absolute-directory>`.
The scanner rejects stale or modified reports. Regular production builds do
not emit sourcemaps. This local scan is separate from a Jenkins execution.

Real raster regressions need an installed native renderer and matching font;
these platform binaries are not part of the source export. Windows source
tests use an installed `engine/bin/resvg.exe` and Arial by default. Linux tests
use `CI_RENDERER_PATH=/usr/local/bin/resvg` and
`CI_FONT_PATH=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf`.
The CI fixture requires the Liberation Sans font for those explicit paths.
Clear application `TLS_*` variables as the source gate does, and retain the
separate `CI_*` paths. Docker builds install the verified renderer and font.
Compose configuration tests require Docker CLI; an isolated test container
without that CLI reports their skips separately.

For focused checks, use PYTHONPATH=backend, disable pytest cacheprovider/tmpdir,
and write any captured test output under a unique `.tmp/` child. Restricted Windows
subprocess/realpath permissions may require an approved local-test escalation;
report environment blockers separately from functional failures.

The local Jenkins quality job and SonarQube stack are installed; see SONARQUBE.md.
They validate a curated snapshot and do not deploy. Historical quality reports do
not prove the current snapshot is clean. Source checks and quality checks are
reported separately; do not suppress findings or weaken gates to obtain PASS.

## Browser checks

One frontend/playwright.config.js uses HTTP loopback 127.0.0.1:8002 by default.
E2E_BASE_URL may select another HTTP loopback port. It starts no servers and seeds
no legacy users. From frontend, after target authorization:

```powershell
npm run test:e2e:ui
npm run test:e2e:integration
npm run test:e2e -- --list
```

UI tests mock APIs and serve the current built frontend through browser routes,
so an older running container does not substitute stale assets for the source
under review. They prove UI behavior against mocked responses, not live rendering
or persistence. Integration tests use the running application. Storage writes are
skipped unless E2E_ALLOW_STORAGE_WRITES=true after named-target authorization;
the synthetic layout is retained, with no automatic storage cleanup.

Each Playwright invocation uses `.tmp/playwright-<unique-id>/test-results` for
screenshots/traces and its sibling playwright-report for HTML. From frontend,
use `npm run show-trace -- <absolute-trace.zip-path>` or
`npm exec playwright show-report -- <absolute-report-directory>`.
Browser tests include both Preview view and Label Simulation current-endpoint
checks; no login/logout or legacy printer/SAP flows are claimed covered.

## Persistent data and recovery

Legacy backend/data files were removed with explicit user authorization. The
active application stores persistent data in Compose external volumes, not a
repository data directory. Volumes default to thermal-label-studio-p8c_p8c-postgres and
thermal-label-studio-p8c_p8c-minio. Select another target through
TLS_POSTGRES_VOLUME/TLS_MINIO_VOLUME only with authorization. Provision selected
fresh volumes separately; do not rename volumes or use down -v during cleanup.
Stop old writers before authorized cutover; never attach two databases or object
stores to the same writable volume. Config changes do not reset existing passwords.

Layout writes preserve immutable objects after ambiguous upload/commit failures.
Retries use fresh versions, potentially leaving gaps/unreferenced objects. Cleanup
requires separate metadata/object reconciliation and authorization; deleting an
object after an API error can destroy an actually committed layout. Tests cover
failure recovery with fakes. Migration, backup/restore, crash/concurrency runtime
and operational reconciliation remain separate unverified work.

## Checkpoint and repository transition

Thermal-Label-Studio is the clean source repository, starting with a reviewed
initial checkpoint. Thermal-Label-Studio-legacy retains previous history.
The checkpoint includes the job repository/schema foundation as future work.
Credentials, operational data, installed dependencies, builds, .tmp reports and
historical archives are excluded. Source and runtime validation evidence is
recorded in SONARQUBE.md; updated Jenkins execution remains a separate check.
Preserve the old local checkout separately; it is not the new repository's history.

`python -B scripts/prepare_checkpoint.py` creates a disposable source ZIP and
SHA-256 file inventory under a unique `.tmp/checkpoint-source-*` directory.
It uses an explicit public-source inventory, omitting old Git history, archived
phase documents, local Codex configuration, credentials and generated/runtime
data. It does not initialize Git, commit, change remotes or publish. Review the
inventory and validate the exported source before creating the new repository.

## Working on a change

Define one behavior and acceptance checks, preserve existing edits, and test the
smallest complete slice. Follow the target shared bitmap/payload boundary. No
archived compatibility paths or speculative abstractions. Update current
contracts when behavior changes. Obtain named-target authorization before SAP,
printer, storage, container, deployment or volume operations. Report PASS, FAIL,
BLOCKED and NOT RUN precisely.

## Checkpoint review

Use the local scope in README and Architecture. Do not present planned graphics,
shared authentication, SAP, jobs or physical printer acceptance as implemented workflows.
The direct Python entry uses loopback by default (`TLS_BIND_HOST=127.0.0.1`).
The image explicitly sets its internal bridge listener to `0.0.0.0`; standard
Compose host ports remain loopback-only. Never use host networking or expose
this unauthenticated application to a shared network.

A source-test PASS and a mocked browser-test PASS are separate from an image
build, Linux rendering, real PostgreSQL/MinIO save/open and restart checks.
Checkpoint release evidence must identify the reviewed source and list all
unresolved quality findings. See the dated assessment in SONARQUBE.md. A new
repository must preserve the active source, lockfile and reviewed contracts;
archives, credentials, operational data and `.tmp` reports do not become source.

## Sample dataset validation boundary

Sample dataset schema/API source is implemented alongside layout persistence.
Persistence-enabled startup also initializes the PostgreSQL sample dataset table.
Do not restart or initialize operational storage for source tests; named-target
authorization remains required. `test_studio_datasets.py` exercises validation,
SQL/error paths and roundtrips through fakes, with no database or object-store
operations. Saved-dataset browser checks use mocked endpoints. Dataset preview
edits have no persistence API in this phase.

## Browser preferences

UI messages live in `frontend/src/shared/i18n`; English source messages are the
translation keys and fallback. Preference controls/store belong to
`features/preferences`, using `thermal-label-studio.preferences.v1` only.
Keep test IDs and protocol keys independent of labels. Use semantic CSS tokens
for editor surfaces; canvas and preview pixels keep their authored colors.


Frontend visual controls use CSS custom properties in `frontend/src/index.css` as the single source for palette pairs, UI typography, compact/default sizes, spacing, borders, radius, shadows, backdrop and motion. Shared primitives expose semantic `tone`, `variant`, `selected` and disabled treatment; native feature controls use the same `data-ui-*` contract. Keep caller classes for layout and deliberate technical geometry. Use compact/stepper variants for narrow editor fields. Selected colors have paired foregrounds. Planned actions remain native-disabled and use the generic planned hover treatment. Focus-visible stays observable. Reduced motion applies only to marked controls, chrome animations and modal portals; authored SVG, Fabric objects and export pixels remain outside UI styling.


Appearance offers Dark, Light, Industrial Dark, Industrial Light and System. Original Dark/Light palettes are restored; industrial choices retain graphite/steel and warm-grey palettes. System follows original Dark/Light. Browser-local v1 preferences accept all theme IDs, and authored canvas/export colors remain unchanged.
Custom adds a draft editor under Preference with Industrial Light/Dark base,
twelve allowlisted six-digit HEX colors, horizontal area tabs, a miniature preview,
and an informational minimum contrast ratio. Apply persists the validated custom
palette under the existing browser-local key; Cancel/backdrop/Escape discard the
draft. Reset copies the chosen base colors. Builtin and language selection retain
their immediate behavior. Both pre-paint bootstrap and runtime validate the same
allowlist, ignore unknown color keys, and never interpolate arbitrary CSS.
Switching away from Custom removes every applied inline override while retaining
the saved palette for later editing. Warning customization keeps the outline/status color separate from
the selected warning fill and its paired foreground. Nine-key saved palettes
default only absent warning fields from their Industrial base; supplied invalid
values fail validation in both bootstrap and runtime. Region tokens affect actual chrome and ruler
backgrounds; viewport/grid tokens affect only the area outside the white label.
Fabric objects/background, authored SVG, barcode payloads and exported pixels are
outside this preference boundary.
Mounted UI icons use the shared `Icon` primitive for Material glyphs and Lucide
components. Icons inherit currentColor and token sizes; `--ui-icon-scale` changes
both families together while control/dock/small and deliberate numeric size tokens
retain their roles. Icons are decorative by default; standalone meaningful icons
provide a label. The Studio mark is a currentColor label outline with three barcode
bars inside a shared primary badge. This UI system never restyles authored SVG
objects, Fabric icons, raster output, or exported label content.


## IPL target and copies in the Print dialog

Open Print, enter numeric Printer IP address and TCP port (default 9100), confirm
layout/IPL and Copies (1..999, default 1), then explicitly choose Print. No environment edit or restart
is required. The last valid target is remembered in this browser under
`thermal-label-studio.print-target.v1`, with safe fallback if storage is unavailable.
Opening, editing or remembering fields never connects to a printer.

An optional server default can still use `TLS_PRINTER_HOST`/`TLS_PRINTER_PORT`.
An empty host means no default, and clients must supply an action target. Compose
and the dev launcher carry these optional settings. Explicit action targets override
the default for one request without modifying it. Default GET failure does not block
manual target entry. Configure/deliver only to a named authorized target; do not edit
ignored `.env` or send an operational label without authorization.

One payload/connection requests all copies through native IPL quantity. Success
unlocks Print for another deliberate submission, without closing. Known pre-send
errors can be corrected/retried; uncertain outcomes retain the inspection/reopen
lock. Submission is unconfirmed physical delivery; inspect the printer before retrying
uncertain results. Tests use fake transports/mocked APIs and no actual PM45 target
was contacted for this implementation.


## T02 synthetic contract checks

Shared cases live in tests/contracts/label_data_cases.json, consumed by backend/tests/test_label_data.py and frontend/tests/label_data.mjs. Dataset tests use fake DB calls and monkeypatch transport to fail if upload calls printing; frontend tests exercise the importDataset action consumed by Studio, dataset-only HTTP, offline preservation and historical output hook gate. Browser target absent means browser integration NOT RUN; do not start services for these source checks.
