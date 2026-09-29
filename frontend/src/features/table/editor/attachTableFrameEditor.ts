import { fabric } from 'fabric';
import { useStudioStore } from '../../../store/useStudioStore';
import { useHistoryStore } from '../../../store/useHistoryStore';
import { parseTableModel, resizeInternal, expandTableRange, visibleHorizontalEdge, visibleVerticalEdge, setTableEdge, type TableModelV2, type TableRange } from '../model/tableModelV2';
import { makeTableGroupV2 } from '../canvas/tableRenderer';

type TableEditOriginals = Pick<fabric.Object, 'lockMovementX' | 'lockMovementY' | 'hasControls'>;
type TableFrameObject = fabric.Group & {
  id?: string;
  width: number;
  height: number;
  isTable: true;
  tableVersion: 2;
  tableSpec: TableModelV2;
  __tableEditOriginals?: TableEditOriginals;
};
type TablePointerEvent = { e: MouseEvent; target?: fabric.Object };
type TableCanvasObjectEvent = { target?: fabric.Object };

const asTableFrame = (object: fabric.Object | undefined): TableFrameObject | null => {
  if (!object) return null;
  const candidate = object as TableFrameObject;
  return candidate.isTable === true && candidate.tableVersion === 2 && !!parseTableModel(candidate.tableSpec) ? candidate : null;
};

export function attachTableFrameEditor(input: { fabricCanvas: fabric.Canvas; getPxPerMm: () => number; syncSelection: (object: fabric.Object | null) => void; onCommit: () => void }) {
  const { fabricCanvas, getPxPerMm, syncSelection, onCommit } = input;
  const tableEditOriginals = new WeakMap<object, TableEditOriginals>();
  const tableEditOriginalsById = new Map<string, TableEditOriginals>();
  const rangeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rangeSvg.setAttribute('aria-hidden', 'true');
  rangeSvg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:3000;overflow:visible;display:none;';
  const rangePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  rangePolygon.setAttribute('fill', 'rgba(14,165,233,0.18)');
  rangePolygon.setAttribute('stroke', '#0284c7');
  rangePolygon.setAttribute('stroke-width', '2');
  rangePolygon.setAttribute('stroke-dasharray', '5 3');
  rangeSvg.appendChild(rangePolygon);
  document.body.appendChild(rangeSvg);
  const drawRangeOverlay = (table: TableFrameObject, model: TableModelV2, range: TableRange) => {
    let x1 = 0, y1 = 0;
    for (let col = 0; col < range.colStart; col++) x1 += model.columnWidthsMm[col] * getPxPerMm();
    for (let row = 0; row < range.rowStart; row++) y1 += model.rowHeightsMm[row] * getPxPerMm();
    const width = model.columnWidthsMm.slice(range.colStart, range.colEnd + 1).reduce((sum: number, value: number) => sum + value, 0) * getPxPerMm();
    const height = model.rowHeightsMm.slice(range.rowStart, range.rowEnd + 1).reduce((sum: number, value: number) => sum + value, 0) * getPxPerMm();
    const matrix = table.calcTransformMatrix(); const viewport = fabricCanvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const rect = fabricCanvas.getElement().getBoundingClientRect();
    const points = [[x1, y1], [x1 + width, y1], [x1 + width, y1 + height], [x1, y1 + height]].map(([x, y]) => {
      const scene = fabric.util.transformPoint(new fabric.Point(x - table.width / 2, y - table.height / 2), matrix);
      const visible = fabric.util.transformPoint(scene, viewport);
      return `${visible.x + rect.left},${visible.y + rect.top}`;
    });
    rangeSvg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    rangePolygon.setAttribute('points', points.join(' ')); rangeSvg.style.display = 'block';
  };
  const refreshRangeOverlay = () => {
    const selection = useStudioStore.getState().tableEditSelection;
    if (!useStudioStore.getState().tableEditMode || !selection) { rangeSvg.style.display = 'none'; return; }
    const table = asTableFrame(fabricCanvas.getObjects().find(object => asTableFrame(object)?.id === selection.tableId));
    const model = table ? parseTableModel(table.tableSpec) : null;
    if (table && model) drawRangeOverlay(table, model, selection.range);
  };
  const applyTableEditMode = (enabled: boolean) => {
    fabricCanvas.getObjects().forEach((object) => {
      const table = asTableFrame(object);
      if (!table) return;
      if (enabled) {
        if (!tableEditOriginals.has(table)) {
          const previous = table.__tableEditOriginals || (table.id ? tableEditOriginalsById.get(table.id) : undefined) || { lockMovementX: table.lockMovementX, lockMovementY: table.lockMovementY, hasControls: table.hasControls };
          tableEditOriginals.set(table, previous); table.__tableEditOriginals = previous;
          if (table.id) tableEditOriginalsById.set(table.id, previous);
        }
        table.set({ lockMovementX: true, lockMovementY: true, hasControls: false });
      } else {
        const previous = tableEditOriginals.get(table) || table.__tableEditOriginals || (table.id ? tableEditOriginalsById.get(table.id) : undefined);
        table.set({ lockMovementX: previous?.lockMovementX ?? false, lockMovementY: previous?.lockMovementY ?? false, hasControls: previous?.hasControls ?? true });
        delete table.__tableEditOriginals;
        if (table.id) tableEditOriginalsById.delete(table.id);
      }
    });
    refreshRangeOverlay();
    fabricCanvas.requestRenderAll();
  };
  applyTableEditMode(useStudioStore.getState().tableEditMode);
  const unsubscribeTableEditMode = useStudioStore.subscribe((state, previous) => {
    if (state.tableEditMode !== previous.tableEditMode) applyTableEditMode(state.tableEditMode);
    else if (state.tableEditSelection !== previous.tableEditSelection) refreshRangeOverlay();
  });

  let tableDividerGesture: { table: TableFrameObject; model: TableModelV2; axis: 'row' | 'column'; boundary: number; start: number } | null = null;
  let tableRangeGesture: { table: TableFrameObject; row: number; col: number; model: TableModelV2 } | null = null;
  const localPoint = (table: TableFrameObject, pointer: { x: number; y: number }) => {
    const centered = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), fabric.util.invertTransform(table.calcTransformMatrix()));
    return { x: centered.x + table.width / 2, y: centered.y + table.height / 2 };
  };
  const cellAt = (model: TableModelV2, point: { x: number; y: number }) => {
    let x = 0, y = 0; let col = -1, row = -1;
    for (let index = 0; index < model.cols; index++) { x += model.columnWidthsMm[index] * getPxPerMm(); if (point.x < x) { col = index; break; } }
    for (let index = 0; index < model.rows; index++) { y += model.rowHeightsMm[index] * getPxPerMm(); if (point.y < y) { row = index; break; } }
    return { row, col };
  };
  const onTableEditDown = (rawEvent: unknown) => {
    const event = rawEvent as TablePointerEvent;
    const table = asTableFrame(event.target);
    if (!useStudioStore.getState().tableEditMode || event.e?.button !== 0 || !table) return;
    const model = parseTableModel(table.tableSpec);
    if (!model) return;
    const point = localPoint(table, fabricCanvas.getPointer(event.e));
    const matrix = table.calcTransformMatrix();
    const toleranceX = 8 / Math.max(0.1, fabricCanvas.getZoom() * Math.hypot(matrix[0], matrix[1]));
    const toleranceY = 8 / Math.max(0.1, fabricCanvas.getZoom() * Math.hypot(matrix[2], matrix[3]));
    let best: { axis: 'row' | 'column'; boundary: number; distance: number; coordinate: number; segment: number } | null = null;
    let edge = 0;
    for (let boundary = 1; boundary < model.cols; boundary++) {
      edge += model.columnWidthsMm[boundary - 1] * getPxPerMm();
      const distance = Math.abs(point.x - edge);
      const row = model.rowHeightsMm.findIndex((height, index) => point.y >= model.rowHeightsMm.slice(0, index).reduce((sum, item) => sum + item * getPxPerMm(), 0) && point.y < model.rowHeightsMm.slice(0, index + 1).reduce((sum, item) => sum + item * getPxPerMm(), 0));
      if (distance < toleranceX && row >= 0 && visibleVerticalEdge(model, row, boundary) && (!best || distance < best.distance)) best = { axis: 'column', boundary, distance, coordinate: point.x, segment: row };
    }
    edge = 0;
    for (let boundary = 1; boundary < model.rows; boundary++) {
      edge += model.rowHeightsMm[boundary - 1] * getPxPerMm();
      const distance = Math.abs(point.y - edge);
      const col = model.columnWidthsMm.findIndex((width, index) => point.x >= model.columnWidthsMm.slice(0, index).reduce((sum, item) => sum + item * getPxPerMm(), 0) && point.x < model.columnWidthsMm.slice(0, index + 1).reduce((sum, item) => sum + item * getPxPerMm(), 0));
      if (distance < toleranceY && col >= 0 && visibleHorizontalEdge(model, boundary, col) && (!best || distance < best.distance)) best = { axis: 'row', boundary, distance, coordinate: point.y, segment: col };
    }
    if (!best) {
      let selected: { target: { kind: 'horizontal' | 'vertical'; row: number; col: number }; distance: number } | null = null;
      let y = 0;
      for (let row = 0; row <= model.rows; row++) {
        let x = 0;
        for (let col = 0; col < model.cols; col++) {
          const width = model.columnWidthsMm[col] * getPxPerMm();
          const distance = Math.abs(point.y - y);
          if (point.x >= x && point.x <= x + width && distance < toleranceY && visibleHorizontalEdge(model, row, col) && (!selected || distance < selected.distance)) selected = { target: { kind: 'horizontal', row, col }, distance };
          x += width;
        }
        if (row < model.rows) y += model.rowHeightsMm[row] * getPxPerMm();
      }
      let x = 0;
      for (let col = 0; col <= model.cols; col++) {
        let y = 0;
        for (let row = 0; row < model.rows; row++) {
          const height = model.rowHeightsMm[row] * getPxPerMm();
          const distance = Math.abs(point.x - x);
          if (point.y >= y && point.y <= y + height && distance < toleranceX && visibleVerticalEdge(model, row, col) && (!selected || distance < selected.distance)) selected = { target: { kind: 'vertical', row, col }, distance };
          y += height;
        }
        if (col < model.cols) x += model.columnWidthsMm[col] * getPxPerMm();
      }
      if (selected) {
        useStudioStore.getState().setTableSelectedEdge({ tableId: table.id, target: selected.target });
        useStudioStore.getState().setTableEditSelection(null);
        fabricCanvas.setActiveObject(table); syncSelection(table);
        event.e.preventDefault(); event.e.stopPropagation();
        return;
      }
    }
    if (!best) {
      if (point.x < 0 || point.y < 0 || point.x >= table.width || point.y >= table.height) return;
      const cell = cellAt(model, point); if (cell.row < 0 || cell.col < 0) return;
      const previousSelection = useStudioStore.getState().tableEditSelection;
      if (event.e.shiftKey && previousSelection && previousSelection.tableId === table.id) {
        const anchor = { row: previousSelection.range.rowStart, col: previousSelection.range.colStart };
        const expanded = expandTableRange(model, { rowStart: Math.min(anchor.row, cell.row), rowEnd: Math.max(anchor.row, cell.row), colStart: Math.min(anchor.col, cell.col), colEnd: Math.max(anchor.col, cell.col) });
        if (expanded) useStudioStore.getState().setTableEditSelection({ tableId: table.id, range: expanded });
        useStudioStore.getState().setTableSelectedEdge(null);
        fabricCanvas.setActiveObject(table); syncSelection(table);
        event.e.preventDefault(); event.e.stopPropagation();
        return;
      }
      useStudioStore.getState().setTableSelectedEdge(null);
      tableRangeGesture = { table, row: cell.row, col: cell.col, model };
      const initialRange = expandTableRange(model, { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col }) || { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col };
      useStudioStore.getState().setTableEditSelection({ tableId: table.id, range: initialRange });
      fabricCanvas.setActiveObject(table); syncSelection(table);
      event.e.preventDefault(); event.e.stopPropagation();
      return;
    }
    useStudioStore.getState().setTableSelectedEdge({ tableId: table.id, target: best.axis === 'column' ? { kind: 'vertical', row: best.segment, col: best.boundary } : { kind: 'horizontal', row: best.boundary, col: best.segment } });
    tableDividerGesture = { table, model, axis: best.axis, boundary: best.boundary, start: best.coordinate };
    fabricCanvas.setActiveObject(table); syncSelection(table);
    event.e.preventDefault(); event.e.stopPropagation();
  };
  const onTableEditUp = (rawEvent: unknown) => {
    const event = rawEvent as { e: MouseEvent };
    tableRangeGesture = null;
    const gesture = tableDividerGesture; tableDividerGesture = null;
    if (!gesture) return;
    const point = localPoint(gesture.table, fabricCanvas.getPointer(event.e));
    const coordinate = gesture.axis === 'column' ? point.x : point.y;
    const next = resizeInternal(gesture.model, gesture.axis, gesture.boundary, (coordinate - gesture.start) / getPxPerMm());
    if (!next) return;
    const canvas = fabricCanvas; const current = gesture.table; const index = canvas.getObjects().indexOf(current);
    const replacement = makeTableGroupV2(next, getPxPerMm(), { left: current.left || 0, top: current.top || 0 }) as TableFrameObject;
    replacement.set({ angle: current.angle || 0, scaleX: current.scaleX || 1, scaleY: current.scaleY || 1, flipX: !!current.flipX, flipY: !!current.flipY, opacity: current.opacity ?? 1, visible: current.visible !== false, selectable: current.selectable !== false, evented: current.evented !== false, lockMovementX: !!current.lockMovementX, lockMovementY: !!current.lockMovementY, lockRotation: !!current.lockRotation, lockScalingX: !!current.lockScalingX, lockScalingY: !!current.lockScalingY, id: current.id });
    replacement.__tableEditOriginals = current.__tableEditOriginals;
    const history = useHistoryStore.getState(); history.lockHistory();
    try { canvas.remove(current); canvas.insertAt(replacement, Math.max(0, index), false); canvas.setActiveObject(replacement); }
    finally { history.unlockHistory(); }
    replacement.setCoords(); syncSelection(replacement);
    onCommit();
    canvas.requestRenderAll();
  };
  const onTableRangeMove = (rawEvent: unknown) => {
    const event = rawEvent as TablePointerEvent;
    const gesture = tableRangeGesture;
    if (!gesture) return;
    const point = localPoint(gesture.table, fabricCanvas.getPointer(event.e));
    const cell = cellAt(gesture.model, { x: Math.max(0, Math.min(gesture.table.width - 0.001, point.x)), y: Math.max(0, Math.min(gesture.table.height - 0.001, point.y)) });
    if (cell.row < 0 || cell.col < 0) return;
    const expanded = expandTableRange(gesture.model, { rowStart: Math.min(gesture.row, cell.row), rowEnd: Math.max(gesture.row, cell.row), colStart: Math.min(gesture.col, cell.col), colEnd: Math.max(gesture.col, cell.col) });
    if (expanded) useStudioStore.getState().setTableEditSelection({ tableId: gesture.table.id, range: expanded });
  };
  const cancelTableGestures = () => {
    tableDividerGesture = null; tableRangeGesture = null;
    useStudioStore.getState().setTableEditSelection(null);
    useStudioStore.getState().setTableSelectedEdge(null);
    fabricCanvas.requestRenderAll();
  };
  const onTableEditEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !useStudioStore.getState().tableEditMode) return;
    event.preventDefault();
    // This handler runs at document before the global window shortcut. Keep the
    // first Escape scoped to the table gesture so the canvas selection survives.
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (tableDividerGesture || tableRangeGesture) cancelTableGestures();
    else useStudioStore.getState().setTableEditMode(false);
  };
  const onTableEditCancel = () => cancelTableGestures();
  const unsubscribeActiveTool = useStudioStore.subscribe((state, previous) => {
    if (state.activeTool !== previous.activeTool && (tableDividerGesture || tableRangeGesture)) cancelTableGestures();
  });
  const onWindowPointerUp = (event: PointerEvent) => { if (tableDividerGesture || tableRangeGesture) onTableEditUp({ e: event }); };
  fabricCanvas.on('mouse:down', onTableEditDown);
  fabricCanvas.on('mouse:up', onTableEditUp);
  fabricCanvas.on('mouse:move', onTableRangeMove);
  document.addEventListener('keydown', onTableEditEscape);
  document.addEventListener('visibilitychange', onTableEditCancel);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onTableEditCancel);
  window.addEventListener('blur', onTableEditCancel);
  const onTableAddedDuringEdit = (rawEvent: unknown) => {
    const event = rawEvent as TableCanvasObjectEvent;
    const object = asTableFrame(event.target);
    if (useStudioStore.getState().tableEditMode && object) {
      const previous = object.__tableEditOriginals || (object.id ? tableEditOriginalsById.get(object.id) : undefined) || { lockMovementX: object.lockMovementX, lockMovementY: object.lockMovementY, hasControls: object.hasControls };
      if (object.id) tableEditOriginalsById.set(object.id, previous);
      tableEditOriginals.set(object, previous); object.__tableEditOriginals = previous;
      object.set({ lockMovementX: true, lockMovementY: true, hasControls: false });
    }
    refreshRangeOverlay();
  };
  fabricCanvas.on('object:added', onTableAddedDuringEdit);
    return () => {
      fabricCanvas.off('mouse:down', onTableEditDown);
      fabricCanvas.off('mouse:up', onTableEditUp);
      fabricCanvas.off('mouse:move', onTableRangeMove);
      fabricCanvas.off('object:added', onTableAddedDuringEdit);
      unsubscribeTableEditMode();
      unsubscribeActiveTool();
      document.removeEventListener('keydown', onTableEditEscape);
      document.removeEventListener('visibilitychange', onTableEditCancel);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onTableEditCancel);
      window.removeEventListener('blur', onTableEditCancel);
      useStudioStore.getState().setTableEditMode(false);
      useStudioStore.getState().setTableEditSelection(null);
      useStudioStore.getState().setTableSelectedEdge(null);
      tableEditOriginalsById.clear();
      rangeSvg.remove();
  };
}
