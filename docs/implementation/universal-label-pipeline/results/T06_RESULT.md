# Task result: T06

## Identity and scope

- Task: T06_STUDIO_SHARED_OUTPUT; task file ../tasks/T06_STUDIO_SHARED_OUTPUT.md.
- Date:2026-10-10, Asia/Jakarta; executor: primary Codex agent, direct implementation. No delegated writer or independent second agent.
- State: PARTIAL; source implementation complete and source self-review PASS. Overall acceptance BLOCKED on current-app mock browser target.
- Repository/branch/HEAD: Thermal-Label-Studio/main, bb639065a3161e9421336913be8327009b4c2ab9; no commit/push.
- Prerequisites: T02 canonical data, T03 metadata, T04 text, T05 complete symbols results/reviews inspected; existing dirty work preserved. Initial412-file hashes in `.tmp/t06-78349734a7/initial.json`; final task-specific change inventory/preservation in preservation.json.

## Delivered behavior

Studio preview and manual print capture an immutable current unsaved draft, exact selected scalar data, descriptions and media at action time. The request is now `{draft:{svg,width_mm,height_mm,dpi,binding_version:1},data,encoder:"IPL",copies,field_descriptions?}`; print retains optional numeric target. No old composed-SVG request fallback exists. Route chooses the sink; JSON mode=print import never submits or selects transport.

Both routes use `prepare_draft_output`: explicit root media/version checks -> shared T04/T05 bind_template -> existing prepare_editor_output -> resvg -> monochrome raster -> IPL PreparedOutput. Simulation decodes its exact IPL payload; print sends the prepared payload once. Responses add original template_sha256 and binding_version. Required missing/null/empty/invalid data fail before raster/send even when client checks are bypassed. Static admitted SVG with empty data is allowed. Unsaved output uses no storage write.

Local Design samples remain responsive and may lag current data. Output serialization permits stale local symbol-feedback errors while retaining complete metadata/crop/filter/font/resource admission; server binding replaces samples with the explicit action data. Local temporary invalid-data dimming is excluded from output. Unsupported profiles cannot use this to bypass the server. Snapshotting leaves live object serializers/errors/data unchanged. Preview generations abort prior work, clear stale images and discard late responses. Both Preview panels share one decoded PNG. Mounted dialog tests prove stale-response cancellation and explicit single-send/uncertain lock.

Copies remains1..999, native IPL quantity, one preparation/one send. Opening Print fetches optional app configuration only and never probes a printer. Known binding/preparation failures safely unlock; malformed success, unknown/lost response or transport uncertainty stays locked. No retry or durable replay promise is added.

Trusted renderer font arguments now include the same available regular/bold/italic/bold-italic siblings that binder metrics measure; regular-only rendering could lose authored style shapes. This is still the existing renderer, not a new engine. Declared dynamic font family must match the configured server font profile.

## Files changed

New:
- backend/app/engine/editor_request.py: shared typed draft/data/copies/media admission and bounded streamed raw JSON middleware.
- backend/tests/test_editor_shared_binding.py:81 source/native parity/admission cases,56 complete native same-input cases.
- frontend/src/features/canvas/model/editorOutputSnapshot.ts: synchronous immutable editor action snapshot.

Existing T06 source/test files:
- backend/app/engine/pipeline.py and raster.py: shared binder preparation and trusted font siblings.
- backend/app/simulation/editor_http.py, printing/http.py, main.py: atomic endpoint contract, template provenance, bounded binding errors and JSON boundary wiring.
- backend/tests/test_editor_preview_http.py, test_printing_http_transport.py: revise endpoint tests without weakening transport/copies protections.
- backend/tests/test_foundation_api.py: explicitly permit implemented pure editor-admission middleware at the composition root; foundation services remain isolated.
- frontend/src/features/canvas/index.ts and svg/fabricSvgExporter.ts: export snapshot helper and output-only stale-feedback serialization; handle self-closing image markup safely.
- frontend/src/components/studio/Studio.tsx; simulation client/hook/modal; printing client/modal: both output entry paths use snapshots; backend owns binding validation; response/cancellation/uncertainty gates retained.
- frontend/src/shared/i18n/messages.ts: one English/Indonesian preview explanation; authored data/colors untouched.
- frontend/tests/studio_preview.mjs:16 tests including real mounted React dialogs, immutable scalar snapshots, malformed responses and cancellation.
- frontend/tests/browser/ui/studio.spec.js and printing.spec.js: revised mocks and separate draft/data assertions, server missing-data rejection, latest unsaved draft scenario.

Documentation: five active docs and task package README/STATUS/SUMMARY/PARITY_MATRIX/T06 task, plus this result/review. Existing T03/T04/T05 shared-file hunks preserved. No dependency/manifest/schema migrations changed by T06. Existing T05 dependency pins stay intact.

## Validation evidence

| Gate | Status | Command/target | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Full source gate | PASS | python -B scripts/check_project.py --run-source-checks | `.tmp/source-checks-d30e030a-eb05-4d6d-bbea-176968fb86de/report.json` | Backend regression, full TypeScript, build, frontend regression; not deployment/runtime |
| Frontend output source/mounted components | PASS | node --import tsx --test tests/studio_preview.mjs |16 passed; core TypeScript separately PASS | JSDOM/React and fetch mocks, not current-app browser |
| Server draft/data/media/safety admission | PASS | test_editor_shared_binding.py + revised endpoint regressions in full source gate | Missing/null/empty/invalid type/version/media reject before raster/send; duplicate/raw overflow reject before parse | Local in-process TestClient, no storage or actual HTTP sender |
| Binding/raster/IPL same-input parity | PASS |56 native cases:28 representative templates x copies1/999 | Static, composition/multiline/zero/false, representative text geometry/style variants, nested/rotated groups and four symbol types; pure future stored-consumer preparation and both existing HTTP sinks | Native Windows resvg0.44.0/Arial/203DPI; future resolver/intake endpoint not implemented |
| Prepared bitmap vs decoded IPL | PASS | Same56 cases plus existing independent test_ipl_codec.py fixtures in source gate | Exact decoded monochrome pixel bytes and dimensions; exact IPL bytes | Bounded existing IPL subset; not a physical printer emulator |
| Recorded bytes/one submit/native copies | PASS | Fake transport in56 HTTP parity cases + existing transport regressions | One exact payload, RS1/RS999 quantity, unconfirmed response | No real socket/printer |
| Independent Design SVG observation | OBSERVED; no blanket pixel PASS |27 independent Fabric expected SVGs, same native renderer | `.tmp/t06-78349734a7/design-observation.json`:16 exact,11 with1..137 differing pixels | SVG quantization/geometry differences; all causes not conclusively isolated; not Canvas/browser raster identity |
| Current-app mock browser | BLOCKED | Existing127.0.0.1:8002; Playwright ui specs | First attempt returned previous top-level request shape: `.tmp/playwright-813bd49e-6d85-4965-aed5-bff6213d177d`; after fresh build final target refused connection: `.tmp/playwright-1dd86087-fe11-499d-9a61-c68dcee86aa4` | Final1 test blocked,5 not run; no current-source browser PASS claimed |
| Actual task diff/preservation | PASS | git diff --check; initial/final hashes and source review | `.tmp/t06-78349734a7/preservation.json` | Primary-agent self-review, no second agent |
| Live storage, packaged Linux/fonts/restart | NOT RUN | No named operational action | Separate T11 gates | Windows font/renderer proof cannot promote packaged readiness |
| Fresh quality scan/external sender/physical printer | NOT RUN | No operations | Separate authorized gates; T12 optional | No device/integration claim |

Initial check failures were corrected: Node sandbox spawnEPERM required a bounded approved source-test retry; changed required-copies/immediate-action tests were updated; self-closing image output was corrected; huge raw-body pytest IDs were bounded; foundation composition-root allowlist was updated for the new implemented middleware. Final source gate is PASS. Earlier FAIL reports are retained as earlier evidence, not current source status.

## Side effects

Source/docs/test edits, local build artifacts, synthetic test reports and local renderer subprocesses only. Browser calls targeted an existing loopback app with mocked APIs. No service was started/stopped, no container/volume/database/MinIO/SAP/printer was changed or contacted, no automatic print, no commit/push. Computed renderer/font hashes identify installed local inputs; an official renderer checksum verification and packaged build remain NOT RUN.

## Decisions, risks and blockers

- No second engine, adapter fallback or speculative intake orchestration. The direct fixture pipeline remains clearly synthetic and unchanged.
- Current-app browser acceptance is still required by T06. Mounted React source tests do not replace it; overall task remains BLOCKED until the existing standard app serves current code and revised browser gates pass.
- Design display and current expected-SVG rounding can differ from authoritative output. The observation is explicit, not a silently accepted tolerance. Equal draft bytes/data/media/profile produce exact shared output. If absolute Design/Canvas pixel identity is mandatory, precision/profile work needs replan before claiming that requirement.
- Keep T05 fractional native linear metrics/old implicit aspect/crop/filter/stroke and T04 rich/wrapped/background/path/complex font limitations fail-closed. Required unsupported features remain NEEDS_REPLAN.
- Current Windows Arial proof does not establish packaged Liberation Sans behavior. Dynamic authored family must match server profile; packaged font alignment remains T11, not silent normalization of binding metrics.

## Handoff

Six source/React/native acceptance criteria are verified; current-app browser verification of both preview entry points and manual print remains outstanding. Source self-review PASS; overall review BLOCKED on that gate. T07 PENDING and not started.

Next prompt: Continue T06 validation against the existing standard application serving this checkout's current source/build. Run revised Studio/printing mock browser cases with API mocks, verify draft/data/copies, latest unsaved output, both preview entries, cancellation and uncertainty lock. Do not start or alter operational storage/containers/printers. Review evidence, then change T06 to DONE only after the remaining gate passes; do not start T07 automatically.
