export type TableLineStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type TableEdge = { color: string; widthMm: number; style: TableLineStyle };
export type TableRegion = { rowStart: number; colStart: number; rowSpan: number; colSpan: number };
export type TableModelV2 = {
  version: 2;
  rows: number;
  cols: number;
  columnWidthsMm: number[];
  rowHeightsMm: number[];
  regions: TableRegion[];
  horizontalEdges: TableEdge[][];
  verticalEdges: TableEdge[][];
};
export type TableRange = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };
export type EdgeTarget =
  | { kind: 'horizontal'; row: number; col: number }
  | { kind: 'vertical'; row: number; col: number };
export type EdgeStyle = Partial<TableEdge>;

const MAX_TRACKS = 20;
const MIN_TRACK_MM = 1;
const MAX_TRACK_MM = 200;
const DEFAULT_EDGE: TableEdge = { color: '#000000', widthMm: 0.25, style: 'solid' };
const clone = <T>(value: T): T => structuredClone(value);
const edge = (value: EdgeStyle = {}): TableEdge => ({ ...DEFAULT_EDGE, ...value });
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const validEdge = (value: unknown): value is TableEdge => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['color', 'widthMm', 'style'].includes(key))) return false;
  return validColor(item.color) && Number.isFinite(item.widthMm) && Number(item.widthMm) >= 0 && Number(item.widthMm) <= 5 && ['none', 'solid', 'dashed', 'dotted'].includes(String(item.style)) && (item.style === 'none' || Number(item.widthMm) >= 0.05);
};
const inRange = (value: number, max: number): boolean => Number.isInteger(value) && value >= 0 && value < max;

function blankEdges(rows: number, cols: number): Pick<TableModelV2, 'horizontalEdges' | 'verticalEdges'> {
  return {
    horizontalEdges: Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => edge())),
    verticalEdges: Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, () => edge())),
  };
}

export function createTableModel(rows = 3, cols = 3, widthsMm = 20, heightsMm = 8): TableModelV2 {
  const safeRows = Math.max(1, Math.min(MAX_TRACKS, Math.floor(Number.isFinite(rows) ? rows : 3)));
  const safeCols = Math.max(1, Math.min(MAX_TRACKS, Math.floor(Number.isFinite(cols) ? cols : 3)));
  const safeWidth = Math.max(MIN_TRACK_MM, Math.min(MAX_TRACK_MM, Number.isFinite(widthsMm) ? widthsMm : 20));
  const safeHeight = Math.max(MIN_TRACK_MM, Math.min(MAX_TRACK_MM, Number.isFinite(heightsMm) ? heightsMm : 8));
  return {
    version: 2, rows: safeRows, cols: safeCols,
    columnWidthsMm: Array(safeCols).fill(safeWidth), rowHeightsMm: Array(safeRows).fill(safeHeight),
    regions: Array.from({ length: safeRows * safeCols }, (_, index) => ({ rowStart: Math.floor(index / safeCols), colStart: index % safeCols, rowSpan: 1, colSpan: 1 })),
    ...blankEdges(safeRows, safeCols),
  };
}

function owns(region: TableRegion, row: number, col: number): boolean {
  return row >= region.rowStart && row < region.rowStart + region.rowSpan && col >= region.colStart && col < region.colStart + region.colSpan;
}
function regionAt(model: TableModelV2, row: number, col: number): TableRegion | undefined {
  return model.regions.find(region => owns(region, row, col));
}
function normalizedRange(model: TableModelV2, range: TableRange): TableRange | null {
  if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(Number.isInteger) || range.rowStart < 0 || range.rowEnd < 0 || range.colStart < 0 || range.colEnd < 0 || range.rowStart >= model.rows || range.rowEnd >= model.rows || range.colStart >= model.cols || range.colEnd >= model.cols) return null;
  const rowStart = Math.max(0, Math.min(model.rows - 1, Math.min(range.rowStart, range.rowEnd)));
  const rowEnd = Math.min(model.rows - 1, Math.max(0, Math.max(range.rowStart, range.rowEnd)));
  const colStart = Math.max(0, Math.min(model.cols - 1, Math.min(range.colStart, range.colEnd)));
  const colEnd = Math.min(model.cols - 1, Math.max(0, Math.max(range.colStart, range.colEnd)));
  return rowStart <= rowEnd && colStart <= colEnd ? { rowStart, rowEnd, colStart, colEnd } : null;
}
function rangesOverlap(a: TableRegion, b: TableRegion): boolean {
  return a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan && a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan;
}
function completePartition(model: TableModelV2): boolean {
  const seen = new Set<number>();
  for (const region of model.regions) {
    if (!region || typeof region !== 'object' || Object.keys(region).some(key => !['rowStart', 'colStart', 'rowSpan', 'colSpan'].includes(key))) return false;
    if (!Number.isInteger(region.rowStart) || !Number.isInteger(region.colStart) || !Number.isInteger(region.rowSpan) || !Number.isInteger(region.colSpan) || region.rowSpan < 1 || region.colSpan < 1 || region.rowStart < 0 || region.colStart < 0 || region.rowStart + region.rowSpan > model.rows || region.colStart + region.colSpan > model.cols) return false;
    for (let row = region.rowStart; row < region.rowStart + region.rowSpan; row++) for (let col = region.colStart; col < region.colStart + region.colSpan; col++) {
      const key = row * model.cols + col; if (seen.has(key)) return false; seen.add(key);
    }
  }
  return seen.size === model.rows * model.cols;
}

export function validateTableModel(value: unknown): value is TableModelV2 {
  if (!value || typeof value !== 'object') return false;
  const model = value as TableModelV2;
  const allowed = ['version', 'rows', 'cols', 'columnWidthsMm', 'rowHeightsMm', 'regions', 'horizontalEdges', 'verticalEdges'];
  if (Object.keys(model as object).some(key => !allowed.includes(key))) return false;
  if (model.version !== 2 || !Number.isInteger(model.rows) || !Number.isInteger(model.cols) || model.rows < 1 || model.rows > MAX_TRACKS || model.cols < 1 || model.cols > MAX_TRACKS) return false;
  if (!Array.isArray(model.columnWidthsMm) || model.columnWidthsMm.length !== model.cols || !Array.isArray(model.rowHeightsMm) || model.rowHeightsMm.length !== model.rows) return false;
  if (!model.columnWidthsMm.every(width => Number.isFinite(width) && width >= MIN_TRACK_MM && width <= MAX_TRACK_MM) || !model.rowHeightsMm.every(height => Number.isFinite(height) && height >= MIN_TRACK_MM && height <= MAX_TRACK_MM)) return false;
  if (!Array.isArray(model.regions) || !completePartition(model)) return false;
  if (!Array.isArray(model.horizontalEdges) || model.horizontalEdges.length !== model.rows + 1 || !model.horizontalEdges.every(row => Array.isArray(row) && row.length === model.cols && row.every(validEdge))) return false;
  if (!Array.isArray(model.verticalEdges) || model.verticalEdges.length !== model.rows || !model.verticalEdges.every(row => Array.isArray(row) && row.length === model.cols + 1 && row.every(validEdge))) return false;
  return true;
}

export function parseTableModel(value: unknown): TableModelV2 | null {
  try {
    if (typeof value === 'string' && value.length > 100_000) return null;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return validateTableModel(parsed) ? clone(parsed) : null;
  } catch { return null; }
}

export function tableDimensionsMm(model: TableModelV2): { widthMm: number; heightMm: number } {
  return { widthMm: model.columnWidthsMm.reduce((sum, value) => sum + value, 0), heightMm: model.rowHeightsMm.reduce((sum, value) => sum + value, 0) };
}
export function regionForCell(model: TableModelV2, row: number, col: number): TableRegion | null {
  return inRange(row, model.rows) && inRange(col, model.cols) ? clone(regionAt(model, row, col) || { rowStart: row, colStart: col, rowSpan: 1, colSpan: 1 }) : null;
}
export function visibleHorizontalEdge(model: TableModelV2, row: number, col: number): boolean {
  if (row < 0 || row > model.rows || col < 0 || col >= model.cols) return false;
  if (row === 0 || row === model.rows) return true;
  return regionAt(model, row - 1, col) !== regionAt(model, row, col);
}
export function visibleVerticalEdge(model: TableModelV2, row: number, col: number): boolean {
  if (row < 0 || row >= model.rows || col < 0 || col > model.cols) return false;
  if (col === 0 || col === model.cols) return true;
  return regionAt(model, row, col - 1) !== regionAt(model, row, col);
}

export function expandTableRange(model: TableModelV2, requested: TableRange): TableRange | null {
  const initial = normalizedRange(model, requested); if (!initial) return null;
  const range = { ...initial };
  let changed = true;
  while (changed) {
    changed = false;
    const selected = { rowStart: range.rowStart, colStart: range.colStart, rowSpan: range.rowEnd - range.rowStart + 1, colSpan: range.colEnd - range.colStart + 1 };
    for (const region of model.regions) if (rangesOverlap(region, selected)) {
      const next = { rowStart: Math.min(range.rowStart, region.rowStart), rowEnd: Math.max(range.rowEnd, region.rowStart + region.rowSpan - 1), colStart: Math.min(range.colStart, region.colStart), colEnd: Math.max(range.colEnd, region.colStart + region.colSpan - 1) };
      if (next.rowStart !== range.rowStart || next.rowEnd !== range.rowEnd || next.colStart !== range.colStart || next.colEnd !== range.colEnd) { Object.assign(range, next); changed = true; }
    }
  }
  return range;
}

export function mergeTableRange(model: TableModelV2, requested: TableRange): TableModelV2 | null {
  const range = expandTableRange(model, requested); if (!range) return null;
  const existing = regionAt(model, range.rowStart, range.colStart);
  if (existing && existing.rowStart === range.rowStart && existing.colStart === range.colStart && existing.rowSpan === range.rowEnd - range.rowStart + 1 && existing.colSpan === range.colEnd - range.colStart + 1) return null;
  const selected = { rowStart: range.rowStart, colStart: range.colStart, rowSpan: range.rowEnd - range.rowStart + 1, colSpan: range.colEnd - range.colStart + 1 };
  const next = clone(model); next.regions = model.regions.filter(region => !owns(selected, region.rowStart, region.colStart)); next.regions.push(selected); return next;
}
export function splitTableRegion(model: TableModelV2, row: number, col: number): TableModelV2 | null {
  const region = regionAt(model, row, col); if (!region || (region.rowSpan === 1 && region.colSpan === 1)) return null;
  const next = clone(model); next.regions = model.regions.filter(item => item !== region);
  for (let r = region.rowStart; r < region.rowStart + region.rowSpan; r++) for (let c = region.colStart; c < region.colStart + region.colSpan; c++) next.regions.push({ rowStart: r, colStart: c, rowSpan: 1, colSpan: 1 });
  return next;
}
export const splitTableCell = splitTableRegion;

const validEdgePatch = (patch: unknown): patch is EdgeStyle => !!patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).every(key => ['color', 'widthMm', 'style'].includes(key)) && Object.keys(patch).length > 0 && Object.entries(patch as Record<string, unknown>).every(([key, value]) => key === 'color' ? validColor(value) : key === 'widthMm' ? Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 5 : ['none', 'solid', 'dashed', 'dotted'].includes(String(value)));
const sameEdge = (a: TableEdge, b: TableEdge) => a.color === b.color && a.widthMm === b.widthMm && a.style === b.style;

export function setTableEdge(model: TableModelV2, target: EdgeTarget, style: EdgeStyle): TableModelV2 | null {
  if (!validateTableModel(model) || !validEdgePatch(style)) return null;
  const current = target.kind === 'horizontal' ? model.horizontalEdges[target.row]?.[target.col] : model.verticalEdges[target.row]?.[target.col];
  if (!current) return null;
  const value = { ...current, ...style };
  if (!validColor(value.color) || !Number.isFinite(value.widthMm) || value.widthMm < 0 || value.widthMm > 5 || (value.style !== 'none' && value.widthMm < 0.05)) return null;
  if (!validEdge(value)) return null;
  if (target.kind === 'horizontal') { if (!inRange(target.row, model.rows + 1) || !inRange(target.col, model.cols) || !visibleHorizontalEdge(model, target.row, target.col)) return null; if (sameEdge(current, value)) return null; const next = clone(model); next.horizontalEdges[target.row][target.col] = value; return next; }
  else { if (!inRange(target.row, model.rows) || !inRange(target.col, model.cols + 1) || !visibleVerticalEdge(model, target.row, target.col)) return null; if (sameEdge(current, value)) return null; const next = clone(model); next.verticalEdges[target.row][target.col] = value; return next; }
}
export function styleTableEdges(model: TableModelV2, style: EdgeStyle, scope: 'all' | 'outer' | 'inner' | 'perimeter' = 'all', range?: TableRange): TableModelV2 {
  if (!validateTableModel(model) || !validEdgePatch(style) || !['all', 'outer', 'inner', 'perimeter'].includes(scope)) return model;
  const targetRange = scope === 'perimeter' && range ? normalizedRange(model, range) : null;
  if (scope === 'perimeter' && !targetRange) return model;
  const next = clone(model);
  for (let row = 0; row <= model.rows; row++) for (let col = 0; col < model.cols; col++) {
    const outer = row === 0 || row === model.rows;
    const inner = row > 0 && row < model.rows;
    const perimeter = !!targetRange && (row === targetRange.rowStart || row === targetRange.rowEnd + 1) && col >= targetRange.colStart && col <= targetRange.colEnd;
    if ((scope === 'all' || (scope === 'outer' && outer) || (scope === 'inner' && inner) || perimeter) && visibleHorizontalEdge(model, row, col)) { const value = edge({ ...model.horizontalEdges[row][col], ...style }); if (!validEdge(value)) return model; next.horizontalEdges[row][col] = value; }
  }
  for (let row = 0; row < model.rows; row++) for (let col = 0; col <= model.cols; col++) {
    const outer = col === 0 || col === model.cols;
    const inner = col > 0 && col < model.cols;
    const perimeter = !!targetRange && (col === targetRange.colStart || col === targetRange.colEnd + 1) && row >= targetRange.rowStart && row <= targetRange.rowEnd;
    if ((scope === 'all' || (scope === 'outer' && outer) || (scope === 'inner' && inner) || perimeter) && visibleVerticalEdge(model, row, col)) { const value = edge({ ...model.verticalEdges[row][col], ...style }); if (!validEdge(value)) return model; next.verticalEdges[row][col] = value; }
  }
  return validateTableModel(next) && JSON.stringify(next) !== JSON.stringify(model) ? next : model;
}

export function resizeTable(model: TableModelV2, widthMm: number, heightMm: number): TableModelV2 | null {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < model.cols * MIN_TRACK_MM || heightMm < model.rows * MIN_TRACK_MM) return null;
  const dimensions = tableDimensionsMm(model); const next = clone(model);
  if (Math.abs(dimensions.widthMm - widthMm) < 1e-9 && Math.abs(dimensions.heightMm - heightMm) < 1e-9) return null;
  next.columnWidthsMm = model.columnWidthsMm.map(value => value * widthMm / dimensions.widthMm);
  next.rowHeightsMm = model.rowHeightsMm.map(value => value * heightMm / dimensions.heightMm);
  return validateTableModel(next) ? next : null;
}
export const resizeGlobal = resizeTable;
export function resizeInternal(model: TableModelV2, axis: 'column' | 'row', boundary: number, deltaMm: number): TableModelV2 | null {
  const next = clone(model); const values = axis === 'column' ? next.columnWidthsMm : next.rowHeightsMm;
  if (!Number.isInteger(boundary) || boundary < 1 || boundary >= values.length || !Number.isFinite(deltaMm) || Math.abs(deltaMm) < 1e-9) return null;
  if (values[boundary - 1] + deltaMm < MIN_TRACK_MM || values[boundary] - deltaMm < MIN_TRACK_MM) return null;
  values[boundary - 1] += deltaMm; values[boundary] -= deltaMm; return next;
}

function remapRegions(model: TableModelV2, axis: 'row' | 'column', index: number, delta: 1 | -1): TableRegion[] {
  return model.regions.flatMap(region => {
    const start = axis === 'row' ? region.rowStart : region.colStart; const span = axis === 'row' ? region.rowSpan : region.colSpan;
    if (delta === 1) { const inside = index > start && index < start + span; const shifted = index <= start ? { ...region, [axis === 'row' ? 'rowStart' : 'colStart']: start + 1 } : { ...region }; if (inside) shifted[axis === 'row' ? 'rowSpan' : 'colSpan'] = span + 1; return [shifted]; }
    if (index < start) return [{ ...region, [axis === 'row' ? 'rowStart' : 'colStart']: start - 1 }];
    if (index >= start + span) return [{ ...region }];
    if (span === 1) return [];
    const changed = { ...region }; changed[axis === 'row' ? 'rowSpan' : 'colSpan'] = span - 1; return [changed];
  });
}
function fillPartitionGaps(regions: TableRegion[], rows: number, cols: number): TableRegion[] {
  const result = [...regions];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (!result.some(region => owns(region, row, col))) result.push({ rowStart: row, colStart: col, rowSpan: 1, colSpan: 1 });
  return result;
}
export function insertTableTrack(model: TableModelV2, axis: 'row' | 'column', index: number): TableModelV2 | null {
  const count = axis === 'row' ? model.rows : model.cols; if (count >= MAX_TRACKS || !Number.isInteger(index) || index < 0 || index > count) return null;
  const total = axis === 'row' ? model.rowHeightsMm.reduce((sum, value) => sum + value, 0) : model.columnWidthsMm.reduce((sum, value) => sum + value, 0);
  if (total < (count + 1) * MIN_TRACK_MM) return null;
  const next = clone(model); if (axis === 'row') { const avg = total / model.rows; next.rowHeightsMm.splice(index, 0, avg); next.rows++; } else { const avg = total / model.cols; next.columnWidthsMm.splice(index, 0, avg); next.cols++; }
  const insertedTotal = axis === 'row' ? next.rowHeightsMm.reduce((sum, value) => sum + value, 0) : next.columnWidthsMm.reduce((sum, value) => sum + value, 0);
  const insertScale = total / insertedTotal;
  if (axis === 'row') next.rowHeightsMm = next.rowHeightsMm.map(value => value * insertScale); else next.columnWidthsMm = next.columnWidthsMm.map(value => value * insertScale);
  next.regions = fillPartitionGaps(remapRegions(model, axis, index, 1), next.rows, next.cols);
  const fresh = blankEdges(next.rows, next.cols);
  if (axis === 'row') {
    for (let row = 0; row <= model.rows; row++) for (let col = 0; col < model.cols; col++) fresh.horizontalEdges[row >= index ? row + 1 : row][col] = clone(model.horizontalEdges[row][col]);
    for (let row = 0; row < model.rows; row++) for (let col = 0; col <= model.cols; col++) fresh.verticalEdges[row >= index ? row + 1 : row][col] = clone(model.verticalEdges[row][col]);
  } else {
    for (let row = 0; row <= model.rows; row++) for (let col = 0; col < model.cols; col++) fresh.horizontalEdges[row][col >= index ? col + 1 : col] = clone(model.horizontalEdges[row][col]);
    for (let row = 0; row < model.rows; row++) for (let col = 0; col <= model.cols; col++) fresh.verticalEdges[row][col >= index ? col + 1 : col] = clone(model.verticalEdges[row][col]);
  }
  next.horizontalEdges = fresh.horizontalEdges; next.verticalEdges = fresh.verticalEdges; return validateTableModel(next) ? next : null;
}
export function deleteTableTrack(model: TableModelV2, axis: 'row' | 'column', index: number): TableModelV2 | null {
  const count = axis === 'row' ? model.rows : model.cols; if (count <= 1 || !inRange(index, count)) return null;
  const next = clone(model); if (axis === 'row') { next.rowHeightsMm.splice(index, 1); next.rows--; } else { next.columnWidthsMm.splice(index, 1); next.cols--; }
  const oldTotal = axis === 'row' ? model.rowHeightsMm.reduce((sum, value) => sum + value, 0) : model.columnWidthsMm.reduce((sum, value) => sum + value, 0);
  const remainingTotal = axis === 'row' ? next.rowHeightsMm.reduce((sum, value) => sum + value, 0) : next.columnWidthsMm.reduce((sum, value) => sum + value, 0);
  if (remainingTotal < next.rows * MIN_TRACK_MM && axis === 'row' || remainingTotal < next.cols * MIN_TRACK_MM && axis === 'column') return null;
  const deleteScale = oldTotal / remainingTotal;
  if (axis === 'row') next.rowHeightsMm = next.rowHeightsMm.map(value => value * deleteScale); else next.columnWidthsMm = next.columnWidthsMm.map(value => value * deleteScale);
  next.regions = remapRegions(model, axis, index, -1);
  const fresh = blankEdges(next.rows, next.cols);
  if (axis === 'row') {
    for (let row = 0; row <= next.rows; row++) for (let col = 0; col < next.cols; col++) fresh.horizontalEdges[row][col] = clone(model.horizontalEdges[row <= index ? row : row + 1][col]);
    for (let row = 0; row < next.rows; row++) for (let col = 0; col <= next.cols; col++) fresh.verticalEdges[row][col] = clone(model.verticalEdges[row < index ? row : row + 1][col]);
  } else {
    for (let row = 0; row <= next.rows; row++) for (let col = 0; col < next.cols; col++) fresh.horizontalEdges[row][col] = clone(model.horizontalEdges[row][col < index ? col : col + 1]);
    for (let row = 0; row < next.rows; row++) for (let col = 0; col <= next.cols; col++) fresh.verticalEdges[row][col] = clone(model.verticalEdges[row][col <= index ? col : col + 1]);
  }
  next.horizontalEdges = fresh.horizontalEdges; next.verticalEdges = fresh.verticalEdges; return validateTableModel(next) ? next : null;
}
export const insertTableRow = (model: TableModelV2, index: number) => insertTableTrack(model, 'row', index);
export const insertTableColumn = (model: TableModelV2, index: number) => insertTableTrack(model, 'column', index);
export const deleteTableRow = (model: TableModelV2, index: number) => deleteTableTrack(model, 'row', index);
export const deleteTableColumn = (model: TableModelV2, index: number) => deleteTableTrack(model, 'column', index);
export function distributeTracks(model: TableModelV2, axis: 'row' | 'column'): TableModelV2 {
  const source = axis === 'row' ? model.rowHeightsMm : model.columnWidthsMm; const count = source.length; const total = source.reduce((sum, value) => sum + value, 0); const each = total / count;
  if (source.every(value => Math.abs(value - each) < 1e-9)) return model;
  const next = clone(model); const values = axis === 'row' ? next.rowHeightsMm : next.columnWidthsMm; values.fill(each); return next;
}
