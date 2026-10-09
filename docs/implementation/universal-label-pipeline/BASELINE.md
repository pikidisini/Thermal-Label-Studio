# T01 source baseline

Inspected 2026-10-10, repository `Thermal-Label-Studio`, branch `main`, HEAD `7ba184a014b8f58ccc1423208be4a369964e450e`. This is current source inspection, not runtime evidence. All pre-existing tracked/untracked changes were preserved. The initial worktree had 85 tracked modifications and 19 untracked entries (directory entries include multiple files); it includes the five active docs, AGENTS.md, backend engine/printing/protocol changes, dataset source, Studio/UI/preferences work, tests and this implementation package. The reviewer retains an exact initial status/preservation snapshot; no reset, staging or publication occurred.

## Implemented consumers and routes

| Consumer/source pointer | Route or operation | Actual boundary |
| --- | --- | --- |
| `backend/app/main.py::validate_label_process` | POST `/api/v1/labels/process` | Fixed ACTIVE_LAYOUTS fixture acceptance; facts envelope, accepted-only response; no output/storage/job |
| `frontend/src/features/simulation/api/fixtureSimulationApi.ts`; `backend/app/simulation/http.py` | POST `/api/v1/simulation/fixture` | Synthetic fixture render/capture, separate from Studio/stored intake |
| `Studio.tsx`, `ThermalPreviewDeck.tsx`, `EditorSimulationModal.tsx`, `features/simulation/api/editorPreviewApi.ts`; `simulation/editor_http.py` | POST `/api/v1/simulation/editor-preview` | Both preview entry points send browser-composed SVG/media; returned PNG is decoded IPL |
| `features/printing/api/printingApi.ts`; `printing/http.py`, `service.py`, `transport.py` | GET `/api/v1/printing/target`, POST `/api/v1/printing/editor` | Explicit numeric action target, optional configured fallback; prepare once, send once; copies 1..999; SUBMITTED unconfirmed |
| `features/templates/api/layoutApi.ts`; `layouts/http.py`, `service.py` | GET/POST `/api/v1/layouts`, GET/PATCH/DELETE `/api/v1/layouts/{label_code}` | Versioned PostgreSQL metadata/immutable MinIO SVG; save directly publishes; no approval record |
| `Studio.tsx`; `studio_datasets/http.py`, `validation.py`, `service.py` | GET/POST `/api/v1/studio-sample-datasets`, GET `/api/v1/studio-sample-datasets/{identifier}` | Full sample envelope in PostgreSQL, browser selection/exploration; no intake listener |
| `jobs/repository.py`, `backend/schema`; `sap/` | Direct foundations only | Injected DB-API jobs revision transitions; no intake ledger, source identity, UNCERTAIN state or HTTP orchestration |

Frontend source search finds no production consumer of labels/process; backend acceptance tests and documentation retain it. Keep this fixture contract unchanged, and introduce exactly one universal route in [CONTRACT](CONTRACT.md). No alias or replacement at the existing path.

## Binding and output boundaries

`Studio.tsx` applies selected tokenMap to text and regenerates barcode/QR image previews in browser effects; `bindingErrors` checks output locally. `features/canvas/svg/fabricSvgExporter.ts::exportFabricToSvg` exports Fabric groups/transforms/text/tspan/shapes/images and metadata: data-field/data-placeholder/data-is-dynamic, data-barcode/data-qr, barcode type/value, base64 JSON payload-spec `{version:1,template}`, editor-group and optional graphic identity. `fabricSvgImporter.ts` restores metadata from element/ancestor and adjusts tspan coordinates; this is editor roundtrip support, not server binding proof. Full barcode width/height/display/font and QR ECC/margin/segmentation choices are not serialized. Captured barcode images/value cannot safely reconstruct missing choices.

Browser `barcodeGenerators.ts` uses JsBarcode ^3.11.6; `qrGenerator.ts` uses qrcode ^1.5.4. Code128/39 and EAN13 are exposed, QR ECC L/M/Q/H defaults M, data-image size 150/margin 1; barcode image defaults width 2/height 40/display false/font 12/margin 2. Existing generator sample defaults, EAN digit sanitizing/padding/truncation and Code128 fallbacks are unacceptable for canonical binding. Composition is literal text plus `{{KEY}}`, keys A-Za-z0-9_-; no arbitrary expressions. Text bound output is capped at 4096 characters; QR preview validates up to 2048 characters. Existing preview ignores missing/null/empty through hasFieldValue; the new contract records those distinctions explicitly.

`labels/templates.py` only allows direct svg/rect/text with data-fact, Arial black/white and bounded ASCII required strings; no group, tspan, transforms or image support. Do not reuse it for Fabric output. `svg_safety.py` is a security admission check (512 KiB, no declarations/scripts/external URLs/use), not a complete feature allowlist.

`engine/pipeline.py` prepares composed editor SVG or fixture binding into immutable PreparedOutput. Editor media permits 10..500 mm, 72..600 DPI, 4096 dots/side and 4,000,000 pixels; configured font normalization, resvg raster, monochrome cutoff and one-pixel editor edge padding precede IPL. `protocols/ipl/` owns codec/native quantity. Simulation decodes exact encoded bytes; printing does not raster/encode again. Shared binding for drafts/stored layouts is still unwired.

`localSapJsonParser.ts` retains v1.1/raw-v2 local exploration. Its versionless data envelope and backend dataset validation currently allow copies through 1000 and do not require mode. `docs/examples/label_data.example.json` has mode already. Imported print mode performs no send. Layout media/version/checksum are server-owned; save marks published and uncertain commit artifacts are preserved. Existing get_layout resolves active version, so immutable version lookup must be added for intake pin/replay.

## Drift and evidence limits

Compared with the package's 2026-10-09 observations, current dirty source includes shared PreparedOutput/IPL codec, explicit Studio action-target/copies handling and dataset persistence; it still has browser binding and no universal intake. Source pointers above were inspected in this task. Historical checks/counts are not rerun or promoted to current PASS. Startup can initialize configured schema/buckets; none was invoked. Stored-layout integrity, auth/admission, durable deduplication, approval, recovery and external routing remain later work. T11 software acceptance and optional T12 device acceptance remain separate.
