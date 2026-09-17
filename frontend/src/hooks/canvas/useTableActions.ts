import { useCallback } from 'react';
import { fabric } from 'fabric';

interface UseTableActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

export function useTableActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseTableActionsProps) {
  const handleAddTable = useCallback(
    (rowsInput?: any, colsInput?: any) => {
      if (!canvasRef.current) return;
      const rows = typeof rowsInput === 'number' ? rowsInput : 3;
      const cols = typeof colsInput === 'number' ? colsInput : 3;
      const cellWidth = 20 * pxPerMm;
      const cellHeight = 8 * pxPerMm;
      const tableWidth = cols * cellWidth;
      const tableHeight = rows * cellHeight;
      const { leftPx, topPx } = getStrategicPlacement(cols * 20, rows * 8, 'center');

      const objects: fabric.Object[] = [];

      // Outer border
      objects.push(
        new fabric.Rect({
          left: 0,
          top: 0,
          width: tableWidth,
          height: tableHeight,
          fill: 'transparent',
          stroke: '#000000',
          strokeWidth: 0.5 * pxPerMm,
        })
      );

      // Horizontal dividers
      for (let r = 1; r < rows; r++) {
        objects.push(
          new fabric.Line([0, r * cellHeight, tableWidth, r * cellHeight], {
            stroke: '#000000',
            strokeWidth: 0.3 * pxPerMm,
          })
        );
      }

      // Vertical dividers
      for (let c = 1; c < cols; c++) {
        objects.push(
          new fabric.Line([c * cellWidth, 0, c * cellWidth, tableHeight], {
            stroke: '#000000',
            strokeWidth: 0.3 * pxPerMm,
          })
        );
      }

      // Sample labels
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          objects.push(
            new fabric.Text(`R${r + 1}C${c + 1}`, {
              left: c * cellWidth + 2 * pxPerMm,
              top: r * cellHeight + 2 * pxPerMm,
              fontSize: 2.5 * pxPerMm,
              fontFamily: 'Arial',
              fill: '#000000',
            })
          );
        }
      }

      const tableGroup = new fabric.Group(objects, {
        left: leftPx,
        top: topPx,
      });

      canvasRef.current.add(tableGroup);
      canvasRef.current.setActiveObject(tableGroup);
      syncSelection(tableGroup);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    },
    [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  return { handleAddTable };
}
