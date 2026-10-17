# T11 software acceptance

Date: 2026-10-10. HEAD: bb639065a3161e9421336913be8327009b4c2ab9.

## Acceptance meaning

T11 verifies the assembled source, HTTP owners and output sinks. It does not waive T07/T10 mandatory resource requirements. Functional parity and regressions can PASS while complete frozen-contract software acceptance remains NEEDS_REPLAN. Runtime acceptance is documented separately in [T11_RUNTIME_ACCEPTANCE](T11_RUNTIME_ACCEPTANCE.md). Optional T12 is not required to demonstrate software parity.

## Shared output matrix

`backend/tests/test_pipeline_acceptance.py` exercises 34 template/data combinations at copies 1 and 999: 28 representative actual Fabric/static fixtures plus six changing-data cases (two text cases and Code128, Code39, EAN13, QR). It uses fixed 203 DPI, media, installed resvg and Arial profile. Test fixtures from earlier tasks retain rotation, nested groups, multiline/alignment/styles, compositions, zero and false. Synthetic layouts, actual bearer policy and a disposable transactional ledger drive the actual HTTP intake route.

For each of the 68 cases, tests compare direct shared preparation with decoded IPL pixels, actual Studio preview pixels, manual Studio recorded print bytes, actual intake simulation pixels/payload hash/size, actual intake print exact bytes, native copies, template pins and terminal replay. Simulation constructs no print sink. Each manual action and claimed intake item submits once to an in-memory recorder; identical request replay submits zero additional payloads. Changed-data cases also require changed pixels and IPL against the original data under the final source gate. No socket transport or operational storage is used.

The focused matrix plus `backend/tests/test_ipl_codec.py` passed 110 tests with zero skipped. Evidence: `.tmp/t11-5e6d617bd2/software.xml`. The final source gate reruns the final test source. Independent codec expectations include the preserved known IPL payload, its full expected preview pixels and known origin, in addition to invalid-command, tiling, quantity and duplicate-print checks. A shared encoder/decoder round trip alone is insufficient.

Exact native renderer and regular/bold/italic/bold-italic font hashes are recorded in `.tmp/t11-5e6d617bd2/native-profile.json`. This proves one native profile, not cross-platform font equivalence or zero differences against browser Canvas rasterization.

## Fresh source and browser gates

Final execution evidence is recorded in [T11_RESULT](results/T11_RESULT.md) and [T11_REVIEW](results/T11_REVIEW.md). The exact required command is `python -B scripts/check_project.py --run-source-checks`; it runs full backend/frontend regression, TypeScript and a fresh build without operator TLS configuration.

Browser acceptance uses the existing `frontend/playwright.config.js`, UI project and existing loopback 8000 origin. The printing/Studio/Align specs now explicitly fulfill `/studio` and assets from the current checkout build and deny unmocked APIs; per-test synthetic mocks override that denial. External font requests are blocked/fulfilled locally. Text roundtrip also uses the helper; preferences owns equivalent current-build mocks. No server is started, no integration project runs and no backend write/printer request occurs. This is built-assets browser mock evidence; historical T06 current-application availability remains separate.

## Supported and rejected profiles

| Feature | Acceptance boundary |
| --- | --- |
| Canonical JSON | Exact keys/scalars, required mode, copies 1..999, raw JSON/duplicate/Unicode/size admission; current OpenAPI response union tested |
| Text/composition | Declared trusted font profile, supported multiline/alignment/style metrics and transforms; required missing/null/empty rejected, zero/false preserved |
| Linear symbols | Code128, Code39, verified EAN13; explicit native checksum/options and integer raster dimensions; authored placement/transforms retained |
| QR | UTF8, declared auto/byte segmentation, ECC and mask/version profiles; regeneration from actual data, no preview-image fallback |
| Static SVG | Allowed bounded shapes, text, embedded safe images, gradients/clips and transforms; safety and graph/resource admission enforced |
| Unsupported bindings | Dynamic rich text/wrapped Textbox, fractional linear raster profile, implicit old aspect/crop/filter/stroke profiles and prepared graphics assets reject explicitly |
| Historical dynamic templates | Incomplete metadata is not reconstructed from samples; explicit working-copy re-export/version migration required |
| Simulation/print | Same binder/raster/codec; final sink differs. SUBMITTED is local acceptance with confirmed=false; uncertain submission is never automatically retried |

T06's separate design observation remains unchanged: 16 of 27 expected-SVG images matched exactly; 11 had 1..137 differing edge pixels. This is not browser Canvas pixel acceptance, and no silent tolerance is introduced. If exact Canvas-to-output raster identity is required, further precision/profile work is still necessary. Equality of identical Studio/intake template bytes does not settle that different comparison.

## Mandatory remaining software requirement

T11-R01 inherits T07-R01/R02 and T10-R01. Actual intake storage calls remain synchronous and cannot be interrupted at the hard preparation deadline; renderer subprocess timeout/application memory reservations do not enforce the frozen native process memory budget. Existing limitation tests and source review reproduce/document that gap. Passing regression tests that expose a limitation do not turn that requirement into PASS.

Implement and test a cancellable, reaped execution boundary with OS memory enforcement, preserving immutable pins, the common engine and no overlapping replacement worker or send resumption. Repeat resource/crash/parity gates before T07/T10 and complete T11 software acceptance can be DONE.


## Final local gate results

Full source gate PASS for backend/frontend regression, TypeScript and fresh build. Final UI browser mocks: 57 passed, zero skipped. After correcting test-only asset/import/canonical-data expectations, frontend regression rerun: 203 passed, zero skipped. The first browser failure evidence is retained; production source was not changed by these corrections. Report locations and unchanged-source/preservation evidence are in T11_RESULT. Functional local acceptance is PASS; full frozen resource acceptance remains NEEDS_REPLAN.
