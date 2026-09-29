export type TableEdge = { style: 'none' | 'solid' | 'dashed'; widthMm: number };
export type TableCell = { text: string; token: string; top: TableEdge; right: TableEdge; bottom: TableEdge; left: TableEdge; rowSpan?: number; colSpan?: number; textAlign?: 'left'|'center'|'right'; fontFamily?: string; fontSizeMm?: number; bold?: boolean; italic?: boolean };
export type TableSpec = { version: 1; rows: number; cols: number; columnWidthsMm: number[]; rowHeightsMm: number[]; cells: TableCell[] };
const edge = (): TableEdge => ({ style: 'solid', widthMm: 0.25 });
export function createTableSpec(rows = 3, cols = 3): TableSpec {
  rows = Math.max(1, Math.min(20, Math.floor(rows))); cols = Math.max(1, Math.min(20, Math.floor(cols)));
  return { version: 1, rows, cols, columnWidthsMm: Array(cols).fill(20), rowHeightsMm: Array(rows).fill(8), cells: Array.from({ length: rows * cols }, (_, i) => ({ text: `R${Math.floor(i / cols) + 1}C${i % cols + 1}`, token: '', top: edge(), right: edge(), bottom: edge(), left: edge(), textAlign: 'left', fontFamily: 'Arial', fontSizeMm: 2.5, bold: false, italic: false })) };
}
export function parseTableSpec(value: unknown): TableSpec | null {
  try {
    const s = typeof value === 'string' ? JSON.parse(value) : value;
    if (!s || s.version !== 1 || !Number.isInteger(s.rows) || !Number.isInteger(s.cols) || s.rows < 1 || s.cols < 1 || s.rows > 20 || s.cols > 20 || !Array.isArray(s.cells) || s.cells.length !== s.rows * s.cols || !Array.isArray(s.columnWidthsMm) || s.columnWidthsMm.length !== s.cols || !Array.isArray(s.rowHeightsMm) || s.rowHeightsMm.length !== s.rows) return null;
    const validEdge = (e: any) => e && ['none','solid','dashed'].includes(e.style) && Number.isFinite(e.widthMm) && e.widthMm >= 0 && e.widthMm <= 5;
    const validCell = (c: any) => c && typeof c.text === 'string' && c.text.length <= 160 && typeof c.token === 'string' && (c.token === '' || /^[A-Za-z0-9_-]{1,80}$/.test(c.token)) && ['top','right','bottom','left'].every(k => validEdge(c[k])) && (c.rowSpan === undefined || Number.isInteger(c.rowSpan)) && (c.colSpan === undefined || Number.isInteger(c.colSpan)) && (c.textAlign === undefined || ['left','center','right'].includes(c.textAlign)) && (c.fontFamily === undefined || (typeof c.fontFamily === 'string' && c.fontFamily.length <= 80)) && (c.fontSizeMm === undefined || (Number.isFinite(c.fontSizeMm) && c.fontSizeMm >= 1 && c.fontSizeMm <= 20)) && (c.bold === undefined || typeof c.bold === 'boolean') && (c.italic === undefined || typeof c.italic === 'boolean');
    if (!s.cells.every(validCell) || !s.columnWidthsMm.every((n: any) => Number.isFinite(n) && n > 0 && n <= 200) || !s.rowHeightsMm.every((n: any) => Number.isFinite(n) && n > 0 && n <= 100)) return null;
    const normalized = normalizeTableSpans(s as TableSpec);
    return normalized;
  } catch { return null; }
}

/** Normalize optional spans and reject invalid/overlapping rectangles. */
export function normalizeTableSpans(input: TableSpec): TableSpec | null {
  const next = structuredClone(input);
  const occupied = new Map<number, number>();
  for (let i = 0; i < next.cells.length; i++) {
    const cell = next.cells[i]; const r = Math.floor(i / next.cols), c = i % next.cols;
    if (occupied.has(i)) {
      // Covered records remain available for backward-compatible editing and
      // are intentionally not treated as additional span anchors.
      if ((cell.rowSpan ?? 1) !== 1 || (cell.colSpan ?? 1) !== 1) return null;
      continue;
    }
    const rowSpan = cell.rowSpan ?? 1, colSpan = cell.colSpan ?? 1;
    if (rowSpan < 1 || colSpan < 1 || r + rowSpan > next.rows || c + colSpan > next.cols) return null;
    cell.rowSpan = rowSpan; cell.colSpan = colSpan;
    for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + colSpan; cc++) {
      const key = rr * next.cols + cc; if (occupied.has(key)) return null; occupied.set(key, i);
    }
  }
  return next;
}

export function mergeTableRange(spec: TableSpec, range: TableRange): TableSpec | null {
  const r0 = Math.max(0, Math.min(range.rowStart, range.rowEnd)), r1 = Math.min(spec.rows - 1, Math.max(range.rowStart, range.rowEnd));
  const c0 = Math.max(0, Math.min(range.colStart, range.colEnd)), c1 = Math.min(spec.cols - 1, Math.max(range.colStart, range.colEnd));
  if (r0 >= r1 && c0 >= c1) return null;
  const normalized = normalizeTableSpans(spec); if (!normalized) return null;
  for (let i = 0; i < normalized.cells.length; i++) { const cell = normalized.cells[i], ar = Math.floor(i / normalized.cols), ac = i % normalized.cols; const rs = cell.rowSpan ?? 1, cs = cell.colSpan ?? 1; const intersects = ar <= r1 && ar + rs - 1 >= r0 && ac <= c1 && ac + cs - 1 >= c0; if (intersects && (ar < r0 || ac < c0 || ar + rs - 1 > r1 || ac + cs - 1 > c1 || rs !== 1 || cs !== 1)) return null; }
  const next = structuredClone(normalized); const anchor = next.cells[r0 * next.cols + c0]; anchor.rowSpan = r1 - r0 + 1; anchor.colSpan = c1 - c0 + 1; return next;
}

export function splitTableCell(spec: TableSpec, index: number): TableSpec | null {
  if (index < 0 || index >= spec.cells.length) return null;
  const normalized = normalizeTableSpans(spec); if (!normalized) return null;
  const cell = normalized.cells[index]; if ((cell.rowSpan ?? 1) === 1 && (cell.colSpan ?? 1) === 1) return null;
  const next = structuredClone(normalized); next.cells[index].rowSpan = 1; next.cells[index].colSpan = 1; return next;
}
export function withCellEdge(spec: TableSpec, index: number, side: 'top' | 'right' | 'bottom' | 'left', nextEdge: TableEdge): TableSpec {
  if (index < 0 || index >= spec.cells.length) return spec;
  const next = JSON.parse(JSON.stringify(spec)) as TableSpec;
  next.cells[index][side] = { ...nextEdge };
  const row = Math.floor(index / next.cols), col = index % next.cols;
  const neighbor = side === 'right' && col < next.cols - 1 ? index + 1 : side === 'left' && col > 0 ? index - 1 : side === 'bottom' && row < next.rows - 1 ? index + next.cols : side === 'top' && row > 0 ? index - next.cols : -1;
  const opposite = ({ right: 'left', left: 'right', top: 'bottom', bottom: 'top' } as const)[side];
  if (neighbor >= 0) next.cells[neighbor][opposite] = { ...nextEdge };
  return next;
}

export function withCellText(spec: TableSpec, index: number, text: string): TableSpec {
  if (index < 0 || index >= spec.cells.length || text.length > 160) return spec;
  const next = structuredClone(spec);
  next.cells[index].text = text;
  return next;
}
export type TableTextFormat = Partial<Pick<TableCell, 'textAlign'|'fontFamily'|'fontSizeMm'|'bold'|'italic'>>;
export function applyTableTextFormat(spec: TableSpec, range: TableRange, format: TableTextFormat): TableSpec {
  const next = structuredClone(spec); const r0 = Math.max(0, Math.min(range.rowStart, range.rowEnd)), r1 = Math.min(spec.rows - 1, Math.max(range.rowStart, range.rowEnd)); const c0 = Math.max(0, Math.min(range.colStart, range.colEnd)), c1 = Math.min(spec.cols - 1, Math.max(range.colStart, range.colEnd));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) Object.assign(next.cells[r * spec.cols + c], format);
  return next;
}

/** Bounded structural edits used by the canvas table toolbar. */
export function insertTableRow(spec: TableSpec, at: number): TableSpec | null {
  if (spec.rows >= 20 || at < 0 || at > spec.rows) return null;
  const next = structuredClone(spec); const template = next.cells.slice(0, next.cols);
  next.cells.splice(at * next.cols, 0, ...template.map((cell, i) => ({ ...structuredClone(cell), text: `R${at + 1}C${i + 1}`, token: '' })));
  next.rowHeightsMm.splice(at, 0, next.rowHeightsMm[Math.max(0, at - 1)] || 8); next.rows += 1; return next;
}
export function insertTableColumn(spec: TableSpec, at: number): TableSpec | null {
  if (spec.cols >= 20 || at < 0 || at > spec.cols) return null;
  const next = structuredClone(spec);
  for (let r = next.rows - 1; r >= 0; r--) next.cells.splice(r * next.cols + at, 0, { ...structuredClone(next.cells[r * next.cols + Math.max(0, at - 1)] || next.cells[0]), text: `R${r + 1}C${at + 1}`, token: '' });
  next.columnWidthsMm.splice(at, 0, next.columnWidthsMm[Math.max(0, at - 1)] || 20); next.cols += 1; return next;
}
export function deleteTableRow(spec: TableSpec, at: number): TableSpec | null {
  if (spec.rows <= 1 || at < 0 || at >= spec.rows) return null;
  const next = structuredClone(spec); next.cells.splice(at * next.cols, next.cols); next.rowHeightsMm.splice(at, 1); next.rows -= 1; return next;
}
export function deleteTableColumn(spec: TableSpec, at: number): TableSpec | null {
  if (spec.cols <= 1 || at < 0 || at >= spec.cols) return null;
  const next = structuredClone(spec); for (let r = next.rows - 1; r >= 0; r--) next.cells.splice(r * next.cols + at, 1); next.columnWidthsMm.splice(at, 1); next.cols -= 1; return next;
}

export type TableRange = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };
export type RangeBorderPreset = 'all' | 'outer' | 'inner' | 'top' | 'right' | 'bottom' | 'left' | 'clear';

/** Apply a spreadsheet-style border command to a bounded rectangular range. */
export function applyRangeBorders(spec: TableSpec, range: TableRange, preset: RangeBorderPreset, nextEdge: TableEdge = { style: 'solid', widthMm: 0.25 }): TableSpec {
  const rowStart = Math.max(0, Math.min(range.rowStart, range.rowEnd));
  const rowEnd = Math.min(spec.rows - 1, Math.max(range.rowStart, range.rowEnd));
  const colStart = Math.max(0, Math.min(range.colStart, range.colEnd));
  const colEnd = Math.min(spec.cols - 1, Math.max(range.colStart, range.colEnd));
  if (rowStart > rowEnd || colStart > colEnd) return spec;
  const result = structuredClone(spec);
  const edge = preset === 'clear' ? { style: 'none' as const, widthMm: 0 } : nextEdge;
  const set = (index: number, side: 'top' | 'right' | 'bottom' | 'left') => {
    result.cells[index][side] = { ...edge };
    const row = Math.floor(index / result.cols), col = index % result.cols;
    const neighbor = side === 'top' && row > 0 ? index - result.cols : side === 'bottom' && row < result.rows - 1 ? index + result.cols : side === 'left' && col > 0 ? index - 1 : side === 'right' && col < result.cols - 1 ? index + 1 : -1;
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side] as 'top' | 'right' | 'bottom' | 'left';
    if (neighbor >= 0) result.cells[neighbor][opposite] = { ...edge };
  };
  for (let row = rowStart; row <= rowEnd; row++) for (let col = colStart; col <= colEnd; col++) {
    const index = row * result.cols + col;
    const sides = (side: 'top' | 'right' | 'bottom' | 'left') => {
      if (preset === 'all' || preset === 'clear') return true;
      if (preset === 'outer') return (side === 'top' && row === rowStart) || (side === 'bottom' && row === rowEnd) || (side === 'left' && col === colStart) || (side === 'right' && col === colEnd);
      if (preset === 'inner') return (side === 'top' && row > rowStart) || (side === 'bottom' && row < rowEnd) || (side === 'left' && col > colStart) || (side === 'right' && col < colEnd);
      return preset === side;
    };
    for (const side of ['top', 'right', 'bottom', 'left'] as const) if (sides(side)) set(index, side);
  }
  return result;
}
export type BorderTarget = 'cell' | 'row' | 'column' | 'table';
export type BorderSides = 'outer' | 'inner' | 'all' | 'selected';

/** Apply a bounded border preset and keep every shared edge identical. */
export function applyTableBorders(spec: TableSpec, index: number, target: BorderTarget, sides: BorderSides, edge: TableEdge, selectedSides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left']): TableSpec {
  if (index < 0 || index >= spec.cells.length) return spec;
  const next = structuredClone(spec);
  const row = Math.floor(index / spec.cols), col = index % spec.cols;
  const included = (r: number, c: number, side: 'top' | 'right' | 'bottom' | 'left') => {
    if (sides === 'selected' && !selectedSides.includes(side)) return false;
    if (target === 'cell' && (r !== row || c !== col)) return false;
    if (target === 'row' && r !== row) return false;
    if (target === 'column' && c !== col) return false;
    const outer = side === 'top' ? r === 0 : side === 'bottom' ? r === spec.rows - 1 : side === 'left' ? c === 0 : c === spec.cols - 1;
    return sides === 'all' || sides === 'selected' || (sides === 'outer' ? outer : !outer);
  };
  for (let r = 0; r < next.rows; r++) for (let c = 0; c < next.cols; c++) {
    const i = r * next.cols + c;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (included(r, c, side)) next.cells[i][side] = { ...edge };
    }
  }
  // Normalize both representations of each interior line after applying the preset.
  for (let r = 0; r < next.rows; r++) for (let c = 0; c < next.cols; c++) {
    const i = r * next.cols + c;
    if (c < next.cols - 1 && (included(r, c, 'right') || included(r, c + 1, 'left'))) {
      const value = included(r, c, 'right') ? next.cells[i].right : next.cells[i + 1].left;
      next.cells[i].right = { ...value }; next.cells[i + 1].left = { ...value };
    }
    if (r < next.rows - 1 && (included(r, c, 'bottom') || included(r + 1, c, 'top'))) {
      const value = included(r, c, 'bottom') ? next.cells[i].bottom : next.cells[i + next.cols].top;
      next.cells[i].bottom = { ...value }; next.cells[i + next.cols].top = { ...value };
    }
  }
  return next;
}
