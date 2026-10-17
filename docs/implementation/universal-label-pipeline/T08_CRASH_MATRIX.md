# T08 crash and acknowledgment matrix

No physical send occurs in these tests. They verify durable eligibility/outcomes and deny automatic resubmission. Transactional SQL fakes are separate from real PostgreSQL/process restart evidence.

| Window | Durable evidence after rollback / lost acknowledgment | Client/next lookup | Explicit quiesced recovery | Automatic send allowed? |
| --- | --- | --- | --- | --- |
| Admission rejected before commit | No identity or pins inserted | 503 ledger_unavailable; lookup has no prior identity | None | No; no owner was returned |
| Admission committed, acknowledgment lost | RECEIVED identity/digest/pins/items | 503; same identity 409 request_in_progress | FAILED/SKIPPED, retained terminal result | No |
| Crash before preparation | RECEIVED, immutable pins | 409 request_in_progress | FAILED/SKIPPED | No |
| PREPARED commit rejected | RECEIVED | 503, no confirmed preparation | FAILED/SKIPPED | No |
| PREPARED acknowledgment lost / worker crashes | PREPARED may be durable, no send claim | 503/409 | FAILED/SKIPPED | No |
| SEND_CLAIMED commit rejected | PREPARED remains | 503; claim call did not return eligibility | FAILED/SKIPPED | No |
| SEND_CLAIMED acknowledgment lost | SEND_CLAIMED may be durable | 503/409; never construct transport after error | UNCERTAIN; later items SKIPPED | No |
| Crash after claim, before socket/send | SEND_CLAIMED; cannot infer whether send occurred | 409 until recovery | UNCERTAIN; later items SKIPPED | No |
| Crash during/after possible send | SEND_CLAIMED | 409 until recovery | UNCERTAIN; later items SKIPPED | No |
| Item-terminal commit rejected | SEND_CLAIMED remains | 503/409 | UNCERTAIN; later items SKIPPED | No |
| Item-terminal acknowledgment lost | SEND_CLAIMED or SUBMITTED may be durable | 503/409 | Unfinished possible-send batch conservatively UNCERTAIN | No |
| Batch terminal commit rejected | Durable item outcomes, unfinished batch | 503/409 | Retain/conservatively recover outcomes; never resend | No |
| Batch terminal committed, response/acknowledgment lost | TERMINAL and complete retained outcome | Identical replay returns original result, replayed=true | Terminal is unchanged | No |
| Simulation result commit rejected | PREPARED or RECEIVED; no terminal result | 503/409 | FAILED/SKIPPED; never rerender automatically | No |
| Simulation response lost after terminal commit | Complete protected result | Original PNG/pins returned; no storage resolve/raster | None | No physical send; no recomputation |
| Retention expired | Permanent keyed tombstone; details may be removed | 409 request_expired | Never reuse identity | No |
| Old key missing or overwritten | Permanent key verifier/tombstone cannot be validated | 503 ledger_unavailable | Restore original key version under authorized procedure | No |
| Quota exhausted | One million permanent identities retained | New identity 503; no eviction | Authorized capacity plan, never delete tombstones for reuse | No |

Source API responsibilities: claim returns eligibility only after an acknowledged commit; T10 must construct transport only after that return, send once and never retry automatically. A claim failure is not permission to call claim/send again. A new request_id requires a deliberate human decision after inspection when delivery is uncertain. T08 neither creates that decision nor exposes a retry endpoint.
