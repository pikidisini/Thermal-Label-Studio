import { useCallback } from 'react';
import type { fabric } from 'fabric';
import { createTextObject } from '../model/textObject';

export interface UseTextActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

/** Adds a default text object from the toolbox action. */
export function useTextActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseTextActionsProps) {
  const handleAddText = useCallback(() => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(35, 10, 'top-left');
    const text = createTextObject({ left: leftPx, top: topPx, fontSize: 4.5 * pxPerMm });

    canvasRef.current.add(text);
    canvasRef.current.setActiveObject(text);
    syncSelection(text);
    saveCanvasHistory();
    canvasRef.current.renderAll();
    triggerRenderSimulation?.();
  }, [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  return { handleAddText };
}
