import { fabric } from './fabricInterop';
import type { TableSpec } from '../model/tableSpec';
import type { TableModelV2 } from '../model/tableModelV2';
import { parseTableModel, visibleHorizontalEdge, visibleVerticalEdge } from '../model/tableModelV2';

type TableFrameGroup = fabric.Group & { id?: string; isTable?: boolean; tableSpec?: TableModelV2; tableVersion?: number; __tableEditOriginals?: unknown };
type HydratedTableFrame = fabric.Object & { id?: string; isTable?: boolean; tableVersion?: number; tableSpec?: unknown; left?: number; top?: number; angle?: number; scaleX?: number; scaleY?: number; flipX?: boolean; flipY?: boolean; opacity?: number; visible?: boolean; selectable?: boolean; evented?: boolean; lockMovementX?: boolean; lockMovementY?: boolean; lockRotation?: boolean; lockScalingX?: boolean; lockScalingY?: boolean; __tableEditOriginals?: unknown };

/** Build Fabric objects from an immutable table model. */
export function makeTableGroup(spec: TableSpec, pxPerMm: number, position = { left: 0, top: 0 }) {
  const xs = [0]; spec.columnWidthsMm.forEach(w => xs.push(xs[xs.length - 1] + w * pxPerMm));
  const ys = [0]; spec.rowHeightsMm.forEach(h => ys.push(ys[ys.length - 1] + h * pxPerMm));
  const objects: fabric.Object[] = [];
  const drawn = new Set<string>(); const occupied = new Set<number>();
  spec.cells.forEach((cell, i) => {
    const r = Math.floor(i / spec.cols), c = i % spec.cols;
    if (occupied.has(i)) return;
    const rowSpan = cell.rowSpan ?? 1, colSpan = cell.colSpan ?? 1;
    for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + colSpan; cc++) occupied.add(rr * spec.cols + cc);
    const rightCol = c + colSpan, bottomRow = r + rowSpan, spanX = xs[rightCol], spanY = ys[bottomRow];
    for (const [side, key, coords] of [
      ['top', `h${r}-${c}-${rightCol}`, [xs[c], ys[r], spanX, ys[r]]], ['bottom', `h${bottomRow}-${c}-${rightCol}`, [xs[c], spanY, spanX, spanY]],
      ['left', `v${c}-${r}-${bottomRow}`, [xs[c], ys[r], xs[c], spanY]], ['right', `v${rightCol}-${r}-${bottomRow}`, [spanX, ys[r], spanX, spanY]]
    ] as const) {
      const edge = cell[side]; if (drawn.has(key)) continue; drawn.add(key);
      if (edge.style !== 'none') objects.push(new fabric.Line([...coords], { stroke: '#000', strokeWidth: edge.widthMm * pxPerMm, strokeDashArray: edge.style === 'dashed' ? [2 * pxPerMm, 1.5 * pxPerMm] : undefined }));
    }
    const align = cell.textAlign || 'left', size = (cell.fontSizeMm || 2.5) * pxPerMm;
    const left = align === 'center' ? (xs[c] + spanX) / 2 : align === 'right' ? spanX - pxPerMm : xs[c] + pxPerMm;
    const text = new fabric.Text(cell.text, { left, top: ys[r] + pxPerMm, originX: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left', fontSize: size, fontFamily: cell.fontFamily || 'Arial', fontWeight: cell.bold ? 'bold' : 'normal', fontStyle: cell.italic ? 'italic' : 'normal', textAlign: align, fill: '#000' }) as any;
    if (cell.token) { text.dataField = cell.token; text.dataPlaceholder = cell.token; text.isDynamic = true; }
    objects.push(text);
  });
  const group = new fabric.Group(objects, { ...position, originX: 'left', originY: 'top' }) as any;
  group.isTable = true; group.tableSpec = spec; group.tableVersion = 1;
  return group;
}

/** Render a v2 line-frame model. The model remains immutable; all topology
 * decisions are made from shared edge matrices and merged-region ownership. */
export function makeTableGroupV2(model: TableModelV2, pxPerMm: number, position = { left: 0, top: 0 }) {
  const xs = [0]; model.columnWidthsMm.forEach(width => xs.push(xs[xs.length - 1] + width * pxPerMm));
  const ys = [0]; model.rowHeightsMm.forEach(height => ys.push(ys[ys.length - 1] + height * pxPerMm));
  const objects: fabric.Object[] = [];
  const widthPx = xs[xs.length - 1], heightPx = ys[ys.length - 1];
  const line = (coords: [number, number, number, number], spec: { color: string; widthMm: number; style: string }) => {
    if (spec.style === 'none') return;
    const strokePx = spec.widthMm * pxPerMm;
    const [x1, y1, x2, y2] = coords;
    const roundCap = spec.style === 'dotted';
    const dash = spec.style === 'dashed' ? [2 * pxPerMm, 1.5 * pxPerMm] : spec.style === 'dotted' ? [0.1 * pxPerMm, 1.6 * pxPerMm] : undefined;
    objects.push(new fabric.Line(coords, {
      stroke: spec.color, strokeWidth: strokePx, strokeDashArray: dash,
      strokeLineCap: roundCap ? 'round' : 'butt', selectable: false, evented: false,
      // Fabric 5 places an axis-aligned Line's stroke bbox after `left/top`.
      // Move that origin back by half the width on its zero-length axis.
      left: Math.min(x1, x2) - (roundCap || x1 === x2 ? strokePx / 2 : 0),
      top: Math.min(y1, y2) - (roundCap || y1 === y2 ? strokePx / 2 : 0),
    }));
  };
  for (let row = 0; row <= model.rows; row++) for (let col = 0; col < model.cols; col++) {
    if (visibleHorizontalEdge(model, row, col)) {
      const spec = model.horizontalEdges[row][col];
      const strokePx = spec.widthMm * pxPerMm;
      const y = row === 0 ? strokePx / 2 : row === model.rows ? heightPx - strokePx / 2 : ys[row];
      const roundCap = spec.style === 'dotted';
      const x1 = col === 0 && roundCap ? strokePx / 2 : xs[col];
      const x2 = col === model.cols - 1 && roundCap ? widthPx - strokePx / 2 : xs[col + 1];
      line([x1, y, x2, y], spec);
    }
  }
  for (let row = 0; row < model.rows; row++) for (let col = 0; col <= model.cols; col++) {
    if (visibleVerticalEdge(model, row, col)) {
      const spec = model.verticalEdges[row][col];
      const strokePx = spec.widthMm * pxPerMm;
      const x = col === 0 ? strokePx / 2 : col === model.cols ? widthPx - strokePx / 2 : xs[col];
      const roundCap = spec.style === 'dotted';
      const y1 = row === 0 && roundCap ? strokePx / 2 : ys[row];
      const y2 = row === model.rows - 1 && roundCap ? heightPx - strokePx / 2 : ys[row + 1];
      line([x, y1, x, y2], spec);
    }
  }
  // A transparent editor-only rectangle fixes exact model bounds, including
  // the all-hidden-edge case. Outer strokes are inset by half their width, so
  // thick borders do not inflate the table object's printable dimensions.
  const bounds = new fabric.Rect({ left: 0, top: 0, width: widthPx, height: heightPx, fill: 'rgba(0,0,0,0)', stroke: 'transparent', strokeWidth: 0, selectable: false, evented: false }) as fabric.Rect & { excludeFromExport?: boolean };
  bounds.excludeFromExport = true;
  objects.push(bounds);
  const group = new fabric.Group(objects, { ...position, originX: 'left', originY: 'top' }) as TableFrameGroup;
  group.set({ lockUniScaling: true });
  group.isTable = true;
  group.tableSpec = model;
  group.tableVersion = 2;
  group.id = `table-v2-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  return group;
}

/** Rebuild v2 child geometry after Fabric JSON hydration. Excluded editor bounds
 * are intentionally omitted from JSON/SVG, so regenerate them from validated
 * model metadata while preserving the canvas object's identity and pose. */
export function rehydrateTableV2Objects(canvas: fabric.Canvas, pxPerMm: number): void {
  const active = canvas.getActiveObject();
  const replacements: Array<{ current: HydratedTableFrame; next: TableFrameGroup; index: number }> = [];
  canvas.getObjects().forEach((raw: fabric.Object, index: number) => {
    const current = raw as HydratedTableFrame;
    if (current?.isTable !== true || current.tableVersion !== 2) return;
    const model = parseTableModel(current.tableSpec);
    if (!model) return;
    const next = makeTableGroupV2(model, pxPerMm, { left: current.left || 0, top: current.top || 0 }) as TableFrameGroup;
    next.set({
      angle: current.angle || 0, scaleX: current.scaleX || 1, scaleY: current.scaleY || 1,
      flipX: !!current.flipX, flipY: !!current.flipY, opacity: current.opacity ?? 1,
      visible: current.visible !== false, selectable: current.selectable !== false, evented: current.evented !== false,
      lockMovementX: !!current.lockMovementX, lockMovementY: !!current.lockMovementY,
      lockRotation: !!current.lockRotation, lockScalingX: !!current.lockScalingX, lockScalingY: !!current.lockScalingY,
      id: current.id,
    });
    next.__tableEditOriginals = current.__tableEditOriginals;
    replacements.push({ current, next, index });
  });
  replacements.forEach(({ current, next, index }) => {
    canvas.remove(current);
    canvas.insertAt(next, index, false);
    if (active === current) canvas.setActiveObject(next);
  });
  if (replacements.length) canvas.requestRenderAll();
}
