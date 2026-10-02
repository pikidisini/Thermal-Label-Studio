# F3.57 Canvas Composition Boundary Inventory

## Actual caller inventory

| Module | Active caller(s) | Classification | Decision |
| --- | --- | --- | --- |
| `features/canvas/ui/StudioCanvas.tsx` | `components/studio/AuthenticatedStudio.tsx` | Canvas public UI | Retain; Studio imports from `features/canvas` barrel. |
| `features/canvas/editor/useFabricCanvas.ts` | `features/canvas/ui/StudioCanvas.tsx` | Canvas lifecycle/editor owner | Retain as feature-internal lifecycle implementation. |
| `hooks/useCanvasActions.ts` | `components/studio/AuthenticatedStudio.tsx` | Cross-feature orchestration adapter | Retain; combines independent tool APIs and shared selection/history/placement callbacks. |
| `hooks/canvas/usePlacementHelper.ts` | `hooks/useCanvasActions.ts` | Orchestration support | Retain; shared placement/history/selection callbacks are injected into tool actions. |
| `hooks/canvas/useDrawingTools.ts` | `features/canvas/editor/useFabricCanvas.ts` | Canvas-attached cross-tool gesture adapter | Retain; listener handles Line, Text, Barcode, Snapping, and held Table gestures. |

## Ownership map

| Responsibility | Owner | Evidence / boundary |
| --- | --- | --- |
| Fabric canvas creation, event lifecycle, disposal, object-moving guides, canvas ready callback | `features/canvas/editor/useFabricCanvas.ts` | Canvas feature owns `fabric.Canvas` lifecycle and imports Snapping through its public feature API. |
| Canvas viewport, rulers, zoom, touchpad, wheel support | `features/canvas` public barrel and internal editor/ruler modules | `AuthenticatedStudio` receives `StudioCanvas` from `features/canvas`; shell has no Canvas deep import. |
| Selection synchronization, history persistence, strategic placement | `hooks/canvas/usePlacementHelper.ts` | Cross-tool callback bundle consumed by the orchestration adapter. |
| Tool actions | Respective feature public APIs: Line, Text, Barcode, QR, Graphics, Image | `useCanvasActions` calls their public hooks and forwards one shared callback contract. |
| Object ordering | `hooks/canvas/useObjectOrderingActions.ts` | Editor-shell operation, retained by the aggregation adapter. |
| Table actions and draw/resize/frame interaction | `hooks/canvas/useTableActions.ts`, `features/table/**` | Legacy Table hold; active compatibility/interoperability path is deliberately unchanged. |
| Pointer drawing listener | `hooks/canvas/useDrawingTools.ts` | One Fabric listener coordinates multiple tool modes and Table hold; moving it into Canvas would falsely make Canvas the owner of feature tools. |

## Why adapters are retained

`useCanvasActions` is not a compatibility shim: it is the sole composition point that creates each feature action hook with one consistent callback bundle. Moving it into `features/canvas` would make Canvas appear to own Line, Text, Barcode, QR, Graphics, Image, and Table behavior. Splitting it into wrapper hooks would not reduce coupling because the same Fabric ref, history, selection, simulation, and placement dependencies must still be supplied together.

`useDrawingTools` is retained beside Canvas hooks because it attaches Fabric listeners, but it remains an orchestration adapter rather than a Canvas domain API. It coordinates the current active tool and imports tool behavior through Line, Text, Barcode, and Snapping public feature APIs. Its held Table branch prevents a safe relocation or deletion.

## Cleanup decision

No compatibility file is deleted in F3.57. Every candidate has an active caller and changes to any one of them could alter gesture, keyboard, history, drawing, or Table behavior. The composition boundary is therefore **IMPLEMENTED BY DOCUMENTED RETENTION**, not an artificial file move.
