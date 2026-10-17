# Task review: T06

- Result: [T06_RESULT](T06_RESULT.md); task: ../tasks/T06_STUDIO_SHARED_OUTPUT.md.
- Reviewer/date: primary Codex agent,2026-10-10, actual source/test/diff self-review. No independent second-agent review was requested or performed.
- Overall outcome: BLOCKED on current-app mock browser acceptance. Source implementation and verified source/native gates: PASS.
- Diff/HEAD: main/bb639065a3161e9421336913be8327009b4c2ab9; initial412-file inventory and final preservation under `.tmp/t06-78349734a7`.

## Primary-agent assessment

The task, frozen contract, prerequisite reviews and actual changed files were read. Reviewed the route models/raw ASGI admission, full shared binder integration, original template provenance, media equality, immutable snapshots, exporter output policy, both UI paths and all error/transport semantics. Reviewed actual diff hunks in already-dirty Studio/exporter/docs; pre-existing binder/generator/metadata work is preserved.

| Acceptance criterion | Evidence inspected/reproduced | Outcome |
| --- | --- | --- |
| One binder and existing engine | Both handlers call prepare_draft_output -> bind_template -> existing raster/IPL; same-input source/native tests | PASS |
| Samples/preview override not authority | Frozen exact data separate from original SVG; stale local-error serialization; missing data server rejects; mounted snapshots | PASS |
| Unsaved drafts/no storage | Snapshot reads current canvas/store only; TestClient endpoints and source dependencies introduce no storage | PASS |
| Server-required data/version/media/safety | Raw byte/media/duplicate admission and canonical scalar fields; missing/null/empty/type/media/version failure before raster/send | PASS |
| Composition/multiline/symbol/group/rotation/scalars parity |56 native complete comparisons and existing T03/T04/T05 golden regressions | PASS for shared entry/output profile |
| Exact raster/IPL/sink bytes | Prepared pixels match decoded IPL; recorded payload equals prepared bytes once; existing independent IPL vectors | PASS |
| Deliberate print and uncertain lock | Mounted React double clicks/uncertain response; fake HTTP/TCP/copies regressions; JSON import remains editor-only | PASS |
| Both current-app preview paths/manual UX | Updated browser assertions; final app8002 connection refused | BLOCKED |
| Diff/source/typecheck/build | Full source report d30e030a-eb05-4d6d-bbea-176968fb86de;16 focused frontend tests; diff/preservation | PASS |
| Canvas/Design exact pixel identity |27 independent expected SVG observations:16 exact;11 differing at1..137 pixels | No blanket PASS; distinct from equal-input shared parity |

## Findings resolved

- Old client-composed samples are no longer accepted by the editor output endpoints; no compatibility route/path remains.
- Draft/data capture occurs at action time before preview debounce, not after late sample generation.
- A stale symbol error cannot prevent a valid new data snapshot reaching authoritative binding; it cannot bypass metadata/geometric/server admission either.
- Binding-specific422 codes are bounded and mapped as proven pre-send failures; unknown/lost/malformed print outcomes retain uncertainty lock.
- Transport construction follows complete binding/raster/encoding; simulation never constructs it.
- Renderer loads trusted style siblings consistent with metrics rather than regular-only style fallback.
- Original template checksum, not a substituted sample's value, is returned on both output routes.
- All revised client and server tests retain one-send/native quantity and cancellation protections.
- Self-closing dynamic image serialization and stale tests for required copies were corrected; exact composition-root middleware dependency is documented/tested without broadening foundation services.

## Remaining gates and next action

Current-app mock browser is BLOCKED: initial existing target produced previous request shape; final rebuilt-source attempt failed at navigation with ERR_CONNECTION_REFUSED. Neither is a current-source functional PASS. Retained traces/results identify both attempts. Mounted React JSDOM tests are useful source evidence but not a substitute.

Absolute Design/Canvas pixel identity is not established;27 same-renderer expected-SVG comparisons explicitly expose1..137 edge-pixel differences in11 cases. No assertion tolerance or new unsupported-profile acceptance was introduced. The equality guarantee concerns identical admitted draft bytes/data/options/profile across output entry points. Mandatory zero Design differences would require further precision/profile replan.

Packaged fonts/Linux rendering, live storage/restart, fresh quality scan, actual external sender and physical printer remain NOT RUN. T12 remains optional. The existing unsupported-feature limits remain documented and fail-closed.

Keep overall T06 BLOCKED and T07 PENDING until current-app mock browser acceptance passes. No successor or operational action is started by this review.
