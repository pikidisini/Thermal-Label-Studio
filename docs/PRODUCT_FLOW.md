# Product flow

## Implemented local experience

Studio and fixture pages offer browser-local Settings for English (default) or
Bahasa Indonesia, and Dark (default), Light or System appearance. Invalid or
unavailable local storage falls back safely; System follows OS color changes.
The palette applies before first paint and changes editor chrome and rulers only.
Authored labels, SVG/PNG exports, JSON/SAP keys and barcode payloads are unchanged.

Open `/studio` to edit the Fabric canvas. There is no login, logout, session or
role selector. Create a layout, use the current text/line/barcode/QR/image tools,
import a local SVG or inspect local JSON facts without contacting SAP.
Local draft recovery preserves its existing browser storage namespace; removing
login does not clear stored drafts.

Save to Server sends authored SVG/media to the layout API. PostgreSQL records
server-owned versions and active metadata; MinIO preserves the exact immutable
SVG. The explorer lists and opens persisted layouts. Its preview fits the SVG media proportions within the panel, with a white label and a contrasting surrounding background so the label boundary remains visible. Without configured storage,
these actions show an error. A failed save is never presented as success.

A storage response failure may follow a successful commit. Retrying publishes a
fresh version; it is not an idempotent retry. Version gaps and unreferenced SVG
artifacts may remain and require separately authorized reconciliation.

Preview view and Label Simulation export the current canvas and use the same
server editor-preview endpoint. Label Simulation opens from Utilities; the HUD
keeps an icon-only, unavailable Print control with a planned tooltip. Its neutral
icon gains a blue background on hover and sends no print request.
Preview view sends one render request and shares
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

Template Explorer provides Rename and Delete for saved custom templates. Rename
changes the display name while retaining the label code. Delete requires an
explicit confirmation naming the template, then removes it from the library only
after server success. The current canvas stays intact; deleting its active saved
template clears the saved-template association. Version history and SVG artifacts
remain retained. Save an edited copy under a new label code. Failed operations
leave the template in the explorer and display an error.

Explorer details show the stable template code, active version/status, media size, DPI, and version creation time in WIB. Expand Storage details for the MinIO object key and SVG SHA-256. Rename does not change the code or object key. Version creation time is not the rename time.

Studio File menu exposes New Template, Save Template, and Template Properties. New Template creates a blank canvas with a separate unsaved identity. Template Properties edits the display name, physical dimensions (10–500 mm per side), orientation, and DPI; Cancel discards these dialog edits. Apply keeps existing canvas objects. Save Template persists the applied name, dimensions, and DPI through the versioned layout API.


## Friendly data fields in Studio

Fields show friendly names and current values. Exact JSON keys remain binding
identities in collapsed technical details. Upload JSON or choose a saved dataset
to supply values; no built-in design sample is available. Imports replace the
active data without filling gaps. The source banner identifies the selected
file, item and batch.
Absent, null and empty values have distinct statuses. Linked text without data
shows a readable no-data message in Design. Both PNG preview entry points block
missing/invalid bindings, including fields inside groups, and clear old images.

The inspector links objects through a friendly field dropdown. Text, barcode
and QR content can combine field chips and fixed text, units or line breaks.
Curly-brace expressions are internal metadata; technical barcode expressions
are optional details. SVG export/import, duplication and history preserve the
binding/composition. These are local editor features, not production SAP intake
or physical print admission.


### SAP characteristic descriptions in Studio

The versionless local JSON envelope accepts optional request-level `field_descriptions`: an object mapping exact characteristic keys to SAP display descriptions, for example `{"ZZWIDTH":"WIDTH"}`. Every item keeps its scalar values under `data.ZZWIDTH`; descriptions never rename binding keys or become label values. Studio uses these descriptions in field search, selectors, composition chips, layers, and missing-data messages. Missing or blank descriptions fall back to the exact key. Duplicate descriptions include the key, for example `WIDTH (ZZWIDTH)`. Importing a new request replaces all previous description metadata.

The description map allows at most 200 entries, the same safe keys as `data`, and string descriptions of at most 256 characters. The complete `docs/examples/label_data.example.json` includes blank descriptions and values for manual completion, with `ZZWIDTH: WIDTH` as the illustrative description. Descriptions are presentation metadata; the actual bound value appears on the label canvas.

## Saved sample datasets in Studio

Upload dataset opens the JSON file picker. Focusing the saved dataset selector
refreshes its list. Uploading a valid versionless JSON file populates local fields and saves its
original parsed envelope as a named sample dataset (default name from filename).
Studio claims Saved only after the server acknowledges storage; failed storage
retains local exploration with an explicit Unsaved status. Saved sample datasets
can be refreshed and opened without reuploading, including all items/descriptions.
The page never automatically selects a dataset; initial fields stay empty.
Legacy v1.1/raw-v2 imports stay local with an
explicit unsaved status. Preview field edits remain in memory; dataset editing
and Save changes are future development. Dataset selection does not bind its
lifecycle to template storage or SAP rendering requests.
