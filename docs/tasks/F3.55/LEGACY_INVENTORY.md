# F3.55 Legacy Inventory

## Method

Inventory was produced from actual files under `frontend/src/utils`, `frontend/src/hooks`, and `frontend/src/components`, then searched against `frontend/src` and `frontend/tests` with `rg`. Counts are file-reference counts using each module basename; they are conservative where a module is retained by a feature barrel or a compatibility export.

| Candidate family | Path(s) | Reference count | Category | Owner / reason | Action |
| --- | --- | ---: | --- | --- | --- |
| API base compatibility | `utils/api/apiConfig.ts` | 8 | 2 compatibility re-export | Re-exports shared `API_BASE`; still consumed by Auth, Print, and Simulation APIs | Retain until callers can migrate as one boundary batch |
| Generic API / rendering / CSRF | `utils/apiClient.ts`, `utils/api/{csrfHelper,printApi,renderApi,templatesApi,sapApi}.ts` | 2–8 | 3 shared boundary | Transport contracts are cross-feature and hardware/export sensitive | Retain |
| Auth / simulation compatibility API | `utils/api/{authApi,safeDemoApi,sapShadowSimulationApi}.ts` | 7 each | 2 compatibility adapters | Feature APIs and test contracts still reference adapters | Retain |
| Template SVG utility | `utils/{fabricSvgExporter,fabricSvgImporter,validateLocalSvg}.ts` | 2–5 | 3 shared boundary | Shared by Templates, Simulation, canvas export/import, and tests | Retain |
| Editor draft recovery | `utils/editorDraftRecovery.ts`, `hooks/useEditorDraftRecovery.ts` | 2–4 | 3 shared boundary | User/session-scoped persistence used by Studio and auth cleanup; Table rehydration is coupled | Retain |
| Data Tokens adapters | `utils/{sapContractAdapter,sapTokenValue}.ts` | 3–6 | 1 active feature-owned caller migration | Stores/tests still import legacy path while Data Tokens feature owns related model | Retain; migration needs separate store/test boundary task |
| Local JSON compatibility export | `utils/localSapJsonParser.ts` | 0 external consumers after public feature migration | 4 unused and safe | It only re-exported `features/data-tokens/model/localSapJsonParser`; public feature barrel is used | **Deleted** |
| Diagnostics compatibility | `utils/{sessionRecorder,sessionReportGenerator}.ts` | 3–7 | 2 compatibility adapters | Diagnostics public feature and tests retain these adapters | Retain |
| Simulation capability predicate | `utils/simulationCapabilities.ts` | 2 | 3 shared boundary | Topbar plus tested fail-closed predicate | Retain |
| Legacy Table model | `utils/tableSpec.ts`, `hooks/canvas/useTableActions.ts` | 18 / 2 | 5 legacy Table hold | Tests and canvas aggregator preserve v1/V2 interoperability; user asked table tools remain hidden | Hold; do not remove or alter |
| Canvas action aggregation | `hooks/useCanvasActions.ts`, `hooks/canvas/{useDrawingTools,useObjectOrderingActions,usePlacementHelper}.ts` | 2–3 | 1 active feature-owned caller migration | Canvas aggregator still coordinates Line, Text, Barcode, QR, Image, and held Table | Retain; no safe narrow cleanup |
| Canvas lifecycle hooks | `hooks/{useAutoFit,useStudioInitialization,useKeyboardShortcuts,useModalA11y}.ts` | 1–6 | 3 shared/editor shell boundary | Studio/window lifecycle and modal accessibility cross feature surfaces | Retain |
| Legacy preview alias | `components/layout/ThermalPreviewSplit.tsx` | 0 external consumers | 4 unused and safe | Deprecated re-export of `ThermalPreviewDeck`; source/tests have no import | **Deleted** |
| Layout shell | `components/layout/**` excluding alias | 2–4 each | 3 shared editor shell | TopMenu, ribbon, toolbox, inspector, status, and preview compose public feature APIs | Retain |
| Modal shell | `components/modals/**` | 2–4 each | 3 shared editor shell | Canvas setup/shortcut help remain generic orchestrators with direct children | Retain |
| Studio composition | `components/studio/AuthenticatedStudio.tsx` | 5 | 3 shared editor shell | Authorized application composition root; feature callers are intentionally coordinated here | Retain |
| Deleted legacy component paths | `components/auth`, `components/canvas`, legacy modal/ribbon/toolbox paths | 0 active files | 2 completed migration tombstones in Git status | Feature-first moves already staged in shared dirty worktree | Do not touch; preserve another writer's move set |

## Safe cleanup evidence

`rg` found no source or test import of `ThermalPreviewSplit`. `utils/localSapJsonParser.ts` had only a compatibility re-export; consumers use the `features/data-tokens` public barrel. Both deletions leave their owned implementation/public API intact.

## Deferred risks

- Basename counts are deliberately not treated as proof to delete nonzero-consumer modules.
- Adapter API paths and Canvas/Table coordination have cross-feature and test consumers; removing them would exceed this cleanup scope.
- The repository has a massive dirty worktree, so deleted paths that are already represented as feature migrations are explicitly held rather than re-processed.
