# Development

For local AI SVG authoring setup, tool discovery and isolated validation, see
[Design MCP](../tools/mcp/DESIGN.md). The sidecar uses the separate tooling
environment and an explicit loopback API target; application startup and storage
activation retain their existing authorization boundaries.

Operational Activity Log is independently opt-in. Prepare with
`python -B scripts/provision_activity.py` (plan only). After named Studio database
authorization, configure `TLS_DATABASE_URL` explicitly and run the script with
`--apply --confirm-host <host> --confirm-database <database>`. Review required
runtime grants in `backend/schema/004_activity_log.sql`, then enable
`TLS_ACTIVITY_ENABLED=true` in the existing authorized runtime configuration.
Neither startup nor HTTP applies the schema. Do not restart/provision a target
without its authorization. Details and best-effort failure semantics are in
`docs/MANAGEMENT_CONTRACT.md#operational-activity-log`.

## Application Management activation

`/management` and its Utilities entry are implemented without login. The default
management policy view is read-only. Source development does not authorize
provisioning operational tables or replacing the running intake policy. Review
[management contract](MANAGEMENT_CONTRACT.md) and the plan-only
`scripts/provision_management.py` before a separately named-authorized activation.
Management tables use the `app_management` schema; template tables remain in
`label_studio` in the same database. Provisioning applies `003_management.sql`
directly and seeds only a missing snapshot. This local development project does
not maintain an upgrade path from a previous management schema. Normal app/dev
startup never applies `003_management.sql`.

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

Work from README.md, AGENTS.md and the active contracts linked by README.md,
including template binding and current pipeline status. Source lives in
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
`/studio` requires login. Provision accounts explicitly and configure origins
using AUTH_CONTRACT.md before authorized shared HTTPS exposure. `/fixture-simulation` is
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

Windows users can double-click root `run-dev.bat` or run `./run-dev.bat` in
PowerShell. This wrapper changes to its own project directory and runs the same
Python launcher; it introduces no additional runtime configuration. It uses
Python on PATH or the active virtual environment and forwards launcher arguments
(`./run-dev.bat --check`, `./run-dev.bat --no-storage`). Startup errors pause the
window for inspection. Leave it open during use and press Ctrl+C to stop both
servers; cmd may also ask whether to terminate the batch job. Storage and intake
prerequisites below still apply; the wrapper does not start Docker or load the
trusted intake PowerShell configuration.

Install root requirements.txt into the selected Python environment and run `npm ci`
in frontend once before using this command. The launcher installs nothing.
It displays the status of both backend 8000 and frontend 5173 before asking any
port-conflict confirmation. Free ports are shown as available. It then rechecks
each port before recovery because the initial status can change.
On Windows, occupied-port diagnostics
show PID, process name and whether it is a verified server from this checkout.
Interactive startup offers `[y/N]` confirmation to stop only a verified project
server tree. Only `y` or `yes` permits termination; empty/other answers cancel
startup. Process creation time and command are revalidated before stopping to
reject PID reuse. Full command lines are never printed. Other/unidentified
owners require manual investigation; noninteractive startup and --check never
prompt or terminate. No Docker service is stopped by this confirmation.
After a confirmed server stop, startup waits up to ten seconds for each port
to become available, including the companion frontend exiting through the old
launcher. It also rechecks a port after owner inspection before failing. These
waits do not authorize termination of additional processes.
Open http://127.0.0.1:5173/studio. Vite HMR updates frontend code; Uvicorn reload
restarts the API when backend/app Python files change. The frontend binds
0.0.0.0:5173 for authorized plant-browser testing; the backend remains loopback-only.
Other computers use http://<development-computer-ip>:5173/print. Firewall access
must be limited to the authorized test computers. This does not establish legacy
browser compatibility or authorize SAP/printer operations. Restore the frontend
host to 127.0.0.1 when network testing is finished.
The frontend proxies /api, /health and /ready to the local API on port 8000.
Ctrl+C stops both servers; if either exits, the launcher stops the other.
On Windows, the launcher attaches itself and all future descendants to an
unnamed job object before starting servers. Its non-inherited handle remains
open until launcher exit; Windows then terminates remaining descendants,
including Uvicorn reload workers, even after an abrupt launcher termination.
Children use separate console process groups so terminal Ctrl+C reaches the
launcher, which owns cleanup. Startup fails if this protection cannot be set up.
This controls development process lifetime only, not intake memory/resource
acceptance. It does not clear orphan processes created by older launchers.

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

### Development process ownership and recovery

Keep the terminal running dev.py open. Ctrl+C stops its frontend/backend children.
If an AI/background session started it, identify the launcher and its project
children before terminating anything:

```powershell
Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match '^python(w)?\.exe$' -and
        ($_.CommandLine -match 'scripts[\\/]dev\.py' -or
         $_.CommandLine -match 'uvicorn app\.main:app')
    } | Select-Object ProcessId, ParentProcessId, CommandLine | Format-List
```

Match the application's backend path and parent launcher before using
`taskkill /PID <verified-project-PID> /T /F`. Replace the placeholder with the
current verified launcher PID; if the launcher is gone, stop only its verified
orphan Uvicorn tree. Never use `taskkill /IM python.exe /F`. This does not stop
PostgreSQL/MinIO. Do not put transient PIDs into reusable commands or documents.
After ports 8000/5173 are free, run `python -B scripts/dev.py --check`, then
`python -B scripts/dev.py`. Occupied-port errors indicate a process to inspect,
not permission to kill unrelated listeners. A health/ready 200 alone does not
prove persistence: also check GET /api/v1/layouts through the Vite origin.
`--no-storage` deliberately returns 503 for Save/Open. It is not a recovery
workaround when testing template storage. Use start-intake-simulation.ps1 when
the authorized simulation policy/ledger configuration is required; a plain
dev.py restart does not load those trusted local PowerShell files.

### Source gate

From the Thermal-Label-Studio repository root:

```powershell
python -B scripts/check_project.py
python -B scripts/check_project.py --run-source-checks
```

Each check has a default 600-second execution budget. If the full native backend
regression exceeds that budget on the selected host, use an explicit bounded
budget, for example `python -B scripts/check_project.py --run-source-checks --timeout-seconds 1200`. The report records the chosen
budget; all checks and failure rules remain unchanged. A timeout is BLOCKED,
never PASS. No runtime/deployment acceptance is inferred.


The first command prints a process-free plan. The second runs backend regression,
full TypeScript, a fresh frontend build, then frontend regression. It saves its
bounded JSON report to `.tmp/source-checks-<unique-id>/report.json`; the report
path appears in its output. It does not install dependencies or start services.
`deployment_ready` remains false even when all source checks pass.

For measured quality evidence, install the pinned requirements and frontend
lockfile dependencies, then run `python -B scripts/check_coverage.py`. It adds
backend branch coverage and combines unit/browser frontend coverage using a
fresh sourcemapped build. Its unique `.tmp/coverage-*` directory contains the
per-stage logs. `--timeout <seconds>` sets a 1..3600-second per-stage limit
(default 1800); a timed-out stage is recorded as BLOCKED, never PASS.
The same directory contains portable XML/LCOV and a passing source/report fingerprint. Feed that
directory to `scripts/sonar_scan.ps1 -CoverageDirectory <absolute-directory>`.
The scanner rejects stale or modified reports. Regular production builds do
not emit sourcemaps. This local scan is separate from a Jenkins execution.

`sonar_scan.ps1 -TokenFile tools/sonarqube/.env.scan -CoverageDirectory
<absolute-directory>` reads one private `SONAR_TOKEN=...` entry if the process
environment has no analysis token. Token contents are never command arguments
or report fields; the previous process environment is restored after scanning.
Do not use the read-only MCP credential as a scanner token or rerun account
bootstrap to recover a missing analysis credential.

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
checks. Current auth specs cover login/logout with fakes and browser mocks;
legacy printer/SAP flows are not established by those checks.

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

Use the local scope in README and Architecture. Graphics provisioning and its local-only API are described in GRAPHICS_CONTRACT.md.
Do not present planned graphics versioning/bulk replacement, shared authentication, SAP, jobs or physical printer acceptance as implemented workflows.
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


Appearance offers Label Studio Signature (default), Dark, Light, Industrial Dark,
Industrial Light and System. Signature uses an immutable palette constant over
the Industrial Light foundation, applied through the bounded UI tokens before
paint and at runtime. Bootstrap parity tests enforce the duplicated inline palette.
Missing/invalid preferences select Signature; explicit saved choices remain valid.
Opening or selecting Signature copies its own palette into the draft; edits become
Custom. Original Dark/Light palettes remain available, and System follows them.
Browser-local v1 preferences accept all theme IDs; authored canvas/export colors
remain unchanged.
Custom adds a draft editor under Preference with Industrial Light/Dark base,
33 allowlisted six-digit HEX colors grouped into Bars & panels, Surfaces & workspace,
Text & borders, Actions, and Status colors, a miniature preview with control-state samples,
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
Expanded palettes separate primary/secondary/disabled text, action/hover/supporting
accents, surfaces, border/outline/focus, success pairs and destructive status.
These shared semantic tokens apply across Home, Studio, Management, Print and
portal dialogs. Solid colors are editable; backdrop/shadow opacity and geometry
remain fixed. Print/graphics thumbnails and authored output retain their colors.
The browser preference storage key remains v1. An optional custom-palette
`version: 2` marks independently editable inspector surfaces. Nine- and twelve-key
palettes without that marker retain the legacy inspector surface alias until an
explicit color edit or Reset. Missing split fields inherit the old text/action
colors; other absent additions use the Industrial base. Supplied invalid values
(including null) reject the palette. Signature retains its previous appearance.
Every allowed token is cleared when switching back to an ordinary builtin theme.

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

## T07 intake source checks

`backend/tests/test_label_intake.py` covers strict HTTP/schema admission, default external denial, sender/print denial, immutable fake-storage pins, ordered failures/budgets, process-slot contention and six native stored-vs-Studio/IPL parity cases. `backend/tests/test_layout_artifact_read.py` exercises the concrete reader using fake SQL/streams only, including bounded reads, exact checksum bytes, corruption, deletion/missing and availability distinctions. Run the authoritative `python -B scripts/check_project.py --run-source-checks` gate. No service startup, operational storage, sender access or printer is needed.

The blocked-resolution regression deliberately demonstrates the remaining cooperative deadline limitation; its pytest PASS records the limitation, not hard-deadline acceptance. T07 overall status is NEEDS_REPLAN until a cancellable bounded worker and enforceable native process memory limit satisfy the frozen contract. Default authorization has no runtime opt-in flag. Test dependency overrides are not production readiness.

## T08 transactional source validation

Run `backend/tests/test_intake_ledger.py`, `test_label_intake.py` and existing `test_job_persistence.py` with PYTHONPATH=backend and the repository's normal pytest flags, then `python -B scripts/check_project.py --run-source-checks`. Disposable `intake_ledger_fake.py` adapts repository SQL to a unique .tmp SQLite database and simulates cross-connection locking/commit faults. This adapter is test source, not a second production persistence implementation.

Tests cover canonical Node differential, atomic duplicate admission/claim, digest conflicts, stored-version/PNG replay, current-auth revocation, before/after-commit crash windows, quota/expiry/key rotation and corruption. Real PostgreSQL dialect/locking/privileges and actual process restart remain required later on a named authorized target. See [T08 operations](implementation/universal-label-pipeline/T08_LEDGER_OPERATIONS.md); do not initialize the proposed schema or invoke maintenance against operational storage as part of source checks.

## T09 synthetic policy validation

`backend/tests/test_intake_policy.py` uses documentation-only addresses and synthetic credentials to exercise actual HTTP bearer admission, mode/source/code denials, replay revocation, exact template approval, IPv4/IPv6 routes, missing/invalid targets, copies limits, audit reload and pre-claim revalidation. It owns a disposable transactional ledger fake; there is no real DB/object-store/device provisioning. Regression suites retain existing manual target/no-probe behavior and native Studio/intake preparation cases. Runtime checklist and secret-free example are in [T09 policy operations](implementation/universal-label-pipeline/T09_POLICY_OPERATIONS.md).

## T10 fake print and crash validation

`backend/tests/test_intake_print.py` exercises actual bearer HTTP intake with strict synthetic T09 policy, disposable transactional ledger and a recorder asserting SEND_CLAIMED before construction and all later outputs PREPARED. Cases cover native copies, preflight/budget/binding failure, target/credential/approval revocation, one worker, lost responses and commit faults before/after admission/preparation/claim/settlement/terminal acknowledgment. Explicit fake quiesced recovery never resumes sends. Six native Windows resvg/Arial cases compare actual Studio preview pixels and exact IPL recorder bytes for static/Fabric text/Code128 templates at copies1/999.

Print transport tests use injected sockets only; do not point this suite at operational credentials/devices. Full source gate clears TLS environment. Source/functionality evidence does not resolve T07 hard cancellation/native memory or T06 browser gates. See [T10 runtime matrix](implementation/universal-label-pipeline/T10_RUNTIME_MATRIX.md).


## T11 acceptance execution (2026-10-10)

Run the exact full source gate and use frontend/playwright.config.js with --project=ui only for local browser mocks. The T11 Studio/printing specs explicitly serve current frontend/dist assets, deny unmocked APIs and block external fonts; E2E_BASE_URL supplies an existing loopback origin without starting servers. This is built-assets mock evidence, not standard-app runtime or storage proof. The assembled native matrix is backend/tests/test_pipeline_acceptance.py; independent IPL expectations remain backend/tests/test_ipl_codec.py. Reports, font hashes and findings are linked in [T11_RESULT](implementation/universal-label-pipeline/results/T11_RESULT.md); runtime/quality NOT RUN gates are listed separately. Do not run integration, schema/setup, image/restart or printer actions without the named authorization required by AGENTS.md.


## T12 optional UAT preparation (2026-10-10)

Nine synthetic cases and eight SVGs in docs/implementation/universal-label-pipeline/fixtures/t12 are locally admitted/prepared/encoded/decoded through the existing engine. Unique reports and PNG/IPL references are in .tmp/t12-6717a439eb; no transport or operational target is invoked. Review [the exact manifest](implementation/universal-label-pipeline/T12_ACCEPTANCE_PLAN.json) and [bounded UAT plan](implementation/universal-label-pipeline/T12_UAT_PLAN.md) before seeking named device/count/slot authorization. Relevant T11 resource/runtime prerequisites still block paired physical intake. Do not transmit generated IPL, provision storage or infer permission from historical PM45 instructions.

## Explicit intake ledger startup

`label_intake/runtime.py` installs a ledger during lifespan only when `TLS_INTAKE_LEDGER_JSON` is nonempty. The reference-only configuration is `{"database_env":"TLS_INTAKE_DATABASE_URL","active_key":"k1","keys":{"k1":"TLS_INTAKE_HMAC_K1"}}`. Provision the dedicated PostgreSQL URL and each referenced HMAC secret separately. Keys encode 32..64 random bytes as canonical unpadded base64url; retain old versions for permanent identities. Configuration supports at most 32 versions and 16 KiB of JSON. Duplicate members, missing references and invalid keys fail startup with a static error; no fallback or key generation occurs.

Ledger construction performs no connection or schema initialization. A missing schema or failed connection denies operations. Apply `backend/schema/002_label_intake.sql` separately on an authorized named target; the Dockerfile now includes that artifact but does not execute it. Compose forwards the blank-by-default ledger variables and K1 only; additional retained keys, policy and source credentials require explicit environment mappings. Python does not load `.env` itself. Driver connect/statement/lock timeouts do not satisfy the hard batch deadline or native memory gate. See [STATUS.md](implementation/universal-label-pipeline/STATUS.md) for current evidence and outstanding acceptance.


## SAP RFC configuration

Integrations includes SAP Connections and RFC Operations with revision-checked
configuration, encrypted password storage and effect-free sample mapping tests.
`app/sap_rfc` owns bounded typed inputs and declarative result mapping;
`management/integrations/sap_http.py` owns persistence commands and sample endpoints.
The existing management JSONB snapshot stores the configuration without a schema
migration. API source credentials and SAP logon credentials remain separate.
Label Print can explicitly read configured operations; its SAP Get Data flow is
still separate. Management can explicitly fetch an actual RFC response through
the opt-in native worker. Sample tests remain local and never become SAP evidence
or print jobs. Saving a connection is not a connectivity test. See the configurable SAP RFC contracts
section in [MANAGEMENT_CONTRACT](MANAGEMENT_CONTRACT.md) for limits and endpoints.

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
authenticated role/origin and bounded JSON admission as LAN Print, returns no-store and
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

## Queue source checks (2026-10-22)

Run `backend/tests/test_intake_queue.py` and `backend/tests/test_queue_operations.py`
with the normal source-test environment and project-local disposable output. Their
SQLite adapter exercises transaction/fault behavior and is not PostgreSQL evidence.
Run the full source gate and `frontend/tests/browser/ui/sap_requests.spec.js` using
the existing UI project/installed browser; all API calls are mocked in that spec.
No script here starts a server or operational container. Windows cannot satisfy
the worker Linux/cgroup acceptance gate. Production startup uses
`TLS_STORAGE_INITIALIZE=false`; exercise migrations/provisioning only on approved
named targets. [Operations and rollout](PRODUCTION_QUEUE.md).
