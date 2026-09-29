import { useCallback } from 'react';
import { fabric } from 'fabric';
import { createTableModel, resizeTable } from '../../features/table/model/tableModelV2';
import { makeTableGroupV2 } from '../../features/table/canvas/tableRenderer';
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
export { makeTableGroupV2 } from '../../features/table/canvas/tableRenderer';

interface UseTableActionsProps { canvasRef: React.MutableRefObject<fabric.Canvas | null>; pxPerMm: number; triggerRenderSimulation?: () => void; syncSelection: (obj: any) => void; getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number }; }
export function useTableActions({ canvasRef, pxPerMm, triggerRenderSimulation, syncSelection, getStrategicPlacement }: UseTableActionsProps) {
  const handleAddTable = useCallback((rows?: number, columns = 3, placement: 'drag' | 'center' = 'center') => {
    if (!canvasRef.current) return;
    const rowCount = typeof rows === 'number' ? rows : 3;
    if (placement === 'drag') {
      const studio = useStudioStore.getState();
      studio.setPendingTableSize({ rows: rowCount, columns });
      studio.setActiveTool('table');
      canvasRef.current.upperCanvasEl.focus();
      return;
    }
    useStudioStore.getState().setPendingTableSize(null);
    const { labelWidthMm, labelHeightMm } = useTemplateStore.getState();
    const width = Math.min(60, labelWidthMm), height = Math.min(24, labelHeightMm);
    if (width < columns || height < rowCount) { window.alert('Ukuran label terlalu kecil untuk tabel yang dipilih.'); return; }
    const base = createTableModel(rowCount, columns, 60 / columns, 24 / rowCount);
    const spec = width === 60 && height === 24 ? base : resizeTable(base, width, height);
    if (!spec) return;
    const left = Math.max(0, (labelWidthMm - width) * pxPerMm / 2);
    const top = Math.max(0, (labelHeightMm - height) * pxPerMm / 2);
    const table = makeTableGroupV2(spec, pxPerMm, { left, top });
    canvasRef.current.add(table); canvasRef.current.setActiveObject(table); syncSelection(table); canvasRef.current.renderAll();
  }, [canvasRef, pxPerMm, syncSelection]);
  return { handleAddTable };
}
