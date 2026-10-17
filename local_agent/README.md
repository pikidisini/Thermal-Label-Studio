# Local print agent

Standalone Python standard-library agent retained for separate workstation
clients. The current Label Print page delivers LAN jobs directly from the
server and does not use this agent or its token. It listens
only on `127.0.0.1:18191` on the operator computer. It never calls SAP, resolves
templates, renders SVG, discovers devices or probes printers. Startup/status
are free of printer effects. Only an authenticated `POST /v1/jobs` can submit.

## Setup on the plant computer

1. Install a supported Python 3 runtime (source uses Python 3.9+ APIs; development
   verification uses Python 3.14). Copy the `local_agent` package to a local
   directory. USB requires Windows with an installed printer queue supporting
   the device's RAW IPL language; queue names must match exactly. This is a
   foreground service process, not an installed Windows SCM service.
2. Copy `config.example.json` to a private operational directory outside Git.
   Remove example printers and configure only the intended devices. The sample
   IP is a documentation address, never a real device destination. Each
   `target_id` must match an enabled printer registered in Application Management.
   For Ethernet, numeric IP and port must also match. For USB, the local queue
   mapping replaces the central Ethernet address for that logical ID; central
   configuration currently stores Ethernet targets only. Verify that mapping
   deliberately before any physical print. Language is currently IPL only.
3. Set `allowed_origins` to the exact web application origin, including scheme
   and port, without a trailing slash. No wildcard is allowed.
4. Generate a private URL-safe random token of at least 32 characters and set
   `TLS_AGENT_TOKEN` in the service process environment. Do not commit, log or
   include it in a URL. This token pairs the browser to this workstation's agent;
   it is unrelated to SAP credentials or intake keys.
5. From the directory containing `local_agent`, run:

   ```powershell
   python -B -m local_agent.agent --config C:\Private\TLS\agent.json --database C:\Private\TLS\jobs.sqlite3
   ```

   The directory must already exist and be writable by the operator/service
   account. SQLite is created explicitly at the supplied path. A second agent
   instance on the same port must not be started. Preserve this database across
   restarts; deleting/replacing it removes duplicate-job protection. Stop with
   Ctrl+C. No Windows startup registration or firewall changes are performed.
6. Use a separately integrated agent client to pair with the token. The current
   Label Print LAN page no longer exposes agent pairing. Agent clients must keep token storage memory-only. Choose an
   enabled registered printer mapped by the agent. Connection type follows the
   mapping. Get Data and select successful previews; Print becomes available
   only when all selected previews still have print artifacts and copies are
   valid. **Test Data printing also contacts a real printer**; Demo never does.

The current React application and this agent do not establish Windows XP
compatibility. No XP binary/runtime package, browser acceptance or plant install
was produced. Evaluate legacy-device support separately before deployment.
Browser permission to reach local network/loopback may be required. CORS and
private-network preflight support do not override browser policy. Application
preview/package routes retain their existing local-development guard; a remote
server deployment needs its own authenticated admission design.

## Contract and outcomes

- `GET /v1/status`: authenticated protocol version 1, configured printer map.
  READY means the agent accepted the status request, not that a device is ready.
- `POST /v1/jobs`: `{job_id: UUID, target_id, language: "IPL", items:
  [{payload_base64, sha256}]}`. Maximum 100 items, 18 MiB HTTP body, 12 MiB total
  decoded wire payload. No caller-supplied IP, queue or arbitrary destination.
- `GET /v1/jobs/{job_id}`: authenticated durable metadata-only result. This can
  be inspected locally with an HTTP client sending the same Origin and bearer
  headers; never paste a real token into shared commands/screenshots.
- Exact allowed Origin, Host, loopback peer and bearer authentication are
  required, including for status. Tokens/payloads are never logged. No TLS is
  served on loopback. The service must not bind a LAN interface or be proxied.
- Validate every item's SHA-256 and supported readable IPL framing before any
  device effect. Convert readable `<STX>`, `<ESC>`, etc. to control bytes for
  physical delivery. Copies are already encoded by the server as native IPL
  quantity; the agent does not multiply or repeat submissions.
- Commit RUNNING in SQLite before the first submission. Duplicate job IDs are
  rejected across restarts and never automatically resubmitted. An interrupted
  RUNNING job becomes UNCERTAIN on restart. The ledger stores only job/target
  identity, aggregate status and per-item indexes/outcomes, never label data.
- Each payload is submitted once. Stop subsequent items on the first failure.
  Per-item outcomes are SUBMITTED, FAILED_BEFORE_SEND, UNCERTAIN and
  NOT_ATTEMPTED. SUBMITTED means TCP accepted bytes or the Windows spooler
  accepted the document; physical output is never confirmed by this protocol.
- Browser keeps a pending job ID in session storage before sending. Connection
  loss, timeout, partial failure or invalid response locks further prints,
  including after page reload in the same tab. Operator must inspect the
  printer/ledger and explicitly release the lock. This is not global job
  orchestration: a new tab or explicit new job can still print the same label.
- Server preview artifacts expire after 15 minutes and have a 64 MiB/256-entry
  process-local cache. Restart, eviction or another worker can return 410;
  retrieve data/preview again. This cache grants no automatic replay and is not
  an operational ledger. Multi-worker/shared deployment is not accepted here.
- Package creation rechecks the centrally registered printer is enabled, and
  the browser checks Ethernet address consistency. It reuses the preview bitmap and only re-encodes IPL when copies
  differ from one. It never calls SAP, rebinds or rerasterizes. Large selections
  exceeding package limits must be split by the operator before any submission.

Source/fake HTTP tests are separate from installed-service, browser-policy,
Windows spooler, printer language/media and physical-label acceptance. No
printer effects are authorized by running the test suite.
