# Decisions and constraints

Created: 2026-10-10. These are implementation decisions, not claims about current behavior.
T01 distinguishes user-approved requirements from selected technical defaults below. T01 writer artifacts are ready for independent review; none is implementation evidence.

## Approved requirements

| ID | Requirement |
| --- | --- |
| D01 | Latest Studio JSON is the data-contract basis; do not make external senders use the fixture facts envelope. |
| D02 | Require request-level mode: simulation or print. |
| D03 | Strict per-item copies range 1–999. |
| D04 | Return clear per-item processing results; accepted alone is insufficient for synchronous completed processing. |
| D05 | Universal naming: label_intake instead of SAP-specific intake. sender.system identifies the source. |
| D06 | Data Tokens does not receive external requests and import never triggers printing. |
| D07 | Studio draft output and stored-template intake converge on server binding and the existing engine. |
| D08 | Preserve exact data keys, values, ordering, descriptions-as-metadata and missing/null/empty/zero/false distinctions. |
| D09 | Equal template/data/parameters must have demonstrable parity, not an architecture-only promise. |
| D10 | Reuse raster, IPL codec and PreparedOutput; only final simulation/print sinks differ. |
| D11 | No automatic retry after uncertain print submission. SUBMITTED does not confirm physical print. |
| D12 | Split execution into bounded, reviewable tasks. Current request creates task files only. |
| D13 | T11 is the main software acceptance gate using bitmap/IPL decode parity, independent codec fixtures and recorded transport evidence. T12 physical acceptance is optional and does not block software acceptance; operational/device claims still require their own evidence. |

## Observed baseline to recheck in T01

- labels/process is fixture acceptance using one label_code and facts; no stored-template intake.
- Studio binds in the browser and sends composed SVG to editor-preview/printing/editor.
- Dataset/parser copies limit remains 1000, mode is not enforced; example JSON already contains mode.
- Backend fixture binding is a small text-only SVG subset.
- Layout saves directly mark published; no business approval gate is established.
- jobs/ and sap/ are standalone foundations, not universal intake orchestration.
- Editor print target is an explicit per-action numeric address; external intake target routing is not designed yet.
- Existing tests/working changes must be inspected and preserved.

## Proposed starting decisions for T01

These are recommendations to concretize and record, not hidden user approvals:
- Synchronous first slice, ordered per-item results, bounded request/response resources.
- New universal endpoint POST /api/v1/label-intake, leaving fixture acceptance clearly separate; evaluate replacing the old endpoint instead if current consumers justify it. Choose one contract/path and test OpenAPI.
- Keep current editor-preview and printing/editor routes, revise their draft+data contract to bind on the server.
- For valid simulation batches, continue after item-specific failures and return all results. Structural rejection occurs before item processing.
- Preflight all template/data/policy gates before any external print; stop further sends on uncertain submission and mark later items explicitly not submitted/skipped.
- Pin immutable template version/checksum at admission and keep that choice on retries.
- Bound resource usage for 100 possible items. A per-item pixel cap is insufficient; choose and test aggregate memory/render/response budgets.
- Durable deduplication keyed by authorized sender identity and external request_id; compare a canonical request digest, retain pinned versions and terminal outcomes.
- Runtime external print stays deny-by-default until admission/template/target policies are explicitly configured.
- Studio local draft printing remains an explicit user action; do not silently apply external approval policy to the existing manual workflow.
- Use a server-owned target mapping. Do not let untrusted JSON choose arbitrary network addresses.
- Keep published and external-print approval separate, including version/checksum in approval records.
- Use a narrowly scoped admission policy rather than adding a full Studio login system.

## Choice ownership (resolved by T01 defaults below; implementation evidence still required)

| Choice | Resolve in | Required evidence |
| --- | --- | --- |
| Universal endpoint and fixture retirement policy | T01 | Consumer inventory, exact API path and no duplicate route semantics |
| Editor draft/data schema and template media ownership | T01 | Request examples, output gate contract, static SVG policy |
| Older saved samples missing mode | T01 | Explicit local exploration/migration policy; no silent print default and no operational rewrite |
| Supported Studio SVG/binding features | T01/T03 | Feature inventory, declared rejects, metadata version policy |
| Barcode/QR generation dependency and rendering choices | T01/T05 | Compatibility/dependency assessment and parity fixture plan |
| Error/status vocabulary and HTTP mappings | T01 | Schema for SIMULATED, SUBMITTED, FAILED, UNCERTAIN and skipped items |
| Request/response/batch budgets | T01 | Explicit finite limits and failure behavior |
| Ledger retention, sensitive data storage and crash recovery | T01/T08 | Minimal durable schema and safe replay/reconciliation rules |
| Admission mechanism / trusted sender identity | T01/T09 | Authorized-source policy; payload sender.system is not an authentication credential |
| Template approval and target-routing format | T01/T09 | Server-owned version-specific policy, denial behavior |
| Runtime and optional device targets | T11/T12 | Named target + explicit operation authorization; T12 runs only when requested |

For reversible internal implementation choices, proceed with documented judgment within task scope.
Ask only when a business requirement or required external authorization is missing. Keep useful independent work moving.
If a decision changes an accepted requirement, record NEEDS_REPLAN rather than implementing it silently.

## Candidate request and response

```json
{
  "sender": {"system": "EXTERNAL_DEMO"},
  "request_id": "REQ-001",
  "mode": "simulation",
  "field_descriptions": {"ZZWIDTH": "Width"},
  "items": [
    {"item_id": "I1", "label_code": "ROLL_DEMO", "copies": 2,
     "data": {"ZZWIDTH": 695, "ZZCHARG": "BATCH-001"}}
  ]
}
```

Response semantics to freeze in T01:
- Echo the external request_id separately from a server-generated trace_id.
- Report batch summary and ordered item results.
- Each result includes item_id, label_code, chosen version/checksum, copies, outcome and bounded error stage/code where applicable.
- Simulation contains a bounded usable PNG/result reference.
- Print contains SUBMITTED with confirmed=false, or FAILED/UNCERTAIN as appropriate.
- Lost responses/crashes must not permit implicit resubmission.
- Unprocessed items must never be reported as successful.

## T01 selected technical defaults

The following choices are writer selections under the approved scope, accepted by the [independent T01 review](results/T01_REVIEW.md) for design scope. The exact normative limits/schemas are in [CONTRACT](CONTRACT.md), current boundaries in [BASELINE](BASELINE.md), required evidence in [PARITY_MATRIX](PARITY_MATRIX.md). D12's historical task-package-only request is superseded for this execution only by the user's explicit T01 execution request; T02 and later work remains unstarted.

| ID | Selected default and rationale | Implementation/evidence dependency |
| --- | --- | --- |
| C01 | POST /api/v1/label-intake is sole canonical intake. Keep labels/process accepted-only and simulation/fixture synthetic; source has no Studio consumer requiring replacement | T02/T07 OpenAPI and route consumers |
| C02 | Editor routes accept explicit draft+data; immutable stored media/version/checksum authoritative for intake; root media validates against draft/stored metadata | T03/T06 no composed-only fallback |
| C03 | Required mode and integer copies 1..999, unknown-member/duplicate-key rejection, finite binary64 numeric profile with ECMAScript/JCS spelling; exact authored strings | T02/P05 cross-language golden cases |
| C04 | Missing-mode historical sample is read-only exploration with warning, no operational rewrite; new output requires explicit canonical working copy; legacy local parsers remain separate | T02 mock dataset checks |
| C05 | Binding metadata v1, strict feature allowlist, complete symbol options; reject unreconstructable legacy options, rich text metrics and unhandled features | T03/T04/T05; NEEDS_REPLAN before T06 if current features cannot be supported |
| C06 | Use Python python-barcode==0.16.1 and qrcode==8.2 as initial server symbol dependencies, explicit module geometry rendered into SVG; reuse existing Pillow/resvg, no Node runtime service | T05 manifest/install/source/runtime compatibility and JS parity before cutover |
| C07 | Ordered synchronous results, HTTP 200 item outcomes, strict bounded pre-admission mappings, SIMULATED/SUBMITTED/FAILED/UNCERTAIN/SKIPPED | T07/T10 schema/error checks |
| C08 | Finite body/template/XML/image/per-item and aggregate pixel/copies/preparation/payload/PNG/response/memory caps; sequential one worker/process, 429 busy; prepare all print items before sends | T07/T10 boundary/load checks, deployment concurrency coordination T11 |
| C09 | Durable sender+request identity, canonical HMAC digest/pinned immutable versions, claim before socket, crashes/response loss remain uncertain; no retry/resume | T08/T10 fake crash races and separately authorized restart gate |
| C10 | Transient raw input only; 24h simulation response/90d print metadata; permanent quota-bounded HMAC tombstones deny expired reuse, fail admission at capacity | T08 protected results/retention design and authorized migrations |
| C11 | Per-sender bearer secret mapping, constant-time verification, sender.system assertion cross-check, explicit allowed modes/codes, TLS for shared deployments | T09; local Studio trust boundary does not establish network deployment security |
| C12 | Version/checksum-specific print approval and server-owned numeric target-ID mapping, deny by default; active published != approved; recheck policy before each claim | T09/T10, no JSON network target |
| C13 | T11 software acceptance uses semantic/canvas/entry/sink/independent codec/recorded transport evidence; storage/recovery/packaged runtime distinct; T12 optional | T11/PARITY_MATRIX, no mock-to-runtime promotion |

Dependency compatibility assessment: [python-barcode supported formats](https://python-barcode.readthedocs.io/en/stable/supported-formats.html) documents Code128/Code39/EAN13; Code39 defaults to checksum enabled, so canonical adapter must explicitly disable it. [python-barcode package metadata](https://pypi.org/project/python-barcode/0.16.1/) records pure-Python SVG generation and Python >=3.9. [qrcode 8.2 package documentation](https://pypi.org/project/qrcode/8.2/) documents ECC/version/SVG/Pillow capabilities and Python >=3.9. These capabilities support the chosen approach, not compatibility proof with this repository's Python/Pillow version or JS output. No dependencies installed or manifests changed in T01. T05 must pin/hashes/test actual resolved dependencies and current interpreter/image.

Current JS QR generator uses automatic segmentation/mask selection, while target v1 proposes byte segmentation and explicit reproducible options. Code128 optimizer and QR mask choice can diverge across libraries. T05 must prove module/grid and canvas raster parity with same options, or record NEEDS_REPLAN and revise the generation profile with review before T06. Routing Studio canvas generation through the same authoritative server profile is permitted only as a reviewed scoped implementation, preserving WYSIWYG. Do not silently normalize, pad, fall back or accept equivalent decoded payload alone as pixel PASS. Nondefault current generator options must be represented/proven or rejected explicitly.

No consequential business requirement is awaiting clarification in T01. Later implementation gates are explicit: exact metadata allowlist fixtures T03, dependency/canvas parity T05, durable storage/recovery T08/T11, source/approval policy T09, authorized runtime target T11. Their PENDING/NOT RUN state does not invalidate documentation freeze; inability to meet a frozen requirement triggers NEEDS_REPLAN rather than silent scope reduction.
