# Product flow

## Implemented local experience

Studio View â†’ Preference and the fixture page's direct Preference control offer
browser-local settings for English (default) or
Bahasa Indonesia, and Dark (default), Light, Industrial Dark, Industrial Light
or System appearance. Dark/Light retain the original palettes; Industrial
appearances use graphite/steel and warm-grey with muted status accents. Invalid or
unavailable local storage falls back safely; System follows OS color changes
using the original Dark/Light palettes. The browser-local v1 key accepts all
explicit theme IDs without migrating existing choices.
Preference always opens the full color editor and live preview, regardless of
the active theme. Opening it does not change the theme. Editing a color, changing
the custom base or resetting colors selects a Custom draft; Apply commits it.
Custom appearance starts from Industrial Light or Industrial Dark and offers
bounded colors for menu/toolbar/inspector/status surfaces, workspace/grid,
text/icons, paired button/selected colors, and warning text/outline plus a
separate selected warning fill/foreground pair. Existing nine-color palettes
receive only missing warning fields from their selected Industrial base; invalid
supplied warning colors are rejected. A miniature preview updates while
editing; Apply commits the validated palette locally and Cancel discards it.
Reset restores the selected base palette. Existing appearance choices still
apply immediately. Language remains immediate. Contrast reports the lowest ratio
among chrome text/surface and button pairs; it informs the choice without blocking
valid colors. Custom settings retain the previous palette when a builtin is selected.
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
server editor-preview endpoint. Label Simulation opens from Utilities and offers the implemented IPL output language; the HUD
opens the Print dialog through an icon-only Print control. Opening it only reads
the optional server default and offers editable target fields without submission.
Preview view sends one render request and shares
the returned 1-bit PNG in both panels. The server first encodes the processed
bitmap as IPL G/u/U, then decodes that exact payload for the PNG. Display effects are cosmetic. Unsupported
SVG/media and renderer failures remain visible; a failed or superseded request
cannot leave an old bitmap displayed as a fresh result. SVG export remains local;
legacy rendered-SVG/protocol export remains unavailable.

Studio Utilities links to `/fixture-simulation`. Its sample/mixed scenarios use
application-owned synthetic data, showing ordered item results, PNG decoded from the exact encoded IPL
payload, bounded traces and failures. It performs no printer or storage writes.

Global graphics-library clients are retained as future work and are not mounted
by Studio. The graphics panel explains the planned status, while global graphics,
data/protocol export actions remain disabled without API requests;
local image upload is a separate current editor tool. Retired auth, operator
simulation and direct print flows are historical reference only.

## Target workflow still to implement

1. Resolve an approved label code/layout/version on the server.
2. Validate actual SAP/API facts without fabricating missing business values.
3. Bind supported text/barcode/QR facts and render the final bitmap once.
4. The local IPL codec already creates shared encoded payloads and decodes them
   for simulation; connect this boundary to the eventual production workflow.
5. Deliver that same output only through an authorized server-resolved transport.

The acceptance endpoint, provisional SAP adapter, metadata-only job repository
and injected IPL boundary are source-tested foundations. They are not wired as a
live product workflow and do not automatically consume saved Studio layouts.
Processing acceptance, successful rasterization, simulated capture, submission
and confirmed physical delivery are distinct evidence categories. Access controls,
actual SAP intake, job orchestration and full-media physical acceptance remain future work.

Template Explorer provides Rename and Delete for saved custom templates. Rename
changes the display name while retaining the label code. Delete requires an
explicit confirmation naming the template, then removes it from the library only
after server success. The current canvas stays intact; deleting its active saved
template clears the saved-template association. Version history and SVG artifacts
remain retained. Save an edited copy under a new label code. Failed operations
leave the template in the explorer and display an error.

Explorer details show the stable template code, active version/status, media size, DPI, and version creation time in WIB. Expand Storage details for the MinIO object key and SVG SHA-256. Rename does not change the code or object key. Version creation time is not the rename time.

Studio File menu exposes New Template, Save Template, and Template Properties. New Template creates a blank canvas with a separate unsaved identity. Template Properties edits the display name, physical dimensions (10â€“500 mm per side), orientation, and DPI; Cancel discards these dialog edits. Apply keeps existing canvas objects. Save Template persists the applied name, dimensions, and DPI through the versioned layout API.


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

Studio Align uses the active Fabric object's transformed scene bounding rectangle, including rotation, skew and stroke, for exact label edges and horizontal/vertical centers. Groups and active selections move as a unit. The nine-point origin changes the object's coordinate reference without moving its visible geometry; numeric X/Y fields refer to that origin. These changes use the normal selection synchronization and undo/redo history. Origins persist in editor JSON history; SVG export preserves geometry, while SVG import may normalize the coordinate origin. Fabric's centered rotation behavior is unchanged.

Studio restores SVG text baseline coordinates from the first positioned tspan when its parent text has no coordinates. This preserves single-line placement in saved Fabric SVGs when reopening a template or loading it on refresh, including small and rotated text. Explicit parent coordinates remain authoritative.


Studio Print opens from the HUD or Preview deck and displays editable Printer IP
address/TCP port, current layout dimensions/DPI, IPL and Copies (default 1, integer 1..999).
Port defaults to 9100.
The last valid target in this browser takes precedence over the optional server
default. Without a server default, enter a target directly; default lookup failure
also leaves the fields usable. Invalid numeric IP/port shows localized guidance
and disables submission. Opening, editing and remembering target contacts no printer.

Print validates current bindings, exports the current canvas and sends its explicit
target and copies. One native IPL quantity controls all identical copies, with one
raster/encoded payload/transport submission. Layout dimensions/DPI remain authoritative.
The target is remembered locally after a valid edit or explicit print action.
There is no server restart, environment edit or shared configuration write needed.

The dialog blocks duplicate clicks and closing/editing during an in-flight request.
Success reads "Sent to printer; physical delivery is unconfirmed" and shows the
effective target/copies returned by the server. After success, Print and fields
unlock for another deliberate action without closing the dialog. Known pre-send
validation/preparation failures also allow correction and retry. Unknown/failed
send explains uncertainty and stays locked; inspect the printer and reopen before
another explicit attempt. No automatic retry exists. Actual integrated PM45 delivery remains NOT RUN.


## Historical sample working copies

Opening/importing historical versionless data without mode shows a read-only warning. Preview, Label Simulation and Print are blocked. Choose Simulation working copy or Print working copy, explicitly correct any copies outside1..999, and work on the new unsaved copy. The original row is retained. Import and mode selection never print; canonical upload calls dataset storage only, returns to Design and clears stale previews. Legacy v1.1/raw-v2 remains local exploration.
