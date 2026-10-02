import { useCallback } from 'react';
import { fabric } from 'fabric';

interface UseImageActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: fabric.Object) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

/** Handles standalone, template-local Upload Image / Logo files. */
export function useImageActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseImageActionsProps) {
  const handleUploadImage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !canvasRef.current) return;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result as string;
        if (!dataUrl) return;
        fabric.Image.fromURL(dataUrl, (image) => {
          if (!canvasRef.current) return;
          const maxDimension = 30 * pxPerMm;
          const scale = Math.min(maxDimension / (image.width || 100), maxDimension / (image.height || 100));
          const { leftPx, topPx } = getStrategicPlacement(30, 30, 'center');
          image.set({ left: leftPx, top: topPx, scaleX: scale, scaleY: scale });
          canvasRef.current.add(image);
          canvasRef.current.setActiveObject(image);
          syncSelection(image);
          saveCanvasHistory();
          canvasRef.current.renderAll();
          triggerRenderSimulation?.();
        });
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  return { handleUploadImage };
}
