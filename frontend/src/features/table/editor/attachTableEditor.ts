import type { TableSpec } from '../model/tableSpec';
import { tableBoundaries } from './tableGeometry';

export function attachTableCellEditor(host: HTMLElement, table: any, spec: TableSpec, row: number, col: number, pxPerMm: number, zoom: number, onCommit: (value: string) => void) {
  const { x, y } = tableBoundaries(spec, pxPerMm); const index = row * spec.cols + col;
  const field = document.createElement('input'); field.type = 'text'; field.value = spec.cells[index].text; field.maxLength = 160;
  field.setAttribute('aria-label', `Edit table cell ${row + 1},${col + 1}`);
  field.style.cssText = `position:absolute;z-index:20;left:${((table.left || 0) + x[col] * (table.scaleX || 1)) * zoom}px;top:${((table.top || 0) + y[row] * (table.scaleY || 1)) * zoom}px;width:${(spec.columnWidthsMm[col] * pxPerMm * (table.scaleX || 1) - 2) * zoom}px;height:${(spec.rowHeightsMm[row] * pxPerMm * (table.scaleY || 1) - 2) * zoom}px;box-sizing:border-box;font:12px Arial;color:#111827;caret-color:#111827;padding:2px;border:1px solid #2563eb;background:#fff;`;
  host.appendChild(field); field.focus(); field.select(); let done = false;
  const close = (commit: boolean) => { if (done) return; done = true; const value = field.value; field.remove(); if (commit && value !== spec.cells[index].text) onCommit(value); };
  field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); close(true); } else if (event.key === 'Escape') close(false); });
  field.addEventListener('blur', () => close(true)); return () => close(false);
}
