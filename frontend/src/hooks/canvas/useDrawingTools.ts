import { fabric } from 'fabric';
import { barcodeGenerators } from '../../utils/barcodeGenerators';
import { createTableModel, resizeTable } from '../../features/table/model/tableModelV2';
import { makeTableGroupV2 } from '../../features/table/canvas/tableRenderer';
import { useStudioStore } from '../../store/useStudioStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { CANVAS_SERIALIZE_PROPS } from '../../types/fabric-custom';
import { LINE_STYLE_DASH } from '../../features/line/model/lineModel';
import { createLinePreview, finalizeLine, isMeaningfulLine, updateLinePreview } from '../../features/line/canvas/lineDrawingController';
import { snapLineEnd } from '../../features/line/editor/lineGeometry';
import { createLineAnchorOverlay, type AnchorOverlayApi } from '../../features/line/ui/lineAnchorOverlay';
import { snapExactLineEndpoint, snapLinePoint } from '../../features/snapping/canvas/fabricSnapping';
import { createSmartGuideOverlay, type SmartGuideOverlay } from '../../features/snapping/ui/smartGuideOverlay';

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
  let tableGesture: { start: { x: number; y: number }; clientX: number; clientY: number; rows: number; columns: number } | null = null;
  let tablePreview: any = null;
  let tableSizeLabel: HTMLDivElement | null = null;

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
    if (currentTool === 'table') {
      const tablePtr = fabricCanvas.getPointer(e);
      const size = useStudioStore.getState().pendingTableSize;
      if (!size) return;
      const sheetWidth = optionsRef.current.labelWidthMm * optionsRef.current.pxPerMm;
      const sheetHeight = optionsRef.current.labelHeightMm * optionsRef.current.pxPerMm;
      if (tablePtr.x < 0 || tablePtr.y < 0 || tablePtr.x > sheetWidth || tablePtr.y > sheetHeight) return;
      tableGesture = { start: tablePtr, clientX: e.clientX, clientY: e.clientY, rows: size.rows, columns: size.columns };
      optionsRef.current.isTablePlacementGesture = true;
      fabricCanvas.selection = false;
      e.preventDefault();
      return;
    }
    isDrawing = true;
    const snappedStartResult = currentTool === 'line' ? snapLinePoint(fabricCanvas, ptr, snapConfig(), e.altKey) : { point: ptr, guides: [] };
    const snappedStart = snappedStartResult.point;
    if (currentTool === 'line') showGuides(snappedStartResult.guides);
    drawStartPos = armedLineAnchor ? { ...armedLineAnchor } : snappedStart;
    armedLineAnchor = null;
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'rect') {
      const rect = new fabric.Rect({
        left: ptr.x,
        top: ptr.y,
        width: 1,
        height: 1,
        fill: 'transparent',
        stroke: '#000000',
        strokeWidth: 0.5 * curPxPerMm,
      });
      previewShape = rect;
      fabricCanvas.add(rect);
    } else if (currentTool === 'line') {
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
    if (tableGesture) {
      const e = opt.e as MouseEvent;
      const ptr = fabricCanvas.getPointer(e);
      const moved = Math.hypot(e.clientX - tableGesture.clientX, e.clientY - tableGesture.clientY) >= 4;
      if (!moved) return;
      const sheetWidth = optionsRef.current.labelWidthMm * optionsRef.current.pxPerMm;
      const sheetHeight = optionsRef.current.labelHeightMm * optionsRef.current.pxPerMm;
      const left = Math.max(0, Math.min(tableGesture.start.x, ptr.x));
      const top = Math.max(0, Math.min(tableGesture.start.y, ptr.y));
      const right = Math.min(sheetWidth, Math.max(tableGesture.start.x, ptr.x));
      const bottom = Math.min(sheetHeight, Math.max(tableGesture.start.y, ptr.y));
      const widthMm = (right - left) / optionsRef.current.pxPerMm;
      const heightMm = (bottom - top) / optionsRef.current.pxPerMm;
      const base = createTableModel(tableGesture.rows, tableGesture.columns, 60 / tableGesture.columns, 24 / tableGesture.rows);
      const model = widthMm === 60 && heightMm === 24 ? base : resizeTable(base, widthMm, heightMm);
      if (!model) { if (tablePreview) { fabricCanvas.remove(tablePreview); tablePreview = null; } tableSizeLabel?.remove(); tableSizeLabel = null; return; }
      if (tablePreview) fabricCanvas.remove(tablePreview);
      tablePreview = makeTableGroupV2(model, optionsRef.current.pxPerMm, { left, top }) as any;
      tablePreview.set({ opacity: 0.35, selectable: false, evented: false });
      tablePreview.isTablePlacementPreview = true;
      fabricCanvas.add(tablePreview);
      if (!tableSizeLabel) {
        tableSizeLabel = document.createElement('div');
        tableSizeLabel.dataset.testid = 'table-placement-dimensions';
        tableSizeLabel.style.cssText = 'position:fixed;z-index:1001;pointer-events:none;padding:3px 6px;background:#172033;color:#fff;border:1px solid #7b91ae;border-radius:3px;font:11px Arial;';
        document.body.appendChild(tableSizeLabel);
      }
      tableSizeLabel.textContent = `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`;
      tableSizeLabel.style.left = `${e.clientX + 12}px`;
      tableSizeLabel.style.top = `${e.clientY + 12}px`;
      fabricCanvas.requestRenderAll();
      return;
    }
    if (!isDrawing || !previewShape) return;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const start = drawStartPos;
    const currentTool = optionsRef.current.activeTool;

    if (currentTool === 'rect' && previewShape instanceof fabric.Rect) {
      const w = Math.abs(ptr.x - start.x);
      const h = Math.abs(ptr.y - start.y);
      previewShape.set({
        left: Math.min(start.x, ptr.x),
        top: Math.min(start.y, ptr.y),
        width: Math.max(4, w),
        height: Math.max(4, h),
      });
      fabricCanvas.renderAll();
    } else if (currentTool === 'line' && previewShape instanceof fabric.Line) {
      // Test raw pointer first: an exact endpoint connection wins even when
      // Shift would otherwise rotate the point away from a non-45 degree line.
      const exact = snapExactLineEndpoint(fabricCanvas, ptr, snapConfig(), e.altKey);
      const snapped = exact || snapLinePoint(fabricCanvas, snapLineEnd(start, { x: ptr.x, y: ptr.y }, Boolean(e.shiftKey)), snapConfig(), e.altKey);
      updateLinePreview(previewShape, snapped.point); showGuides(snapped.guides);
      fabricCanvas.renderAll();
    }
  };

  const handleMouseUp = (opt: any) => {
    if (tableGesture) {
      const gesture = tableGesture;
      tableGesture = null;
      const e = opt.e as MouseEvent;
      const ptr = fabricCanvas.getPointer(e);
      const moved = Math.hypot(e.clientX - gesture.clientX, e.clientY - gesture.clientY) >= 4;
      const sheetWidth = optionsRef.current.labelWidthMm * optionsRef.current.pxPerMm;
      const sheetHeight = optionsRef.current.labelHeightMm * optionsRef.current.pxPerMm;
      let left: number, top: number, widthMm: number, heightMm: number;
      if (moved) {
        left = Math.max(0, Math.min(gesture.start.x, ptr.x));
        top = Math.max(0, Math.min(gesture.start.y, ptr.y));
        widthMm = Math.max(0, Math.min(sheetWidth, Math.max(gesture.start.x, ptr.x)) - left) / optionsRef.current.pxPerMm;
        heightMm = Math.max(0, Math.min(sheetHeight, Math.max(gesture.start.y, ptr.y)) - top) / optionsRef.current.pxPerMm;
      } else {
        const minWidth = gesture.columns, minHeight = gesture.rows;
        widthMm = Math.min(60, optionsRef.current.labelWidthMm);
        heightMm = Math.min(24, optionsRef.current.labelHeightMm);
        left = Math.min(gesture.start.x, sheetWidth - widthMm * optionsRef.current.pxPerMm);
        top = Math.min(gesture.start.y, sheetHeight - heightMm * optionsRef.current.pxPerMm);
        left = Math.max(0, left); top = Math.max(0, top);
        if (widthMm < minWidth || heightMm < minHeight) { cancelAndExitTablePlacement(); window.alert('Ukuran label terlalu kecil untuk tabel yang dipilih.'); return; }
      }
      if (widthMm < gesture.columns || heightMm < gesture.rows) { cancelAndExitTablePlacement(); window.alert('Ruang tidak cukup. Setiap kolom dan baris memerlukan minimal 1 mm.'); return; }
      const base = createTableModel(gesture.rows, gesture.columns, 60 / gesture.columns, 24 / gesture.rows);
      const model = widthMm === 60 && heightMm === 24 ? base : resizeTable(base, widthMm, heightMm);
      if (!model) { cancelAndExitTablePlacement(); window.alert('Ukuran tabel tidak valid pada label ini.'); return; }
      if (tablePreview) fabricCanvas.remove(tablePreview);
      tablePreview = makeTableGroupV2(model, optionsRef.current.pxPerMm, { left, top }) as any;
      tablePreview.isTablePlacementPreview = false;
      tablePreview.set({ opacity: 1, selectable: true, evented: true });
      fabricCanvas.add(tablePreview);
      optionsRef.current.isTablePlacementGesture = false;
      fabricCanvas.selection = true;
      fabricCanvas.setActiveObject(tablePreview);
      syncSelection(tablePreview);
      optionsRef.current.triggerRenderSimulation?.();
      fabricCanvas.requestRenderAll();
      tablePreview = null;
      tableSizeLabel?.remove(); tableSizeLabel = null;
      useStudioStore.getState().setPendingTableSize(null);
      optionsRef.current.setActiveTool('select');
      return;
    }
    if (!isDrawing) return;
    isDrawing = false;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const currentTool = optionsRef.current.activeTool;
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'text') {
      const text = new fabric.IText('New Label Text', {
        left: ptr.x,
        top: ptr.y,
        fontFamily: 'Arial',
        fontSize: 4 * curPxPerMm,
        fill: '#000000',
      });
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

  const cancelTablePlacement = () => {
    if (tablePreview) { fabricCanvas.remove(tablePreview); tablePreview = null; }
    tableSizeLabel?.remove(); tableSizeLabel = null;
    tableGesture = null;
    optionsRef.current.isTablePlacementGesture = false;
    fabricCanvas.selection = true;
    fabricCanvas.requestRenderAll();
  };
  const cancelAndExitTablePlacement = () => { cancelTablePlacement(); useStudioStore.getState().setPendingTableSize(null); optionsRef.current.setActiveTool('select'); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="btn-add-table"]')?.focus()); };
  const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && (tableGesture || useStudioStore.getState().pendingTableSize)) { event.preventDefault(); cancelAndExitTablePlacement(); } };
  const cancelLineDrawing = (preserveTool = false) => { if (previewShape) fabricCanvas.remove(previewShape); previewShape = null; pendingLineBeforeState = null; isDrawing = false; armedLineAnchor = null; smartGuideOverlay?.clear(); fabricCanvas.discardActiveObject(); fabricCanvas.selection = !preserveTool; if (!preserveTool) fabricCanvas.skipTargetFind = linePreviousSkipTargetFind; fabricCanvas.requestRenderAll(); if (!preserveTool) optionsRef.current.setActiveTool('select'); };
  const onEscapeWithLine = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && optionsRef.current.activeTool === 'line') {
      event.preventDefault();
      if (isDrawing || armedLineAnchor) { armedLineAnchor = null; cancelLineDrawing(true); renderLineAnchors(); }
      else cancelLineDrawing(false);
    } else onEscape(event);
  };
  const onLinePointerCancel = () => { if (isDrawing) cancelLineDrawing(true); };
  const onLineWindowBlur = () => { if (isDrawing) cancelLineDrawing(true); };
  const onLineWindowPointerUp = (event: PointerEvent) => { if (isDrawing) { const target = event.target as HTMLElement | null; if (target?.closest('[data-testid="line-anchor"]') && anchorPreviewStarted) { anchorPreviewStarted = false; return; } handleMouseUp({ e: event }); } };
  const onPointerCancel = () => { if (tableGesture) cancelAndExitTablePlacement(); };
  const onWindowBlur = () => { if (tableGesture) cancelAndExitTablePlacement(); };
  const onVisibilityChange = () => { if (document.visibilityState === 'hidden' && tableGesture) cancelAndExitTablePlacement(); };
  const onWindowPointerUp = (event: PointerEvent) => { if (tableGesture) handleMouseUp({ e: event }); };
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
    if (state.activeTool !== 'table' && previous.activeTool === 'table') {
      if (tableGesture) cancelTablePlacement();
      useStudioStore.getState().setPendingTableSize(null);
    }
    if (state.activeTool !== 'line' && previous.activeTool === 'line') { fabricCanvas.skipTargetFind = linePreviousSkipTargetFind; cancelLineDrawing(true); fabricCanvas.selection = true; fabricCanvas.off('after:render', renderLineAnchors); window.removeEventListener('resize', renderLineAnchors); lineHud?.remove(); lineHud = null; lineAnchorOverlay?.destroy(); lineAnchorOverlay = null; smartGuideOverlay?.destroy(); smartGuideOverlay = null; }
  });
  document.addEventListener('keydown', onEscapeWithLine);
  fabricCanvas.upperCanvasEl.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointerup', onLineWindowPointerUp);
  window.addEventListener('pointercancel', onLinePointerCancel);
  window.addEventListener('blur', onLineWindowBlur);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    cancelTablePlacement();
    fabricCanvas.off('after:render', renderLineAnchors); window.removeEventListener('resize', renderLineAnchors);
    lineHud?.remove(); lineHud = null; lineAnchorOverlay?.destroy(); lineAnchorOverlay = null; smartGuideOverlay?.destroy(); smartGuideOverlay = null;
    unsubscribeTool();
    document.removeEventListener('keydown', onEscapeWithLine);
    fabricCanvas.upperCanvasEl.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointerup', onLineWindowPointerUp);
    window.removeEventListener('pointercancel', onLinePointerCancel);
    window.removeEventListener('blur', onLineWindowBlur);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    fabricCanvas.off('mouse:down', handleMouseDown);
    fabricCanvas.off('mouse:move', handleMouseMove);
    fabricCanvas.off('mouse:up', handleMouseUp);
  };
}
