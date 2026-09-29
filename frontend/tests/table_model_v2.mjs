import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTableModel, deleteTableColumn, deleteTableRow, insertTableColumn, insertTableRow,
  mergeTableRange, parseTableModel, resizeInternal, setTableEdge, splitTableRegion,
  styleTableEdges, validateTableModel, visibleHorizontalEdge, visibleVerticalEdge,
} from '../src/features/table/model/tableModelV2.ts';

const range = (rowStart, rowEnd, colStart, colEnd) => ({ rowStart, rowEnd, colStart, colEnd });
const snapshot = value => JSON.parse(JSON.stringify(value));

test('v2 model has a complete partition and exact shared edge matrices', () => {
  const model = createTableModel(2, 3);
  assert.equal(model.version, 2);
  assert.equal(model.regions.length, 6);
  assert.equal(model.horizontalEdges.length, 3);
  assert.equal(model.verticalEdges.length, 2);
  assert.ok(validateTableModel(model));
  assert.equal(Object.hasOwn(model, 'cells'), false);
});

test('merge hides only interior edges and split restores topology and style byte-for-byte', () => {
  let model = createTableModel(2, 2);
  model = setTableEdge(model, { kind: 'horizontal', row: 1, col: 0 }, { color: '#ff0000', style: 'dotted', widthMm: 0.5 });
  const before = snapshot(model);
  const merged = mergeTableRange(model, range(0, 1, 0, 1));
  assert.ok(merged);
  assert.equal(visibleHorizontalEdge(merged, 1, 0), false);
  assert.equal(visibleHorizontalEdge(merged, 1, 1), false);
  assert.equal(visibleVerticalEdge(merged, 0, 1), false);
  assert.equal(visibleVerticalEdge(merged, 1, 1), false);
  assert.equal(visibleHorizontalEdge(merged, 0, 0), true);
  assert.deepEqual(splitTableRegion(merged, 0, 0).horizontalEdges, before.horizontalEdges);
  assert.deepEqual(splitTableRegion(merged, 0, 0).verticalEdges, before.verticalEdges);
});

test('merge repeatedly expands a selection that cuts multiple merged regions', () => {
  let model = createTableModel(3, 4);
  model = mergeTableRange(model, range(0, 1, 0, 1));
  model = mergeTableRange(model, range(1, 2, 2, 3));
  const merged = mergeTableRange(model, range(0, 1, 1, 2));
  assert.ok(merged);
  assert.deepEqual(merged.regions.find(region => region.rowSpan === 3 && region.colSpan === 4), { rowStart: 0, colStart: 0, rowSpan: 3, colSpan: 4 });
});

test('validator rejects overlap and holes without mutating input', () => {
  const model = createTableModel(3, 3);
  const overlap = snapshot(model); overlap.regions = [{ rowStart: 0, colStart: 0, rowSpan: 2, colSpan: 2 }, ...model.regions.slice(1)];
  const hole = snapshot(model); hole.regions = model.regions.slice(0, -1);
  assert.equal(validateTableModel(overlap), false);
  assert.equal(validateTableModel(hole), false);
  assert.deepEqual(model, createTableModel(3, 3));
});

test('style all visible edges leaves hidden interior style available after split', () => {
  let model = createTableModel(2, 2);
  model = setTableEdge(model, { kind: 'horizontal', row: 1, col: 0 }, { color: '#ff0000', style: 'dotted', widthMm: 0.5 });
  model = mergeTableRange(model, range(0, 1, 0, 1));
  model = styleTableEdges(model, { color: '#0000ff', style: 'solid', widthMm: 1 }, 'all');
  assert.deepEqual(model.horizontalEdges[1][0], { color: '#ff0000', style: 'dotted', widthMm: 0.5 });
  const split = splitTableRegion(model, 0, 0);
  assert.deepEqual(split.horizontalEdges[1][0], { color: '#ff0000', style: 'dotted', widthMm: 0.5 });
});

test('internal resize changes exactly two adjacent tracks and preserves total', () => {
  let model = createTableModel(1, 2);
  model.columnWidthsMm = [30, 20];
  const resized = resizeInternal(model, 'column', 1, 5);
  assert.deepEqual(resized.columnWidthsMm, [35, 15]);
  assert.deepEqual(model.columnWidthsMm, [30, 20]);
  assert.equal(resizeInternal(model, 'column', 1, -30), null);
});

test('insert and delete tracks preserve merged spans and bounded partition', () => {
  let model = createTableModel(3, 3);
  model = mergeTableRange(model, range(1, 2, 1, 2));
  const inside = insertTableRow(model, 2);
  assert.equal(inside.regions.find(region => region.colStart === 1 && region.colSpan === 2).rowSpan, 3);
  const outside = insertTableRow(model, 1);
  assert.equal(outside.regions.find(region => region.colStart === 1 && region.colSpan === 2).rowStart, 2);
  const shrunk = deleteTableColumn(model, 1);
  assert.equal(shrunk.regions.find(region => region.rowStart === 1 && region.colStart === 1)?.colSpan, 1);
  assert.ok(validateTableModel(shrunk));
  assert.ok(validateTableModel(deleteTableColumn(shrunk, 1)));
});

test('insert rejects an impossible minimum-size total without partial mutation', () => {
  const model = createTableModel(1, 2, 1, 1);
  const before = snapshot(model);
  assert.equal(insertTableColumn(model, 2), null);
  assert.deepEqual(model, before);
});

test('parse rejects malformed, legacy and non-finite metadata', () => {
  const model = createTableModel(2, 2);
  assert.ok(parseTableModel(JSON.stringify(model)));
  assert.equal(parseTableModel({ ...model, version: 1 }), null);
  assert.equal(parseTableModel({ ...model, columnWidthsMm: [Infinity, 1] }), null);
  assert.equal(parseTableModel({ ...model, horizontalEdges: [[{ color: '#000000', style: 'solid', widthMm: 0.25 }]] }), null);
});

test('partial edge styles preserve other attributes and reject hidden merged edges', () => {
  const model = createTableModel(2, 2);
  const colored = setTableEdge(model, { kind: 'horizontal', row: 0, col: 0 }, { color: '#123456' });
  assert.deepEqual(colored.horizontalEdges[0][0], { color: '#123456', widthMm: 0.25, style: 'solid' });
  const merged = mergeTableRange(colored, range(0, 1, 0, 1));
  assert.equal(setTableEdge(merged, { kind: 'horizontal', row: 1, col: 0 }, { style: 'dashed' }), null);
  assert.equal(setTableEdge(colored, { kind: 'horizontal', row: 0, col: 0 }, { unexpected: true }), null);
  assert.equal(setTableEdge(colored, { kind: 'horizontal', row: 0, col: 0 }, { widthMm: 0.01 }), null);
});

test('validator rejects nested payload extras and no-op style does not produce a new model', () => {
  const model = createTableModel(1, 1);
  const malformed = snapshot(model);
  malformed.regions[0].text = 'unexpected';
  assert.equal(validateTableModel(malformed), false);
  assert.equal(styleTableEdges(model, { color: '#000000' }), model);
});

test('perimeter style applies only to visible edges bounding a selected range', () => {
  let model = createTableModel(3, 3, 10, 10);
  model = styleTableEdges(model, { color: '#ff0000' }, 'perimeter', range(1, 1, 1, 1));
  assert.equal(model.horizontalEdges[1][1].color, '#ff0000');
  assert.equal(model.horizontalEdges[2][1].color, '#ff0000');
  assert.equal(model.verticalEdges[1][1].color, '#ff0000');
  assert.equal(model.verticalEdges[1][2].color, '#ff0000');
  assert.equal(model.horizontalEdges[0][0].color, '#000000');
  assert.equal(model.verticalEdges[0][0].color, '#000000');
  assert.equal(styleTableEdges(model, { color: '#00ff00' }, 'perimeter'), model);
});
