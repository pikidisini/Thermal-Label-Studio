# Task result: T04

## Identity and scope

- Task: T04_TEXT_AND_COMPOSITION; 2026-10-10, Asia/Jakarta.
- Executor: primary Codex agent, direct implementation as requested; no delegated writer.
- State: DONE for T04 supported text slice; source review PASS (primary-agent self-review, not a second-agent review).
- Repository: Thermal-Label-Studio, main, HEAD bb639065a3161e9421336913be8327009b4c2ab9.
- Prerequisites: T01/T02/T03 results and review PASS. Initial worktree already contained T03 edits. Hash inventory: `.tmp/t04-eb08302f71/initial-hashes.json`; task-specific shared-file changes are described below. No reset/commit/publication.

## Delivered behavior

Pure backend text/composition preparation now returns immutable BoundTemplate SVG, original manifest/checksum, final SVG hash and authoritative mm/DPI/dot media. Admission and exact scalar validation precede reference resolution/font measurement. Missing, null and empty fail distinctly; false, zero, significant spaces and original Unicode are preserved. Composition is literal text and exact tokens only, never executable syntax or saved preview fallback. Number spelling has actual JavaScript goldens and a deterministic cross-language differential check.

Uniform Fabric text rebuilds multiline/blank-line geometry, left/center/right alignment and positive/negative character spacing. Additive origin/displacement metadata preserves noncenter/numeric origins through rotation/skew/scales/flips/nested groups without moving static siblings. The importer joins same-baseline fragments instead of treating every spaced character as a new line. Original T03 templates without additive layout metadata retain their centered SVG geometry.

Trusted local font profiles use bounded hmtx/kern metrics and grapheme segmentation. Dynamic symbols, unsupported fonts/glyph fallback/complex shaping/rich text/wrapped Textbox/background/path text reject explicitly. Background/path export rejection prevents stale sample geometry. The current editor endpoints remain unchanged; T05/T06 will consume this owner later.

## Task-specific files

- New backend `backend/app/template_binding/composition.py`, `text.py`, `service.py`: exact resolution, trusted metrics and sink-independent result.
- Existing T03 `models.py`, `metadata.py`, `validation.py`, `__init__.py`: immutable optional TextLayout, strict additive metadata admission and public preparation exports. Existing safety/image/reference behavior is preserved.
- Existing frontend `bindingMetadata.ts`, `fabricSvgExporter.ts`, `fabricSvgImporter.ts`: serialize/validate/restore text layout, reject unsupported dynamic background/path, reconstruct baseline lines. Existing T03 symbol/group/spec logic is preserved.
- `fieldPresentation.ts`: only zero-length string is missing; significant whitespace stays valid.
- New `backend/tests/test_text_binding.py`, `frontend/tests/text_binding.mjs`, `tests/contracts/templates/text_binding_fabric.json`, `tests/contracts/text_scalar_cases.json`; package.json includes the meaningful fixture test in its normal gate.
- requirements.txt pins regex==2026.9.29 and fonttools==4.66.1, installed locally for source validation. No font binary is copied into the repository; synthetic fixture records regular/style font digests.
- Active docs, implemented binding contract and task-package contract/status/decisions/parity/results document actual behavior and cutover limits.

## Validation evidence

| Gate | Status | Command/evidence | Limit |
| --- | --- | --- | --- |
| Focused backend T04 and T03 regression | PASS | `python -B -m pytest backend/tests/test_text_binding.py backend/tests/test_template_metadata.py -q --tb=short -p no:cacheprovider`: 152 passed | 125 T04, 27 T03; real fixed Windows font available, no skips |
| Actual Fabric fixture capture and replay | PASS | `node --import tsx --test tests/text_binding.mjs`: 4 passed | 84 independently captured replacement fixtures, synthetic inputs, font hashes fixed |
| Text placement/content parity | PASS | Actual Studio exporter before/after data replacement vs Python bound SVG | 80x60mm/203DPI; world baselines within0.004 editor units (0.001mm); SVG geometry, not raster |
| Numeric differential | PASS | `.tmp/t04-eb08302f71/numeric-result.json`:10606 valid seeded binary64 values, zero differences vs Node String | Regression evidence, not an exhaustive proof over every binary64 value |
| Required data failures before dependencies | PASS | Failure tests prohibit font/raster/socket calls; distinct bounded codes/stage | No output sink invoked by valid binding either |
| Source gate | PASS | `python -B scripts/check_project.py --run-source-checks`; `.tmp/source-checks-e78bed98-d479-4623-b4ed-334f9c7b59f3/report.json` | Backend/frontend regression, core TypeScript, build |
| Diff/preservation review | PASS | `git diff --check`; `.tmp/t04-eb08302f71/preservation.json` | Shared-file changes deliberate; unchanged T03 files hashed |
| Raster pixels / prepared bitmap / decoded IPL / payload bytes | NOT RUN | T06/T11 | No renderer or codec introduced into binder |
| Browser, storage/restart, Linux package, quality scan | NOT RUN | Separate operational gates | No services/containers/storage initiated |
| External sender / physical printer T12 | NOT RUN | Optional authorized gate | No SAP/printer access |

Initial Pillow BASIC metric comparison failed; trusted font-table metrics replaced it. Actual font variants were then registered in the independent Fabric capture. Those failures were resolved without loosening geometry tolerance. Review also found inherited-anchor conflict and corrected it to fail before font work.

## Limits and handoff

- Supported trusted style slots: normal/400 or bold/700, normal/italic/oblique, known Arial/Liberation Sans sibling files. Only the actual Windows Arial profile has geometry evidence in this task. Linux/package and browser profiles need T06/T11 proof.
- Latin/Greek/Cyrillic/common glyphs with simple metrics; NFC is measurement-only. Uncomposed remaining marks/complex shaping/fallback fail unsupported_feature. Original accepted strings are never normalized in output.
- Limits: canonical 200 scalar keys/2MiB reservation, resolved text4096 codepoints/16384bytes/100lines, conservative total10000-node reservation, final SVG512KiB,72..600DPI,4096 dots/dimension,four million pixels.
- Rich text/wrapped Textbox/dynamic background/path and required unsupported font/shaping profiles are NEEDS_REPLAN before cutover; no captured-value fallback. T05 must remove the symbol rejection only after actual symbol parity proof.
- Explicit lone CR/unsupported baseline/letter-spacing/anchor profiles reject. CRLF is one break.
- T04 does not route Studio preview/simulation/print through backend binding. Output integration remains T06, and software raster/IPL equivalence remains T11.
- Next eligible task: T05 only when requested. No successor started.

## Side effects

Only repository edits, unique disposable test evidence, synthetic fixture generation and the pinned local Python dependency installation occurred. No operational storage writes, TCP sends, services/containers, deployment, commit or push occurred.
