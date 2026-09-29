import { fabric } from 'fabric';

export type LineEndpoint = 'x1' | 'y1' | 'x2' | 'y2';

export type LinePoint = { x: number; y: number };

/** Snap a freehand segment to the common drafting angles. Shift makes the
 * nearest 45 degree angle deterministic; without Shift only a small angular
 * tolerance is used so ordinary diagonal drawing remains natural. */
export function snapLineEnd(start: LinePoint, end: LinePoint, force = false): LinePoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return end;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const nearest = Math.round(angle / step) * step;
  const delta = Math.abs(Math.atan2(Math.sin(angle - nearest), Math.cos(angle - nearest)));
  if (!force && delta > Math.PI / 18) return end;
  return { x: start.x + Math.cos(nearest) * distance, y: start.y + Math.sin(nearest) * distance };
}

/** Return the closest existing line endpoint in canvas coordinates. */
export function snapToLineEndpoint(end: LinePoint, lines: readonly fabric.Line[], tolerancePx: number): LinePoint {
  let best: LinePoint | null = null;
  let bestDistance = tolerancePx;
  for (const line of lines) {
    if ((line as any).isLineDrawingPreview) continue;
    const local = line.calcLinePoints();
    const matrix = line.calcTransformMatrix();
    const transformed = [
      fabric.util.transformPoint(new fabric.Point(local.x1, local.y1), matrix),
      fabric.util.transformPoint(new fabric.Point(local.x2, local.y2), matrix),
    ];
    for (const point of transformed) {
      const distance = Math.hypot(point.x - end.x, point.y - end.y);
      if (Number.isFinite(distance) && distance <= bestDistance) { best = point; bestDistance = distance; }
    }
  }
  return best || end;
}

export function lineEndpointCanvas(line: fabric.Line, end: 'start' | 'end'): LinePoint {
  const local = line.calcLinePoints();
  const point = end === 'start' ? new fabric.Point(local.x1, local.y1) : new fabric.Point(local.x2, local.y2);
  const transformed = fabric.util.transformPoint(point, line.calcTransformMatrix());
  return { x: transformed.x, y: transformed.y };
}

/** Update Fabric's line-local endpoints and refresh its transformed bounds. */
export function updateLineEndpoint(line: fabric.Line, endpoint: LineEndpoint, valuePx: number): void {
  if (!Number.isFinite(valuePx)) return;
  const pose = { left: line.left, top: line.top, angle: line.angle, scaleX: line.scaleX, scaleY: line.scaleY };
  line.set(endpoint, valuePx);
  // Fabric recalculates left/top from x1..y2. Restore the user's canvas pose
  // so editing an endpoint on a moved or rotated line does not teleport it.
  line.set(pose);
  line.setCoords();
}

export function lineEndpointMm(line: fabric.Line, endpoint: LineEndpoint, pxPerMm: number): number {
  const value = Number((line as any)[endpoint]);
  return Number.isFinite(value) && pxPerMm > 0 ? value / pxPerMm : 0;
}
