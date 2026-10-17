# T12 optional device acceptance plan

Prepared: 2026-10-10. State: PREPARED ONLY; physical and external-system tests NOT RUN.

## Execution gate

The user requested T12. This authorizes local preparation, but no current printer, source system, saved version, storage target or bounded physical action was named. The PM45/address in the historical IPL guide is not current authorization. Root AGENTS.md requires explicit authorization for the named target before printer delivery, SAP access or operational storage/container actions. No discovery, connection probe, sender script, API print request or transport invocation was performed.

T11 also has mandatory resource/runtime findings: hard storage cancellation/native memory, standard intake ledger/configuration setup and retained policy history. Resolve and verify the relevant T11 gates before paired Studio/intake device execution. A device name alone does not complete those prerequisites.

## Reviewable artifacts

- [T12_ACCEPTANCE_PLAN.json](T12_ACCEPTANCE_PLAN.json): exact synthetic data, canonical request examples, template SHA256, media/DPI/copies, expected scan values, reserved IPL IDs and local output evidence for every case. All authorized flags are false; target and saved_version are null.
- Eight SVGs in `fixtures/t12/`: actual Fabric exports for text/symbols plus explicit static axis and tile calibration templates. P09 reuses P03's exact template/data with copies3.
- `.tmp/t12-6717a439eb/local/P01..P09/preview.png` and `payload.ipl`: locally prepared/decoded output only. These IPL files are not authorized for transmission.
- `.tmp/t12-6717a439eb/local-validation.json`: nine preparations passed exact prepared/decoded pixel and native quantity checks, with zero transport calls.
- `.tmp/t12-6717a439eb/native-profile.json`: verified installed Windows renderer and Arial regular/style hashes. No Linux/device equivalence inferred.

## Proposed bounded sequence

Each pair means one explicit Studio action and one fresh intake request using the same saved version, original template bytes, data, media, DPI and native copies. It does not mean an automatic retry. The complete proposed plan permits at most 18 new submissions and 22 labels, plus nine exact intake replays expected to emit zero additional labels. These limits are proposals awaiting explicit authorization; they are not permission to print.

Before a physical pair, capture the actual current Studio output draft, save that exact exported SVG as an approved immutable stored version on the authorized target, and compare its hash/media with the pinned intake template. Import/re-export can change serialization; if it changes the prepared fixture bytes, revise the manifest/hash and regenerate local references before any send. Do not use an old saved template against a changed or reserialized unsaved Studio draft, and do not send the prepared IPL files directly as a substitute for the actual Studio/intake pair.

| Case | Purpose | Media / DPI | Copies per path | Pair label count | Physical expectation |
| --- | --- | --- | --- | --- | --- |
| P01 | Text baseline, exact scalars and composition | 80x60 mm /203 | 1 | 2 | Same authored text/spacing and orientation; readable text |
| P02 | Nested/transformed multiline text | 80x60 mm /203 | 1 | 2 | Same line sequence, group/rotation placement and no clipping |
| P03 | Code128 | 80x60 mm /203 | 1 | 2 | Scan exactly `A1234567890 / 0` |
| P04 | Code39 | 80x60 mm /203 | 1 | 2 | Scan exactly `A1234567890 / 0` |
| P05 | EAN13 | 80x60 mm /203 | 1 | 2 | Scan exactly `5901234123457`; document reader symbology normalization |
| P06 | UTF8 QR | 80x60 mm /203 | 1 | 2 | Scan exactly `Lot é日本😀 / 1234567890`; preserve exact Unicode and spacing |
| P07 | Axis, border and reference dimensions | 80x60 mm /203 | 1 | 2 | Border 1mm inset, span78x58mm; reference arms50mm horizontally and30mm vertically; distinct corner marks identify axes |
| P08 | Both IPL tile axes | 120x120 mm /203 | 1 | 2 | Four graphics64..67; continuous lines at both799-dot boundaries without additional seam gap/overlap |
| P09 | Native quantity | Same exact P03 version/data /203 | 3 | 6 | Exactly three labels per deliberate action; one IPL quantity command/submit per path |
| Total | Nine pairs | Requires compatible media/device | — | 22 | Nine duplicate intake replays add zero labels |

Start with P01 only and inspect its two physical labels before any continuation. Stop on an unexpected count, panel error, clipping, wrong orientation, scan mismatch, ambiguous write or missing response. Inspect/reconcile the target; never automatically retry. Each later case requires deliberate progression within the authorized scope. No destructive crash/network fault injection belongs in this plan.

P08 requires a device/media width compatible with120mm at203DPI. If unavailable, record P08 NOT RUN/BLOCKED and propose a separately approved device-specific case; do not silently scale it or pretend a one-axis test covers both axes. A changed subset/count/media requires a revised manifest and explicit acceptance scope before sending.

## Proposed measurement criteria (not approved yet)

Record device model/firmware/IP/port, actual IPL mode, head DPI, media width/pitch/gap sensing, ribbon/media, darkness and speed. Payload dimensions do not configure physical label pitch or calibrate feed. Obtain permission to overwrite graphics64..99 and format90; the current encoder may replace those printer resources. No reset, slot cleanup or deletion is included.

Quantity and scan values must match exactly. For P07, proposed absolute position/reference-length tolerance is +/-0.5mm; approve this tolerance before printing. One203DPI dot is approximately0.1251mm. Measure the emitted fiducial centers/reference endpoints, account for raster quantization and record both expected nominal and measured positions. P08 allows no added missing/duplicated row or column at tile seams; compare line continuity with its decoded pixel reference. Readability and no-clipping checks supplement measurements and exact scans; a plausible preview/photo alone is not a physical PASS.

For each pair record actual saved label_code/version/checksum, current approval/policy revision, target ID, request/item/trace identities and response status. Count/measure/scan the paper independently. SUBMITTED/confirmed=false remains local transport evidence even after an operator records separate physical observations. Replay the identical intake identity only after the original result is inspected; preserve original outcomes and confirm zero new labels without a second deliberate Studio action.

## Target and authority fields to complete

1. Printer model/firmware, numeric IP/port, IPL mode, actual DPI and compatible media sizes.
2. Explicit approval for the selected cases, maximum new sends/labels/replays and permitted resource replacement (graphics64..99, format90).
3. Named stored label codes/immutable versions/checksums and approved target/policy; named storage/schema/configuration actions if setup is needed, after T11 corrections.
4. Synthetic client only, or the exact SAP/MES/other system plus separate authority to access/send from that system. A synthetic POST is not actual source integration.
5. Operator to observe/count/measure/scan; permission for any retained photos/scan exports and final proposed tolerances.

## Observation worksheet

| Case / path | Saved version/hash | Request/trace/target ID | Response/confirmed | Observed count | Dimensions/positions | Decoded scan text | Panel/settings/photo reference | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01..P09 / Studio or intake | PENDING | PENDING | NOT RUN | NOT RUN | NOT RUN | NOT RUN | PENDING | NOT RUN |
| P01..P09 / exact intake replay | Same original pins | Original identity, new trace | NOT RUN | Expected0; NOT RUN | N/A | N/A | PENDING | NOT RUN |

Record actual observations here or in a target-specific evidence file after the gates are satisfied. Do not prefill PASS from local simulation or historical printer experiments.
