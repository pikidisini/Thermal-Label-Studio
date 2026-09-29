import { fabric } from 'fabric';
import { lineEndpointCanvas } from '../../line/editor/lineGeometry';
import { resolveSnap } from '../engine/snapEngine';
import type { SnapCandidate, SnapConfig, SnapResult } from '../model/snappingModel';

function objectCandidates(canvas: fabric.Canvas, excluded?: fabric.Object): SnapCandidate[] {
  const result: SnapCandidate[] = [];
  for (const object of canvas.getObjects()) {
    if (object === excluded || (object as any).isLineDrawingPreview) continue;
    if (object.type === 'line') {
      for (const end of ['start', 'end'] as const) { const p = lineEndpointCanvas(object as fabric.Line, end); result.push({ axis: 'x', value: p.x, kind: 'object', label: 'endpoint' }, { axis: 'y', value: p.y, kind: 'object', label: 'endpoint' }); }
      continue;
    }
    const bounds = object.getBoundingRect(true, true);
    result.push(
      { axis: 'x', value: bounds.left, kind: 'object', label: 'edge' }, { axis: 'x', value: bounds.left + bounds.width / 2, kind: 'object', label: 'center' }, { axis: 'x', value: bounds.left + bounds.width, kind: 'object', label: 'edge' },
      { axis: 'y', value: bounds.top, kind: 'object', label: 'edge' }, { axis: 'y', value: bounds.top + bounds.height / 2, kind: 'object', label: 'center' }, { axis: 'y', value: bounds.top + bounds.height, kind: 'object', label: 'edge' },
    );
  }
  return result;
}

export function labelCandidates(config: SnapConfig): SnapCandidate[] {
  return [
    { axis: 'x', value: config.labelWidth / 2, kind: 'label', label: 'label center' }, { axis: 'x', value: config.margin, kind: 'label', label: 'margin' }, { axis: 'x', value: config.labelWidth - config.margin, kind: 'label', label: 'margin' },
    { axis: 'y', value: config.labelHeight / 2, kind: 'label', label: 'label center' }, { axis: 'y', value: config.margin, kind: 'label', label: 'margin' }, { axis: 'y', value: config.labelHeight - config.margin, kind: 'label', label: 'margin' },
  ];
}

export function snapLinePoint(canvas: fabric.Canvas, point: { x: number; y: number }, config: SnapConfig, altKey: boolean): SnapResult {
  const lines = canvas.getObjects().filter((o): o is fabric.Line => o.type === 'line');
  // A complete endpoint connection has precedence over independent-axis alignment.
  // It is deliberately checked before grid/object candidates so Shift cannot pull it away.
  const exactAnchor = snapExactLineEndpoint(canvas, point, config, altKey);
  if (exactAnchor) return exactAnchor;
  const anchors: SnapCandidate[] = lines.flatMap(line => ['start', 'end'].flatMap(end => { const p = lineEndpointCanvas(line, end as 'start' | 'end'); return [{ axis: 'x' as const, value: p.x, kind: 'anchor' as const, label: 'anchor' }, { axis: 'y' as const, value: p.y, kind: 'anchor' as const, label: 'anchor' }]; }));
  return resolveSnap(point, [...anchors, ...objectCandidates(canvas), ...labelCandidates(config)], { ...config, enabled: config.enabled && !altKey });
}

/** Check complete endpoint distance before applying any angular correction. */
export function snapExactLineEndpoint(canvas: fabric.Canvas, point: { x: number; y: number }, config: SnapConfig, altKey: boolean): SnapResult | null {
  if (!config.enabled || altKey) return null;
  for (const line of canvas.getObjects().filter((o): o is fabric.Line => o.type === 'line')) for (const end of ['start', 'end'] as const) {
    const p = lineEndpointCanvas(line, end);
    if (Math.hypot(p.x - point.x, p.y - point.y) <= config.tolerance) return { point: p, guides: [{ axis: 'x', value: p.x, label: 'anchor' }, { axis: 'y', value: p.y, label: 'anchor' }], candidates: [] };
  }
  return null;
}

export function snapMovingObject(canvas: fabric.Canvas, object: fabric.Object, config: SnapConfig): SnapResult {
  const result = resolveSnap({ x: object.left || 0, y: object.top || 0 }, [...objectCandidates(canvas, object), ...labelCandidates(config)], config);
  if (config.enabled) object.set({ left: result.point.x, top: result.point.y });
  return result;
}
