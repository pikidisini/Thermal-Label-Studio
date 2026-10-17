# Graphics library: embedded copies

Application Management has a separate **Graphics / Images** menu at
`/management?section=graphics`. It reuses the Studio Graphics library for search,
pagination, explicit refresh and upload, and shows a selected asset's original
image, dimensions, MIME type, byte size, creation time and immutable asset ID.
Selecting an asset here only opens its details; insertion remains a Studio action.
Graphics storage operates independently of the management-policy writable flag.
Templates remains the menu for complete saved label designs and their versions.
A label containing an embedded image remains a template, regardless of its name.
This navigation does not migrate or reclassify existing records, provision storage,
or activate version replacement/deletion.

Studio's Graphics dock supports local library upload, paginated name search,
thumbnails and insertion into the current label. Accepted files are single-frame
PNG, JPEG and WebP. SVG/GIF/BMP and remote URLs are unsupported. Uploading never
prints, modifies a template or automatically inserts a layer.

Each upload creates a new immutable UUID asset (version 1). Identical names and
bytes may be uploaded deliberately as separate assets. There is no automatic
retry, overwrite, deletion, linked-asset resolution, version replacement, impact
analysis or bulk template update. Graphic Update Center remains unmounted.

Clicking an asset fetches its embedded source and passes a File through the same
image insertion owner as Upload Image / Logo. The image is centered and scaled
proportionally into half the label dimensions. Aggregate 4-million-native-pixel
and 512-KiB-UTF8-SVG limits are checked before insertion. No graphicAssetId or
graphicAssetVersion metadata is assigned. Save/open, Preview and Label Simulation
therefore use the static image already embedded in the SVG, with no library call.
Library changes cannot alter previously saved templates.

## HTTP contract

All routes use the configured API prefix (normally `/api/v1`) and the existing
loopback development access guard, including origin/cross-site checks. There is
no shared-user authentication or permission model.

- `GET /graphics?q=<literal name substring>&offset=0`: at most 100 summaries,
  newest first with UUID tie-breaker. Case-insensitive literal substring search;
  `%` and `_` are literal characters. `q` is at most 160 characters; offset is
  0..1000000. UI Load more advances by 100 and ignores stale search responses.
- `POST /graphics`: JSON with exactly `name` and `data_uri`; returns 201 summary.
  Names are trimmed, nonblank, at most 160 characters, without control characters.
  The original image bytes are retained. MIME and actual decoded format must
  agree. Invalid input returns 422, oversized request body 413, wrong media 415.
- `GET /graphics/{uuid}`: summary plus `data_uri`; missing UUID returns 404.
- `GET /graphics/{uuid}/content`: original image bytes, exact image MIME,
  `X-Content-Type-Options: nosniff`, private cache (immutable content).

Summary: `id`, `name`, `version: 1`, `content_type`, `byte_length`, `width`,
`height`, `updated_at` (creation timestamp). List never returns image blobs.
JSON uses the existing duplicate-member rejection. Request body <=512 KiB,
image <=393000 bytes, sides <=4096 px and total native pixels <=4000000.
The server checks dimensions/frame count before decoding and verifies/loads the
image before storage. Some assets can fit the library but exceed the remaining
budget in a particular template; insertion reports that error without a layer.

Missing/unprovisioned storage returns 503; no transient memory/disk fallback is
allowed. UI preserves errors, allows deliberate refresh, clears the file input
for repeat selection, serializes upload/add actions and never retries a write.

## Storage and activation

Small, bounded image blobs use `label_studio.graphics` in the configured Studio
PostgreSQL database. Metadata and bytes commit in one transaction; MinIO is not
needed for this asset slice. Existing template object storage is unchanged.
Library queries have connection, statement and lock timeouts.

Application startup constructs the service but **never applies Graphics DDL**.
The named database target must be authorized before provisioning or live tests.
From the application root, with the authorized `TLS_DATABASE_URL` already loaded:

```powershell
python -B scripts/provision_graphics.py
# PLAN ONLY; no connection.
python -B scripts/provision_graphics.py --apply --confirm-host <authorized-host> --confirm-database <authorized-database>
```

The explicit apply executes `backend/schema/005_graphics.sql` without deleting
existing data. The script never prints the DSN. Host/database confirmation is an
operator safeguard and does not itself grant authorization. Normal configured
Studio persistence is required; no new storage container or volume is created.

After authorized provisioning, verify a uniquely named synthetic image through
upload, list/search, add, save/open and shared PNG simulation on the named target.
Retain the test asset/template unless cleanup is separately authorized. Mock/fake
tests do not establish live persistence, packaged runtime or physical printing.

The live browser acceptance is
`frontend/tests/browser/integration/graphics.spec.js`. Run it from `frontend/`
against the already running standard application, after named-target authorization:

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:5173'
$env:E2E_ALLOW_STORAGE_WRITES = 'true'
$env:E2E_GRAPHICS_RUN_ID = '<unique_lowercase_run_id>'
npm.cmd run test:e2e -- --project=integration tests/browser/integration/graphics.spec.js
```

Reuse the same run ID for investigation/reruns: the test finds its retained asset
and template before creating anything. It checks original image bytes, embedded
SVG and checksum, reload/open, real server PNG output and nonblank pixels. It
exports JSON/PNG evidence to the unique Playwright `.tmp` directory. API requests
are not mocked; printer/SAP/unrelated mutation requests are blocked. The test
does not start servers, provision storage, delete records or overwrite templates.
