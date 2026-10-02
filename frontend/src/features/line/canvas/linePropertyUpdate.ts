import { fabric } from 'fabric';
import { LINE_STYLE_DASH, clampLineWidthMm } from '../model/lineModel';
import { updateLineEndpoint, type LineEndpoint } from '../editor/lineGeometry';

/** Applies line-only inspector properties and reports whether it owned the update. */
export function applyLinePropertyUpdate(line: fabric.Object, property: string, value: unknown, pxPerMm: number): boolean {
  if (line.type !== 'line') return false;
  const fabricLine = line as fabric.Line;
  if (property === 'x1' || property === 'y1' || property === 'x2' || property === 'y2') {
    updateLineEndpoint(fabricLine, property as LineEndpoint, Number(value));
    return true;
  }
  if (property === 'strokeWidthMm') {
    fabricLine.set('strokeWidth', clampLineWidthMm(Number(value)) * pxPerMm);
    return true;
  }
  if (property === 'lineStyle') {
    fabricLine.set('strokeDashArray', LINE_STYLE_DASH[value as keyof typeof LINE_STYLE_DASH]);
    return true;
  }
  return false;
}
