import { useCallback } from 'react';
import * as fabric from 'fabric';
import { qrGenerator } from '../model/qrGenerator';

export interface UseQrActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

/** Adds QR objects without changing the metadata used by SVG import/export. */
export function useQrActions({
  canvasRef,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseQrActionsProps) {
  const handleAddQrCode = useCallback(
    async (customValue?: any, onCreated?: (object: fabric.FabricImage) => void) => {
      if (!canvasRef.current) return;
      const initialValue = typeof customValue === 'string' ? customValue : 'https://enterprise.sap.com/material';
      const dataUrl = await qrGenerator.generateQrDataUrl(initialValue);

      if (dataUrl && canvasRef.current) {
        const { leftPx, topPx } = getStrategicPlacement(25, 25, 'top-right');
        void fabric.FabricImage.fromURL(dataUrl).then((img) => {
          if (!canvasRef.current) return;
          img.set({
            left: leftPx,
            top: topPx,
            scaleX: 0.6,
            scaleY: 0.6,
            isBarcode: true,
            barcodeType: 'qrcode',
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

  return { handleAddQrCode };
}
