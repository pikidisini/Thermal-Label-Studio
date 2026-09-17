import { useCallback } from 'react';
import { fabric } from 'fabric';
import { barcodeGenerators } from '../../utils/barcodeGenerators';

interface UseBarcodeActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
  jsonData: Record<string, any>;
}

export function useBarcodeActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
  jsonData,
}: UseBarcodeActionsProps) {
  const handleAddBarcode = useCallback(
    (type: any = 'code128', customValue?: any) => {
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
            dataBarcode: typeof customValue === 'string' ? customValue : undefined,
          } as any);

          canvasRef.current.add(img);
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

  const handleAddQrCode = useCallback(
    async (customValue?: any) => {
      if (!canvasRef.current) return;
      const initialValue = typeof customValue === 'string' ? customValue : 'https://enterprise.sap.com/material';
      const dataUrl = await barcodeGenerators.generateQrDataUrl(initialValue);

      if (dataUrl && canvasRef.current) {
        const { leftPx, topPx } = getStrategicPlacement(25, 25, 'top-right');
        fabric.Image.fromURL(dataUrl, (img) => {
          if (!canvasRef.current) return;
          img.set({
            left: leftPx,
            top: topPx,
            scaleX: 0.6,
            scaleY: 0.6,
            isBarcode: true,
            barcodeType: 'qrcode',
            barcodeValue: initialValue,
            dataQr: typeof customValue === 'string' ? customValue : undefined,
          } as any);

          canvasRef.current.add(img);
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

  const handleAddSapToken = useCallback(
    (tokenKey: string, asType: 'text' | 'barcode' | 'qr' = 'text') => {
      if (!canvasRef.current) return;
      const resolvedValue = jsonData[tokenKey] || `{{${tokenKey}}}`;

      if (asType === 'barcode') {
        handleAddBarcode('code128', resolvedValue);
        const active = canvasRef.current.getActiveObject();
        if (active) {
          (active as any).dataBarcode = tokenKey;
          (active as any).isDynamic = true;
          syncSelection(active);
        }
      } else if (asType === 'qr') {
        handleAddQrCode(resolvedValue).then(() => {
          const active = canvasRef.current?.getActiveObject();
          if (active) {
            (active as any).dataQr = tokenKey;
            (active as any).isDynamic = true;
            syncSelection(active);
          }
        });
      } else {
        const { leftPx, topPx } = getStrategicPlacement(40, 10, 'top-left');
        const text = new fabric.IText(String(resolvedValue), {
          left: leftPx,
          top: topPx,
          fontFamily: 'Arial',
          fontSize: 4 * pxPerMm,
          fill: '#000000',
        });
        (text as any).dataField = tokenKey;
        (text as any).isDynamic = true;

        canvasRef.current.add(text);
        canvasRef.current.setActiveObject(text);
        syncSelection(text);
        saveCanvasHistory();
        canvasRef.current.renderAll();
        triggerRenderSimulation?.();
      }
    },
    [canvasRef, jsonData, pxPerMm, getStrategicPlacement, handleAddBarcode, handleAddQrCode, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  return { handleAddBarcode, handleAddQrCode, handleAddSapToken };
}
