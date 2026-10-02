# F3.59 Table Retirement Inventory

## Pre-removal runtime paths

| Area | Paths or behavior removed |
| --- | --- |
| Feature implementation | `src/features/table/**`: model, Fabric renderer/interoperability, frame/range/cell editors, resize overlay, inspector, and menu helper |
| Canvas orchestration | `src/hooks/canvas/useTableActions.ts`, the Table contribution in `src/hooks/useCanvasActions.ts`, and Table gesture/preview branches in `useDrawingTools.ts` |
| Canvas lifecycle | Table transform, rehydration, frame-editor setup, selection, and cursor branches in `features/canvas/editor/useFabricCanvas.ts` |
| UI and state | `TableGridPicker`, toolbox props, Table active-tool union, pending placement/edit state, Table inspector/layer/order behavior, and status copy |
| Persistence | Table-specific Fabric serialization props, SVG metadata/reconstruction, and draft validation/rehydration |
| Tests | Table model/spec/renderer/editor tests and their `npm test` entries |

## Post-removal boundary

- `ActiveTool` has no Table mode and no toolbox action can enter one.
- Canvas actions still aggregate Text, Line, Barcode, QR, Graphics, and Image actions; the former Table aggregation is absent.
- SVG import uses Fabric's generic object path. Legacy custom metadata is not interpreted as a retired feature and does not cause an importer failure or synthesized rendering.
- Draft validation accepts generic Fabric objects with unknown metadata, while retaining the existing top-level draft shape validation.
- No `features/table`, `useTableActions`, `tableSpec`, `TableGridPicker`, Table active-tool branch, or Table Fabric import remains in frontend production source or active tests.

## Evidence command

```powershell
rg -n -i "features/table|useTableActions|tableSpec|tableV2|isTable|pendingTable|tableEdit|TableGridPicker|activeTool.*table|data-table-spec" src tests
```

The expected remaining matches are only F3.59 retirement assertions/documentation, never a runtime source path or active test import.
