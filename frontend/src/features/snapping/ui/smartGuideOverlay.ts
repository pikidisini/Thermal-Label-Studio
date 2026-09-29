import type { fabric } from 'fabric';
import type { SnapGuide } from '../model/snappingModel';

export interface SmartGuideOverlay { show(guides: SnapGuide[]): void; clear(): void; destroy(): void }
export function createSmartGuideOverlay(container: HTMLElement, canvas: fabric.Canvas): SmartGuideOverlay {
  const layer = document.createElement('div'); layer.dataset.testid = 'smart-guide-layer'; layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1002;overflow:hidden;'; container.appendChild(layer);
  const clear = () => { layer.replaceChildren(); };
  return { show(guides) { clear(); const zoom = canvas.getZoom() || 1; const v = canvas.viewportTransform || [1, 0, 0, 1, 0, 0]; for (const guide of guides) { const node = document.createElement('div'); node.dataset.testid = 'smart-guide'; node.style.cssText = 'position:absolute;background:#ec4899;opacity:.9;'; if (guide.axis === 'x') { node.style.left = `${guide.value * zoom + v[4]}px`; node.style.top = '0'; node.style.height = '100%'; node.style.width = '1px'; } else { node.style.top = `${guide.value * zoom + v[5]}px`; node.style.left = '0'; node.style.width = '100%'; node.style.height = '1px'; } layer.appendChild(node); } }, clear, destroy() { clear(); layer.remove(); } };
}
