import { fabric } from 'fabric';
import { createTableFloatingMenu, type TableMenuGroup } from '../floatingMenu';
import { parseTableSpec, applyRangeBorders, applyTableTextFormat, insertTableRow, insertTableColumn, deleteTableRow, deleteTableColumn, mergeTableRange, splitTableCell } from '../model/tableSpec';
import { replaceTableObject } from './tableCommands';

type Cell = { row: number; col: number };

export interface TableRangeSelectionOptions {
  canvas: fabric.Canvas;
  host: HTMLDivElement;
  getPxPerMm: () => number;
  syncSelection: (object: any) => void;
  onCanvasModified: () => void;
}

export function attachTableRangeSelection(options: TableRangeSelectionOptions) {
  const { canvas, host } = options;
  let tableRange: HTMLDivElement | null = null;
  let tableToolbar: HTMLDivElement | null = null;
  let contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  let anchor: { table: any; row: number; col: number } | null = null;
  let focus: Cell | null = null;
  let movementLock: { table: any; lockMovementX: boolean; lockMovementY: boolean } | null = null;

  const clearContextMenu = () => {
    if (contextMenuHandler) host.removeEventListener('contextmenu', contextMenuHandler);
    contextMenuHandler = null;
  };
  const clear = () => {
    tableRange?.remove(); tableRange = null;
    tableToolbar?.remove(); tableToolbar = null;
    clearContextMenu();
    anchor = null; focus = null;
    if (movementLock?.table) movementLock.table.set({ lockMovementX: movementLock.lockMovementX, lockMovementY: movementLock.lockMovementY });
    movementLock = null;
  };
  const show = (table: any, spec: any, from: Cell, to: Cell) => {
    tableRange?.remove(); tableToolbar?.remove(); tableToolbar = null;
    const zoom = canvas.getZoom(); const sx = Number(table.scaleX || 1); const sy = Number(table.scaleY || 1); const px = options.getPxPerMm();
    const xs = [0]; spec.columnWidthsMm.forEach((w: number) => xs.push(xs[xs.length - 1] + w * px));
    const ys = [0]; spec.rowHeightsMm.forEach((h: number) => ys.push(ys[ys.length - 1] + h * px));
    const r0 = Math.min(from.row, to.row), r1 = Math.max(from.row, to.row), c0 = Math.min(from.col, to.col), c1 = Math.max(from.col, to.col);
    const mark = document.createElement('div'); mark.dataset.testid = 'table-range-selection'; mark.dataset.range = `${r0}:${r1}:${c0}:${c1}`;
    mark.style.cssText = `position:absolute;pointer-events:none;z-index:13;left:${((table.left || 0) + xs[c0] * sx) * zoom}px;top:${((table.top || 0) + ys[r0] * sy) * zoom}px;width:${(xs[c1 + 1] - xs[c0]) * sx * zoom}px;height:${(ys[r1 + 1] - ys[r0]) * sy * zoom}px;background:rgba(37,99,235,.14);border:2px solid #2563eb;box-sizing:border-box;`;
    host.appendChild(mark); tableRange = mark;
    const replace = (next: any) => { if (!next) return; const replacement = replaceTableObject(canvas, table, next, px); options.syncSelection(replacement); options.onCanvasModified(); show(replacement, next, from, to); canvas.requestRenderAll(); };
    const range = { rowStart: r0, rowEnd: r1, colStart: c0, colEnd: c1 }; const merged = mergeTableRange(spec, range); const split = splitTableCell(spec, r0 * spec.cols + c0); const anchorCell = spec.cells[r0 * spec.cols + c0];
    const groups: TableMenuGroup[] = [
      { title: 'Struktur tabel', items: [{ label: 'Baris di atas', action: () => replace(insertTableRow(spec, r0)) }, { label: 'Baris di bawah', action: () => replace(insertTableRow(spec, r1 + 1)) }, { label: 'Kolom di kiri', action: () => replace(insertTableColumn(spec, c0)) }, { label: 'Kolom di kanan', action: () => replace(insertTableColumn(spec, c1 + 1)) }, { label: 'Hapus baris', action: () => { let n = spec; for (let r = r1; r >= r0; r--) n = deleteTableRow(n, r) || n; replace(n); } }, { label: 'Hapus kolom', action: () => { let n = spec; for (let c = c1; c >= c0; c--) n = deleteTableColumn(n, c) || n; replace(n); } }] },
      { title: 'Gabung dan pisah', items: [...(merged ? [{ label: 'Gabungkan sel', action: () => replace(merged) }] : []), ...(split ? [{ label: 'Pisahkan sel', action: () => replace(split) }] : [])] },
      { title: 'Teks', items: [...(['left', 'center', 'right'] as const).map(value => ({ label: `Rata ${value === 'left' ? 'kiri' : value === 'center' ? 'tengah' : 'kanan'}`, action: () => replace(applyTableTextFormat(spec, range, { textAlign: value })) })), ...(['Arial', 'Inter'] as const).map(value => ({ label: `Font ${value}`, action: () => replace(applyTableTextFormat(spec, range, { fontFamily: value })) })), ...[2, 2.5, 3, 3.5, 4, 5].map(value => ({ label: `Ukuran ${value} mm`, action: () => replace(applyTableTextFormat(spec, range, { fontSizeMm: value })) })), { label: anchorCell.bold ? 'Matikan tebal' : 'Tebal', action: () => replace(applyTableTextFormat(spec, range, { bold: !anchorCell.bold })) }, { label: anchorCell.italic ? 'Matikan miring' : 'Miring', action: () => replace(applyTableTextFormat(spec, range, { italic: !anchorCell.italic })) }] },
      { title: 'Garis tabel', items: [...(['all', 'outer', 'inner', 'top', 'right', 'bottom', 'left', 'clear'] as const).map(value => ({ label: ({ all: 'Semua garis', outer: 'Garis luar', inner: 'Garis dalam', top: 'Garis atas', right: 'Garis kanan', bottom: 'Garis bawah', left: 'Garis kiri', clear: 'Hapus garis' })[value], action: () => replace(applyRangeBorders(spec, range, value)) }))] },
    ];
    const floating = createTableFloatingMenu(host, mark.getBoundingClientRect(), groups); tableToolbar = floating.root; clearContextMenu();
    contextMenuHandler = (event) => { const rect = mark.getBoundingClientRect(); if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) { event.preventDefault(); floating.open(); } }; host.addEventListener('contextmenu', contextMenuHandler);
  };
  const updateFromClient = (clientX: number, clientY: number) => { if (!anchor) return; const spec = parseTableSpec(anchor.table.tableSpec); const rect = host.getBoundingClientRect(); if (!spec) return; const localX = ((clientX - rect.left) / canvas.getZoom() - (anchor.table.left || 0)) / (anchor.table.scaleX || 1); const localY = ((clientY - rect.top) / canvas.getZoom() - (anchor.table.top || 0)) / (anchor.table.scaleY || 1); const xs = [0]; spec.columnWidthsMm.forEach((w: number) => xs.push(xs[xs.length - 1] + w * options.getPxPerMm())); const ys = [0]; spec.rowHeightsMm.forEach((h: number) => ys.push(ys[ys.length - 1] + h * options.getPxPerMm())); const col = Math.max(0, Math.min(spec.cols - 1, xs.findIndex((x, i) => i < spec.cols && localX >= x && localX < xs[i + 1]))); const row = Math.max(0, Math.min(spec.rows - 1, ys.findIndex((y, i) => i < spec.rows && localY >= y && localY < ys[i + 1]))); focus = { row, col }; show(anchor.table, spec, { row: anchor.row, col: anchor.col }, focus); };
  const onPointerMove = (event: PointerEvent) => updateFromClient(event.clientX, event.clientY); const onMouseMove = (event: MouseEvent) => updateFromClient(event.clientX, event.clientY); const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && tableRange) { clear(); const active = canvas.getActiveObject(); if (active?.isTable) { canvas.setActiveObject(active); options.syncSelection(active); } canvas.requestRenderAll(); } };
  window.addEventListener('pointermove', onPointerMove); window.addEventListener('mousemove', onMouseMove); document.addEventListener('keydown', onEscape);
  const onDown = (event: any) => { const table = event.target as any; const spec = table?.isTable ? parseTableSpec(table.tableSpec) : null; if (!spec || Math.abs(Number(table.angle || 0)) > 0.01) return; const pointer = canvas.getPointer(event.e); const localX = (pointer.x - (table.left || 0)) / (table.scaleX || 1); const localY = (pointer.y - (table.top || 0)) / (table.scaleY || 1); const xs = [0]; spec.columnWidthsMm.forEach((w: number) => xs.push(xs[xs.length - 1] + w * options.getPxPerMm())); const ys = [0]; spec.rowHeightsMm.forEach((h: number) => ys.push(ys[ys.length - 1] + h * options.getPxPerMm())); const col = xs.findIndex((x, i) => i < spec.cols && localX >= x && localX < xs[i + 1]); const row = ys.findIndex((y, i) => i < spec.rows && localY >= y && localY < ys[i + 1]); if (row < 0 || col < 0) return; movementLock = { table, lockMovementX: Boolean(table.lockMovementX), lockMovementY: Boolean(table.lockMovementY) }; table.set({ lockMovementX: true, lockMovementY: true }); anchor = { table, row, col }; focus = { row, col }; show(table, spec, { row, col }, { row, col }); };
  const onMove = (event: any) => updateFromClient(event.e.clientX, event.e.clientY); const onUp = () => { if (!anchor) return; const spec = parseTableSpec(anchor.table.tableSpec); if (!spec) { clear(); return; } show(anchor.table, spec, { row: anchor.row, col: anchor.col }, focus || { row: anchor.row, col: anchor.col }); if (movementLock?.table === anchor.table) anchor.table.set({ lockMovementX: movementLock.lockMovementX, lockMovementY: movementLock.lockMovementY }); movementLock = null; anchor = null; focus = null; };
  canvas.on('mouse:down', onDown); canvas.on('mouse:move', onMove); canvas.on('mouse:up', onUp);
  return { clear, cleanup: () => { clear(); window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('mousemove', onMouseMove); document.removeEventListener('keydown', onEscape); canvas.off('mouse:down', onDown); canvas.off('mouse:move', onMove); canvas.off('mouse:up', onUp); } };
}
