import { fabric } from 'fabric';
import { makeTableGroup } from '../canvas/tableRenderer';
import type { TableSpec } from '../model/tableSpec';

export function replaceTableObject(canvas: fabric.Canvas, current: any, spec: TableSpec, pxPerMm: number) {
  const index = canvas.getObjects().indexOf(current);
  const replacement = makeTableGroup(spec, pxPerMm, { left: current.left || 0, top: current.top || 0 });
  replacement.set({ angle: current.angle || 0, scaleX: current.scaleX || 1, scaleY: current.scaleY || 1, id: current.id });
  canvas.remove(current);
  canvas.insertAt(replacement, Math.max(0, index), false);
  canvas.setActiveObject(replacement);
  replacement.setCoords();
  return replacement;
}
