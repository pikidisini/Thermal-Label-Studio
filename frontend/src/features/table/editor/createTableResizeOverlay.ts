import type { TableSpec } from '../model/tableSpec';

type TableLike = { left?: number; top?: number; scaleX?: number; scaleY?: number };
type ResizeOptions = { host: HTMLElement; table: TableLike; spec: TableSpec; pxPerMm: number; zoom: number; onResize: (nextSpec: TableSpec, table: TableLike) => void };

/** Creates divider hit areas and owns their pointer listener cleanup. */
export function createTableResizeOverlay({ host, table, spec, pxPerMm, zoom, onResize }: ResizeOptions) {
  const overlay = document.createElement('div');
  overlay.dataset.testid = 'table-resize-handles';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:12;';
  const xs = [0]; spec.columnWidthsMm.forEach(w => xs.push(xs[xs.length - 1] + w * pxPerMm));
  const ys = [0]; spec.rowHeightsMm.forEach(h => ys.push(ys[ys.length - 1] + h * pxPerMm));
  const cleanups = new Set<() => void>();
  const addHandle = (axis: 'column' | 'row', index: number, x: number, y: number) => {
    const handle = document.createElement('button'); handle.type = 'button';
    handle.setAttribute('aria-label', axis === 'column' ? `Resize column ${index + 1}` : `Resize row ${index + 1}`);
    const totalW = xs[spec.cols] * (table.scaleX || 1) * zoom, totalH = ys[spec.rows] * (table.scaleY || 1) * zoom;
    const left = ((table.left || 0) + x * (table.scaleX || 1)) * zoom, top = ((table.top || 0) + y * (table.scaleY || 1)) * zoom;
    handle.style.cssText = axis === 'column' ? `position:absolute;z-index:2;pointer-events:auto;width:8px;height:${Math.max(20, totalH)}px;background:transparent;border:0;padding:0;left:${left - 4}px;top:${(table.top || 0) * zoom}px;cursor:col-resize;` : `position:absolute;z-index:1;pointer-events:auto;width:${Math.max(20, totalW)}px;height:8px;background:transparent;border:0;padding:0;left:${(table.left || 0) * zoom}px;top:${top - 4}px;cursor:row-resize;`;
    let pointerId: number | null = null; let start = 0; let moved = false;
    const move = (event: PointerEvent) => { if (event.pointerId !== pointerId) return; moved = true; };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return; cleanup(); if (!moved) return; moved = false;
      const delta = (axis === 'column' ? event.clientX : event.clientY) - start;
      const deltaMm = delta / (zoom * pxPerMm * (axis === 'column' ? (table.scaleX || 1) : (table.scaleY || 1)));
      const next = structuredClone(spec); if (axis === 'column') next.columnWidthsMm[index] = Math.min(200, Math.max(1, next.columnWidthsMm[index] + deltaMm)); else next.rowHeightsMm[index] = Math.min(100, Math.max(1, next.rowHeightsMm[index] + deltaMm)); onResize(next, table);
    };
    const cleanup = () => { pointerId = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); cleanups.delete(cleanup); };
    handle.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); pointerId = event.pointerId; start = axis === 'column' ? event.clientX : event.clientY; moved = false; cleanups.add(cleanup); window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); });
    overlay.appendChild(handle);
  };
  for (let c = 0; c < spec.cols; c++) addHandle('column', c, xs[c + 1], ys[spec.rows] / 2);
  for (let r = 0; r < spec.rows; r++) addHandle('row', r, xs[spec.cols] / 2, ys[r + 1]);
  host.appendChild(overlay);
  return { overlay, cleanup: () => { for (const cleanup of cleanups) cleanup(); cleanups.clear(); overlay.remove(); } };
}
