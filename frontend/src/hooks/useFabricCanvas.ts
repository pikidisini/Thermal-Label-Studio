import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useStudioStore } from '../store/useStudioStore';
import { useTemplateStore } from '../store/useTemplateStore';
import { useContractStore } from '../store/useContractStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { CANVAS_SERIALIZE_PROPS } from '../types/fabric-custom';
import { snapMovingObject } from '../features/snapping/canvas/fabricSnapping';
import { createSmartGuideOverlay } from '../features/snapping/ui/smartGuideOverlay';
import { attachDrawingToolListeners } from './canvas/useDrawingTools';
import { parseTableModel, resizeTable } from '../features/table/model/tableModelV2';
import { makeTableGroupV2 } from '../features/table/canvas/tableRenderer';
import { attachTableFrameEditor } from '../features/table/editor/attachTableFrameEditor';

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
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;
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
    isTablePlacementGesture: false,
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
    isTablePlacementGesture: optionsRef.current.isTablePlacementGesture,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cursor = activeTool === 'table' || activeTool === 'line' ? 'crosshair' : 'default';
    canvas.upperCanvasEl.style.cursor = cursor;
    canvas.lowerCanvasEl.style.cursor = cursor;
  }, [activeTool, canvasRef]);

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
    fabricCanvas.lowerCanvasEl.tabIndex = 0;
    fabricCanvas.upperCanvasEl.tabIndex = 0;

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
        previewOverride: obj.previewOverride,
        validationError: obj.validationError,
      } as any);
      optionsRef.current.updateUsedTokensFromCanvas(fabricCanvas);
    };

    const tableTransformSnapshots = new WeakMap<object, any>();
    fabricCanvas.on('before:transform', (event: any) => {
      const target: any = event?.transform?.target;
      if (target?.isTable === true && target.tableVersion === 2) tableTransformSnapshots.set(target, { left: target.left, top: target.top, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle, flipX: target.flipX, flipY: target.flipY });
    });
    const handleCanvasModified = (event?: any) => {
      if (optionsRef.current.isTablePlacementGesture) return;
      const modified: any = event?.target;
      if (modified?.isTable === true && modified.tableVersion === 2 && !useStudioStore.getState().tableEditMode && (Math.abs(Number(modified.scaleX || 1) - 1) > 1e-6 || Math.abs(Number(modified.scaleY || 1) - 1) > 1e-6)) {
        const model = parseTableModel(modified.tableSpec);
        if (model) {
          const width = model.columnWidthsMm.reduce((sum, value) => sum + value, 0) * Math.abs(Number(modified.scaleX || 1));
          const height = model.rowHeightsMm.reduce((sum, value) => sum + value, 0) * Math.abs(Number(modified.scaleY || 1));
          const resized = resizeTable(model, width, height);
          if (!resized) {
            const original = tableTransformSnapshots.get(modified);
            if (original) { modified.set(original); modified.setCoords(); tableTransformSnapshots.delete(modified); }
            fabricCanvas.requestRenderAll(); syncSelection(modified); optionsRef.current.triggerRenderSimulation?.(); return;
          }
          const index = fabricCanvas.getObjects().indexOf(modified);
          const replacement: any = makeTableGroupV2(resized, optionsRef.current.pxPerMm, { left: modified.left || 0, top: modified.top || 0 });
          replacement.set({ angle: modified.angle || 0, flipX: !!modified.flipX || Number(modified.scaleX) < 0, flipY: !!modified.flipY || Number(modified.scaleY) < 0, opacity: modified.opacity ?? 1, visible: modified.visible !== false, selectable: modified.selectable !== false, evented: modified.evented !== false, lockMovementX: !!modified.lockMovementX, lockMovementY: !!modified.lockMovementY, lockRotation: !!modified.lockRotation, lockScalingX: !!modified.lockScalingX, lockScalingY: !!modified.lockScalingY, id: modified.id });
          const history = useHistoryStore.getState(); history.lockHistory();
          try { fabricCanvas.remove(modified); fabricCanvas.insertAt(replacement, Math.max(0, index), false); fabricCanvas.setActiveObject(replacement); }
          finally { history.unlockHistory(); }
          replacement.setCoords(); syncSelection(replacement);
          tableTransformSnapshots.delete(modified);
        }
      }
      if (!useHistoryStore.getState().isLocked) {
        if (event?.target?.isLineDrawingPreview) return;
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

    fabricCanvas.on('selection:created', (e) => { const obj = e.selected ? e.selected[0] : null; syncSelection(obj); });
    fabricCanvas.on('selection:updated', (e) => { const obj = e.selected ? e.selected[0] : null; syncSelection(obj); });
    fabricCanvas.on('selection:cleared', () => { syncSelection(null); });
    fabricCanvas.on('object:modified', handleCanvasModified);
    fabricCanvas.on('object:added', handleCanvasModified);
    fabricCanvas.on('object:removed', handleCanvasModified);
    const cleanupTableFrameEditor = attachTableFrameEditor({ fabricCanvas, getPxPerMm: () => optionsRef.current.pxPerMm, syncSelection, onCommit: () => { optionsRef.current.pushState(JSON.stringify(fabricCanvas.toJSON(CANVAS_SERIALIZE_PROPS as any))); optionsRef.current.triggerRenderSimulation?.(); } });
    const movingGuideOverlay = canvasContainerRef.current ? createSmartGuideOverlay(canvasContainerRef.current, fabricCanvas) : null;
    fabricCanvas.on('object:moving', (e) => {
      if (!e.target) return;
      const pxPerMm = optionsRef.current.pxPerMm || 1;
      const result = snapMovingObject(fabricCanvas, e.target, { enabled: Boolean(optionsRef.current.isSnapEnabled), tolerance: 8 / (fabricCanvas.getZoom() || 1), gridStep: (optionsRef.current.gridSizeMm || 2.5) * pxPerMm, labelWidth: optionsRef.current.labelWidthMm * pxPerMm, labelHeight: optionsRef.current.labelHeightMm * pxPerMm, margin: 5 * pxPerMm });
      if (optionsRef.current.areGuidesEnabled) movingGuideOverlay?.show(result.guides); else movingGuideOverlay?.clear();
    });
    fabricCanvas.on('object:modified', () => movingGuideOverlay?.clear());

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

    const cleanupDrawingTools = attachDrawingToolListeners({
      fabricCanvas,
      canvasContainerRef,
      optionsRef,
      syncSelection,
    });

    canvasRef.current = fabricCanvas;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed && canvasRef.current === fabricCanvas) onCanvasReadyRef.current?.(fabricCanvas);
    });

    return () => {
      disposed = true;
      cleanupTableFrameEditor();

      cleanupDrawingTools();
      movingGuideOverlay?.destroy();
      fabricCanvas.dispose();
      canvasRef.current = null;
    };
  }, [canvasElRef, canvasRef]);
}
