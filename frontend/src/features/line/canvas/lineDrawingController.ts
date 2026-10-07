import * as fabric from 'fabric';

export type LinePoint = { x: number; y: number };

/** Feature-owned Fabric lifecycle primitives used by the canvas gesture adapter. */
export function createLinePreview(start: LinePoint, strokeWidth: number): fabric.Line {
  const line = new fabric.Line([start.x, start.y, start.x, start.y], { stroke: '#000000', strokeWidth, strokeLineCap: 'butt', selectable: false, evented: false, hasControls: false, hasBorders: false });
  (line as any).isLineDrawingPreview = true;
  // Fabric rebases Line local points whenever x1/y1/x2/y2 change. Retain the
  // intended canvas start independently so each preview update can compensate
  // for that bounds rebasing rather than accumulating a visual offset.
  (line as any).__linePreviewStart = { ...start };
  return line;
}

export function updateLinePreview(line: fabric.Line, end: LinePoint): void {
  const start = (line as any).__linePreviewStart as LinePoint | undefined;
  if (!start) return;
  // Set both endpoints from the stable canvas-space contract. Updating only
  // x2/y2 leaves Fabric free to reinterpret the existing local bounds.
  line.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  line.setCoords();
  const local = line.calcLinePoints();
  const matrix = line.calcTransformMatrix();
  const actualStart = fabric.util.transformPoint(new fabric.Point(local.x1, local.y1), matrix);
  // Translate the rebased bounds back to the exact requested canvas start.
  // Translation preserves the line vector, therefore it also makes its end
  // equal to `end` without relying on half-stroke special cases.
  line.set({ left: Number(line.left || 0) + start.x - actualStart.x, top: Number(line.top || 0) + start.y - actualStart.y });
  line.setCoords();
}

export function isMeaningfulLine(line: fabric.Line, minimumPixels = 2): boolean {
  return Math.hypot((line.x2 || 0) - (line.x1 || 0), (line.y2 || 0) - (line.y1 || 0)) >= minimumPixels;
}

export function finalizeLine(line: fabric.Line): void {
  (line as any).isLineDrawingPreview = false;
  line.set({ selectable: true, evented: true, hasControls: true, hasBorders: true });
  line.setCoords();
}
