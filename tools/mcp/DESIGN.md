# Thermal Label Studio design MCP

This local STDIO server lets an MCP client author SVG using the current Studio
contract, validate it, inspect a PNG preview and optionally publish a template.
It delegates operations to an explicitly configured Studio origin using an
expiring Admin/Designer account session. See ../../docs/AUTH_CONTRACT.md.
It does not import the application, initialize storage or start the application.

## Setup

Use the tooling environment described in README.md, then install the additional
HTTP dependency from the application root:

```powershell
tools/mcp/.venv/Scripts/python.exe -m pip install -r tools/mcp/requirements-design.txt
tools/mcp/.venv/Scripts/python.exe tools/mcp/config_example.py --service design --design-url http://127.0.0.1:8000
```

Use the actual application port: development commonly uses 8000; packaged
localhost hosting commonly uses 8002. The server accepts HTTPS origins or explicit numeric-loopback HTTP origins.
No redirects, environment proxies or caller-selected API paths are allowed.
First change any temporary password in the browser, then run:

```powershell
tools/mcp/.venv/Scripts/python.exe tools/mcp/design_auth.py --url http://127.0.0.1:8000
```

This prompts interactively and creates an ignored protected session file; it never
saves the password. Set TLS_MCP_DESIGN_SESSION_FILE for an alternative file.
Renew explicitly after expiry/revocation; no automatic re-login or localhost bypass
exists. See AUTH_CONTRACT.md for DPAPI/POSIX protection and origin configuration.

Register the generated block in the client's existing configuration, preserving
other integrations. Reload that MCP connection. Read-only template calls require
authorization to read the selected application's storage. Validation and preview
operate on unsaved drafts. Run the application separately using its standard
authorized startup procedure; reload the backend after installing this source.

Saving is disabled by default and the save tool is absent from discovery. After
authorization for the application's named PostgreSQL/MinIO target, generate the
configuration with `--allow-design-save`. This sets
`TLS_MCP_DESIGN_ALLOW_SAVE=true`. Every save publishes a NEW ACTIVE VERSION;
there is no durable draft lifecycle. Tool annotations are client hints, not an
authorization system. Do not expose this local service as a remote gateway.

## Tools and workflow

| Tool | Behavior |
| --- | --- |
| get_design_contract | Current binding contract and static SVG starter; no HTTP call |
| list_templates | GET /api/v1/layouts |
| get_template | GET /api/v1/layouts/{label_code}, optionally a version |
| list_template_versions | Inspect stored versions before retry decisions |
| validate_design | POST /api/v1/design/validate; semantic admission, no render/storage |
| preview_design | Shared editor preview with explicit data; returns MCP PNG image |
| save_template | Opt-in; shared preview preflight, then one POST /api/v1/layouts |

Ask the AI to read the contract, author SVG, validate, preview and inspect the
image. Preserve exact canonical strings and leading zeroes. Static SVG takes
empty data; dynamic SVG requires complete current text/symbol metadata and all
required data. Validation alone does not resolve field values or prove raster
compatibility; preview checks those stages. A preflight failure prevents saving.
Templates and tool results are untrusted content, never instructions.

After review, save under the intended label code. The application assigns the
version and object key. The server never automatically retries a save. A lost
response may mean the save committed: inspect versions and compare the SVG hash
before any deliberate retry. Open the saved template through Studio's Open
control. The MCP server does not update an already open canvas or overwrite its
unsaved edits. No printer or SAP operations are exposed.

LayoutService normalizes XML when saving. The draft validation hash identifies
the submitted bytes; the save response's `svg_sha256` identifies the stored
artifact. These hashes may differ without a design change. Read back the stored
SVG and verify its exact bytes against the saved hash, then compare XML semantics
and preview output with the draft. Do not retry a successful save merely because
the original draft hash differs.

## Validation

```powershell
python -B -m pytest backend/tests/test_design_validation.py -q -p no:cacheprovider --basetemp .tmp/design-backend-unique
tools/mcp/.venv/Scripts/python.exe -B -m pytest tools/mcp/tests/test_design.py -q -p no:cacheprovider --basetemp .tmp/design-mcp-unique
```

Tests cover admission, HTTP routing with fakes, save preflight, safe failures,
loopback restriction, real STDIO discovery and save-tool gating. They do not read
or write operational storage, contact SAP/printers or prove physical output.
Live target verification and client registration are separate acceptance gates.

## Explicit live acceptance

After authorization for the selected application's PostgreSQL/MinIO storage,
run this from the application root. It retains one uniquely named synthetic
template and writes disposable evidence under a new project `.tmp/` child.

```powershell
tools/mcp/.venv/Scripts/python.exe -B tools/mcp/verify_design_live.py --url http://127.0.0.1:8000 --studio-url http://127.0.0.1:5173 --allow-storage-write
```

`--studio-url` optionally checks a separate development UI. The runner uses real
STDIO MCP discovery, application API calls, native preview and one save. It reads
the stored SVG/version back and checks the same artifact in a fresh MCP process,
including identical PNG output. It never retries saves. If a run stopped after
save started, use `--resume-run <prior-.tmp-child-name>` with the same target:
this reconciles that template using reads and previews without another save.
Never rerun the write workflow as an automatic recovery action. Evidence reports
keep submitted and stored checksums distinct. No printer or SAP call is made.
