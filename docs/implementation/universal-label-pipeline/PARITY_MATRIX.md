# T01 parity evidence plan

All cases below are PENDING; no design artifact proves implementation parity. [BASELINE](BASELINE.md) inventories actual code; [CONTRACT](CONTRACT.md) fixes target inputs and budgets. Synthetic fixtures contain no operational data. Record source revision, canonical template bytes/checksum, binding metadata, data, media, renderer executable digest/version, font file digest/family, cutoff=128, edge normalization, encoder version, copies and OS for every positive comparison. Persist minimal artifacts under a unique `.tmp/` child.

## Comparison levels and owners

| Level | Required evidence | Owner/gate |
| --- | --- | --- |
| A semantics | Exact bound strings, escaped XML, symbol payload/options, error distinctions; transform/layout preserved | T03/T04/T05 |
| B canvas WYSIWYG | Existing/current Studio canvas generation versus canonical backend binding raster under same media/font; inspect geometry and module grid independently; record intentional migration differences before approval | T05 before T06 cutover |
| C shared entry parity | Identical draft and immutable stored template/data/options produce bit-identical decoded monochrome raster and exact IPL bytes, including quantity | T06/T07/T11 |
| D sink parity | Prepared raster each bit equals decoded IPL PNG each bit, full bounds/white padding; compression/PNG file bytes not compared | T11 |
| E independent codec | Hand-specified IPL byte vectors and independently specified pixel matrices; encoder and decoder each tested against vectors, never solely roundtrip | T11 |
| F transport/browser | Recorder asserts exact bytes, one socket attempt/item, native copies; mock browser asserts explicit output/stale clearing/uncertainty lock; no physical effects | T06/T10/T11 |
| G operations | Authorized named disposable storage save/pin/replay/restart/crash, packaged renderer/font parity; retain distinct evidence | T11 runtime gate |
| H optional device | Named printer/media quantity/scan/geometry and external sender identity | T12 only when requested |

## Synthetic fixture matrix

| ID/input | Expected result/comparison | Owner |
| --- | --- | --- |
| P01 static 40x30 mm @203 DPI, white background, rect/line/circle/ellipse/path/polygon/polyline and local gradient/clip | A/C/D exact geometry and pixels; no extra canvas backdrop layer after save/open | T03/T06/T07 |
| P02 nested group with rotation 37°, scale 1.2/0.8, skew, negative affine translation and static embedded PNG/JPEG/WebP | A/C/D preserved transform and ordering; no external fetch | T03/T06 |
| P03 field text with `ZZCHARG="A&B<\"001"`, literal Unicode, multiline `A\nB`, explicit tspan metrics; composition `ID={{ZZCHARG}}` | A XML escaped once, explicit line baselines, font/geometry parity B/C/D | T04/T06 |
| P04 same field separately absent, null, empty, 0, false; descriptions "Friendly label" | distinct missing/null/empty failures; 0/false exact text, descriptions never substituted | T02/T04 |
| P05 numeric 1, 1.5, 1e-7, 1e21, max-safe integer, unsafe integer, -0, nonfinite JSON | shared canonical numeric spelling, unsafe/nonfinite reject; -0 ->0 per frozen numeric rule | T02/T04 |
| P06 code128 `AB123456CD`, numeric-only 20 digits, alternating digits/text and punctuation; code39 `AB-12 $%`; EAN13 `4006381333931` | module sequence/checksum/quiet area and transformed raster B; C/D exact pixels/bytes; no checksum added to Code39 | T05 |
| P07 QR ASCII and UTF-8 `BATCH-001`/`日本語`, each ECC L/M/Q/H, explicit/auto version and mask, byte profile | version/mask/segment/module matrix B; backend authoritative options on canvas C/D | T05 |
| P08 dynamic image contains stale sample `OLD`, data=`NEW`, complete metadata | regenerate NEW; no stale fallback; C/D | T03/T05 |
| P09 unknown binding version/type/option, missing symbol-spec, conflicting aliases, malformed base64/spec, nested dynamic owner, unresolvable rich text metrics | unsupported_feature/invalid_template before raster/send; NEEDS_REPLAN if current feature cannot be supported | T03/T05/T06 |
| P10 EAN wrong checkdigit/non-digits/12 digits; Code39 lowercase; QR >2048 bytes; missing/empty payload | invalid_symbol or distinct binding error; no sanitizing/padding/Code128 fallback | T05 |
| P11 script/onload/use/DOCTYPE/entity/foreignObject/external URL/style import/filter/mask/reference cycle, oversized image/path/nesting | fail closed at admission; zero external reads and zero renderer/transport calls | T03/T09 |
| P12 media 10..500mm @72..600, exactly 4096-side/4m-pixel boundary; +/-one-dot renderer edge, >one-dot mismatch | limits enforced, shared white edge normalization only at one dot; boundary rejects before rendering | T06/T11 |
| P13 1/999 copies, bool/0/1000/fraction/string; equal draft/stored content | valid native quantity, one preparation/payload/send; exact C/D/F; invalid zero side effects | T02/T10/T11 |
| P14 mixed ordered 3 items (valid/unknown label/invalid data), 100 items, duplicates and extra keys | simulation ordered successes/failures; structural reject before processing; print no sends if any preflight failure | T07/T10 |
| P15 aggregate pixels/copies/PNG/IPL/response/memory just below/above caps; body chunk overflow; preparation timeout/concurrent admission | bounded failure/skips, 413/429 as frozen; no late response allocation failure after send | T07/T10 |
| P16 repeat same identity/digest, changed digest, concurrent duplicate; active template changes after pin | same pins/outcomes/no resend, 409 conflicts, exact version fetch | T08 |
| P17 crashes before claim/after claim/after socket success/before terminal commit; claim commit failure | no send before durable claim; possible sends UNCERTAIN, later SKIPPED; never background resume | T08/T10/G |
| P18 forged sender, invalid credential, missing policy, unapproved published version, checksum mismatch, revoked approval, target change | deny before claim/socket; sender.system does not authenticate; no payload-directed address | T09 |
| P19 transport recorder fail before send/partial send/response loss, first success then second uncertain | first SUBMITTED false, second UNCERTAIN, third SKIPPED; one attempt; explicit UI lock | T10/T11 |
| P20 dataset missing mode/legacy raw-v2/v1.1, import mode=print, unsaved draft differing stored version | local warning/no automatic output; canonical strict validation; distinct content allowed to differ | T02/T06 |
| P21 tiles 799/800 dot boundaries, >one tile, 4096 bounds; independently specified blank, single dot, alternating bits, height not multiple of six, quantity 999 | E exact G/u/U byte vectors and expected placement; invalid command/scale/graphics bounds reject | T11 |
| P22 preview view + Label Simulation + manual print from same latest unsaved draft/data; rapid edits/late response/duplicate click | C/F shared server input, stale PNG cleared, no legacy endpoints, explicit print and one request; success permits deliberate new print | T06/T11 |

Dependency policy: Python symbol libraries are a selected implementation approach, not established pixel equivalence to JS generators. T05 must compare codeword/module arrays and actual Studio pixels before T06. Code128 code-set selection and QR segmentation/mask tie-breaking may differ despite equivalent decoded payloads. Prefer deterministic options persisted in metadata and make Studio canvas generation use the same server profile when needed; any unavoidable WYSIWYG change requires documented NEEDS_REPLAN and review, never silently accepting a different symbol or stale captured image. JS preview sample defaults/fallbacks must be removed for canonical output.

T11 is the main software acceptance gate (A–F plus separately recorded G). Report source software PASS independently of live storage/restart/package gaps. H/T12 NOT RUN is optional and cannot be used to claim device acceptance or block proven software parity.
