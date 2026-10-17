# Task result: T05

## Identity and scope

- Task: T05_BARCODE_AND_QR; date2026-10-10, Asia/Jakarta.
- Executor: primary Codex agent, direct implementation; no delegated writer.
- State: DONE for declared proven symbol profiles, source self-review PASS.
- Repository: Thermal-Label-Studio/main; HEAD bb639065a3161e9421336913be8327009b4c2ab9.
- Prerequisites: T03 metadata and T04 text results/reviews PASS. Existing T03/T04 work was dirty; initial399-file hash inventory and final preservation evidence reside in `.tmp/t05-0dd9123773`.
- Scope: complete pure binder, symbol payload/options/asset generation, actual Studio generation/refresh corrections, meaningful parity/decode/error tests. No T06 routing or engine/transport changes.

## Delivered behavior

`bind_template` now binds text and regenerates Code128, Code39, EAN13 and QR through one preparation implementation. All required values/type constraints are checked before generators/font dependencies. The entire item succeeds only after every object and final safety/media/resource gate passes. Missing/null/empty differ; zero/false/whitespace/exact keys and duplicate composition references preserve canonical semantics. Samples never provide values, and invalid codes cannot switch symbology or become padded/stripped data.

The immutable result keeps existing SVG/media/source and output hashes, plus SymbolEvidence with owner index, kind, payload/module hashes, native image dimensions and effective QR version/mask. Actual raw QR UTF8 bytes are preserved without text-only XML/line-layout restrictions. No label renderer/codec/storage/transport is invoked.

Actual Studio generator policies are reproduced: Code128 set selection, Code39 terminal gap, EAN guard bars/font clamp, and QR segmentation graph/tie order/mask scoring. Both explicit byte and existing auto QR profiles are supported and stay distinct. Studio generators now fail closed, honor declared metadata options, and allocate within pixel budgets. Refresh loads privately, checks freshness before mutation and preserves the full painted quadrilateral. New symbol SVG explicitly declares full-image stretching.

## Files and dependencies

New backend: `barcode.py`, `qr.py`, `symbols.py`, `SYMBOL_GENERATOR_LICENSES.txt` under template_binding; new backend/tests/test_symbol_binding.py. Existing service.py integrates symbols into the text owner; composition.py distinguishes text layout validation from exact symbol bytes; __init__.py exports the complete binder/evidence. Existing admission, engine/raster, IPL/protocols and transport remain unchanged.

New frontend helpers: features/barcode/model/symbolPayload.ts and replaceSymbolImage.ts. Existing barcodeGenerators.ts/qrGenerator.ts remove fallbacks and honor bounded profiles; barcodePreview.ts delegates declared settings. Studio and useObjectOrderingActions use the helper/options; deliberate type changes create a matching explicit spec. useBarcodeActions chooses a valid explicit EAN seed and rejects unknown types. Existing exporter adds explicit none aspect and rejects unproven crop/filter/stroke, fractional linear raster profiles and invalid previews. Normal frontend test command includes symbol_binding.mjs.

New synthetic evidence: tests/contracts/symbol_vectors.json, templates/symbol_binding_fabric.json, frontend/tests/symbol_binding.mjs. Python pins python-barcode0.16.1, qrcode8.2 and independent test decoder zxing-cpp3.1.1 in requirements.txt. The first two were already installed; the decoder was installed for validation. Actual installed JsBarcode is3.12.3 despite the prior manifest range ^3.11.6; package.json/root lock now pin3.12.3 and qrcode1.5.4 without updating transitive locks. Fixture records actual inspected library versions. MIT adaptation notices ship inside the existing backend COPY boundary; dependency details in docs/SYMBOL_GENERATOR_NOTICES.md.

## Validation evidence

| Gate | Status | Command/evidence | Limit |
| --- | --- | --- | --- |
| Focused backend T03/T04/T05 | PASS | `python -B -m pytest backend/tests/test_symbol_binding.py backend/tests/test_text_binding.py backend/tests/test_template_metadata.py -q --tb=short -p no:cacheprovider`:402 passed |250 T05,125 T04,27 T03; current host has actual Arial for mixed text |
| Actual Studio fixture replay | PASS | `node --import tsx --test tests/symbol_binding.mjs`:4 passed |170 module/mask/version/native RGBA cases;24 actual Fabric placement cases |
| Exact payload decode/type | PASS |32 selected native symbol cases decoded with independent zxing-cpp | Disposable diagnostic quiet-zone padding only; original production pixels/margins compared separately |
| Asset pixel parity | PASS |170 exact native dimensions/RGBA SHA256 comparisons | PNG compression bytes may differ; black/white symbols at declared native settings |
| Placement and static/group preservation | PASS |24 actual Fabric before/after fixtures; backend corners within0.02 editor units, live painted corners within1e-7 | SVG coordinate rounding, not transformed label-raster comparison |
| Required failures/options/capacity/budgets | PASS | Forbidden generator/raster/socket calls; invalid settings/capacity/aggregate pixels and duplicate/mixed bindings tests | Pure module test evidence |
| Full source gate | PASS | `python -B scripts/check_project.py --run-source-checks`; `.tmp/source-checks-60993281-2f56-4591-8b80-6303d6aab639/report.json` | Backend/frontend regressions, core TypeScript and build |
| Diff/preservation review | PASS | `git diff --check`; `.tmp/t05-0dd9123773/preservation.json` | Primary-agent source self-review, no independent second agent |
| Final transformed label raster / prepared bitmap / IPL bytes / decoded IPL | NOT RUN |T06/T11 | Asset-pixel parity is not final label-pipeline parity |
| Real browser / live storage / restart / Docker Linux rendering / quality scan | NOT RUN |Separate gates | No services or containers started |
| External sender / physical printer T12 | NOT RUN |Optional authorized gate | No sender/printer/transport effects |

Initial EAN asset checks found shorter backend guard bars; matching Studio's guarded profile resolved all9 EAN mismatches. Initial geometry checks used Fabric selection-frame corners, which can change under equivalent affine decomposition; tests now compare the actual painted image corners and exported image geometry. Pixel/module mismatches are zero in the retained vectors. Source diff review caught and restored accidental UTF8 mojibake in two edited source files; final diff contains only intended code hunks, not authored text changes.

## Decisions, limitations and explicit replan gates

- Both auto and byte QR remain deterministic declared profiles; no existing auto sample is silently converted to byte.
- Native linear raster metrics must be positive integers. Fractional module/bar raster sizes require NEEDS_REPLAN if required before cutover; arbitrary finite design transforms remain supported.
- Dynamic image aspect must explicitly be none. Old omitted/default meet templates require an explicit current-Studio working-copy re-export/new saved version, or NEEDS_REPLAN if their aspect must be retained. No stored migration or sample-based inference occurred.
- Dynamic cropping/filter/clip/stroke and prior T04 unsupported text/font/shaping profiles remain explicit failures/replan gates.
- Total generated+static image pixels<=4million before PNG allocation; each side<=4096; existing final512KiB SVG/compressed-image/media limits remain authoritative. Payload512 ASCII chars linear/2048 UTF8 bytes QR does not override geometry/capacity budgets.
- Prepared symbol evidence does not contain raw payload logs. The independent scan diagnostic uses padding; production margin1/2 is unchanged.
- Renderer, IPL and printer transport are unchanged. Current output routes still accept composed SVG until T06. No intake endpoint or physical/system readiness claim is made.

## Side effects and handoff

Only authorized local source/docs edits, synthetic fixture/test runs and the pinned local decoder installation occurred. No operational storage initialization/write, sender access, socket submission, containers/deployment, commit/push or successor execution occurred.

All T05 acceptance criteria are met within the explicit proven profiles, with source self-review PASS. T06 may begin only when requested, consuming bind_template and retaining the documented unsupported-profile/re-export gates. Do not infer label-raster/IPL/runtime acceptance from this task.

Copy-ready next task: Execute T06_STUDIO_SHARED_OUTPUT after reading T05 result/review and the implemented binding contract. Route current draft plus canonical data through the complete binder and existing shared engine; prove final renderer/IPL parity and stale-response handling with fakes. Preserve the worktree, perform no operational effects, and stop at T06.
