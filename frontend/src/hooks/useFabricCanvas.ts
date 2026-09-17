import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useStudioStore } from '../store/useStudioStore';
import { useTemplateStore } from '../store/useTemplateStore';
import { useContractStore } from '../store/useContractStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { CANVAS_SERIALIZE_PROPS } from '../types/fabric-custom';
import { applySnappingAndGuides } from './canvas/useSnapGuides';
import { attachDrawingToolListeners } from './canvas/useDrawingTools';

interface UseFabricCanvasProps {
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm?: number;
  gridSizeMm?: number;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  triggerRenderSimulation?: () => void;
  drawRulers?: (mouseX?: number, mouseY?: number) => void;
}

export function useFabricCanvas({
  canvasElRef,
  canvasContainerRef,
  canvasRef,
  pxPerMm = 4,
  gridSizeMm = 2.5,
  onCanvasReady,
  triggerRenderSimulation,
  drawRulers,
}: UseFabricCanvasProps) {
  const {
    zoom,
    activeTool,
    setActiveTool,
    isSnapEnabled,
    areGuidesEnabled,
    setSelectedObject,
    setCursorPos,
  } = useStudioStore();

  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { updateUsedTokensFromCanvas } = useContractStore();
  const { pushState, isLocked } = useHistoryStore();

  const optionsRef = useRef({
    pxPerMm,
    gridSizeMm,
    labelWidthMm,
    labelHeightMm,
    isSnapEnabled,
    areGuidesEnabled,
    activeTool,
    isLocked,
    setSelectedObject,
    setCursorPos,
    setActiveTool,
    triggerRenderSimulation,
    drawRulers,
    updateUsedTokensFromCanvas,
    pushState,
  });

  optionsRef.current = {
    pxPerMm,
    gridSizeMm,
    labelWidthMm,
    labelHeightMm,
    isSnapEnabled,
    areGuidesEnabled,
    activeTool,
    isLocked,
    setSelectedObject,
    setCursorPos,
    setActiveTool,
    triggerRenderSimulation,
    drawRulers,
    updateUsedTokensFromCanvas,
    pushState,
  };

  useEffect(() => {
    if (!canvasElRef.current) return;

    const initialCanvasWidth = optionsRef.current.labelWidthMm * optionsRef.current.pxPerMm;
    const initialCanvasHeight = optionsRef.current.labelHeightMm * optionsRef.current.pxPerMm;

    const fabricCanvas = new fabric.Canvas(canvasElRef.current, {
      width: initialCanvasWidth * zoom,
      height: initialCanvasHeight * zoom,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      fireRightClick: true,
      stopContextMenu: true,
    });
    fabricCanvas.setZoom(zoom);

    fabric.Object.prototype.set({
      borderColor: '#3b82f6',
      cornerColor: '#ffffff',
      cornerStrokeColor: '#3b82f6',
      cornerStyle: 'rect',
      cornerSize: 8,
      transparentCorners: false,
      padding: 2,
    });

    fabricCanvas.on('mouse:down:before', () => {
      fabricCanvas.calcOffset();
    });

    const syncSelection = (obj: any) => {
      if (!obj) {
        optionsRef.current.setSelectedObject(null);
        return;
      }
      optionsRef.current.setSelectedObject({
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
      optionsRef.current.updateUsedTokensFromCanvas(fabricCanvas);
    };

    const handleCanvasModified = () => {
      if (!optionsRef.current.isLocked) {
        try {
          const json = fabricCanvas.toJSON(CANVAS_SERIALIZE_PROPS as any);
          optionsRef.current.pushState(JSON.stringify(json));
        } catch (e) {
          console.warn('History capture notice:', e);
        }
      }
      if (fabricCanvas.getActiveObject()) {
        syncSelection(fabricCanvas.getActiveObject());
      }
      optionsRef.current.triggerRenderSimulation?.();
    };

    fabricCanvas.on('selection:created', (e) => syncSelection(e.selected ? e.selected[0] : null));
    fabricCanvas.on('selection:updated', (e) => syncSelection(e.selected ? e.selected[0] : null));
    fabricCanvas.on('selection:cleared', () => syncSelection(null));
    fabricCanvas.on('object:modified', handleCanvasModified);
    fabricCanvas.on('object:added', handleCanvasModified);
    fabricCanvas.on('object:removed', handleCanvasModified);

    fabricCanvas.on('object:moving', (e) => {
      if (!e.target) return;
      applySnappingAndGuides({
        obj: e.target,
        isSnapEnabled: optionsRef.current.isSnapEnabled,
        areGuidesEnabled: optionsRef.current.areGuidesEnabled,
        gridSizeMm: optionsRef.current.gridSizeMm,
        pxPerMm: optionsRef.current.pxPerMm,
        labelWidthMm: optionsRef.current.labelWidthMm,
        labelHeightMm: optionsRef.current.labelHeightMm,
      });
    });

    fabricCanvas.on('mouse:move', (opt) => {
      const ptr = fabricCanvas.getPointer(opt.e);
      const opts = optionsRef.current;
      const xMm = Math.max(0, Math.min(opts.labelWidthMm, ptr.x / opts.pxPerMm)).toFixed(1);
      const yMm = Math.max(0, Math.min(opts.labelHeightMm, ptr.y / opts.pxPerMm)).toFixed(1);
      opts.setCursorPos({ xMm, yMm });
      if (opt.e && opts.drawRulers) {
        opts.drawRulers(opt.e.clientX, opt.e.clientY);
      }
    });

    attachDrawingToolListeners({
      fabricCanvas,
      canvasContainerRef,
      optionsRef,
      syncSelection,
    });

    canvasRef.current = fabricCanvas;
    onCanvasReady?.(fabricCanvas);

    return () => {
      fabricCanvas.dispose();
      canvasRef.current = null;
    };
  }, [canvasElRef, canvasRef, onCanvasReady]);
}
