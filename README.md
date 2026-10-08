# Thermal Label Studio

Thermal Label Studio designs SVG layouts and renders thermal label bitmaps.
Product UI and active technical documentation use English.

## Current implementation

The local checkpoint scope is Studio without authentication, layout editing,
local SVG import/export, local JSON exploration, versioned layout save/open,
Preview, Label Simulation PNG and fixture simulation. Global graphics, shared
access authentication, SAP intake, job orchestration, physical printers and
production operations are follow-up work. Planned global graphics, data/protocol
export and print controls explain their status without calling unavailable APIs.


The local Studio at `/studio` edits SVG and previews a server-produced 1-bit
PNG. P8C adds versioned layout save/list/open: PostgreSQL owns metadata and
active versions; MinIO owns immutable SVG artifacts. Versions, checksums and
object keys are server-owned. The dated P8C result records local save/open,
preview and application-restart evidence; it is not production approval.

Studio has no login, session or role controls; it is intended for local use.
The Python runtime defaults to 127.0.0.1. The image explicitly sets
TLS_BIND_HOST=0.0.0.0 inside its bridge network; Compose publishes host ports
only on 127.0.0.1. This does not authorize a shared deployment.

The same application exposes `/fixture-simulation`, using application-owned
synthetic data. The standard Compose stack enables persistence. Source tests
can exercise the API without storage configuration; layout calls then return
503 and storage drivers are not imported. The fixture entry loads
independently of the Studio and diagnostics entry.

SAP intake, physical delivery, authentication for the current layout API,
job orchestration, migrations and production operations remain incomplete.
Retired auth/session, operator simulation, print/export and old API clients
are archived. Remaining graphics clients and root `engine/` modules do not prove
those features work against the current backend.

## Workspace

| Path | Ownership |
| --- | --- |
| `backend/app/` | Active API, layout persistence, rendering and simulation |
| `backend/tests/` | Local source tests and synthetic fixtures |
| `backend/schema/` | Job schema foundation; separate from P8C layout startup DDL |
| `frontend/src/features/` | Feature code; shared primitives live in `shared/` |
| `engine/` | Retained engine and local renderer binary; new backend rendering lives in `backend/app/engine/` |
| `docs/` | Five active contracts and phase-specific evidence |
| `scripts/check_project.py` | Local source gate; no deployment |
| `.tmp/` | Disposable local runs and uncommitted environment files |
| `.archive/` | Historical reference; excluded from Docker build context |

## One standard launch

One application, one standard way to run it:

- `Dockerfile` builds the application image.
- `docker-compose.yml` starts app, PostgreSQL and MinIO together.
- Root `requirements.txt` is the only Python dependency manifest, used by both
  the image and local development. Test tools are intentionally included.
- `.env.example` documents configuration; copy it to ignored root `.env` and
  supply local credentials plus an independently verified renderer checksum.

After prerequisites and authorization for the named local target:

```powershell
docker compose up --build -d
```

Studio is at `http://127.0.0.1:8002/studio` by default. Fixture simulation is a
page in the same application, not a separate deployment mode. Host ports bind
only loopback. The standard stack always configures layout persistence.

The Compose project is `thermal-label-studio`. Existing physical volume names
are explicitly preserved as external volumes; no empty replacement database is
created implicitly. Follow [Development](docs/DEVELOPMENT.md) for prerequisites,
new-volume provisioning and an authorized cutover from older containers. Source
checks do not start services, stop old writers or migrate data.

Superseded split configuration is preserved in
`.archive/split-configuration-2026-10-06/`; phase and prototype archives remain
historical reference. The installed local Jenkins quality gate is documented in
[Local SonarQube](docs/SONARQUBE.md); it performs no checkout or deployment.

## Processing contract

```text
SAP/API -> validate label_code -> resolve layout -> bind SVG -> raster bitmap
                                                               |
                                                    shared encoded payload
                                                               |
                                          simulation sink OR print transport
```

This is the target flow. Current simulation returns PNG only. The IPL output
boundary is fake-tested; shared payload orchestration and real transport are
not wired. The actual SAP JSON contract remains unfinalized.

## Development checks

For editing with live reload, from the repository root run:

```powershell
python -B scripts/dev.py
```

Open `http://127.0.0.1:5173/studio`. Vite updates frontend changes automatically;
Uvicorn restarts for changes under backend/app. Ctrl+C stops both processes.
This uses the same source and dependency manifests as Docker. It starts no
containers and uses existing authorized Compose storage by default, with Save/Open
and the installed Windows renderer. Stop the Compose app first. Use `--no-storage`
only for editing without database access. See [Development](docs/DEVELOPMENT.md)
for setup, renderer prerequisites and explicitly enabled storage. Build the
Docker image for final packaging validation after the editing iteration.

Install Python dependencies with `python -m pip install -r requirements.txt`
when installation is authorized. Docker installs this same file. There are no
runtime/dev or phase-specific requirement files in the active project. Frontend
dependencies remain in `frontend/package.json` and `frontend/package-lock.json`.

From `web_app`, `python -B scripts/check_project.py` prints the check plan.
`--run-source-checks` runs backend/frontend regression, full TypeScript checks
and frontend build. Reports are saved under unique `.tmp/source-checks-*`
children. Source PASS does not establish runtime readiness.

## Active documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Product flow](docs/PRODUCT_FLOW.md)
- [API contract](docs/API_CONTRACT.md)
- [Development](docs/DEVELOPMENT.md)
- [Decisions](docs/DECISIONS.md)

Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
Phase task results are dated evidence, not a substitute for these current
contracts. The Phase 7L baseline records an earlier freeze, not the current
workspace inventory.

## Browser tests

One frontend/playwright.config.js targets the already running standard application
at http://127.0.0.1:8002 (E2E_BASE_URL may select another HTTP loopback port).
Playwright starts no Python/Vite/container servers and seeds no legacy users.
After the named application target is authorized and running, from frontend:

```powershell
npm run test:e2e:ui
npm run test:e2e:integration
```

`ui` tests mock every API request and cover current Studio tools, save/open,
storage error and preview presentation. They do not prove storage or rendering.
`integration` uses actual health/layout routes and Studio. The save/open/preview
case is skipped unless E2E_ALLOW_STORAGE_WRITES=true after explicit authorization
for that target. It creates one uniquely named synthetic layout and retains it;
no delete API or automatic storage cleanup exists. Never enable this for business
data merely to obtain a passing test. npm run test:e2e selects both projects;
the write opt-in still applies. npm run test:ui opens Playwright's interactive UI.

Use npm run test:e2e -- --list to inspect selection without starting a browser
or accessing the app. Historical browser specs, including F4 operator/simulation
and tests importing Vite /src modules, are preserved with migration notes under
.archive/playwright-prototype-2026-10-06/. Their old feature coverage is not claimed
by the current browser inventory. A missing app/browser is BLOCKED, not PASS.

## Checkpoint scope

Local Studio editing, versioned layout save/open and current-canvas PNG preview
are the implemented scope. Preview view and Label Simulation use the same API.
Failed layout saves preserve uncertain immutable artifacts; subsequent saves
allocate fresh versions with bounded conflict probes. Version gaps and orphan
reconciliation are described in Architecture/Development.

The planned new repository is [Thermal-Label-Studio](https://github.com/pikidisini/Thermal-Label-Studio);
the legacy repository is [Thermal-Label-Studio-legacy](https://github.com/pikidisini/Thermal-Label-Studio-legacy).
This repository starts from the reviewed source-only local application checkpoint.
The initial checkpoint retains the job/schema foundation for future development.
.tmp, secrets, operational data and historical archives are excluded.

Playwright screenshots/traces and HTML reports use unique .tmp/playwright-*
children. No generated test results belong in frontend or docs.

Studio also supports PostgreSQL JSONB storage for user-uploaded sample datasets,
with a saved dataset list and reopening all items/descriptions. Sample datasets
are separate from SAP rendering requests and SVG templates in MinIO. Preview
edits remain local; dataset editing is future work.
This source capability requires authorized persistence schema initialization for
real storage; fake/source checks alone do not verify a live database deployment.
