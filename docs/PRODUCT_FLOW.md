# Product flow

Studio Fit Label to Viewport centers the label in the working area beyond the
left and top rulers, with equal opposing margins. Fit reserves 24px on each
side and rounds zoom down to a 5% step within the supported 15%-400% range.
At the minimum zoom, oversized labels can still exceed the available area.

Studio Upload Image / Logo accepts PNG, JPEG and WebP only. MIME type and file
signature must agree. Empty, unreadable and unsupported files show localized
errors without adding an object or changing selection/history. The input resets
after every selection so the same file can be selected again.

Every upload is scaled proportionally, up or down, to fit half the label width
and height and is centered on the label. This changes editor geometry, preserving
the original embedded pixels. Source images must have sides <=4096 px, with
aggregate embedded pixels <=4 million. Before reading, files whose base64 alone
cannot fit the 512 KiB SVG budget are rejected. Before insertion, existing SVG
plus candidate image markup must fit that UTF-8 byte budget. These client checks
complement server admission; the server remains authoritative. SVG logos are
not accepted through this image control; template SVG import is a separate flow.

Optional AI design authoring uses the local Design MCP: read the SVG contract,
author a draft, validate and inspect the shared PNG preview, then review before
an opt-in template save. Open saved versions through Studio Open. Every save
publishes an active version; no editor session synchronization is implemented.
See [Design MCP](../tools/mcp/DESIGN.md).

Label Print sends selected successful previews directly from the server to the
selected enabled LAN printer registered in Application Management. No agent,
token or workstation mapping is required. The server rechecks the saved target
and the address/port shown to the operator before any delivery. Copies must be
1..999. Print reuses preview output without calling SAP, resolving a layout or
rasterizing again. Readable IPL tokens become device control bytes before TCP
RAW delivery. Each selected payload is submitted once in order; the first
failure stops remaining items. SUBMITTED means transport acceptance only.
The browser persists a pending job ID before sending, and uncertain/partial
results lock printing until operator review. No automatic retry occurs. This
local-development flow has no durable server job ledger or global deduplication;
job IDs correlate responses, and a deliberate new request may print again.


Label Print shows per-batch processing steps from data retrieval through PNG
decode and preview acceptance. Failure cards open the steps, identify the failed
stage and retain the resolved label code with corrective guidance. Completed
stages remain visible; later stages are not run. A fatal RFC failure marks
subsequent batches not attempted. Summary counts distinguish ready, failed and
not-attempted items; HTTP success alone never claims successful preview.


Label Print's SAP source can now load configured RFC operations, select one
and retrieve the entered batch list through the existing native RFC runtime.
Catalog loading alone never calls SAP. Get Data requires a ready selected
label_json operation with one operator string parameter; the parameter name
is taken from that saved configuration, not assumed to be IV_CHARG. Inputs
configured as constants remain server-owned. Each admitted batch yields a
saved-layout IPL-decoded preview or a bounded failure, retaining order.
Details carries operation/configuration revision and template/payload provenance.
Changing source/operation/input clears previews; unavailable runtime cannot
silently use sample data. Print requires selected preview artifacts and an enabled registered LAN printer.

Label Print loads registered printer targets from the same management snapshot
used by Application Management. Disabled targets are listed but cannot be
selected. Selection shows IP/port and TCP/RAW; normal language/connection are
fixed to the supported IPL/Ethernet configuration. Refresh clears selection
and reloads configuration. Loading, empty, disabled-only and error states are
distinct, with a Manage printers link. Real Print requires an enabled LAN target and successful selected previews. No selection or refresh probes a printer. Demo
mode retains explicitly simulated example devices.

Application Management -> Test Data edits existing Studio sample datasets.
The table edits batch (`item_id`) and `label_code`; a selected row exposes
typed scalar fields. String/number/boolean/null are distinct; deleting a field
means absent rather than null. JSON preview and import/export preserve the
canonical envelope. Save is explicit and revision checked; conflict/uncertain
writes require reload before another save. Unsaved navigation requests confirmation.

Label Print -> Test Data selects a persisted dataset and uses stored
Studio layouts by each item's code. Operator batch values match item_id, not
an inferred SAP key. Designers must provide the exact binding keys needed by
their layout. SAP execution requires configured runtime activation; LAN delivery requires server network access to the selected printer. Existing
built-in Fixture IPL remains backend regression support and is no longer offered
in the operator source menu. No dataset is automatically deleted or seeded.

The root URL opens an activity menu with Label Studio, Application Management
and Label Print cards. Home uses Studio's shared logo and icon primitives and
provides the shared Preference dialog in its compact header. Studio keeps its
existing `/studio` entry and offers File -> Main menu navigation back to Home.
`/print` opens the operator batch workspace: explicit SAP/Test Data retrieval
prepares saved-layout previews, and explicit Print submits selected artifacts
to a registered LAN target. Catalog loading/selection does not contact printers;
Check status and Print are distinct device actions. Both pages follow application
preferences and load independently of Studio and diagnostics. Page navigation
does not establish XP compatibility or physical output acceptance.

Label Print accepts text batch identifiers in numbered editable rows. A trailing
empty row and Enter navigation support manual entry. Multiline single-column
paste replaces the active row with ordered entries, ignores blank lines and
trims surrounding whitespace while preserving leading zeros. Multicolumn paste
is rejected without mutation. Duplicate values are marked, never silently
removed. Delete removes only the chosen row. Get Data with the SAP source requires a selected compatible RFC operation
and an available server runtime. Label Print uses a batch/settings sidebar
and a gallery with selection, expandable batch/label-code details, copy totals
and an explicit Print action gated by preview artifacts and an enabled registered LAN target.
Normal printing supports IPL over server TCP/RAW Ethernet; copies default to 1
with range 1..999. Selecting a printer never probes it.

Explicit Demo mode enables example printers, simulated agent status and local
illustrative PNGs for entered batches. These are not SAP data, bound templates
or decoded IPL/ZPL. Simulate print reports a local demonstration only. Disabling
Demo mode or editing batches/language clears the gallery. Printer selection
preserves successful preview artifacts. Demo creates no jobs and submits no
payloads. Actual SAP acceptance remains target-specific; ZPL encoding/decoding
is unimplemented. Normal Print uses direct server LAN delivery.

The Data source selector offers SAP and **Test Data** outside
Demo mode. Test Data requires a saved dataset and calls the preview endpoint
with its identifier and the ordered batch list. Saved data and Studio layouts
use the shared canonical binder, native renderer, IPL encoder and exact-payload
PNG decoder. Unknown batches and per-item processing failures appear as failed
cards that cannot be selected. Details includes code/version and provenance
hashes. Only IPL is available for this source; explicit Print can deliver real
test labels when LAN print prerequisites are met. Test Data
never falls back to built-in fixture data, illustrative Demo images or SAP.

Changing batches, source or language clears results and aborts the
client request; a revision check ignores late responses. Browser cancellation
does not assert hard cancellation of a native server render. Maximum 100 entries
are accepted per request; busy state prevents duplicate retrieval clicks.

Application Management -> Activity Log shows the latest 200 recorded intake and
Studio output requests, with trace/source/label search, mode/status/time filters
and safe stage details. Configuration changes remain in Audit Log. Disabled or
unavailable activity storage is explicitly shown. Studio Preview and Label Simulation
are attributed separately; printer SUBMITTED remains physically unconfirmed.

Application module loading displays a centered theme-aware logo and localized
workspace preparation status. It ends when the requested module resolves, without
an artificial delay or percentage. Module/render failure offers a reload action;
reduced-motion preferences stop the loading animation.

## Application Management

Utilities -> Application Management opens a separate `/management` page with
Overview, Templates, Printers, Integrations and Audit Log. Preference
and Back to Studio remain available. Login and user roles are intentionally
deferred. The initial page displays real configuration read-only; persistent
changes require explicit management-schema provisioning and activation. See
[management contract](MANAGEMENT_CONTRACT.md) for the implemented scope and
follow-up features. Previewing configuration never sends or retries a print.
Templates supports searching, previewing stored versions, editing the readable
name and label code, confirmed soft deletion and opening the selected version in
Studio. Review/approval controls are removed. Renaming updates configured source
references; external senders must use the new code. Metadata and audit commit
together. Stored artifacts and prior audit evidence remain retained.

Integrations manages a source's modes, enabled state and print destination, with
search plus configuration/mode filters above a compact source list. Rows show
selected state, mode chips, configuration and key status; selecting a row opens
the adjacent configuration/access-key detail with a save footer. Print destination
and copy-limit fields appear only when print mode is allowed. At narrower widths
the list stacks above details. Filters that hide the selected source clear details
and displayed keys; source switch, Close, Escape, refresh and navigation also clear
key presentation. Selection never reveals a key automatically. Existing read-only,
confirmation and uncertain-write restrictions continue to apply, with
no template restrictions or change reason. Create source & key saves a new source
and generated key atomically, including Enabled sources. Details offers deliberate
Show/Hide and Copy for encrypted keys. Existing hash-only keys need one explicit
replacement to enable recovery. Replace key invalidates the previous value;
Revoke key stops subsequent authenticated requests. Keys have no automatic expiry.
Manage previous key migrates a valid existing environment key to encrypted storage
without changing the sender's key. These actions never configure SAP or print.
Management configuration and audit use `app_management`; templates remain in
`label_studio` in the same database. Both schemas share atomic template/configuration changes.

## Template resolution persistence

New Template and Template Properties share a single selected DPI control. The
selected button uses the active theme's selected fill/foreground, and the HUD
updates from the same draft value. Apply/Create commits the choice to the editor;
Cancel discards the dialog draft. Save to Server persists DPI as version metadata
in PostgreSQL, and Open restores it alongside the SVG artifact. Standalone SVG
export contains physical width/height in millimeters and a viewBox, but does not
embed the printhead DPI. Exporting/importing that SVG alone is therefore not a DPI
round trip.

## Implemented local experience

Studio View â†’ Preference and the fixture page's direct Preference control offer
browser-local settings for English (default) or
Bahasa Indonesia, and Label Studio Signature (default), Dark, Light, Industrial
Dark, Industrial Light or System appearance. Label Studio Signature is an
immutable builtin with neutral grey chrome/workspace, white tool/inspector
surfaces, near-black text, steel-blue selected controls and warm-grey warnings.
No preferences or malformed preferences select Signature; explicit saved theme
choices are preserved. Its editor draft starts from the exact Signature palette
even when a separate Custom palette was previously saved. Edits select Custom.
Dark/Light retain the original palettes; Industrial
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

Sign in through `/login` before opening `/studio`; Admin and Designer can edit
the Fabric canvas. Accounts with temporary passwords must change them first. Create a layout, use the current text/line/barcode/QR/image tools,
import a local SVG or inspect local JSON facts without contacting SAP.
Local draft recovery uses the authenticated account ID. Existing anonymous drafts
are not imported into an account. Logout clears memory through document reload,
while print uncertainty locks survive account changes.

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

Graphics in the Studio dock lists, searches and uploads immutable PNG/JPEG/WebP
assets. Clicking an asset inserts a proportional, centered embedded copy through
the same admission and aggregate SVG/pixel budgets as local image upload. Saved
templates never resolve a library reference at render time. Uploading a new asset
does not change existing templates. The library requires separately provisioned
PostgreSQL storage; unavailable storage shows an error, with no memory fallback.
Graphic Update Center (versioning/bulk replacement) and data/protocol export
remain disabled. See [Graphics contract](GRAPHICS_CONTRACT.md).
Retired auth, operator simulation and direct print flows are historical reference only.

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
shows a readable no-data message in Design. Both PNG preview entry points use server display fallbacks for missing/null/empty
bindings, including fields inside groups, reject invalid nonempty values, and clear old images.

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

## T03 local template metadata

Implemented local metadata and immutable semantic admission are described in [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md). New Fabric7 exports preserve exact binding specs, explicit symbol options and marked nested groups. T04/T05 implement replacement text/symbol preparation and T06 integrates the editor output routes; runtime/storage remain separate gates. Legacy incomplete dynamic metadata fails closed without a stored migration. Dynamic rich text/wrapped Textbox require NEEDS_REPLAN if required before output integration.


## T04 local text preparation

The pure `app.template_binding.bind_text_template` owner now resolves validated canonical scalar fields/compositions into an immutable final SVG/media result. New Studio metadata preserves text origins and character spacing. Output text uses `N/A` for missing keys and ` - ` for null/empty values. Unavailable barcode/QR sources use plain centered ` N/A ` boxes. Unsupported font/shaping/symbol profiles and invalid nonempty values still fail closed. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) for semantics, budgets and the 84 actual Fabric geometry fixtures. T05 completes symbols; T06 integrates this owner into the existing editor output routes. SVG geometry checks do not prove raster/IPL/device or packaged-font parity.


## T05 complete local binding

The pure `app.template_binding.bind_template` owner now regenerates text, Code128, Code39, EAN13 and QR from exact canonical values. Independent actual Studio module/pixel fixtures and Fabric placement fixtures validate the declared profiles; explicit options, effective QR version/mask and asset/media hashes remain available in immutable results. Studio symbol refresh preserves painted bounds and uses declared options; invalid input cannot fall back to a sample or another type. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) and [generator notices](SYMBOL_GENERATOR_NOTICES.md) for exact dependencies, limits and unsupported profiles. Editor output APIs now accept explicit draft/data requests and use this binder before the shared raster/IPL engine (T06). This slice creates no intake endpoint or operational side effects.


## T06 shared Studio output

Both editor output routes now require `draft:{svg,width_mm,height_mm,dpi,binding_version:1}`, `data`, `encoder:"IPL"` and `copies:1..999`; optional `field_descriptions` is presentation metadata only. Print retains optional numeric `target:{host,port}`; simulation rejects it. The old top-level composed-SVG request is rejected. Unsaved drafts need no storage operation. A static template with no dynamic metadata accepts empty data; incomplete dynamic metadata never falls back to static/sample processing.

`engine/editor_request.py` admits streamed JSON up to2MiB, rejects duplicate members/invalid UTF8/media type, and validates bounded canonical scalar data. `prepare_draft_output` checks exact root mm dimensions and `viewBox="0 0 width*4 height*4"`, calls `template_binding.bind_template`, then the existing `prepare_editor_output`/resvg/IPL preparation. Preview decodes that exact prepared payload; print submits it once. Both responses add original `template_sha256` and `binding_version:1`. Stable binding errors are422 and prevent raster/transport; print failures with uncertain effects retain the client lock.

Studio captures immutable draft/data/media at action time. Local dynamic samples, preview overrides and stale local symbol errors are not output data authority. Unsupported metadata/crop/filter/font profiles still fail closed; local sample refresh remains responsive. Superseded requests are aborted and late results ignored; stale PNGs are cleared. JSON import with mode=print does not choose a sink or submit. The two Preview panels reuse one decoded PNG.

The renderer loads the same trusted regular/bold/italic/bold-italic font siblings used by binding. The authored dynamic font family must match the server profile; Windows Arial evidence does not establish packaged Liberation Sans/Arial equivalence. Design Canvas and SVG coordinate rounding are separate from exact shared-output raster/IPL parity. See [T06 result](implementation/universal-label-pipeline/results/T06_RESULT.md) for actual gates and limits; no sender/device/storage/package readiness is implied.

## T07 external intake simulation boundary

The registered universal intake first validates canonical JSON, then requires trusted source admission. T09 requires a server-configured bearer identity and explicit source/mode permissions. The default remains denied: missing bearer is unauthenticated and absent policy is policy_unavailable. After admission, simulation freezes the stored template mapping and uses the same server output pipeline as Studio. Results explain each completed simulation, failure or skipped item; simulation decodes the prepared IPL payload into PNG. Intake neither changes the Data Tokens selection nor saves a sample. T08 supplies durable identity/replay, T09 supplies source policy, and T10 now implements print orchestration through the existing sink with synthetic acceptance evidence; default operational configuration remains denied.

T07 software resource acceptance is NEEDS_REPLAN: cooperative deadline checks and working reservations do not provide hard interruption of blocked storage calls or OS renderer memory enforcement. T06 current-app browser remains BLOCKED; proceeding with this local T07 slice was explicitly requested on 2026-10-10 and does not change T06 evidence.

## T08 repeated intake requests

After current source admission, a new simulation request resolves/stores immutable pins, prepares through the shared Studio engine and commits the protected result before HTTP success. Repeating the same sender/request ID and input returns that original result; changing data/mode/copies/descriptions/item order rejects a conflict. Expired identities reject without recomputation. This does not alter Data Tokens or enable intake print.

Missing ledger and ambiguous commits deny processing/success. Explicit recovery marks unfinished pre-claim work failed and possible-send work uncertain, with later work skipped; it never triggers a retry. T08 source/fake evidence is separate from operational PostgreSQL restart or printer evidence. Default external admission stays closed without explicit T09 server policy/credentials.

## T09 external authorization

External systems supply bearer credentials separately from JSON sender metadata. Authorized simulation proceeds through the durable stored-template pipeline and returns original results on replay; disabling source, mode permission or rotating credentials can deny access to retained output. Data Tokens selection and Studio manual target actions are unaffected. Stored version changes require no approval. External print uses all valid stored templates with the configured source printer and copies limit, while pinning the resolved immutable version/checksum before sending. T09 owns pure policy; T10 consumes it for preflight and each committed claim before one-attempt print. No live sender or device is configured by this source task.

## T10 external print flow

A configured print-capable external source uses the stored-template shared binder/engine, not the current unsaved Studio draft. The server checks the whole batch before any printer submission. Each native copies value 1..999 changes IPL quantity in one payload, not the number of submissions. Request repetition returns retained results without printing again; changed input under the same identity is rejected.

SUBMITTED means local transport acceptance only. UNCERTAIN means submission may have occurred and later items are skipped. Proven no-submit failure is FAILED; no automatic retry, alternative target or background resumption exists. A durable-outcome/response failure can return response_unavailable, requiring cautious inspection or same-identity outcome lookup, never automatic new request IDs. Source/fake tests are separate from actual source/device acceptance. T10 remains NEEDS_REPLAN pending the T07 hard execution-resource gate; no real printer or storage was configured.


## T11 acceptance state (2026-10-10)

Software tests compare actual Studio preview/manual print with intake simulation/print and replay, including regenerated text and all symbol kinds. Browser tests explicitly use current built assets and mocked APIs; current application availability is separate. This does not yet enable an external sender in the standard runtime: ledger/configuration setup, retained policy history and mandatory resource enforcement are outstanding. Optional T12 physical acceptance is not required for software parity. See [T11 result](implementation/universal-label-pipeline/results/T11_RESULT.md).


## SAP RFC configuration

Integrations includes SAP Connections and RFC Operations with revision-checked
configuration, encrypted password storage and effect-free sample mapping tests.
`app/sap_rfc` owns bounded typed inputs and declarative result mapping;
`management/integrations/sap_http.py` owns persistence commands and sample endpoints.
The existing management JSONB snapshot stores the configuration without a schema
migration. API source credentials and SAP logon credentials remain separate.
Label Print can explicitly read configured operations; its SAP Get Data flow is
still separate. Management can explicitly fetch an actual RFC response through
the opt-in native worker. Sample tests remain local and never become SAP evidence
or print jobs. Saving a connection is not a connectivity test. See the configurable SAP RFC contracts
section in [MANAGEMENT_CONTRACT](MANAGEMENT_CONTRACT.md) for limits and endpoints.


RFC operations support direct JSON label responses through EV_JSON, with
EV_STATUS success gating and EV_MESSAGE validation. New operations use the
Z_TLS_GET_LABEL_DATA contract and IV_CHARG string input. label_code and all data
fields pass through canonical admission without mandatory field mappings.
Direct structure/table and advanced manual mapping modes remain available.
Existing operations keep their previous mode until explicitly edited and saved.
Configuration/sample acceptance does not itself enable the native worker.
Management actual-response testing requires server opt-in; it does not render or print. Details: [management RFC contract](MANAGEMENT_CONTRACT.md#z_tls_get_label_data-response-contract).

## Explicit LAN printer status (2026-10-16)

Label Print offers Check status for the selected enabled Management printer.
Only that button calls POST /api/v1/label-print/printer-status with target_id,
expected_host and expected_port; no caller-controlled destination is accepted.
The route rechecks saved configuration (409 if changed/disabled), uses the same
authenticated role/origin and bounded JSON admission as LAN Print, returns no-store and
serializes with LAN delivery (429 while busy). There is no background polling,
selection probe, SAP access, print payload, reset or configuration command.
The server sends one IPL ENQ byte (0x05) to the saved numeric TCP target, with
3 seconds for connection and a further bounded 3-second I/O budget, at most
16 initial response bytes and bounded framed-response reads. No retry exists.
RESPONDING indicates a recognized response, never physical completion. Standard
DC1 means ready/printing/skipping; US combines label-path/ribbon faults. The UI
keeps these ambiguous and displays ATTENTION, UNREACHABLE or UNAVAILABLE for
faults, connection failures and missing/unrecognized responses respectively.
A refused/timed-out connection does not prove power-off. Unknown data cannot
become READY. Responses include a server UTC checked_at timestamp, target,
method IPL_ENQ and confirmed=false. The UI clears results on printer changes,
refresh or Demo and ignores late responses. Results are snapshots, separate
from print-job outcomes; status checks neither unlock uncertain jobs nor grant
print permission. Device/firmware/protocol support still requires separate
named-target acceptance. SNMP is not implemented by this feature.
Protocol references: Honeywell IPL Command Reference, Status Enquiry, and ITE
Programmer's Reference, Printer Status Query Responses:
https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/printers/common/documents/sps-ppr-ipl-en-cr.pdf
https://automation.honeywell.com/content/dam/honeywell-edam/sps/ppr/en-us/public/products/discontinued/software/sps-ppr-937-015.pdf

## Label Print gallery workspace (2026-10-16)

The workspace has three columns: a numbered batch table on the left, a gallery
and message area in the middle, and an inspector above configuration on the right.
The batch table supports single-column paste, Enter navigation, row addition/
removal, duplicate detection and a 100-batch limit. Gallery S/M/L controls only
change thumbnail size. Clicking a thumbnail activates its inspector independently
of the checkbox that selects it for print.

The inspector's Preview, Data, Status and Details tabs follow the active label.
Preview reuses the exact returned PNG. Data shows output metadata; original
business field values are not included by the preview API and are not fabricated.
Status shows the returned processing steps and submission outcome when available;
Details retains version, revision, dimensions, DPI and hashes. Printer and Data
Source configuration use separate tabs below the inspector. Copies, totals and
submission are in the Printer tab. Tab changes preserve local configuration and
never trigger SAP, printer queries or submission. Narrow viewports stack panels.

The desktop workspace follows the Label Print sketch refined in Stitch: square
panels, bordered gallery cards, equal-width tabs, and a roughly 43% right column
split equally between inspector and settings. Existing application theme tokens
remain authoritative. Batch rows and gallery cards scroll within their panes;
batch actions and the gallery message strip remain accessible at the bottom.
Printer settings scroll independently above the copies/Print area. This is a
presentation change only; existing controls, translated copy, preview pixels,
validation and operational gates are preserved.

Loading is indeterminate while the existing preview/print endpoints are pending.
Placeholder cards and waiting states do not claim completed server stages or
live per-batch progress. Final results display after the server responds. Input,
selection and target/copy changes are disabled during processing/submission.
Demo print loading remains local simulation. No transport retry is added.

## Label Print operational history (2026-10-16)

Existing opt-in Activity Log now covers POST /api/v1/label-print/preview,
/label-print/print and /label-print/printer-status. It reuses the provisioned
app_management.activity_log JSONB table with no migration or startup DDL.
Records include server-generated trace ID, UTC request time, HTTP status,
duration, origin label_print, preview/print/status mode and allowlisted errors.
Preview logs retain source kind, item count, indexed stages and outcome counts;
HTTP 200 can still contain FAILED/PARTIAL preview results. Print logs retain
registered target ID, copies, indexed submission outcomes and confirmed=false.
Status logs retain fixed device state/reason codes; CHECKED means the query
completed, including UNREACHABLE/UNAVAILABLE, not physical device readiness.
Never record batch identifiers, SAP fields, raw request/response bodies, tokens,
artifact IDs, SVG, PNG or IPL. Log-write failure never changes delivery or retries.
Global HTTP error sanitization preserves preview_busy/print_busy and other
explicit Label Print admission codes with static messages and correlation ID.
Activity Log lists Label Print as source and offers preview/status mode filters.
Recording remains completion-time and best-effort: a running/hung request is
not yet a persisted row; this is not a live job monitor or durable request queue.
Past unrecorded requests cannot be reconstructed from these new records.


### Default label fields in Data Tokens

Data Tokens uses the 47 exact string keys from `items[].data` in
`docs/examples/label_data.sample.json`, with default labels from its
`field_descriptions`. These appear in the SAP label fields group and are also
available in inspector/composer choices. Startup uses that file's synthetic
sample values and shows a demo notice. Loading a dataset replaces startup data
without filling missing keys. Extra dataset/template/custom fields remain usable.
`ZZLABEL` is independent of the item's routing `label_code`; envelope metadata
is not exposed as field data. No Discovery proposal aliases, numeric conversions
or mandatory-field rules are inferred. See TEMPLATE_BINDING_CONTRACT.md for
catalog parity and current output fallback behavior.


## Studio shortcuts (2026-10-17)

Help -> Keyboard shortcuts, the help button and `?` open the same catalog.
`?` or Escape closes help; focus is trapped and restored to its opener.
Windows/Linux use Ctrl; macOS uses Cmd. Tool keys are V/T/B/Q/L for
Select/Text/Barcode/QR/Line. Grid and DataMatrix shortcuts are not advertised.
Tools and selection edits require Design mode. Inputs, editable content, Fabric
text editing, IME composition, modal dialogs and open menus suppress editor
shortcuts. Additional modifiers are not accepted unless explicitly registered.
Held keys repeat only movement and zoom; Save and Duplicate execute once per press.

Ctrl/Cmd+D duplicates selection using the existing action (+10 mm in each axis).
Ctrl/Cmd+0 fits and centers; Ctrl/Cmd+1 restores 100% and centers through the same
triggers as viewport controls. Arrows move selection by 1 mm, Shift+arrows by 5 mm,
Alt+arrows by 0.2 mm, independently of zoom and respecting movement locks.
A held-arrow sequence commits one history step when released, on blur, or before
another command/pointer action. Undo/Redo, Delete/Backspace, Select All and Save
use the existing Studio actions. Escape cancels ordinary tools or deselects;
Line first cancels an active segment/chain, then a subsequent Escape exits Line.
Space temporarily pans and is released on window blur. No shortcut sends output
to a printer. Save opens its dialog and requires its explicit save action.


## Object Copy/Paste (2026-10-17)

In Design mode, Ctrl/Cmd+C copies the selected object(s), and Ctrl/Cmd+V
pastes a fresh copy. Edit -> Copy/Paste uses the same actions. The clipboard
is an immutable serialized snapshot held in this Studio tab's memory; it
survives source edits/deletion and template changes in the same mounted editor,
but is cleared on page reload and is not shared with another tab or external
application. It does not read or write the operating-system clipboard. Text inputs and Fabric text editing keep
their normal copy/paste behavior. Cut is not implemented.

Each successful paste offsets the snapshot by another 10 mm in both axes,
preserves artwork, nested groups and exact binding metadata, and generates
fresh IDs recursively. One paste creates one history step and schedules draft
recovery through the existing object-modified event. Paste is unavailable until
an object has been copied, and editor shortcuts remain suppressed in dialogs,
menus and Preview. Held Copy/Paste keys do not repeat. An in-progress paste is
ignored after an editor unmount or a changed target scene.


## 2026-10-17 - Select a printer for an external transaction

An administrator registers logical printers and grants a source a default and
optional additional destinations under Integrations. In SAP Simulator, the
operator selects the source, fetches a batch, applies a plant/station mapping
(or selects a permitted printer), chooses Print/copies and creates an immutable
transaction before sending. Mapping context remains sender-side; the envelope
contains `target_id`, never a supplied printer network address. Existing requests
without this selection continue using the source default. Simulation cannot
include a print target. Retry retains both payload and request ID.


## 2026-10-18 - Sender-owned workstation routing

SAP/ABAP and SAP Simulator resolve workstation/station mapping before fetching
label facts and submitting intake. Both simulation and print explicitly carry
`target_id`. Application Management owns target addresses and one permitted-target
list per source. Intake validates mode, target registration/enabled state and
source permission without default fallback. Simulation reports its validated
target while remaining free of printer transport effects. See API_CONTRACT.md.

## SAP queued requests (2026-10-22)

SAP submits canonical data to API v2 and receives an acceptance ID after durable
storage; it polls the returned status URL every five seconds. Two workers prepare
labels with the existing stored-template engine and serve different printers
concurrently. Each physical printer is served in admission order. Uncertain sends
are held for inspection, never retried automatically. The SAP Requests activity
shows recent results and allows an operator to record a physical check; only an
Admin can release a hold with an audited note. Neither action sends a label.
See [queue contract and production gates](PRODUCTION_QUEUE.md).
