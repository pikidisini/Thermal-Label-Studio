# Local SonarQube

This repository keeps the local SonarQube configuration in `tools/sonarqube`.
It is separate from the application Compose stack: it creates a dedicated
PostgreSQL database and five named volumes for SonarQube. It does not create,
mount, inspect, or change the application's PostgreSQL or MinIO volumes.

The server is loopback-only at `http://127.0.0.1:9004`. The non-default host
port avoids the existing local use of port 9000. It is a local quality service,
not an application dependency and not a production deployment.

## Start the local service

1. Increase Docker Desktop resources to the local baseline used by
   `Test-SonarQubePrerequisites.ps1`: at least 6 GiB RAM and 4 CPUs. Ensure the
   Docker Linux VM has `vm.max_map_count >= 524288`. Do not disable the
   Elasticsearch bootstrap check.
2. Pull the exact server image used by the preflight, then run the preflight:

   ```powershell
   docker pull sonarqube:26.9.0.129388-community
   .\tools\sonarqube\Test-SonarQubePrerequisites.ps1
   ```

3. Copy `tools/sonarqube/.env.example` to `tools/sonarqube/.env` and replace
   both placeholders with unique secrets. Keep this file out of source control.
4. From `web_app`, start only after the preflight passes:

   ```powershell
   docker compose --env-file tools/sonarqube/.env -f tools/sonarqube/compose.yml up -d
   ```

5. For a fresh SonarQube volume only, open `http://127.0.0.1:9004`, sign in
   with the initial `admin/admin` credentials, change the administrator
   password, and create a project token with analysis permission. Do not put
   that token in `.env`, Git, or a Jenkinsfile. An already bootstrapped
   installation must use its retained ignored `tools/sonarqube/.env.auth` and
   must not attempt the initial credentials or bootstrap procedure again.

After a Docker Desktop or WSL restart, rerun
`Test-SonarQubePrerequisites.ps1` before starting SonarQube. It confirms the
current Docker VM resources and `vm.max_map_count`; reapply the approved WSL
kernel setting if that check reports it was lost. After changing the ignored
Codex MCP environment file or `.codex/config.toml`, reload Codex before using
the read-only SonarQube MCP tools.

The Community Build and PostgreSQL image tags are pinned in `compose.yml`.
They were selected from the official SonarQube Docker release and PostgreSQL
Docker Official Image tags. Upgrade them intentionally, with release notes,
backup, and a test restore; do not substitute `latest`.

## Analyze the current source

`sonar-project.properties` limits analysis to the active backend and frontend
source and test trees. It excludes archived history, generated frontend output,
dependencies, disposable files, operational backend data, and `tools`.

The scan script first executes the existing source gate unless explicitly
given `-SkipSourceChecks`, then copies an explicit source/test/config allowlist
to a unique disposable `.tmp/sonar-scan-*` child, records a SHA-256 manifest of
that exact snapshot as the scanner build string, and runs the pinned
`sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0` image and waits for the
SonarQube quality gate. Before the first scan, pull that exact image explicitly:

```powershell
docker pull sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0
```

The token is passed only through the scanner container environment; it is never
placed in a command-line argument. The scan does not deploy the application.

```powershell
$env:SONAR_TOKEN = 'project-analysis-token'
.\scripts\sonar_scan.ps1
Remove-Item Env:SONAR_TOKEN
```

This initial scan establishes a baseline for the current authorized snapshot.
It does not by itself prove production readiness, rendering correctness,
barcode readability, SAP connectivity, printer delivery, or database/object
storage behavior.

See [local image provenance](IMAGE_PROVENANCE.md) for the declared source of
each local service image and the distinction between a pinned tag and an actual
resolved digest.

## Jenkins artifact

`tools/jenkins` defines a loopback-only, fresh Jenkins controller image at
`http://127.0.0.1:8081`. It deliberately reuses the existing Jenkins home
volume supplied through `TLS_JENKINS_HOME_VOLUME`; the Compose definition marks
that volume external, so it cannot create, clear, or remove it. Its workspace
mount is read-only and there is no checkout or deployment stage. It has no
Docker socket mount or permission to create containers. Its Docker CLI/Compose
binary is present only for the source-only `docker compose config` test; it
cannot contact the Docker daemon. The controller packages the pinned
SonarScanner CLI from its official image and runs it as the non-root `jenkins`
account. Do not expose this controller beyond localhost or add unreviewed jobs
to its reused Jenkins home.

`Jenkinsfile` is a local-snapshot job definition. Its `SOURCE_DIR` parameter
defaults to the read-only `web_app` mount. It copies an explicit allowlist into
the Jenkins workspace: active backend/engine/frontend source and tests,
source-gate scripts, and the manifests/configuration those gates need.
Archives, `.git`, environment files, tool configuration, caches, virtualenvs,
operational backend data, and generated output have no copy rule. Cleanup is
limited to the verified `source` child of the current Jenkins job workspace;
it never clears the reused Jenkins home.

For analysis the pipeline runs the bundled pinned scanner directly from the
curated workspace snapshot. It does not mount any Jenkins-home subpath into a
scanner container and does not need Docker Engine access. The controller image
supplies Python 3.14 from the official `python:3.14-slim-bookworm` image, Node
22, and the scanner from
`sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0`, matching the application
runtime family while keeping the controller non-root.

Create the Jenkins secret text credential `thermal-label-sonarqube-token`; its
value is passed only as `SONAR_TOKEN` to the native scanner process. The
pipeline uses `http://host.docker.internal:9004` because Jenkins runs in a
container. It does not require the SonarQube Jenkins plugin. It installs the Python test
dependencies in a workspace venv and requires a committed
`frontend/package-lock.json` before it will run `npm ci`. Current Jenkins
runtime and quality-gate evidence is recorded only in its dated execution
result; this setup document does not claim a gate outcome. The controller has
no Docker socket access.

SonarQube quality findings guide review and repair. They do not authorize
suppression, exclusions, quality-gate changes, or production actions.

## Codex read-only MCP

After the local service is bootstrapped, create `tools/mcp/.env.sonar` from
`tools/mcp/.env.sonar.example`. `Initialize-LocalSonar.ps1` creates that ignored
file with a dedicated read-only SonarQube USER token; otherwise set the token
there manually. Validate it without starting the MCP server:

```powershell
.\tools\mcp\Start-SonarMcp.ps1 -ValidateOnly
```

The launcher accepts only `http://host.docker.internal:9004` and
`SONARQUBE_READ_ONLY=true`, passes the ignored env file to the pinned
`sonarsource/sonarqube-mcp:1.19.0.2785` container, and mounts no workspace,
application data, or Docker socket. Register this launcher in Codex after validating
the credentials; its presence in the repository does not establish a connection.
Keep the token in `tools/mcp/.env.sonar`, never in Codex configuration or source
control. See [SonarQube MCP setup](../tools/mcp/SONARQUBE.md) for the portable
configuration generator and migration instructions. The bootstrap initializer is
for a new authorized service; do not rerun it against an existing configured server
merely to create the MCP credential file.

## References

- SonarQube Community Build, [Docker setup](https://docs.sonarsource.com/sonarqube-community-build/server-installation/from-docker-image/set-up-and-start-container)
  and [Linux/Elasticsearch prerequisites](https://docs.sonarsource.com/sonarqube-community-build/server-installation/pre-installation/linux).
- SonarQube Community Build, [analysis scope](https://docs.sonarsource.com/sonarqube-community-build/project-administration/adjusting-analysis/setting-analysis-scope/setting-initial-scope), [Jenkins integration](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/ci-integration/jenkins-integration/add-analysis-to-job), and [quality-gate waiting](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/ci-integration/overview).
- [SonarSource Docker image releases](https://github.com/SonarSource/docker-sonarqube/releases) and [PostgreSQL Docker Official Image tags](https://hub.docker.com/_/postgres/tags).

## Checkpoint quality assessment: 2026-10-07

The checkpoint scope follows README. The active editor now uses Fabric 7.4.0
native Promise APIs, native escaped SVG serialization and explicit left/top
origins. Group/ungroup history is atomic. SVG import/export preserves physical
size across repeated round trips and excludes the editor background. Tailwind
4.3.3 uses @tailwindcss/postcss while retaining the configured editor theme.
The previous Fabric 5/Tailwind 3 advisory assessment is archived under
.archive/checkpoint-quality-2026-10-07/; those dependency deferrals are closed.

The complete npm lockfile audit has zero known vulnerabilities. The pinned
Python requirements audit also has zero known vulnerabilities. Audits describe
known advisories at execution time; they do not establish production readiness.

Use scripts/check_coverage.py with the installed requirements and frontend
lockfile dependencies. It runs backend branch coverage, full TypeScript, a
fresh sourcemapped frontend build, frontend unit tests and mocked browser tests.
All generated reports stay under a unique .tmp/coverage-* directory. c8 maps
browser bundles to source before applying the unchanged source filter. Python
XML paths are relative to the project root. Report hashes and source fingerprint
must match before the scanner accepts them. Production builds omit sourcemaps.

Pass the verified directory to scripts/sonar_scan.ps1 -CoverageDirectory.
SkipSourceChecks is appropriate only after the same snapshot's complete checks
have passed. The scanner copies the reports into its curated immutable snapshot.
Coverage exclusions, quality profiles and gate thresholds were not weakened.
The configured gate still requires 80% new-code coverage and zero new violations.
The dated result under .tmp/checkpoint-finalization-* identifies the final scan.

Final analysis `3a3011f7-f825-42c9-9d69-73a0b85c7b58` passed the gate:
94.1% overall coverage, 100% new-code coverage, zero new violations and 0.47506%
new duplicated lines. It recorded zero bugs, vulnerabilities and security
hotspots, with 292 existing code smells remaining. Coverage is measured line/
branch evidence, not proof of every possible behavior. The source snapshot hash
is `66c443aba2fc44c0903fde6bc308b172371195f32015141cc373dab7f2f39f46`.

The Jenkinsfile now collects these reports, and the controller Dockerfile adds
Chromium and its Linux dependencies. The updated controller/pipeline has not
been rebuilt or executed in this assessment; direct local scan evidence must
not be presented as a new Jenkins build result.

The final application image was built with the verified resvg checksum. Real
browser save/open/render tests ran against 127.0.0.1:8002 and retained unique
synthetic layouts. Restart checks confirmed an unchanged stored SVG checksum
and working Linux PNG rendering. PostgreSQL/MinIO containers and their existing
external volumes were retained. Backup/restore, SAP, shared authentication and
physical printers remain outside this local checkpoint scope.
