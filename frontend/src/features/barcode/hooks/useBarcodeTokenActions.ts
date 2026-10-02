import { useCallback } from 'react';
import { fabric } from 'fabric';
import { createTextObject } from '../../text';
import { resolveSapTokenDisplayValue } from '../../data-tokens';

export interface UseBarcodeTokenActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
  jsonData: Record<string, any>;
  handleAddBarcode: (type?: any, customValue?: any, onCreated?: (object: fabric.Image) => void) => void;
  handleAddQrCode: (customValue?: any, onCreated?: (object: fabric.Image) => void) => Promise<void>;
}

/** Resolves a data token and delegates image creation to its owning feature. */
export function useBarcodeTokenActions({
  canvasRef, pxPerMm, triggerRenderSimulation, syncSelection, saveCanvasHistory, getStrategicPlacement,
  jsonData, handleAddBarcode, handleAddQrCode,
}: UseBarcodeTokenActionsProps) {
  const handleAddSapToken = useCallback(
    (tokenKey: string, asType: 'text' | 'barcode' | 'qr' = 'text') => {
      if (!canvasRef.current) return;
      const resolvedValue = resolveSapTokenDisplayValue(jsonData[tokenKey], tokenKey);
      if (asType !== 'text' && (!resolvedValue || resolvedValue === `{{${tokenKey}}}` || /^(ABSENT|NULL|EMPTY)\b/.test(resolvedValue))) return;

      if (asType === 'barcode') {
        handleAddBarcode('code128', resolvedValue, (active) => {
          (active as any).dataBarcode = tokenKey;
          (active as any).payloadTemplate = `{{${tokenKey}}}`;
          (active as any).isDynamic = true;
          syncSelection(active);
        });
      } else if (asType === 'qr') {
        void handleAddQrCode(resolvedValue, (active) => {
          (active as any).dataQr = tokenKey;
          (active as any).payloadTemplate = `{{${tokenKey}}}`;
          (active as any).isDynamic = true;
          syncSelection(active);
        });
      } else {
        const { leftPx, topPx } = getStrategicPlacement(40, 10, 'top-left');
        const text = createTextObject({ content: String(resolvedValue), left: leftPx, top: topPx, fontSize: 4 * pxPerMm });
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
  return { handleAddSapToken };
}
