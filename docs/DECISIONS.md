# Decisions

## 2026-10-16 - AI SVG authoring through the application API

Expose an optional local STDIO design MCP sidecar. Reuse application admission,
shared preview and versioned layout HTTP services rather than direct storage
writes. Default discovery omits saving; an explicitly enabled save preflights
through preview and publishes one active version without automatic retries.
Canvas session synchronization and durable draft lifecycle remain outside this
slice. See [Design MCP](../tools/mcp/DESIGN.md).

## 2026-10-13 - Separate operational activity history

Record intake and Studio output request metadata in explicitly provisioned
`app_management.activity_log`, independently of administrative `management_audit`.
The existing durable intake ledger remains authoritative for identity, replay and
print claims. Safe stages and final item outcomes exclude raw business/output data
and credentials. A best-effort history write never changes or retries submitted
output; storage/process failures may leave gaps. A read-only Activity Log page
shows the latest 200 requests and separate unconfirmed/uncertain print semantics.
Schema activation and live database/device acceptance require their named scope.

These decisions describe the current source. Dated phase inventories/results and
archived documents retain history; they are not current launch instructions.

1. One application, one root Dockerfile, one Compose file and one Python manifest.
   The frontend retains its package manifest and lockfile.
2. Studio is a local editor with no login/session/CSRF implementation. Retired auth,
   operator simulation, print/export and old API adapters are archived. Future
   shared deployment requires new server authentication/authorization controls.
3. Both Studio preview entry points call the current editor-preview API. One PNG
   populates both Preview panels; display effects do not prove printer behavior.
4. PostgreSQL owns layout metadata, active versions and version history. MinIO owns
   immutable SVG. Versions/checksums/object keys are server-owned. A save publishes
   a new version; it is not an approval workflow or an idempotent request.
5. Database/object-store writes are not atomic together. Preserve artifacts after
   uncertain commit/upload results and allocate a fresh immutable key on retry
   under the per-label transaction lock, with bounded conflict probes. Gaps and
   unreferenced artifacts are allowed; automatic deletion after errors is unsafe.
6. Layout processing validates caller facts and server layout resolution. Current
   acceptance/fixture processing does not automatically consume saved Studio
   layouts. Actual SAP intake, approved layouts, jobs are future integration
   work. Studio Print separately chooses a per-action TCP target.
7. Target flow: SAP/API -> validate label_code -> resolve layout -> bind SVG ->
   raster bitmap -> shared encoded payload -> simulation sink OR print transport.
   Both final sinks must consume the same processed output. Preview alone does
   not establish payload orchestration or physical printer delivery.
8. External inputs fail closed; secrets/raw business data stay out of logs/reports.
   Interfaces exist for consumed behavior only. Do not restore archived service
   structures or add speculative compatibility layers.
9. Storage drivers load only for configured persistence. Fixture source tests
   require no storage services. Operational data and existing volume identities
   are preserved; schema/bucket initialization is an authorized startup write.
10. /health is liveness and /ready checks packaged dependency presence. Neither
    certifies current storage connectivity, device compatibility or production.
11. The installed local Jenkins/SonarQube workflow checks a curated source snapshot
    and performs no checkout/deployment. Source gate, quality gate, live runtime
    acceptance and production approval remain separate.
12. Generated test reports, traces and screenshots use unique children of .tmp.
    Test source stays under backend/tests and frontend/tests. Temporary output is
    never source, configuration, operational data or a new-repository artifact.
13. Future repository transition from Thermal-Label-Studio-legacy to
    Thermal-Label-Studio follows a reviewed checkpoint. No remote/repository
    operation is implied by local repairs. Preserve separate parent/web_app Git
    boundaries until a transition is explicitly authorized.
14. Test local failure paths with fakes; seek named-target authorization before
    storage/SAP/printer/container operations. Migrations, backup/restore,
    reconciliation, access controls and production operations require their own
    implementation and evidence. No current source PASS upgrades those claims.

15. The checkpoint covers the local Studio/editor, SVG import/export, local JSON,
    versioned save/open, Preview, PNG Label Simulation and fixture simulation.
    Graphics now supports immutable embedded-copy assets (see GRAPHICS_CONTRACT.md).
    Graphics versioning/bulk replacement, shared access/auth, SAP, jobs, printers
    and production stay future work; planned UI controls must not invoke unavailable backend routes.
16. The direct Python runtime binds loopback by default. Docker explicitly sets
    its internal bridge listener; Compose host publishing stays localhost-only.
    Remaining quality/dependency findings are recorded in SONARQUBE.md and are
    not waived by source tests or by a planned fresh repository.


The successful PM45 G/u/U sample supersedes Direct Graphics for the retained IPL
encoder. Simulation now decodes its exact payload, including tiled graphics at
most799dots per side, rather than returning the source raster PNG. Graphics 64..99
and format 90 are a bounded reserved namespace requiring deployment allocation.
Direction0 is the supported logical canvas subset; full physical placement and
tiled printing remain unverified. Printer feedback and full-media physical acceptance remain deferred.


Shared output preparation chooses language at the simulation/print action, with
IPL as the only implemented choice. Layout owns physical dimensions and DPI.
Prepared output is immutable and both sinks consume the exact encoded payload;
print submission does not reencode or rasterize and adds no printer profile
compatibility gate. Studio TCP RAW transport is implemented; real target setup
and physical acceptance remain separately authorized actions.


Studio Print permits one explicit submission to a validated per-action
numeric IPv4/IPv6 target. The dialog owns editable IP/port and remembers the last
valid target in browser-local storage; the environment target is optional fallback
for clients omitting an action target. Browser choices never mutate server-global
configuration. Default loading cannot gate manual entry or overwrite later edits.
Copies is an action parameter (default 1, strict integer 1..999). The shared pipeline
encodes native IPL `<RS>N` with `<US>1`; it does not loop the raster, encoder or
transport. Simulation renders one logical canvas for quantity N. Success unlocks
a deliberate subsequent Print; deterministic pre-send errors also unlock. Uncertain
failures retain the inspection/reopen lock. TCP connect/write remain bounded;
exact bytes are sent once and socket closes on
every path. No retry or printer feedback is added. Invalid target fails before
rasterization/transport construction. Known pre-send preparation failure and
unknown/uncertain delivery remain distinct; HTTP 500 alone cannot prove no send.
Opening/editing target does not contact a printer. Source/fake validation does
not establish physical acceptance.


## T02 admission refinements

Canonical mode/copies are strict semantic JSON values: 1.0/1e0 copies equal1, typed models normalize copies to int. Backend/frontend object budgets use common conservative reservation instead of float JSON spelling; raw limit remains2MiB. Historical missing-mode copies1000 is retained read-only and requires explicit correction. No compatibility intake aliases or automatic output were added.

## T03 local template metadata

Implemented local metadata and immutable semantic admission are described in [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md). New Fabric7 exports preserve exact binding specs, explicit symbol options and marked nested groups. T04/T05 implement replacement text/symbol preparation and T06 integrates the editor output routes; runtime/storage remain separate gates. Legacy incomplete dynamic metadata fails closed without a stored migration. Dynamic rich text/wrapped Textbox require NEEDS_REPLAN if required before output integration.


## T04 local text preparation

The pure `app.template_binding.bind_text_template` owner now resolves validated canonical scalar fields/compositions into an immutable final SVG/media result. New Studio metadata preserves text origins and character spacing. Missing/null/empty values and unsupported font/shaping/symbol profiles fail closed. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) for semantics, budgets and the 84 actual Fabric geometry fixtures. T05 completes symbols; T06 integrates this owner into the existing editor output routes. SVG geometry checks do not prove raster/IPL/device or packaged-font parity.


## T05 complete local binding

The pure `app.template_binding.bind_template` owner now regenerates text, Code128, Code39, EAN13 and QR from exact canonical values. Independent actual Studio module/pixel fixtures and Fabric placement fixtures validate the declared profiles; explicit options, effective QR version/mask and asset/media hashes remain available in immutable results. Studio symbol refresh preserves painted bounds and uses declared options; invalid input cannot fall back to a sample or another type. See [TEMPLATE_BINDING_CONTRACT](TEMPLATE_BINDING_CONTRACT.md) and [generator notices](SYMBOL_GENERATOR_NOTICES.md) for exact dependencies, limits and unsupported profiles. Editor output APIs now accept explicit draft/data requests and use this binder before the shared raster/IPL engine (T06). This slice creates no intake endpoint or operational side effects.


## T06 shared Studio output

Both editor output routes now require `draft:{svg,width_mm,height_mm,dpi,binding_version:1}`, `data`, `encoder:"IPL"` and `copies:1..999`; optional `field_descriptions` is presentation metadata only. Print retains optional numeric `target:{host,port}`; simulation rejects it. The old top-level composed-SVG request is rejected. Unsaved drafts need no storage operation. A static template with no dynamic metadata accepts empty data; incomplete dynamic metadata never falls back to static/sample processing.

`engine/editor_request.py` admits streamed JSON up to2MiB, rejects duplicate members/invalid UTF8/media type, and validates bounded canonical scalar data. `prepare_draft_output` checks exact root mm dimensions and `viewBox="0 0 width*4 height*4"`, calls `template_binding.bind_template`, then the existing `prepare_editor_output`/resvg/IPL preparation. Preview decodes that exact prepared payload; print submits it once. Both responses add original `template_sha256` and `binding_version:1`. Stable binding errors are422 and prevent raster/transport; print failures with uncertain effects retain the client lock.

Studio captures immutable draft/data/media at action time. Local dynamic samples, preview overrides and stale local symbol errors are not output data authority. Unsupported metadata/crop/filter/font profiles still fail closed; local sample refresh remains responsive. Superseded requests are aborted and late results ignored; stale PNGs are cleared. JSON import with mode=print does not choose a sink or submit. The two Preview panels reuse one decoded PNG.

The renderer loads the same trusted regular/bold/italic/bold-italic font siblings used by binding. The authored dynamic font family must match the server profile; Windows Arial evidence does not establish packaged Liberation Sans/Arial equivalence. Design Canvas and SVG coordinate rounding are separate from exact shared-output raster/IPL parity. See [T06 result](implementation/universal-label-pipeline/results/T06_RESULT.md) for actual gates and limits; no sender/device/storage/package readiness is implied.

## T07 local intake implementation and resource replan

The user's explicit 2026-10-10 instruction authorized T07 local work against verified T06 source/native parity while retaining T06 browser BLOCKED. Universal intake uses exact stored artifacts and the existing draft preparation/simulation sink; it never uses the fixture catalog or Data Tokens storage. External authorization defaults to denial until T09, and print stays denied until later gates.

Result metadata reservation is 128 KiB rather than the frozen minimum 64 KiB, providing room for 100 maximal identifiers, pins and bounded errors without changing request semantics. The canonical and public contracts otherwise retain frozen field names, copies 1..999 and failure policy. T07 is NEEDS_REPLAN: no hard wall deadline or renderer OS memory limit is claimed from cooperative checks/application reservation. Resolve that execution-boundary requirement before marking T07 DONE or starting dependent implementation.

## T08 durable ledger implementation

The user's explicit T08 instruction permits local source work while T07 stays NEEDS_REPLAN and T06 browser BLOCKED. Use an independent PostgreSQL ledger, not old jobs: the latter lacks external digest identity, native claim uncertainty and permanent expiry tombstones. Use fresh injected transactions, a serialized permanent quota row, immutable key-version verifiers and domain-separated HMACs. Protected simulation JSON/PNG is retained 24 hours; print metadata 90 days; keyed tombstones persist permanently. No schema/lifecycle operation was applied.

T08 exposes internal print state boundaries only; T09/T10 still own authorization/revalidation and one-attempt transport. Replay must follow current source admission and must not rerender or use new active template versions. Missing keys/ledger/results deny rather than allowing fresh effects. The shared T07 pipeline gains only pin/preparation persistence hooks.

## T09 source policy implementation

Explicit T09 execution authorizes the local source/fake slice while retaining T07 NEEDS_REPLAN and T06 browser BLOCKED. C11/C12 use a strict immutable process-environment policy with secret environment references, fixed-size constant-time digest verification, enabled source/mode/code permissions and version-specific approve/revoke events. Simulation does not require a print grant or target. Every print grant pins one server target and copies ceiling; any changed revision/target/credential or revoked permission denies the next claim. Published layouts and manual Studio draft output do not mutate or consult external approvals.

Policy edits must retain audit prefix and use a different revision during environment reload. Administrative retained configuration, unique revision ownership, protected audit history across restart and coordinated workers are T11 operations, not a durable audit implementation. Technical bounds are 1 MiB config, 1000 sources/targets/codes-per-source, 10000 events and 32..256 base64url credential characters; actual entropy/provisioning is operational. T10 must integrate preflight for all items and revalidation before committed ledger claims. Intake print remains denied in T09.

## T10 implementation and resource acceptance

Explicit T10 execution authorizes source/fake orchestration only despite outstanding T07/T06 gates. Use the existing stored pin validator, prepare_draft_output, PreparedOutput, native IPL quantity and submit_prepared_output/TcpRawTransport. Commit all pins before preparation, finish preparation and reserve bounded response before sends, revalidate original policy before each claim, and commit claim before factory/socket. Capture detailed bounded errors in the ledger without business data.

A trusted existing transport now distinguishes exceptions before entering sendall as PrintBeforeSendError; write/close errors remain ambiguous. Only that proof or a pure constructor/input failure may settle a committed claim as FAILED. Manual Studio remains conservative through the unchanged PrintSubmissionError superclass. Ambiguous claim/settlement/terminal commit or response failure returns response_unavailable after any claim attempt and stops subsequent sends; persisted identity blocks resumption.

T10 source/fake functional behavior is complete, but overall task acceptance is NEEDS_REPLAN because the frozen hard storage deadline/native memory enforcement remains unsatisfied. This is not waived or silently delegated as an optional T11 operation. No operational policy/ledger/printer provisioning occurred; T11 is not started.


## T11 acceptance decision (2026-10-10)

Complete unaffected local source/native/browser mock acceptance despite explicit T11 execution while T07/T10 resource gates remain NEEDS_REPLAN. Do not reinterpret regression PASS, absent named operational authorization or optional physical acceptance as satisfaction of mandatory cancellation/native memory requirements. Record standard runtime ledger/configuration and retained policy-history gaps separately. Preserve prior task evidence and require tested resource correction plus authorized runtime proofs before claiming complete readiness. See [T11 review](implementation/universal-label-pipeline/results/T11_REVIEW.md).

## 2026-10-13 - Template management and source routing without approval

User explicitly removed the approval/review requirement. Intake print now checks
source identity/mode/template permissions and the configured print_target_id plus
print_max_copies. No approval event is required for the current stored version.
Historical approval/review records remain retained as history. Missing destinations
in older documents deny printing until explicitly configured. Immutable artifact
pins, durable claim/replay identity, pre-send revision checks and uncertainty rules
remain in force. Studio Explorer rename/delete use the same audited management
transaction as Application Management; direct layouts mutation routes are retired.
Input validation keeps forms editable; conflicts and ambiguous failures require
explicit refresh. Integration forms expose all-template simulation separately from
print permissions and use a searchable template picker with valid empty selection.
This supersedes historical T09/T10 approval requirements in dated task/result records.

## 2026-10-13 - All-template access and optional change reasons

User explicitly removed per-source template restrictions for both simulation and
print. All enabled authenticated sources may use every valid stored template for
their allowed modes. Legacy label_codes/simulation_all_label_codes are retained for
reading existing snapshots but no longer gate admission, print preflight or replay.
Unknown template codes and invalid artifacts/data still fail closed. Credentials,
mode permissions, explicit printer routing, copies limits and durable pins remain.
The UI removes Simulation templates, Allowed templates and Change reason. Management
commands accept omission of note and record an empty note while preserving atomic
before/after audit and policy revision checks. This supersedes the template-scope
and required-reason decisions above without changing historical audit records.

## 2026-10-16 - Display fallbacks for unavailable bound facts

User approved text output ` - ` for present null/empty-string values and `N/A`
for absent exact keys. Barcode/QR with any unavailable source token uses a plain
outlined box with centered ` N/A ` in the authored image area. No fallback text
or partial composition is encoded. This applies at the shared binder, including
Studio, Label Print and stored intake; raw facts and request identities remain
unchanged. Zero/false/whitespace remain content. Invalid nonempty values and
invalid/unsupported metadata still reject. See TEMPLATE_BINDING_CONTRACT.md.


## 2026-10-17 - Logical printer selection belongs to each print transaction

Support optional canonical `target_id` for print only, authorized against source
default plus explicitly granted additional IDs. Keep network addresses in the
server registry. SAP-side plant/station mapping should return this logical ID;
it need not duplicate IP/port tables or map each connected PC. The simulator's
local mapping represents this future sender responsibility. Freeze selection
with the request ID, preserve old absent-field digests, and reject routing or
permission changes before send. Local HTTP/TCP captures establish transport
routing only; SAP and physical printer acceptance remain separate gates.
