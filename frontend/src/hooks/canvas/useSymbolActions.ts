import { useCallback } from 'react';
import { fabric } from 'fabric';
import { getSymbolSvg } from '../../utils/industrialSymbols';

interface UseSymbolActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
  handleAddSapToken: (token: string, type: 'text' | 'barcode' | 'qr') => void;
}

export function useSymbolActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
  handleAddSapToken,
}: UseSymbolActionsProps) {
  const handleAddIsoSymbol = useCallback(
    (symbolKeyInput?: any) => {
      if (!canvasRef.current) return;
      const symbolKey = typeof symbolKeyInput === 'string' ? symbolKeyInput : 'iso7000_fragile';
      const svgString = getSymbolSvg(symbolKey, 16 * pxPerMm, 16 * pxPerMm);
      if (!svgString) return;

      const { leftPx, topPx } = getStrategicPlacement(16, 16, 'top-right');
      fabric.loadSVGFromString(svgString, (objects, options) => {
        if (!canvasRef.current || !objects || objects.length === 0) return;
        const group = fabric.util.groupSVGElements(objects, options);
        group.set({
          left: leftPx,
          top: topPx,
          isGhsSymbol: symbolKey.startsWith('ghs_'),
        } as any);

        canvasRef.current.add(group);
        canvasRef.current.setActiveObject(group);
        syncSelection(group);
        saveCanvasHistory();
        canvasRef.current.renderAll();
        triggerRenderSimulation?.();
      });
    },
    [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  const handleUploadImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !canvasRef.current) return;

      const reader = new FileReader();
      reader.onload = (f) => {
        const dataUrl = f.target?.result as string;
        if (dataUrl) {
          fabric.Image.fromURL(dataUrl, (img) => {
            if (!canvasRef.current) return;
            const maxDimension = 30 * pxPerMm;
            const scale = Math.min(maxDimension / (img.width || 100), maxDimension / (img.height || 100));
            const { leftPx, topPx } = getStrategicPlacement(30, 30, 'center');

            img.set({
              left: leftPx,
              top: topPx,
              scaleX: scale,
              scaleY: scale,
            });

            canvasRef.current.add(img);
            canvasRef.current.setActiveObject(img);
            syncSelection(img);
            saveCanvasHistory();
            canvasRef.current.renderAll();
            triggerRenderSimulation?.();
          });
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [canvasRef, pxPerMm, getStrategicPlacement, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  const handleDropElement = useCallback(
    (data: any) => {
      if (!data) return;
      if (data.type === 'sap-token' && data.token) {
        handleAddSapToken(data.token, data.asType || 'text');
      } else if (data.type === 'symbol' && data.symbolKey) {
        handleAddIsoSymbol(data.symbolKey);
      }
    },
    [handleAddSapToken, handleAddIsoSymbol]
  );

  return { handleAddIsoSymbol, handleUploadImage, handleDropElement };
}
