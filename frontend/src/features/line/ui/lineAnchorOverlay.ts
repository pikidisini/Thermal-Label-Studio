import * as fabric from 'fabric';
import { lineEndpointCanvas } from '../editor/lineGeometry';

export type AnchorOverlayApi = {
  update: (lines: fabric.Line[], active: { x: number; y: number } | null) => void;
  destroy: () => void;
  layer: HTMLDivElement;
};

export function createLineAnchorOverlay(
  container: HTMLElement,
  canvas: fabric.Canvas,
  onAnchor: (point: { x: number; y: number }, event: MouseEvent) => void,
): AnchorOverlayApi {
  const layer = document.createElement('div');
  layer.dataset.testid = 'line-anchor-layer';
  layer.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none;';
  container.appendChild(layer);
  const buttons = new Map<string, HTMLButtonElement>();
  const hovered = new Set<string>();
  const activeKeys = new Set<string>();

  const update = (lines: fabric.Line[], active: { x: number; y: number } | null) => {
    const seen = new Set<string>();
    const emitted: Array<{ x: number; y: number; key: string }> = [];
    for (const line of lines) {
      const identity = String((line as any).id || (line as any).__uid || lines.indexOf(line));
      for (const end of ['start', 'end'] as const) {
        const key = `${identity}:${end}`;
        const point = lineEndpointCanvas(line, end);
        const view = fabric.util.transformPoint(new fabric.Point(point.x, point.y), canvas.viewportTransform || [1, 0, 0, 1, 0, 0]);
        const duplicate = emitted.find((item) => Math.hypot(item.x - view.x, item.y - view.y) <= 4);
        if (duplicate) continue;
        emitted.push({ x: view.x, y: view.y, key });
        seen.add(key);
        let button = buttons.get(key);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.dataset.testid = 'line-anchor';
          button.setAttribute('aria-label', `Anchor garis ${end}`);
          button.style.cssText = 'position:absolute;pointer-events:auto;width:16px;height:16px;border-radius:50%;padding:0;cursor:crosshair;';
          button.onmouseenter = () => { hovered.add(key); button!.style.background = '#fbbf24'; };
          button.onmouseleave = () => { hovered.delete(key); button!.style.background = activeKeys.has(key) ? '#f59e0b' : '#dbeafe'; };
          buttons.set(key, button);
          layer.appendChild(button);
        }
        const isActive = !!active && Math.hypot(active.x - point.x, active.y - point.y) < 0.01;
        if (isActive) activeKeys.add(key); else activeKeys.delete(key);
        button.style.left = `${view.x - 8}px`;
        button.style.top = `${view.y - 8}px`;
        button.style.border = `2px solid ${isActive ? '#f59e0b' : '#2563eb'}`;
        button.style.background = hovered.has(key) ? '#fbbf24' : (isActive ? '#f59e0b' : '#dbeafe');
        button.onpointerdown = (event) => { event.preventDefault(); event.stopPropagation(); onAnchor(point, event); };
        button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); };
      }
    }
    for (const [key, button] of buttons) if (!seen.has(key)) { button.remove(); buttons.delete(key); hovered.delete(key); activeKeys.delete(key); }
  };

  return { layer, update, destroy: () => { buttons.clear(); hovered.clear(); activeKeys.clear(); layer.remove(); } };
}
