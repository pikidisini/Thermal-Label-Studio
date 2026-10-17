# Request identity contract for SAP and Thermal Label Studio

Date: 2026-10-15.

Status: documentation contract for new SAP/backend request generators. The
generator profile below is specified for the planned integration; this document
does not implement generator enforcement, sender persistence, or SAP activation.
Existing intake admission and replay behavior remain authoritative in
[API_CONTRACT.md](API_CONTRACT.md) (canonical data, T08 identity, T10 print).

## Scope and ownership

`request_id` identifies one logical label-processing request, potentially holding
multiple ordered items. It is distinct from a batch number and from each
`item_id`. One batch can participate in several deliberate processing requests.

| Flow | Request ID owner |
| --- | --- |
| Backend reads SAP through RFC and creates a processing request | Backend creates the processing ID |
| SAP program reads data and initiates delivery to label intake | SAP sending program creates the processing ID |
| Backend receives or forwards an already identified SAP processing request | Preserve SAP's exact ID and asserted sender; authenticate and authorize that sender independently |
| RFC function only reads and returns business data | No processing ID generation is required |

A read-only RFC call may have a separate correlation ID. Do not reuse a read
correlation ID as the identity of every later simulation or print. Any optional
RFC correlation parameter is an interface design decision, not an implemented
requirement introduced here. RFC data retrieval and HTTP intake delivery are
separate operations; a remote-enabled SAP function does not itself deliver HTTP.

## Existing receiver rules

The canonical intake receiver currently requires a string of 1..128 ASCII
characters matching:

```regex
^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$
```

Validate the entire string, including rejecting trailing newlines. No trimming
or case conversion is performed. See `IDENTITY` in
`backend/app/label_data/validation.py` for executable admission semantics.
The receiver accepts other IDs such as `REQ-001`; this document does not remove
that support or change existing clients.

## Generator profile for new SAP/backend integration

New generators following this contract MUST emit:

```text
<ORIGIN>-<UUID32>
```

| Component | Rule |
| --- | --- |
| `ORIGIN` | `SAP` for a SAP sending program; `TLS` for this application's backend |
| Separator | One ASCII hyphen |
| `UUID32` | 32 uppercase hexadecimal characters from a standard UUID generator |
| Total length | Exactly 36 ASCII characters |

The full-string profile pattern is `(?:SAP|TLS)-[0-9A-F]{32}`. A portable JSON
Schema for the ID string is provided in
[request_id.generator-profile.schema.json](examples/request_id.generator-profile.schema.json).
It is a generator-profile schema, not a complete intake envelope schema.

Examples:

```text
SAP-550E8400E29B41D4A716446655440000
TLS-B368C7CC30734DD4800A93A119ECFC25
```

Do not construct IDs from batch number alone, timestamp alone, or a short custom
random number. Randomness is not a receiver requirement; uniqueness and stable
reuse for the same request are required. UUID is the selected generator strategy.
The text format does not require SAP and Python to use the same UUID algorithm
or version. UUID collisions are extremely unlikely, not mathematically impossible;
durable receiver identity uniqueness must still be enforced.

The prefix is descriptive and is not proof of origin, a credential, or a routing
instruction. The identity namespace is the authenticated sender plus exact
`request_id`. A prefix does not establish the configured `sender.system` value.

## Generation examples

Python backend:

```python
from uuid import uuid4

# Execute once when creating a new logical processing request.
request_id = f"TLS-{uuid4().hex.upper()}"
# Retain this ID with the request before delivery; do not regenerate on timeout.
```

ABAP illustration for systems providing the indicated class, types and exception:

```abap
DATA: lv_uuid       TYPE sysuuid_c32,
      lv_request_id TYPE string.

TRY.
    lv_uuid = cl_system_uuid=>create_uuid_c32_static( ).
    TRANSLATE lv_uuid TO UPPER CASE.
    CONCATENATE 'SAP-' lv_uuid INTO lv_request_id.
  CATCH cx_uuid_error.
    "Abort request creation and return an explicit failure to the caller.
    RETURN.
ENDTRY.
```

The ABAP fragment is illustrative and is not a complete FM or a sender.
Verify SAP_BASIS availability, the actual caller's error contract, syntax and
activation in the authorized SAP target. UUID failure must not fall back to an
empty, timestamp-only or reused constant ID.

References: [Python UUID documentation](https://docs.python.org/3.12/library/uuid.html)
and [SAP UUID usage example](https://developers.sap.com/tutorials/abap-environment-sbpa-workflow-handler-class).

## Lifecycle and durable retention

1. Create the ID once for a new deliberate processing action.
2. Retain the ID, sender identity, exact request snapshot and delivery state in
   protected durable sender storage before delivery. Do not put raw business
   data or credentials in ordinary logs. Schema/provisioning and retention design
   require separate implementation and authorization.
3. Preserve the ID and request snapshot across transport failure and restart.
   Do not fetch changed SAP values and silently attach them to the old ID.
4. Record the outcome against the same ID. An ID alone does not provide durable
   duplicate prevention without the receiver ledger and sender state.

| Situation | Required handling |
| --- | --- |
| New simulation | New ID |
| Print after simulation | New ID; `mode` changes the request |
| Deliberate new request with changed data, copies, descriptions or item order | New ID; preserve the prior request |
| Lost response or timeout | Preserve original ID/snapshot; no automatic resend or replacement ID |
| Human-authorized replay of the same request | Same sender, ID and accepted values; use the existing intake replay behavior |
| Uncertain print outcome | Inspect/reconcile before any deliberate new print; a new ID is not a recovery shortcut |
| Deliberate reprint after inspection where necessary | New ID, with the previous request linked in protected operational history |

The canonical envelope rejects unknown fields. Do not add `previous_request_id`,
`origin`, `trace_id` or provenance objects to it; keep such relationships in the
appropriate separately designed operational record.

## Intake replay and tracing

| Existing identity and request | Receiver behavior |
| --- | --- |
| Same authenticated sender, ID and accepted values; retained terminal result available | Replay original results without another print send |
| Same identity with changed accepted values | HTTP 409 `request_conflict` |
| Same identity still active | HTTP 409 `request_in_progress` |
| Expired identity | HTTP 409 `request_expired`; no automatic recomputation |
| Missing/unavailable durable ledger | Processing denied; no in-memory fallback |

Replay still requires current source authorization. ID reuse does not bypass
revocation. An expired or uncertain request is not permission to print again.
`SUBMITTED` does not confirm physical output.

`trace_id` identifies the current HTTP handling attempt. Intake returns a new
`trace_id` on replay while preserving the external `request_id` and
`original_trace_id`. Do not apply this durable identity guarantee to the editor
routes: their request IDs are correlation IDs and their contracts are separate.
No new automatic retry, polling or recovery endpoint is specified here.

## Complete request examples and verification boundary

- [SAP-origin simulation](examples/request_id.sap-simulation.json)
- [Backend-origin simulation](examples/request_id.tls-simulation.json)

Both examples contain synthetic business data and fixed illustrative IDs. New
real requests must generate fresh IDs. The different sender names are examples
only: actual sender identity must match configured authentication. `A013` does
not assert that a compatible template is installed. No credential, printer
destination or output bytes are included.

The files illustrate the existing versionless canonical intake envelope, with
flat scalar `data`; they are not RFC import/export definitions. They do not
prove live policy, storage, SAP execution, end-to-end RFC integration or physical
printing. Reading or validating them does not submit any request.
