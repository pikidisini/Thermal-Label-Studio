import { useCallback } from 'react';
import { fabric } from 'fabric';
import { barcodeGenerators } from '../model/barcodeGenerators';

export interface UseBarcodeActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

export function useBarcodeActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseBarcodeActionsProps) {
  const handleAddBarcode = useCallback(
    (type: any = 'code128', customValue?: any, onCreated?: (object: fabric.Image) => void) => {
      if (!canvasRef.current) return;
      const barcodeType = typeof type === 'string' ? type : 'code128';
      const initialValue = typeof customValue === 'string' ? customValue : '12345678';
      let dataUrl: string | null = null;

      if (barcodeType === 'ean13') {
        dataUrl = barcodeGenerators.generateEan13DataUrl(initialValue);
      } else if (barcodeType === 'code39') {
        dataUrl = barcodeGenerators.generateCode39DataUrl(initialValue);
      } else {
        dataUrl = barcodeGenerators.generateCode128DataUrl(initialValue);
      }

      if (dataUrl) {
        const { leftPx, topPx } = getStrategicPlacement(50, 15, 'center');
        fabric.Image.fromURL(dataUrl, (img) => {
          if (!canvasRef.current) return;
          img.set({
            left: leftPx,
            top: topPx,
            scaleX: 0.8,
            scaleY: 0.8,
            isBarcode: true,
            barcodeType: barcodeType,
            barcodeValue: initialValue,
            payloadTemplate: initialValue,
          } as any);

          canvasRef.current.add(img);
          onCreated?.(img);
          canvasRef.current.setActiveObject(img);
          syncSelection(img);
          saveCanvasHistory();
          canvasRef.current.renderAll();
          triggerRenderSimulation?.();
        });
      }
    },
    [canvasRef, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  return { handleAddBarcode };
}
