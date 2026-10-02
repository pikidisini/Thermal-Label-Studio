import { fabric } from 'fabric';
import { barcodeGenerators } from '../../features/barcode';
import { useStudioStore } from '../../store/useStudioStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { CANVAS_SERIALIZE_PROPS } from '../../types/fabric-custom';
import { LINE_STYLE_DASH, createLineAnchorOverlay, createLinePreview, finalizeLine, isMeaningfulLine, snapLineEnd, type AnchorOverlayApi, updateLinePreview } from '../../features/line';
import { createSmartGuideOverlay, snapExactLineEndpoint, snapLinePoint, type SmartGuideOverlay } from '../../features/snapping';
import { createTextObject } from '../../features/text';

interface UseDrawingToolsProps {
  fabricCanvas: fabric.Canvas;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  optionsRef: React.MutableRefObject<any>;
  syncSelection: (obj: any) => void;
}

export function attachDrawingToolListeners({
  fabricCanvas,
  canvasContainerRef,
  optionsRef,
  syncSelection,
}: UseDrawingToolsProps) {
  let isDrawing = false;
  let drawStartPos = { x: 0, y: 0 };
  let previewShape: fabric.Object | null = null;
  let pendingLineBeforeState: string | null = null;
  let lineWidthMm = 0.5;
  let lineAnchorOverlay: AnchorOverlayApi | null = null;
  let smartGuideOverlay: SmartGuideOverlay | null = null;
  let armedLineAnchor: { x: number; y: number } | null = null;
  let anchorPreviewStarted = false;
  const renderLineAnchors = () => {
    if (!lineAnchorOverlay) return;
    const lines = fabricCanvas.getObjects().filter((o): o is fabric.Line => o.type === 'line' && !(o as any).isLineDrawingPreview);
    lineAnchorOverlay.update(lines, armedLineAnchor);
  };
  let linePreviousSkipTargetFind = false;
  let lineHud: HTMLDivElement | null = null;

  const getCanvasPointer = (e: MouseEvent) => {
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const currentZoom = fabricCanvas.getZoom() || 1.0;
      const x = (e.clientX - rect.left) / currentZoom;
      const y = (e.clientY - rect.top) / currentZoom;
      return { x, y };
    }
    return fabricCanvas.getPointer(e);
  };
  const snapConfig = () => {
    const zoom = fabricCanvas.getZoom() || 1;
    const pxPerMm = optionsRef.current.pxPerMm || 1;
    // Drawing listeners outlive a React render. Read the toggle at gesture
    // time so a ribbon click immediately affects the next mouse event.
    return { enabled: useStudioStore.getState().isSnapEnabled, tolerance: 8 / zoom, gridStep: (optionsRef.current.gridSizeMm || 2.5) * pxPerMm, labelWidth: optionsRef.current.labelWidthMm * pxPerMm, labelHeight: optionsRef.current.labelHeightMm * pxPerMm, margin: 5 * pxPerMm };
  };
  const showGuides = (guides: any[]) => { if (useStudioStore.getState().areGuidesEnabled) smartGuideOverlay?.show(guides); else smartGuideOverlay?.clear(); };

  const handleMouseDown = (opt: any) => {
    const e = opt.e as MouseEvent;
    if (!e || e.button !== 0) return;
    const currentTool = optionsRef.current.activeTool;
    if (!currentTool || currentTool === 'select') return;

    const ptr = getCanvasPointer(e);
    if (currentTool === 'line' && isDrawing) return;
    isDrawing = true;
    const snappedStartResult = currentTool === 'line' ? snapLinePoint(fabricCanvas, ptr, snapConfig(), e.altKey) : { point: ptr, guides: [] };
    const snappedStart = snappedStartResult.point;
    if (currentTool === 'line') showGuides(snappedStartResult.guides);
    drawStartPos = armedLineAnchor ? { ...armedLineAnchor } : snappedStart;
    armedLineAnchor = null;
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'line') {
      // Establish the pre-gesture checkpoint because the transient preview is
      // deliberately excluded from object-added history and draft recovery.
      pendingLineBeforeState = JSON.stringify(fabricCanvas.toJSON(CANVAS_SERIALIZE_PROPS as any));
      const line = createLinePreview({ x: drawStartPos.x, y: drawStartPos.y }, lineWidthMm * curPxPerMm);
      (line as any).isLineDrawingPreview = true;
      previewShape = line;
      fabricCanvas.add(line);
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
    }
  };

  const handleMouseMove = (opt: any) => {
    if (!isDrawing || !previewShape) return;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const start = drawStartPos;
    const currentTool = optionsRef.current.activeTool;

    if (currentTool === 'line' && previewShape instanceof fabric.Line) {
      // Test raw pointer first: an exact endpoint connection wins even when
      // Shift would otherwise rotate the point away from a non-45 degree line.
      const exact = snapExactLineEndpoint(fabricCanvas, ptr, snapConfig(), e.altKey);
      const snapped = exact || snapLinePoint(fabricCanvas, snapLineEnd(start, { x: ptr.x, y: ptr.y }, Boolean(e.shiftKey)), snapConfig(), e.altKey);
      updateLinePreview(previewShape, snapped.point); showGuides(snapped.guides);
      fabricCanvas.renderAll();
    }
  };

  const handleMouseUp = (opt: any) => {
    if (!isDrawing) return;
    isDrawing = false;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const currentTool = optionsRef.current.activeTool;
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'text') {
      const text = createTextObject({ left: ptr.x, top: ptr.y, fontSize: 4 * curPxPerMm });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      syncSelection(text);
      fabricCanvas.renderAll();
      optionsRef.current.setActiveTool('select');
    } else if (currentTool === 'barcode') {
      const dataUrl = barcodeGenerators.generateCode128DataUrl('12345678', {
        barWidth: 2,
        barHeight: 40,
      });
      if (dataUrl) {
        fabric.Image.fromURL(dataUrl, (img) => {
          img.set({
            left: ptr.x,
            top: ptr.y,
            scaleX: 0.8,
            scaleY: 0.8,
            isBarcode: true,
            barcodeType: 'code128',
            barcodeValue: '12345678',
            dataBarcode: '12345678',
            payloadTemplate: '12345678',
          } as any);
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          syncSelection(img);
          fabricCanvas.renderAll();
          optionsRef.current.setActiveTool('select');
        });
      }
    } else if (previewShape) {
      if (currentTool === 'line' && previewShape instanceof fabric.Line) {
        const exact = snapExactLineEndpoint(fabricCanvas, ptr, snapConfig(), e.altKey);
        const finalEnd = exact || snapLinePoint(fabricCanvas, snapLineEnd(drawStartPos, ptr, Boolean(e.shiftKey)), snapConfig(), e.altKey);
        updateLinePreview(previewShape, finalEnd.point);
      }
      if (currentTool === 'line' && previewShape instanceof fabric.Line && !isMeaningfulLine(previewShape)) {
        fabricCanvas.remove(previewShape);
        previewShape = null;
        armedLineAnchor = null;
        pendingLineBeforeState = null;
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        return;
      }
      if (currentTool === 'line' && previewShape instanceof fabric.Line) finalizeLine(previewShape);
      if (currentTool !== 'line') fabricCanvas.setActiveObject(previewShape);
      (previewShape as any).isLineDrawingPreview = false;
      syncSelection(previewShape);
      const committedLine = previewShape;
      previewShape = null;
      if (pendingLineBeforeState) {
        const history = useHistoryStore.getState();
        if (history.undoStack[history.undoStack.length - 1] !== pendingLineBeforeState) optionsRef.current.pushState(pendingLineBeforeState);
      }
      pendingLineBeforeState = null;
      fabricCanvas.fire('object:modified', { target: committedLine });
      fabricCanvas.renderAll();
      smartGuideOverlay?.clear();
      if (currentTool === 'line') {
        const committed = committedLine as fabric.Line;
        armedLineAnchor = null;
        renderLineAnchors();
        fabricCanvas.selection = false;
        // Keep the line tool active for a connected next segment. Alt-click
        // starts a fresh segment; Escape exits the chain and restores select.
      } else optionsRef.current.setActiveTool('select');
    }
  };

  fabricCanvas.on('mouse:down', handleMouseDown);
  fabricCanvas.on('mouse:move', handleMouseMove);
  fabricCanvas.on('mouse:up', handleMouseUp);

  const cancelLineDrawing = (preserveTool = false) => { if (previewShape) fabricCanvas.remove(previewShape); previewShape = null; pendingLineBeforeState = null; isDrawing = false; armedLineAnchor = null; smartGuideOverlay?.clear(); fabricCanvas.discardActiveObject(); fabricCanvas.selection = !preserveTool; if (!preserveTool) fabricCanvas.skipTargetFind = linePreviousSkipTargetFind; fabricCanvas.requestRenderAll(); if (!preserveTool) optionsRef.current.setActiveTool('select'); };
  const onEscapeWithLine = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && optionsRef.current.activeTool === 'line') {
      event.preventDefault();
      if (isDrawing || armedLineAnchor) { armedLineAnchor = null; cancelLineDrawing(true); renderLineAnchors(); }
      else cancelLineDrawing(false);
    }
  };
  const onLinePointerCancel = () => { if (isDrawing) cancelLineDrawing(true); };
  const onLineWindowBlur = () => { if (isDrawing) cancelLineDrawing(true); };
  const onLineWindowPointerUp = (event: PointerEvent) => { if (isDrawing) { const target = event.target as HTMLElement | null; if (target?.closest('[data-testid="line-anchor"]') && anchorPreviewStarted) { anchorPreviewStarted = false; return; } handleMouseUp({ e: event }); } };
  const unsubscribeTool = useStudioStore.subscribe((state, previous) => {
    if (state.activeTool === 'line' && previous.activeTool !== 'line') {
      linePreviousSkipTargetFind = fabricCanvas.skipTargetFind;
      fabricCanvas.skipTargetFind = true;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      if (canvasContainerRef.current) { smartGuideOverlay = createSmartGuideOverlay(canvasContainerRef.current, fabricCanvas); lineAnchorOverlay = createLineAnchorOverlay(canvasContainerRef.current, fabricCanvas, (point, event) => { event.preventDefault(); event.stopPropagation(); if (isDrawing && previewShape instanceof fabric.Line) { updateLinePreview(previewShape, point); anchorPreviewStarted = false; renderLineAnchors(); return; } pendingLineBeforeState = JSON.stringify(fabricCanvas.toJSON(CANVAS_SERIALIZE_PROPS as any)); armedLineAnchor = point; drawStartPos = point; isDrawing = true; anchorPreviewStarted = true; const line = createLinePreview(point, lineWidthMm * (optionsRef.current.pxPerMm || 1)); previewShape = line; fabricCanvas.add(line); renderLineAnchors(); }); }
      renderLineAnchors();
      fabricCanvas.on('after:render', renderLineAnchors);
      window.addEventListener('resize', renderLineAnchors);
    }
    if (state.activeTool !== 'line' && previous.activeTool === 'line') { fabricCanvas.skipTargetFind = linePreviousSkipTargetFind; cancelLineDrawing(true); fabricCanvas.selection = true; fabricCanvas.off('after:render', renderLineAnchors); window.removeEventListener('resize', renderLineAnchors); lineHud?.remove(); lineHud = null; lineAnchorOverlay?.destroy(); lineAnchorOverlay = null; smartGuideOverlay?.destroy(); smartGuideOverlay = null; }
  });
  document.addEventListener('keydown', onEscapeWithLine);
  window.addEventListener('pointerup', onLineWindowPointerUp);
  window.addEventListener('pointercancel', onLinePointerCancel);
  window.addEventListener('blur', onLineWindowBlur);
  return () => {
    fabricCanvas.off('after:render', renderLineAnchors); window.removeEventListener('resize', renderLineAnchors);
    lineHud?.remove(); lineHud = null; lineAnchorOverlay?.destroy(); lineAnchorOverlay = null; smartGuideOverlay?.destroy(); smartGuideOverlay = null;
    unsubscribeTool();
    document.removeEventListener('keydown', onEscapeWithLine);
    window.removeEventListener('pointerup', onLineWindowPointerUp);
    window.removeEventListener('pointercancel', onLinePointerCancel);
    window.removeEventListener('blur', onLineWindowBlur);
    fabricCanvas.off('mouse:down', handleMouseDown);
    fabricCanvas.off('mouse:move', handleMouseMove);
    fabricCanvas.off('mouse:up', handleMouseUp);
  };
}
