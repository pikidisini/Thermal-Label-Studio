import type { TableSpec } from '../model/tableSpec';

export function tableBoundaries(spec: TableSpec, pxPerMm: number) {
  const x = [0], y = [0];
  spec.columnWidthsMm.forEach(width => x.push(x[x.length - 1] + width * pxPerMm));
  spec.rowHeightsMm.forEach(height => y.push(y[y.length - 1] + height * pxPerMm));
  return { x, y };
}

export function tableCellAt(spec: TableSpec, pxPerMm: number, localX: number, localY: number) {
  const { x, y } = tableBoundaries(spec, pxPerMm);
  const col = x.findIndex((edge, i) => i < spec.cols && localX >= edge && localX < x[i + 1]);
  const row = y.findIndex((edge, i) => i < spec.rows && localY >= edge && localY < y[i + 1]);
  return row < 0 || col < 0 ? null : { row, col, index: row * spec.cols + col };
}

export function tableLocalPoint(clientX: number, clientY: number, hostRect: DOMRect, zoom: number, table: { left?: number; top?: number; scaleX?: number; scaleY?: number }) {
  return { x: ((clientX - hostRect.left) / zoom - (table.left || 0)) / (table.scaleX || 1), y: ((clientY - hostRect.top) / zoom - (table.top || 0)) / (table.scaleY || 1) };
}
