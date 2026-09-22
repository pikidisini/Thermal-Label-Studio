# Task Contract — B2B2J: Raw SAP Contract and Label Rule Migration

## Identitas dan status

- Status: `REPLANNED — supersedes the earlier narrow HTTP-adapter scope`
- Risk level: `3` — public SAP-to-application contract, business-rule migration,
  rendering correctness, idempotency, and future print lifecycle.
- Branch: `codex/b2b2j-abap-http-contract`.
- Baseline: `origin/main` at `a5fc287` after B2B2I merge.
- Planner/reviewer: `Codex`.
- Intended executor: `Gemini Flash 3.8 via Antigravity`.
- Active writer: `NONE` until the executor starts this replanned task.

This keeps the task identifier **B2B2J**. It does not create a new phase.
The prior B2B2J reference adapter is a superseded design attempt and must not be
committed, deployed, or treated as an approved SAP integration.

---

## Business context established from SAP QA analysis

`docs/tasks/B2B2J/Analisa_Pencetakan_Label.md` is the primary source for the
current process. The production-business orchestrator is `ZMMR_LABELROL`, not
only the older JSON/file helper.

`ZMMR_LABELROL` currently:

1. selects batches and checks plant authorization;
2. reads batch characteristics, sales-order data, alias data, and Core RTP data;
3. resolves `ZZLABEL` and mappings in `ZMAP_LABEL` / `ZMAP_LABEL_TYB`;
4. chooses Windows Smartforms or DOS/TAX-DAX-BAT legacy routing;
5. applies label-family rules such as Toyobo, Interfilm, TTE, TTA, PrimaPack,
   Sampoerna, PMI, Inchi, A211, and standard old/new labels;
6. currently renders/prints through legacy output mechanisms.

The target architecture deliberately changes the responsibility boundary:

```text
SAP
  -> sends a versioned, redacted-safe snapshot of business facts
  -> includes the business label code (for example ZZLABEL)

Thermal Label Studio
  -> resolves a versioned label profile and rules
  -> calculates display values, barcode/QR payloads, conversions, and formatting
  -> resolves an approved template
  -> renders Safe Demo PDF evidence
  -> later, after a separately approved phase, dispatches physical print jobs
```

SAP remains the source of truth for SAP business facts. Thermal Label Studio is
the planned future source of truth for label rules and rendering. Neither side
may silently invent a source value or a business rule.

---

## Goal

Replace the earlier generic-field adapter design with a reviewable migration
plan and contract for **raw SAP facts to application-owned label rules**.

The first outcome is not a real SAP call or a physical-print replacement. It is
a safe, offline, versioned foundation that can reproduce one selected label
family from redacted SAP facts into a Safe Demo PDF and compare it with an
approved legacy result.

---

## In scope

1. Create an explicit inventory of current SAP sources and business rules from
   `ZMMR_LABELROL` analysis:
   - batch/material facts and characteristics;
   - sales-order, customer, and text inputs;
   - `ZZLABEL`, mapping/customizing dependencies, and label family;
   - Core RTP, alias, special-touch, image, and date dependencies;
   - derived/display fields that will migrate to Thermal Label Studio.
2. Define a versioned **Raw SAP Label Input** contract. It must distinguish:
   - immutable source snapshot from SAP;
   - SAP identifiers and source provenance;
   - `label_code` / `ZZLABEL` as a business selector;
   - application-derived render values;
   - template version, rule-profile version, and resulting evidence metadata.
3. Define an application-side Label Rule Profile model and a migration matrix.
   Every field/rule must be classified as `SOURCE_FACT`, `SAP_DERIVED_LEGACY`,
   `APPLICATION_DERIVED_TARGET`, `CUSTOMIZING_DEPENDENCY`, `UNSUPPORTED`, or
   `OPEN_QUESTION`.
4. Select exactly one low-risk pilot label family only after the selection
   criteria are documented. Do not silently choose a customer-specific family.
5. Define a golden-comparison protocol between a redacted legacy output and the
   Safe Demo PDF: visible fields, item order, barcode/QR payload text, dimensions,
   rules/template versions, and human PPIC approval evidence.
6. Produce a redacted multi-item raw-SAP fixture for the selected pilot. It must
   contain facts, not invented final display values masquerading as SAP data.
7. Replace the previous ABAP HTTP reference with a **non-executable interface
   design** only: stable request identity, protected destination configuration,
   no secret literal, no user-selectable destination, and no implementation of
   SECSTORE/SM59/HTTP in this task.
8. Update `RESULT.md` and `REVIEW.md` honestly so earlier claims about a ready
   generic adapter are marked superseded, while retaining useful historical
   evidence as history.

---

## Out of scope

- SAP DEV/QAS/PRD changes, transports, SE38 execution, ABAP syntax check,
  ABAP Unit, SM59, STRUST, SECSTORE, certificates, technical users, or credentials.
- Any live HTTP request, intranet endpoint, internal hostname/IP, SAP RFC/OData
  call, TCP 9100, Windows Spooler, printer access, DAX/BAT execution, or batch
  file creation.
- Reimplementing every existing label family in one change.
- Declaring a Safe Demo PDF equal to a production label without golden comparison
  and PPIC/business approval.
- Changing B2B2I runtime APIs, database persistence, production dispatcher,
  physical printing, or frontend permissions without an approved follow-up task.
- Adding real SAP table names, credential storage, or a persistence design that
  has not been authorized by the user/Basis.

---

## Design rules

### 1. Raw facts are not every SAP table

The SAP payload must contain only the minimum normalized facts required by the
selected rule profile, plus immutable source identifiers and provenance. It must
not dump unrestricted SAP tables, raw customer text beyond the chosen scope, or
personal/secret data.

### 2. Application rules are versioned and testable

For a single item:

```text
Raw SAP Input Snapshot + Label Profile Version + Rule Version + Template Version
  -> Resolved Label Intent
  -> Safe Demo PDF / manifest
```

Every conversion, format, barcode/QR composition, treatment rule, and image
choice that moves from SAP must be represented by a named versioned rule and a
golden test. A free-form unversioned Python rule is not acceptable.

### 3. Preserve business sequence and idempotency

- One business execution is one batch, with a stable `request_id` supplied by a
  future durable SAP-side mechanism.
- A retry must send the same request ID and exact source snapshot.
- Every different physical label is a distinct `item_sequence`; `copies = 1` in
  Safe Demo remains mandatory.
- Request ID creation/persistence implementation is an `OPEN_QUESTION`; the
  design must fail closed rather than fabricate a timestamp-based ID.

### 4. Do not use user-controlled infrastructure

Future ABAP integration must use a protected, Basis-managed named destination.
It must not expose destination, URL, host, port, credential, or token as a
selection parameter or payload field. This task only documents the seam.

### 5. Migration is incremental

The legacy SAP process remains operational during shadow comparison. A label
family moves only after its golden cases pass and PPIC approves the result.
`delivery_unknown` and physical-print semantics remain out of scope.

---

## Required deliverables

- `docs/tasks/B2B2J/SAP_RAW_LABEL_CONTRACT.md`
- `docs/tasks/B2B2J/LABEL_RULE_MIGRATION_MATRIX.md`
- `docs/tasks/B2B2J/GOLDEN_COMPARISON_PROTOCOL.md`
- `docs/tasks/B2B2J/fixtures/raw_sap_label_batch_redacted.json`
- revised `docs/tasks/B2B2J/ABAP_HTTP_INTEGRATION_DESIGN.md`
- revised non-executable `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON_HTTP_REFERENCE.abap`
- revised `docs/tasks/B2B2J/RESULT.md` and `docs/tasks/B2B2J/REVIEW.md`

Keep these source references unchanged:

- `docs/tasks/B2B2J/Analisa_Pencetakan_Label.md`
- `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON.abap`

---

## Acceptance criteria

1. **Correct process boundary:** documentation identifies `ZMMR_LABELROL` as
   the current orchestrator and describes Windows/DOS plus the major rule
   dependencies without claiming they have already migrated.
2. **Raw/derived separation:** every pilot field is classified; no SAP-derived
   display result is mislabeled as a raw SAP source fact.
3. **No invented mapping:** every mapping points to the QA analysis/legacy source
   or is explicitly `OPEN_QUESTION`/`ASSUMPTION`.
4. **Versioned rule plan:** the selected pilot profile identifies rule version,
   template version, required raw fields, expected derived fields, and tests.
5. **Safe pilot fixture:** a redacted multi-item fixture is structurally valid,
   ordered, `copies = 1`, contains no secret/internal endpoint/production values,
   and is not presented as an actual SAP transmission.
6. **Golden comparison plan:** defines evidence, expected checks, comparison
   limits, and a PPIC approval gate before a label family can progress.
7. **Secure SAP seam:** the ABAP reference is clearly non-executable; it has no
   token literal, no timestamp-generated request ID, no selectable destination,
   no live transport implementation, and no raw payload/response logging.
8. **Evidence honesty:** `RESULT.md`/`REVIEW.md` mark static work `PASS`, SAP
   execution `NOT RUN`, and any unresolved rule/source decision explicitly.
9. **Boundary proof:** static scans and local structural validation show no real
   SAP connection, printer route, TCP 9100, spooler, credential, or internal
   infrastructure data in the new task artifacts.

---

## Required verification

1. JSON parse and structural checks for the raw redacted fixture.
2. Local contract validation only where the fixture intentionally targets an
   existing B2B2I model; otherwise mark the runtime contract gap `NOT RUN` and
   do not bend B2B2I merely to make a planning fixture pass.
3. Static scans for secret literals, endpoint/infrastructure values, GUI/DAX/BAT
   execution, RFC/OData, socket/TCP 9100, spooler, and executable HTTP calls.
4. Direct whitespace scan including untracked files, plus `git diff --check`.
5. Review all task artifacts against this contract. Do not claim ABAP syntax,
   SAP integration, printer behavior, or production equivalence as verified.

---

## Handoff to executor

Use **Gemini Flash 3.8** as the sole writer after this contract is reviewed.

1. Read this contract, `Analisa_Pencetakan_Label.md`, legacy source, current
   B2B2I safe-demo contract, and the earlier B2B2J artifacts.
2. Work only within `docs/tasks/B2B2J/`; do not alter runtime application code
   unless a blocker is proven and reported rather than expanded silently.
3. Treat legacy DAX/BAT paths and all SAP-specific values in the analysis as
   historical information, not values to copy into active integration code.
4. Do not run SAP, network calls, printers, Docker, or database services.
5. Update `RESULT.md` and `REVIEW.md`, provide exact local evidence, and stop
   before `git add`, commit, push, PR, or merge.

## Escalation rules

Stop and request a user decision before:

- selecting the first production-representative label family;
- using actual SAP data, SAP access, SM59/STRUST/SECSTORE, credentials, or an
  intranet endpoint;
- deciding to retire a legacy SAP label route;
- changing business copy semantics, template/media mapping, or physical print.
