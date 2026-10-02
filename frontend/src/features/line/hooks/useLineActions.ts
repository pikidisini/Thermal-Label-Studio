import { useCallback } from 'react';
import { fabric } from 'fabric';

interface UseLineActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

export function useLineActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseLineActionsProps) {
  const handleAddLine = useCallback(() => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(50, 4, 'center');

    const line = new fabric.Line([leftPx, topPx, leftPx + 50 * pxPerMm, topPx], {
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });

    canvasRef.current.add(line);
    canvasRef.current.setActiveObject(line);
    syncSelection(line);
    saveCanvasHistory();
    canvasRef.current.renderAll();
    triggerRenderSimulation?.();
  }, [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  return { handleAddLine };
}
