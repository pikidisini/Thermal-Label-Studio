# Development

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

## Source checks and generated results

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
shared authentication, SAP, jobs or physical printing as implemented workflows.
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
