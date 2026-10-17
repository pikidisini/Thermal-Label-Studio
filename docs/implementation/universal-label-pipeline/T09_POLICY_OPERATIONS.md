# Server-owned admission and print routing

Current policy: 2026-10-13. The user removed template review/approval and per-source template restrictions, and made change reasons optional.
Historical T09/T10 task and result records describe the prior approval model; this
contract and MANAGEMENT_CONTRACT.md define the current source behavior. This file
provisions no credential, database, sender or physical printer.

## Configuration and identity

The environment authority reads TLS_INTAKE_POLICY_JSON only from explicitly mapped
process configuration. When management is enabled, the managed PostgreSQL snapshot
is authoritative. Storage failure denies requests rather than falling back to an
older environment snapshot. See MANAGEMENT_CONTRACT.md for provisioning boundaries.

Policy remains a strict immutable JSON object with revision, sources, targets and
audit. Unknown/duplicate members, invalid values and duplicate registry identities
fail closed. Limits are 1000 sources, 1000 codes per source, 1000 targets and 10000
historical audit events; environment policy JSON is capped at 1 MiB. Retain history
and unique, non-reused revisions when changing policy.

Each source declares identity, credential_env, enabled, modes, print_target_id and print_max_copies. Credentials exist
only in the referenced runtime TLS_INTAKE_TOKEN_<NAME> environment variables:
32..256 ASCII base64url characters. Never put secrets in policy JSON, business data,
committed files, screenshots or logs. Credential references and valid configured
secrets must be unique. Disabled source records retain their credential references.

Bearer authentication is independent of sender.system, which must match the
credential identity. Fixed-size SHA-256 digests use hmac.compare_digest; raw tokens
are not retained in admission objects. Duplicate Authorization headers are denied.
This is external sender authentication; local Studio login remains deferred.

Canonical validation remains first. Missing/invalid bearer is 401 unauthenticated;
absent/invalid policy is 503 policy_unavailable; disabled/mismatched source or
identity mismatch is 403 sender_not_allowed; disallowed mode is 403 mode_not_allowed.
Authorization runs before storage/ledger access and replay disclosure. Simulation
and print require the durable ledger and valid stored templates; there is no
in-memory identity fallback. Shared-network deployment requires its own access and
TLS acceptance; local development changes do not establish deployment readiness.

## Template scope and routing

Enabled authenticated sources may use every valid stored template in their allowed
modes. There is no per-source template allowlist for simulation or print. Legacy
label_codes and simulation_all_label_codes remain readable in existing snapshots
but are ignored by authorization and print preflight. Unknown label codes still
fail stored resolution with unknown_label_code; invalid artifacts/data fail before
any send. Simulation and print do not require review or approval.
Each source chooses one existing enabled print_target_id and print_max_copies in
1..999. Missing routing defaults to None and denies print. Existing policies are
not assigned a destination from historical approvals. Management rejects missing
or unknown print routes; an enabled print source requires an enabled destination.

Targets map server IDs to validated numeric IPv4/IPv6 and integer ports. DNS names,
unspecified/multicast addresses, zone IDs and invalid ports are rejected. Business
item.data.host/port/target_id are label values and never routing authority. Canonical
request/item target members remain rejected.

Pure print preflight reports POLICY template_not_allowed, copies_not_allowed or
target_not_allowed. No approval is required for an existing or newly stored version.
Actual immutable version/checksum, destination, copies and policy revision are pinned
before preparation; new versions cannot change an already admitted request's pins.

## Historical records and revocation

Chronological approve/revoke events remain in policy.audit for retained history.
They neither grant nor reject current print requests. Existing review records are
also retained; HTTP review submission/decision routes remain retired.

Every configuration mutation requires a new revision and retained audit prefix.
Management records before/after, object, time and development actor in the same transaction
as policy and template-reference changes. Change reason is optional; omitted note is stored as an empty string. Environment reload validate_transition
rejects changed content without a new revision or removal of prior history. Across
workers/restarts, protected coordinated configuration and unique revisions remain
operational requirements.

Disable a source, remove a mode, rotate a credential or disable
its target to revoke capability. Replay authorization checks current source/mode
permission before disclosing retained results. Completed requests remain durable and
are never resent simply because current policy or template versions changed.

## Safe structural example

Documentation-only identifiers and reserved numeric address; no usable secret is
provided. The source below permits simulation only, and the target is disabled.

```json
{
  "revision": "POLICY-001",
  "sources": [{
    "identity": "EXTERNAL_DEMO",
    "credential_env": "TLS_INTAKE_TOKEN_DEMO",
    "enabled": true,
    "modes": ["simulation"],
    "print_target_id": null,
    "print_max_copies": 1
  }],
  "targets": [{
    "target_id": "PRINTER_DEMO",
    "host": "192.0.2.44",
    "port": 9100,
    "enabled": false
  }],
  "audit": []
}
```

## Preflight and durable sending

1. Authenticate and authorize the whole request before lookup/replay disclosure.
2. Resolve checksum-verified immutable stored templates; caller evidence or draft
   SVG cannot replace intake template resolution.
3. Preflight every item before rendering. Failures make offenders FAILED and others
   SKIPPED/preflight_aborted, with zero preparation or transport construction.
4. Atomically admit immutable pins, then prepare the whole batch and commit all
   prepared digest/size evidence before any send.
5. Immediately before each ledger.claim_send, revalidate source/mode permissions,
   credential continuity, copies limit, destination/address/port and original policy
   revision. Any change denies sending; never silently reroute. Commit the original
   claim before constructing transport.
6. Expose only permitted target IDs/revisions and bounded results; never tokens,
   network addresses or raw business data. A possible send is UNCERTAIN and stops
   later claims. SUBMITTED does not confirm physical printing. No automatic resend
   or recovery endpoint is introduced.

Source/fake tests prove software behavior, not operational migration, hard native
resource cancellation, actual SAP/printer acceptance or deployment readiness.
