import { useCallback } from 'react';
import { fabric } from 'fabric';
import { barcodeGenerators } from '../../utils/barcodeGenerators';

interface UseObjectOrderingActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  setSelectedObject: (obj: any) => void;
}

export function useObjectOrderingActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  setSelectedObject,
}: UseObjectOrderingActionsProps) {
  const handleUpdateProperty = useCallback(
    (property: string, value: any) => {
      if (!canvasRef.current) return;
      const active = canvasRef.current.getActiveObject() as any;
      if (!active) return;

      if (property === 'leftMm') {
        active.set('left', Number(value) * pxPerMm);
      } else if (property === 'topMm') {
        active.set('top', Number(value) * pxPerMm);
      } else if (property === 'fontSizePt') {
        active.set('fontSize', (Number(value) * pxPerMm) / 2.834);
      } else if (property === 'strokeWidthMm') {
        active.set('strokeWidth', Number(value) * pxPerMm);
      } else if (property === 'barcodeValue' || property === 'barcodeType') {
        const nextType = property === 'barcodeType' ? value : active.barcodeType || 'code128';
        const nextVal = property === 'barcodeValue' ? value : active.barcodeValue || '12345678';
        active.barcodeType = nextType;
        active.barcodeValue = nextVal;

        let newUrl: string | null = null;
        if (nextType === 'qrcode') {
          barcodeGenerators.generateQrDataUrl(nextVal).then((url) => {
            if (url && active._element) active.setSrc(url, () => canvasRef.current?.renderAll());
          });
        } else if (nextType === 'ean13') {
          newUrl = barcodeGenerators.generateEan13DataUrl(nextVal);
        } else if (nextType === 'code39') {
          newUrl = barcodeGenerators.generateCode39DataUrl(nextVal);
        } else {
          newUrl = barcodeGenerators.generateCode128DataUrl(nextVal);
        }

        if (newUrl && active._element) {
          active.setSrc(newUrl, () => canvasRef.current?.renderAll());
        }
      } else {
        active.set(property, value);
      }

      active.setCoords();
      syncSelection(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    },
    [canvasRef, pxPerMm, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  const handleBringForward = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.bringForward(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleSendBackward = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.sendBackwards(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleDuplicate = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (!active) return;

    active.clone((cloned: fabric.Object) => {
      if (!canvasRef.current) return;
      cloned.set({
        left: (active.left || 0) + 10 * pxPerMm,
        top: (active.top || 0) + 10 * pxPerMm,
        evented: true,
      });
      canvasRef.current.add(cloned);
      canvasRef.current.setActiveObject(cloned);
      syncSelection(cloned);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    });
  }, [canvasRef, pxPerMm, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  const handleDelete = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      if ((active as any).isEditing) (active as any).exitEditing();
      const objectsToRemove = active.type === 'activeSelection'
        ? (active as fabric.ActiveSelection).getObjects()
        : [active];
      canvasRef.current.remove(...objectsToRemove);
      canvasRef.current.discardActiveObject();
      setSelectedObject(null);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    }
  }, [canvasRef, setSelectedObject, saveCanvasHistory, triggerRenderSimulation]);

  return {
    handleUpdateProperty,
    handleBringForward,
    handleSendBackward,
    handleDuplicate,
    handleDelete,
  };
}
