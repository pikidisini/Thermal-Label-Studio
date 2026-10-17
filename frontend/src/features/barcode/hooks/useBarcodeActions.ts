// The canvas barrel mounts drawing tools that import this feature's barrel.
import { creationSymbolSpec } from '../../canvas/svg/bindingMetadata';
import { useCallback } from 'react';
import * as fabric from 'fabric';
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
    (type: any = 'code128', customValue?: any, onCreated?: (object: fabric.FabricImage) => void) => {
      if (!canvasRef.current) return;
      const barcodeType = typeof type === 'string' ? type : 'code128';
      if (!['code128','code39','ean13'].includes(barcodeType)) return;
      const initialValue = typeof customValue === 'string' ? customValue : barcodeType === 'ean13' ? '4006381333931' : barcodeType === 'code39' ? 'CODE39' : '12345678';
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
        void fabric.FabricImage.fromURL(dataUrl).then((img) => {
          if (!canvasRef.current) return;
          img.set({
            left: leftPx,
            top: topPx,
            scaleX: 0.8,
            scaleY: 0.8,
            isBarcode: true,
            barcodeType: barcodeType,
            symbolSpec: creationSymbolSpec(barcodeType),
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
