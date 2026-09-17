import type { fabric } from 'fabric';
import { useStudioStore } from '../store/useStudioStore';
import { useContractStore } from '../store/useContractStore';
import { usePlacementHelper } from './canvas/usePlacementHelper';
import { useShapeActions } from './canvas/useShapeActions';
import { useBarcodeActions } from './canvas/useBarcodeActions';
import { useTableActions } from './canvas/useTableActions';
import { useSymbolActions } from './canvas/useSymbolActions';
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

  const shapeActions = useShapeActions({
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
    jsonData: tokenMap,
  });

  const tableActions = useTableActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  });

  const symbolActions = useSymbolActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
    handleAddSapToken: barcodeActions.handleAddSapToken,
  });

  const orderingActions = useObjectOrderingActions({
    canvasRef,
    pxPerMm,
    triggerRenderSimulation,
    syncSelection,
    saveCanvasHistory,
    setSelectedObject,
  });

  return {
    ...shapeActions,
    ...barcodeActions,
    ...tableActions,
    ...symbolActions,
    ...orderingActions,
    syncSelection,
    saveCanvasHistory,
    getStrategicPlacement,
  };
}
