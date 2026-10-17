# T10 source and runtime boundaries

2026-10-10. This matrix records evidence, not operational authorization. T10 functional source/fake scope is implemented; overall acceptance is NEEDS_REPLAN for mandatory T07 hard deadline/native memory enforcement. T11 has not been started.

| Boundary | Current evidence | State / next gate |
| --- | --- | --- |
| Authenticated source, allowed mode/code | Actual HTTP synthetic bearer and T09 registry tests; before storage/ledger/replay | PASS source |
| Exact immutable version/checksum/grant/target | Existing pin_layout, T09 grants; same active code read once, no request-directed destination | PASS fake source |
| Admission ownership before prepare | T08 committed target/revision/media pins; duplicate collision/competing fake workers | PASS transactional fake; real PostgreSQL T11 |
| Entire batch ready before send | Approval/resource resolution, all shared preparations, actual-size retention and public outcome reservation | PASS cooperative/application limits |
| Hard storage deadline and native memory | Reuses same synchronous T07 boundary; no hard cancellation/OS memory fence | NEEDS_REPLAN, mandatory before accepted enablement |
| Identical Studio/stored output | Six native Windows resvg/Arial static/text/Code128 cases, copies1/999, actual Studio preview pixels and exact recorded IPL | PASS chosen native profile; browser/package profiles separate |
| Claim before transport | Factory/recorder asserts committed SEND_CLAIMED and all later PREPARED; claim ACK faults cause no construct | PASS fake |
| One payload/attempt, native quantity | Existing submit_prepared_output and TcpRawTransport; exact bytes/one call, no loops/retry/spooler | PASS recorder/fake socket; device NOT RUN |
| Proven no-submit vs uncertainty | Existing TCP socket/connect/setup before sendall emits trusted PrintBeforeSendError; writes/close remain uncertain; later items skipped | PASS fake; actual failure behavior NOT RUN |
| Claim/settlement/terminal ACK loss | Before/after-commit faults, no later effect; correlated response_unavailable; retained identity/recovery | PASS transactional fake; live crash/restart T11 |
| Lost HTTP response | Terminal outcome committed first; synthetic serialization loss returns 503 and same-identity replay without another send | PASS fake |
| Policy changes during batch | Current credential, permissions, grant, exact revision/address/port rechecked before each claim; no reroute | PASS synthetic; coordinated workers T11 |
| Simulation/manual Studio boundaries | Intake simulation no transport; Studio action target/no-probe and conservative uncertainty unchanged | PASS regression; T06 current browser BLOCKED |
| Operational setup | No policy/key provisioning, schema application, migration, DB/object store access or container/service lifecycle | NOT RUN; named authorization required |
| Packaged runtime/TLS/audit restart | No build/start/deploy or protected retained policy-history operation | NOT RUN; T11 |
| Quality scan | No current Sonar scan | NOT RUN, distinct from source gate |
| External sender/device acceptance | No real sender credentials or physical delivery | NOT RUN; optional named-authorized T12 |

## Implemented lifecycle

Canonical admission and source authorization -> ledger lookup -> unique stored resolution and all policy/media/resource checks -> committed RECEIVED pins -> shared sequential preparation -> committed PREPARED hash/size for every item -> bounded public outcome reservation -> current policy/credential/target check -> acknowledged SEND_CLAIMED -> construct existing transport -> one submit -> committed SUBMITTED/UNCERTAIN/proven-no-submit FAILED -> terminal commit -> response.

Any batch preflight/preparation failure yields offender FAILED and all others SKIPPED/preflight_aborted, with zero transport construction. Failed resolution/routing has null target; a resolved target ID is public, never its network address. All print data/SVG/PNG/IPL remain transient except hashes/pins and bounded public outcomes.

PrintBeforeSendError is proof from a trusted transport implementation, not a client claim. Existing TCP class raises it only for socket creation/connect/timeout setup before sendall. A write/close failure is possible submission regardless of reported local exception. Constructor injection must remain pure, like TcpRawTransport.__init__; no IO belongs in factories. Manual Studio still treats the superclass conservatively and does not gain a retry path.

After attempting a claim, an ambiguous claim/settlement/terminal persistence error returns 503 response_unavailable. This means possible submission, not retry permission; later items are not sent. Durable identity survives, ordinary repeats cannot resume. A terminal commit whose ACK was lost may already have a complete retained result, which can be replayed; otherwise request_in_progress persists until an explicitly quiesced recovery. Recovery never sends and conservatively marks possible-send work UNCERTAIN. There is no recovery/retry endpoint and no automatic new request ID.

## Next work and stop boundary

Resolve T07 hard cancellation/native memory enforcement before treating T10 as accepted print enablement. Preserve common binder/engine/pins and committed ownership during that change. Complete T06 current-browser acceptance separately. T11, when selected, must distinguish source, native/browser, actual PostgreSQL dialect/locks/permissions, protected policy/key history/restart, Linux package/font and shared-network TLS evidence. Every operational setup/migration/device action needs named authorization; this document does not grant it. T12 physical acceptance remains optional and NOT RUN.
