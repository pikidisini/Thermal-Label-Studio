# SonarQube MCP tooling

`Start-SonarMcp.ps1` ensures one pinned SonarSource Streamable HTTP container
is running on loopback, then launches a short-lived local Python STDIO bridge
for the connecting client. Repeated Codex sessions therefore reuse
`tls-sonar-mcp-shared` rather than accumulating one container per session. The
bridge supplies the USER token from the ignored local file only to the fixed
`http://127.0.0.1:9005/mcp` upstream endpoint, filters the ten approved
read-only tools, and never exposes credentials in client configuration.

The shared container mounts no workspace, application storage or Docker socket.
The launcher does not start/restart SonarQube, create users, change permissions,
scan source or provision volumes.

## Local configuration

The host SonarQube service is `http://127.0.0.1:9004`. Inside the MCP container,
the configured endpoint is `http://host.docker.internal:9004` on Docker Desktop.
The launcher retains that explicit local endpoint and read-only mode; it does
not silently adapt to another deployment. Other Docker environments need a
reviewed host-routing/endpoint configuration.

Copy `.env.sonar.example` to `.env.sonar` only if the local file does not exist,
then fill a dedicated SonarQube USER token locally. Keep the file ignored by Git.
It is separate from PostgreSQL `.env`, MinIO `.env.minio` and Jenkins `.env.jenkins`.
Do not use an analysis token as the MCP user token or embed a token in client
configuration. The dedicated user should have Browse and See Source Code only
on the intended project, initially `thermal-label-studio`.

The environment example retains read-only toolsets for issues, quality gates,
rules, measures and coverage. Actual discovery depends on the pinned MCP image.
The launcher checks the local token is present and not a placeholder, but does
not audit remote permissions or authenticate when running `-ValidateOnly`.

```powershell
./tools/mcp/Start-SonarMcp.ps1 -ValidateOnly
```

The image `sonarsource/sonarqube-mcp:1.19.0.2785` must already be installed;
the Compose launcher uses `--pull never` and does not silently upgrade it.
Container execution is a separately authorized action. A valid local file does
not prove the service is reachable or that the token can read the project.

## Codex configuration and portability

Generate the block for the current checkout using Python:

```powershell
python tools/mcp/config_example.py --service sonar
```

The generator resolves `pwsh` from the current device and produces a
`mcp_servers.thermal_label_sonar` block with the launcher path. Register the block
while preserving other client settings, then reload the MCP connection and
verify actual tool discovery and project quality-gate access.

Source, template and documentation travel with Git. The USER token, Docker
image, PowerShell installation and client registration are local prerequisites.
See [general portability and AI maintenance](README.md). Source relocation alone
does not register or activate the MCP connection.

## Migration from tools/codex

The launcher and example now live in `tools/mcp/`. On a device with existing
`tools/codex/.env`, transfer its credentials to `tools/mcp/.env.sonar` locally
only after checking that the destination does not exist. Preserve the original
until the migrated connection has been verified. Update the existing client
launcher path rather than creating duplicate SonarQube connections.

`tools/sonarqube/Initialize-LocalSonar.ps1` now writes the new credential path
when bootstrapping a new authorized server, and refuses to overwrite it. That
script also changes the admin password and provisions users/project credentials;
do not rerun it against the already configured server just to obtain a token.
For an existing server, configure a dedicated reader/token through its normal
administrative workflow with authorization for the named target.

## Verification boundaries

Check PowerShell syntax, template fields, client block generation and references
after a relocation. Missing credentials must fail before any container starts.
Credential validation, STDIO discovery, remote authentication and quality-gate
results are separate evidence. Never present a historical scan or handshake as
the current connection state.

The previous launcher path is retired; there is no forwarding copy.

## Local activation evidence (2026-10-08)

The existing reader token from the legacy checkout was authenticated against
`http://127.0.0.1:9004` and migrated into the ignored `.env.sonar` without changing
the server account or generating a replacement token. A temporary MCP client
successfully initialized the pinned STDIO container, discovered ten read-only
tools and called `get_project_quality_gate_status` for `thermal-label-studio`.
The stored analysis returned `status=OK`; this verification did not run a new scan.

The local user-level Codex configuration now contains `thermal_label_sonar`,
pointing to this checkout's launcher with an explicit allowlist of those ten
tools. Tokens remain outside the client configuration. Restart/reload the Codex
MCP connection to load this registration into an existing session. Registration
is specific to this device and must be generated again after moving the checkout.

## Shared runtime verification (2026-10-10)

The shared loopback service returned `200` from `/health`, reported the exact
version `1.19.0.2785` from `/info`, and rejected unauthenticated `/mcp` requests
with `401`. An SDK `ClientSession` HTTP handshake discovered the approved ten
read-only tools and fetched the project quality gate successfully. The hardened
read-only filesystem, tmpfs and dropped capabilities remained compatible with
that verification. This is runtime evidence for the shared MCP layer, not a
new SonarQube scan or a claim about production access.

Independent review also verified two concurrent SDK clients through the actual
PowerShell STDIO launcher: both discovered ten tools and retrieved the stored
`thermal-label-studio` gate (`OK`). The full MCP test suite passed: 82 tests.
The initial sandbox run denied Windows subprocess pipe access; the bounded
unsandboxed rerun passed without changing implementation to bypass that error.

Fifteen legacy `tls-sonar-mcp-<12hex>` containers were checked for the pinned
image, open STDIO, automatic removal and zero mounts, then stopped. Automatic
removal left one `tls-sonar-mcp-shared` container, using approximately 160 MiB
at the verification snapshot with a 512 MiB limit. Core container IDs, images
and states matched before and after cleanup; application volumes were untouched.
The live Codex MCP connection reconnected through the new launcher and fetched
the gate successfully after the old transport closed. These checks retrieved
existing analysis results; they did not trigger a source scan.
