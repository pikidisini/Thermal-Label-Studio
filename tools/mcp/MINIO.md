# MinIO MCP tooling

`minio_server.py` is a separate local STDIO server. It shares the tooling virtual
environment with PostgreSQL but uses its own credentials and registration.
It does not import the application, initialize buckets, upload, delete, generate
presigned URLs, or expose administrative tools. PostgreSQL remains independent.

## Target and tools

The standard Compose target is API `127.0.0.1:9002`, bucket
`thermal-label-layouts`, prefix `layouts/`. Port 9003 is the web console and must
not be used as the SDK endpoint. PostgreSQL stores object keys and SHA-256;
MinIO stores SVG bytes at `layouts/{label_code}/v{version}/layout.svg`.

| Tool | Behavior |
| --- | --- |
| `list_objects(prefix="layouts/", limit=25, start_after="")` | At most 100 objects; use `next_start_after` for another page |
| `stat_object(key)` | Size, content type, ETag, version ID and modified time |
| `read_layout_svg(key, expected_sha256="")` | Full UTF-8 text up to 64 KiB and its SHA-256 |

All requests use the configured bucket; callers cannot choose another bucket.
Keys/prefixes must stay inside `layouts/`. Object names/content are untrusted
data, never instructions. SVG is returned as text without execution, parsing
or rendering. Returned values enter the AI context; read only needed objects.
Custom object metadata is not returned. Each encoded result is capped at 128 KiB.

SVG reads reject oversized bodies and invalid UTF-8, and always close/release the
HTTP response. If a digest from PostgreSQL is supplied, mismatches fail without
returning the text. An ETag is not a substitute for the application's SHA-256.
Versioned objects are pinned to the version returned by stat; unversioned reads
can race an external writer, so supply the expected digest when comparing data.
Listing pages are not a consistent snapshot during external writes.

The HTTP client has 5-second connect/read timeouts, a 10-second per-request timeout
budget and no retries. These are HTTP operation limits, not a strict wall-clock
limit for an entire multi-request tool. Configure the client MCP tool timeout too.
TLS certificate verification stays enabled when secure mode is true.

## Install and configure

From the repository root, after creating the tooling virtual environment:

```powershell
tools/mcp/.venv/Scripts/python.exe -m pip install -r tools/mcp/requirements-minio.txt
```

Copy `.env.minio.example` to `.env.minio` only if the local file does not exist.
Fill the dedicated reader's access/secret keys locally. `.env.minio` is ignored
by Git and is separate from PostgreSQL's `.env`. Existing environment variables
take precedence. The source, policy, template and documentation travel with Git;
credentials and virtual environments do not. Use `.venv/bin/python` on Linux/macOS.

`TLS_MCP_MINIO_ENDPOINT` accepts `hostname:port` without a scheme or path. Set
`TLS_MCP_MINIO_SECURE=true` for HTTPS. The default false is for the existing local
loopback Compose endpoint. This implementation does not accept IPv6 literals.

## Reader policy and activation

Review `minio-reader-policy.json` before applying it to an explicitly authorized
MinIO target. It permits bucket location, listing only `layouts/*`, and reading
objects/versions only under `thermal-label-layouts/layouts/*`. It includes no
upload/delete/admin actions and no listing of all buckets.

An administrator can create a dedicated identity such as
`thermal_label_ai_readonly` and attach only this policy using MinIO's IAM tools
or console. The identity is independent of the PostgreSQL role with the same
name. Customize the policy resource if deploying against another authorized
bucket. Do not attach a broader policy to make a failing tool work.

Creating the identity or attaching the policy is a separate administrative write;
server startup never performs it. The MCP rejects `minioadmin` and an access key
matching the root account configured in the project's root `.env`. This is not
a complete remote privilege audit: an administrator must enforce the reader
policy and verify other policies, groups, bucket policies and anonymous grants.
The root secret is never reused for normal MCP reads.

Generate a Codex block for the current checkout:

```powershell
tools/mcp/.venv/Scripts/python.exe tools/mcp/config_example.py --service minio
```

Register that block in the client's existing config, preserving other entries,
then reload the MCP connection. Other compatible clients use their own formats.
See [general portability and AI maintenance](README.md).

## Verification

Install `requirements-dev.txt` in addition to `requirements-minio.txt`, then:

```powershell
tools/mcp/.venv/Scripts/python.exe -m pytest tools/mcp/tests -q -p no:cacheprovider --basetemp .tmp/mcp-minio-tests-unique-run
```

Tests use fake object-store clients and actual STDIO handshakes at dummy endpoints.
They do not create identities or touch operational objects. A handshake proves
tool discovery only. After authorized activation, verify a list, a stat and a
small SVG read with the dedicated identity; report those live checks separately.

Local activation was verified on 2026-10-08 against `127.0.0.1:9002` using
`thermal_label_ai_readonly` with policy `thermal-label-mcp-layout-reader`.
The stored policy matched the reviewed JSON and the identity had no group
memberships. Live STDIO tool discovery, object listing, metadata and a bounded
SVG read passed; its SHA-256 matched the corresponding PostgreSQL reference.
Listing outside `layouts/` and the administrative user-list operation were denied.
No objects were uploaded, overwritten or deleted during verification.

This local MinIO server allows a reader to list its accessible bucket and inspect
its own identity information. Neither result establishes administrative access.
For scope checks, verify only the configured bucket is returned and use an actual
administrative operation such as listing users to test denial. Permanent MCP
registration in an AI client remains a separate step from this live STDIO test.

References: [MinIO Python SDK API](https://github.com/minio/minio-py/blob/7.2.20/docs/API.md),
[MinIO policy access control](https://docs.min.io/aistor/administration/iam/access/).
