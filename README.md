# Thermal Label Studio

Thermal Label Studio is a local-first web application for designing SVG label templates, binding SAP data, reviewing thermal output, and producing controlled simulation evidence.

> **Development status:** the application supports local development and controlled simulation. Passing local checks does not prove production readiness, SAP production integration, or permission to print to physical devices.

## Current capabilities

- Design SVG label templates on a Fabric-based canvas with millimetre dimensions, rulers, zoom, pan, Snap, and guides.
- Add and edit text, 1D barcodes, QR codes, straight lines, standalone uploaded images, and global graphic-library assets.
- Bind supported elements to SAP data tokens and preview data from local SAP JSON imports.
- Save and open templates, inspect layers and properties, and export supported label formats through the protected application flows.
- Run label simulation and generate watermarked PDF evidence without sending data to a physical printer.
- Use authenticated PPIC and IT sessions for protected UI and API flows.

### Unsupported feature

The Table design feature is retired and unsupported. It has no toolbox entry, editor mode, runtime implementation, or migration path. There are no official legacy templates that require Table compatibility.

## Frontend architecture

The frontend uses a feature-first structure under `frontend/src/features/`.

```text
frontend/src/
├── features/
│   ├── barcode/          # Barcode creation and payload rules
│   ├── canvas/           # Canvas lifecycle, viewport, ruler, and navigation
│   ├── data-tokens/      # SAP contracts, local JSON parsing, and token UI
│   ├── graphics/         # Global graphic library and update workflow
│   ├── images/           # Standalone template image uploads
│   ├── line/             # Line creation, editing, anchors, and snapping
│   ├── qr/               # QR generation and placement
│   ├── snapping/         # Grid, guide, endpoint, and object snapping
│   ├── templates/        # Template browsing and persistence workflow
│   └── text/             # Text creation and formatting
├── shared/               # Shared UI primitives, overlay layers, and API config
├── components/           # Studio composition and layout
├── hooks/                # Cross-feature editor orchestration only
├── store/                # Client state
└── utils/                # Non-feature utility boundaries
```

Feature public barrels are the default import boundary. Canvas lifecycle and viewport behavior belong to `features/canvas`; the studio-level action hook coordinates the remaining feature actions without owning their internal implementations.

## Run locally

### Frontend development server — port 8765

Start the backend separately, then run the Vite development server from `web_app/frontend`:

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 8765
```

Open <http://127.0.0.1:8765>. The development server proxies `/api` requests to the backend at `http://127.0.0.1:8000`.

### Docker application — port 8000

From `web_app/`, start the local simulation application:

```powershell
docker compose up -d --build
```

Open:

- Application: <http://127.0.0.1:8000>
- Health check: <http://127.0.0.1:8000/api/v1/health>
- OpenAPI documentation: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>

Useful Docker commands:

```powershell
docker compose logs -f label-thermal-studio
docker compose stop
```

Local application data is bind-mounted at `backend/data`. Do not delete local data or volumes without a confirmed backup and authorization.

## Login and local data

The application uses PPIC and IT accounts. Do not store passwords, tokens, credentials, or `.env` content in this repository or this README.

To create a local account in a running container, use the administrative CLI and enter the password interactively:

```powershell
docker exec -it label-thermal-studio python -m app.cli.user_admin create-user --username ppic_operator --role PPIC
```

Local SAP JSON imports are intended for SAP DEV/SANDBOX simulation. The simulator may show `--` and a warning for missing fields in text output; it must not fabricate values or generate Barcode/QR content from missing data.

## Validation

Run frontend checks from `web_app/frontend`:

```powershell
npm.cmd test
npm.cmd exec tsc -- --noEmit
npm.cmd run build
npm.cmd run test:e2e
```

Run backend tests from `web_app/`:

```powershell
python -m pytest backend/tests -q -p no:cacheprovider
```

Use `git diff --check` before committing. Report checks as **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** according to actual evidence. A browser smoke test, production integration, and physical-print verification remain separate activities.

## Safety and hardware boundaries

Local simulation is not a production print path.

- `LOCAL_SIMULATION_ONLY=true` keeps the Docker deployment simulation-only.
- `LEGACY_DIRECT_PRINT_ENABLED=false` keeps legacy physical-print routes disabled by default.
- Do not enable LAN access, TCP port 9100, Windows Spooler access, or a physical printer without explicit infrastructure and security approval.
- Production and machine-to-machine paths remain strict and fail closed; local import tolerance must not weaken them.
- Do not use SAP production data in unapproved local environments.

## Documentation

Read these documents before making architectural or operational changes:

- [AGENTS.md](AGENTS.md) — repository rules, security boundaries, and validation expectations.
- [Project status](docs/PROJECT_STATUS.md) — current project status and known limits.
- [Architecture decisions](docs/DECISIONS.md) — approved architecture decisions.
- [AI handoff](docs/AI_HANDOFF.md) — cross-session implementation history.
- [Quality gates](docs/QUALITY_GATE.md) — validation and Definition of Done guidance.
- [Architecture](docs/architecture/) — feature and system design references.
- [Task evidence](docs/tasks/) — task contracts, results, and reviews.
- [Local Jenkins simulation runbook](docs/deployment/jenkins_local_simulation.md) — localhost-only Jenkins workflow.

## Development workflow

- Keep one active writer per branch and use `codex/...` branches for Codex work unless a different branch is explicitly requested.
- Preserve unrelated working-tree changes.
- Use task contracts, results, and reviews for cross-module work.
- Do not commit generated frontend output, screenshots, reports, `test-results/`, Playwright artifacts, `.env`, or credentials.
- A local test or build pass is evidence only for the scope that ran; it is not production approval.
