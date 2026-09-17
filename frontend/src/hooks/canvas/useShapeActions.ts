import { useCallback } from 'react';
import { fabric } from 'fabric';

interface UseShapeActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

export function useShapeActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseShapeActionsProps) {
  const handleAddText = useCallback(() => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(35, 10, 'top-left');

    const text = new fabric.IText('New Label Text', {
      left: leftPx,
      top: topPx,
      fontFamily: 'Arial',
      fontSize: 4.5 * pxPerMm,
      fill: '#000000',
    });

    canvasRef.current.add(text);
    canvasRef.current.setActiveObject(text);
    syncSelection(text);
    saveCanvasHistory();
    canvasRef.current.renderAll();
    triggerRenderSimulation?.();
  }, [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  const handleAddBox = useCallback(() => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(40, 20, 'center');

    const rect = new fabric.Rect({
      left: leftPx,
      top: topPx,
      width: 40 * pxPerMm,
      height: 20 * pxPerMm,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });

    canvasRef.current.add(rect);
    canvasRef.current.setActiveObject(rect);
    syncSelection(rect);
    saveCanvasHistory();
    canvasRef.current.renderAll();
    triggerRenderSimulation?.();
  }, [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

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

  const handleAddCircle = useCallback(() => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(20, 20, 'center');

    const circle = new fabric.Circle({
      left: leftPx,
      top: topPx,
      radius: 10 * pxPerMm,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });

    canvasRef.current.add(circle);
    canvasRef.current.setActiveObject(circle);
    syncSelection(circle);
    saveCanvasHistory();
    canvasRef.current.renderAll();
    triggerRenderSimulation?.();
  }, [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  return { handleAddText, handleAddBox, handleAddLine, handleAddCircle };
}
