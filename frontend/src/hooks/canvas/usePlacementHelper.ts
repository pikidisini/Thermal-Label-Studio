import { useCallback } from 'react';
import type { fabric } from 'fabric';
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useContractStore } from '../../store/useContractStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { CANVAS_SERIALIZE_PROPS } from '../../types/fabric-custom';

export function usePlacementHelper(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  pxPerMm = 4
) {
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { setSelectedObject } = useStudioStore();
  const { updateUsedTokensFromCanvas } = useContractStore();
  const { pushState, isLocked } = useHistoryStore();

  const syncSelection = useCallback(
    (obj: any) => {
      if (!obj) {
        setSelectedObject(null);
        return;
      }
      setSelectedObject({
        ...obj,
        _target: obj,
        id: obj.id || null,
        left: obj.left,
        top: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        strokeWidth: obj.strokeWidth,
        fontSize: obj.fontSize,
        fill: obj.fill,
        fontFamily: obj.fontFamily,
        fontWeight: obj.fontWeight,
        fontStyle: obj.fontStyle,
        textAlign: obj.textAlign || 'left',
        underline: !!obj.underline,
        type: obj.type,
        isBarcode: obj.isBarcode,
        barcodeType: obj.barcodeType,
        barcodeValue: obj.barcodeValue,
        dataQr: obj.dataQr,
        dataBarcode: obj.dataBarcode,
        dataField: obj.dataField,
        isGhsSymbol: obj.isGhsSymbol,
        isDynamic: obj.isDynamic,
      } as any);
      if (canvasRef.current) {
        updateUsedTokensFromCanvas(canvasRef.current);
      }
    },
    [setSelectedObject, updateUsedTokensFromCanvas, canvasRef]
  );

  const saveCanvasHistory = useCallback(() => {
    if (!canvasRef.current || isLocked) return;
    try {
      const json = canvasRef.current.toJSON(CANVAS_SERIALIZE_PROPS as any);
      const jsonStr = JSON.stringify(json);
      pushState(jsonStr);
    } catch (err) {
      console.warn('History snapshot error:', err);
    }
  }, [canvasRef, isLocked, pushState]);

  const getStrategicPlacement = useCallback(
    (elementWidthMm = 30, elementHeightMm = 15, preferredQuadrant = 'center') => {
      const marginMm = 4;
      const availWMm = Math.max(10, labelWidthMm - 2 * marginMm);
      const availHMm = Math.max(10, labelHeightMm - 2 * marginMm);

      const objCount = canvasRef.current ? canvasRef.current.getObjects().length : 0;
      const stagger = (objCount % 5) * 4;

      let leftMm = marginMm;
      let topMm = marginMm;

      if (preferredQuadrant === 'top-left') {
        leftMm = Math.min(availWMm - elementWidthMm + marginMm, marginMm + stagger);
        topMm = Math.min(availHMm - elementHeightMm + marginMm, marginMm + stagger);
      } else if (preferredQuadrant === 'top-right') {
        leftMm = Math.max(marginMm, labelWidthMm - marginMm - elementWidthMm - (stagger % 12));
        topMm = Math.min(availHMm - elementHeightMm + marginMm, marginMm + stagger);
      } else {
        leftMm = Math.max(
          marginMm,
          Math.min(
            labelWidthMm - marginMm - elementWidthMm,
            (labelWidthMm - elementWidthMm) / 2 + (stagger - 6)
          )
        );
        topMm = Math.max(
          marginMm,
          Math.min(
            labelHeightMm - marginMm - elementHeightMm,
            (labelHeightMm - elementHeightMm) / 2 + (stagger - 6)
          )
        );
      }

      return {
        leftPx: Math.max(0, leftMm * pxPerMm),
        topPx: Math.max(0, topMm * pxPerMm),
      };
    },
    [labelWidthMm, labelHeightMm, pxPerMm, canvasRef]
  );

  return { syncSelection, saveCanvasHistory, getStrategicPlacement };
}
