import { useCallback } from 'react';
import type { fabric } from 'fabric';
import { useStudioStore } from '../store/useStudioStore';
import { useContractStore } from '../store/useContractStore';
import { usePlacementHelper } from './canvas/usePlacementHelper';
import { useLineActions } from '../features/line';
import { useTextActions } from '../features/text';
import { useBarcodeActions, useBarcodeTokenActions } from '../features/barcode';
import { useQrActions } from '../features/qr';
import { useGraphicActions } from '../features/graphics';
import { useImageActions } from '../features/images';
import { useObjectOrderingActions } from './canvas/useObjectOrderingActions';

export function useCanvasActions(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  pxPerMm = 4,
  triggerRenderSimulation?: () => void
) {
  const { setSelectedObject } = useStudioStore();
  const { tokenMap } = useContractStore();

  const { syncSelection, saveCanvasHistory, getStrategicPlacement } = usePlacementHelper(
    canvasRef,
    pxPerMm
  );

  const lineActions = useLineActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });
  const textActions = useTextActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });

  const barcodeActions = useBarcodeActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });
  const qrActions = useQrActions({ canvasRef, triggerRenderSimulation, syncSelection, saveCanvasHistory, getStrategicPlacement });
  const tokenActions = useBarcodeTokenActions({
    canvasRef, pxPerMm, triggerRenderSimulation, syncSelection, saveCanvasHistory, getStrategicPlacement,
    jsonData: tokenMap, handleAddBarcode: barcodeActions.handleAddBarcode, handleAddQrCode: qrActions.handleAddQrCode,
  });


  const graphicActions = useGraphicActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });

  const imageActions = useImageActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });

  const handleDropElement = useCallback((data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const candidate = data as { type?: unknown; token?: unknown; asType?: unknown };
    if (candidate.type !== 'sap-token' || typeof candidate.token !== 'string') return;
    const type = candidate.asType === 'barcode' || candidate.asType === 'qr' ? candidate.asType : 'text';
    tokenActions.handleAddSapToken(candidate.token, type);
  }, [tokenActions]);

  const orderingActions = useObjectOrderingActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    setSelectedObject,
  });

  return {
    ...lineActions,
    ...textActions,
    ...barcodeActions,
    ...qrActions,
    ...tokenActions,
    ...graphicActions,
    ...imageActions,
    ...orderingActions,
    handleDropElement,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  };
}
