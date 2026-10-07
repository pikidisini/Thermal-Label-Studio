# Product flow

## Implemented local experience

Open `/studio` to edit the Fabric canvas. There is no login, logout, session or
role selector. Create a layout, use the current text/line/barcode/QR/image tools,
import a local SVG or inspect local JSON facts without contacting SAP.
Local draft recovery preserves its existing browser storage namespace; removing
login does not clear stored drafts.

Save to Server sends authored SVG/media to the layout API. PostgreSQL records
server-owned versions and active metadata; MinIO preserves the exact immutable
SVG. The explorer lists and opens persisted layouts. Without configured storage,
these actions show an error. A failed save is never presented as success.

A storage response failure may follow a successful commit. Retrying publishes a
fresh version; it is not an idempotent retry. Version gaps and unreferenced SVG
artifacts may remain and require separately authorized reconciliation.

Preview view and Label Simulation export the current canvas and use the same
server editor-preview endpoint. Preview view sends one render request and shares
the returned 1-bit PNG in both panels. Display effects are cosmetic. Unsupported
SVG/media and renderer failures remain visible; a failed or superseded request
cannot leave an old bitmap displayed as a fresh result. SVG export remains local;
legacy rendered-SVG/protocol export and physical delivery are unavailable.

Studio Utilities links to `/fixture-simulation`. Its sample/mixed scenarios use
application-owned synthetic data, showing ordered item results, exact backend
bitmaps, bounded traces and failures. It performs no printer or storage writes.

Global graphics-library clients are retained as future work and are not mounted
by Studio. The graphics panel explains the planned status, while global graphics,
data/protocol export and print actions remain disabled without API requests;
local image upload is a separate current editor tool. Retired auth, operator
simulation and direct print flows are historical reference only.

## Target workflow still to implement

1. Resolve an approved label code/layout/version on the server.
2. Validate actual SAP/API facts without fabricating missing business values.
3. Bind supported text/barcode/QR facts and render the final bitmap once.
4. Create the shared encoded payload; capture that output for simulation evidence.
5. Deliver that same output only through an authorized server-resolved transport.

The acceptance endpoint, provisional SAP adapter, metadata-only job repository
and injected IPL boundary are source-tested foundations. They are not wired as a
live product workflow and do not automatically consume saved Studio layouts.
Processing acceptance, successful rasterization, simulated capture, submission
and confirmed physical delivery are distinct evidence categories. Access controls,
actual SAP intake, job orchestration and live printer delivery remain future work.
