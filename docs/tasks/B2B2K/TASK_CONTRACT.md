# Task Contract — B2B2K: Extensible Raw SAP Snapshot and N001 Rule Boundary

## 1. Identity and status

- **Status:** `PLANNED — requires executor implementation and independent review`.
- **Risk level:** `3` — public SAP-to-application contract, input validation,
  idempotency, durable evidence, and label-rule ownership.
- **Branch:** `codex/b2b2k-n001-pilot-safe-demo`.
- **Baseline:** `origin/main` at `b0d711c`.
- **Planner/reviewer:** Codex.
- **Recommended executor:** Gemini Flash 3.8 via Antigravity.
- **Active writer:** Codex only while planning. The executor becomes the sole
  writer only after this contract is accepted and Codex has stopped writing.

This task supersedes the *raw-data shape* of B2B2J only. B2B2J remains the
historical analysis of legacy SAP behaviour. It must not be rewritten to make
old selective examples appear to be the target integration contract.

## 2. Business decision already made

The target boundary is:

```text
SAP
  -> sends a complete available raw business snapshot for each label item
  -> includes all batch characteristics and available non-characteristic facts
  -> may send known fields with null or empty values when SAP has no value
  -> does not decide label layout, display formatting, barcode, QR, or PDF

Thermal Label Studio
  -> preserves the received raw snapshot for audit/replay
  -> selects the application-owned N001 profile and template version
  -> decides which raw facts are required, displayed, hidden, or derived
  -> generates only Safe Demo PDF evidence in this task
```

`N001` is the new SAP business label code and the planned application label
profile identifier. It is not a conversion or alias for a legacy label code.
The batch/object previously inspected in SAP DEV is reference-only discovery
evidence; its values and identifiers must not be copied to fixtures, logs, or
checked-in documentation.

## 3. Goal

Implement a safe, offline **Raw SAP Snapshot v2** ingestion boundary that can
receive a complete, extensible snapshot and adapt only the fields selected by
an application-owned **N001 development rule profile** into the existing
canonical Safe Demo pipeline.

The outcome proves that unknown future characteristics and optional business
facts do not force an SAP transport merely because a template later wants to
use them. It does **not** approve an N001 production layout or physical print.

## 4. Required raw input model

### 4.1 Envelope invariants

- A batch has a stable `producer_namespace` and `request_id`; retries use the
  exact same raw snapshot and identity.
- Each item has a positive, unique `item_sequence`, `label_code`, and
  `copies = 1` for Safe Demo.
- `label_code = "N001"` is required for the N001 route. Any other label code
  must be rejected or reported as unsupported; it must never silently use N001.
- The raw snapshot is immutable after acceptance and must be retained with the
  resulting simulation record/manifest, subject to existing retention policy.
- Inputs remain untrusted: schema size limits, bounded string lengths, allowed
  scalar types, duplicate-name detection, and safe error responses are required.

### 4.2 Complete characteristics collection

Each item contains an extensible `characteristics` list. The application must
preserve every accepted entry even when N001 does not use it today.

```json
{
  "name": "ZZEXAMPLE",
  "value": "example-or-number",
  "value_type": "string-or-number",
  "unit": null,
  "source": "batch_classification"
}
```

Rules:

- `name` is an SAP characteristic name, not a Python/template expression.
- A characteristic may be textual or numeric and may have a null unit.
- Duplicate names are rejected unless the contract explicitly supports a
  multi-value representation; this first implementation rejects duplicates
  rather than choosing an arbitrary value.
- An unknown but valid characteristic is preserved and must not fail N001
  merely because no current rule reads it.
- Empty values are represented as `null` or an empty string according to their
  source type and are valid raw facts, not automatic validation errors.

### 4.3 Available non-characteristic facts

Each item also contains an extensible `business_context` object for facts that
do not originate from batch classification. At minimum the model must permit:

- material and batch identifiers/descriptions;
- sales-order and sales-order-item references;
- customer text or other permitted customer/order text;
- production-date source result/provenance; and
- future namespaced source facts.

Every business-context key is optional. Its absence, `null`, and empty string
are distinct states:

| State | Meaning |
|---|---|
| key absent | This sender/version does not provide the fact. |
| key with `null` | SAP provides the field but has no value for this item. |
| key with `""` | SAP provides an intentionally empty text value. |

The application must not infer a value for any of these states. Template/rule
configuration decides whether an absent or empty fact is acceptable, rendered
as a default, warned about, or blocks N001 processing.

### 4.4 Data minimisation and provenance

“Complete” means all available and business-authorized label facts, **not a
dump of arbitrary SAP tables**. The adapter must reject executable payloads,
unbounded nested objects, secrets, destination/host/port fields, and raw SAP
technical dumps. Source provenance is audit-only and must never appear in a
label page or ordinary operator view.

Customer/order text is raw input. The N001 profile decides whether it is used;
it is not automatically rendered. Retention/access to PDF and raw snapshots
must continue to obey the existing service-token boundary until SSO/RBAC exists.

## 5. N001 application rule boundary

The N001 profile is application-owned and versioned. It must declare:

1. profile and rule version;
2. required versus optional raw fact names;
3. field-presence behaviour (`absent`, `null`, `empty`, or value);
4. deterministic derived values and formatting rules;
5. approved template version and media dimensions; and
6. barcode/QR payload definitions, only after their business content is known.

This task may introduce a **development-only N001 profile** for adapter tests.
It must not claim that its layout, visual text, barcode payload, or media is
the approved production N001 label. If no approved template exists, the
production-route activation must fail closed instead of fabricating a label.

The application may calculate `expiry_date` only from explicitly received
source facts and a versioned rule. The unit/business meaning of a shelf-life
characteristic remains an N001 business approval item; no hidden conversion or
assumed 30-day multiplier is allowed.

## 6. In scope

1. Add Raw SAP Snapshot v2 Pydantic/domain models and strict boundary
   validation that permit extensible characteristics and `business_context`.
2. Add a server-side Raw Snapshot v2-to-canonical adapter for N001 and preserve
   the full redacted raw snapshot in durable simulation evidence/record data.
3. Add a protected, feature-flagged Safe Demo endpoint for raw SAP snapshots.
   Reuse the existing simulation authorization and virtual PDF sink; do not
   loosen canonical B2B2I endpoint validation.
4. Add a development-only N001 rule/profile registry entry plus unit and API
   tests. It must use synthetic/redacted fixtures only.
5. Document the v2 contract, raw/derived boundary, unknown-field policy,
   absence/null/empty semantics, and N001 activation gate.
6. Update `RESULT.md`, `REVIEW.md`, and `AI_HANDOFF.md` with actual evidence.

## 7. Out of scope

- SAP configuration, ZMAP_LABEL changes, ABAP source changes, transports,
  SM59, SECSTORE, STRUST, technical users, credentials, or live HTTP calls.
- SAP DEV/SANDBOX program execution or any SAP write operation. SAP MCP may be
  used only for read-only context discovery on `DEV` or `SANDBOX`.
- Real customer/batch/order values, object identifiers, production PDFs, or
  internal endpoint information in Git fixtures, logs, errors, or documents.
- Physical printer delivery, TCP 9100, Windows Spooler, Docker, production or
  staging database access, and migration changes.
- Any claim that N001 is PPIC-approved, visually equivalent to legacy output,
  or production ready.
- A user-facing manual JSON editor, browser credential form, or browser access
  to raw SAP/PDF data without the existing service authentication boundary.

## 8. Acceptance criteria

1. **Complete extensible intake:** a redacted fixture can include all available
   characteristics plus non-characteristic context. Unknown valid
   characteristics survive ingestion and are visible in protected stored
   snapshot/manifest data; they do not break N001 by themselves.
2. **No silent loss or substitution:** duplicate characteristic names,
   malformed scalar types, forbidden/unbounded structures, and unsafe metadata
   are rejected deterministically. The adapter never guesses missing values.
3. **Null/empty semantics:** tests prove the different treatment of absent,
   `null`, and empty-text business facts. Optional empty customer/SO facts do
   not invalidate a batch solely for being empty.
4. **N001 route isolation:** only explicit `label_code = N001` uses the N001
   adapter/profile. An unknown code fails closed, and existing canonical
   B2B2I batches keep their current behavior.
5. **Rule ownership:** any canonical values produced by N001 are traced to a
   named, versioned application rule and selected raw fields. No display-ready
   field, barcode/QR string, or template mapping is silently treated as SAP raw
   data.
6. **Safe Demo only:** successful synthetic N001 development inputs reuse the
   real render-to-PDF evidence pipeline, remain ordered by `item_sequence`,
   preserve `copies = 1`, and retain the simulation watermark. No printer
   route, socket, spooler, or DAX/BAT path is reachable.
7. **Security and replay:** feature flag and service token remain fail-closed;
   raw submission has stable idempotency semantics and no raw payload/token is
   written to logs or error details.
8. **Evidence honesty:** test/documentation separates local simulation proof
   from SAP runtime, N001 PPIC sign-off, physical output, and production
   integration, all of which remain `NOT RUN`.

## 9. Required verification

1. Targeted raw-model/adapter/API tests, including all acceptance-criterion
   failure cases and idempotent replay.
2. Existing B2B2I simulation tests and the relevant backend suite.
3. Frontend tests/build only if frontend code changes; otherwise record them
   as `NOT RUN`.
4. Static scan of new/changed task and runtime files for secret literals,
   internal endpoint values, SAP execution, RFC/OData, socket/TCP 9100,
   spooler, subprocess, DAX, and BAT use.
5. `git diff --check`, plus direct whitespace scan of every untracked/new file.
6. Review exact diff and verify that generated PDFs, reports, `.env`, tokens,
   screenshots, and real SAP examples are excluded.

## 10. Execution steps and stop rules

1. **Gemini Flash 3.8** reads this contract, B2B2I runtime/test code, B2B2J
   historical docs, and `AGENTS.md`; it then becomes the sole writer.
2. Implement the smallest vertical slice: raw v2 model -> N001 adapter ->
   protected Safe Demo endpoint -> durable evidence -> tests.
3. If an approved N001 SVG/template or barcode definition is missing, implement
   the raw boundary and development-only test path, document the production
   activation gate, and stop. Do not invent business layout content.
4. Update `RESULT.md` with commands actually run, then stop before git add,
   commit, push, PR, or merge.
5. Codex performs an independent Level 3 review using `REVIEW.md`; corrections
   use the same branch and contract.

Stop and request a user decision before using any real SAP data, adding a
production N001 layout/rule, enabling a real SAP destination, accessing a
printer, touching a production/staging database, or changing data retention
and authorization policy.
