import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRangeBorders, applyTableBorders, applyTableTextFormat, createTableSpec, deleteTableColumn, deleteTableRow, insertTableColumn, insertTableRow, mergeTableRange, parseTableSpec, splitTableCell, withCellEdge, withCellText } from '../src/utils/tableSpec.ts';
import { tableBoundaries, tableCellAt } from '../src/features/table/editor/tableGeometry.ts';

test('table geometry maps millimetre grid coordinates to stable cells', () => {
  const spec = createTableSpec(2, 2);
  const boundaries = tableBoundaries(spec, 4);
  assert.deepEqual(boundaries.x, [0, 80, 160]);
  assert.deepEqual(boundaries.y, [0, 32, 64]);
  assert.deepEqual(tableCellAt(spec, 4, 81, 33), { row: 1, col: 1, index: 3 });
  assert.equal(tableCellAt(spec, 4, 160, 33), null);
});

test('table spec is bounded, versioned and contains per-cell content and edge settings', () => {
  const spec = createTableSpec(2, 3);
  assert.equal(parseTableSpec(spec)?.cells.length, 6);
  assert.equal(parseTableSpec({ ...spec, version: 2 }), null);
  assert.equal(parseTableSpec({ ...spec, columnWidthsMm: [20] }), null);
  assert.equal(parseTableSpec({ ...spec, rows: 21 }), null);
  assert.equal(parseTableSpec({ ...spec, cells: [{ ...spec.cells[0], text: 'x'.repeat(161) }, ...spec.cells.slice(1)] }), null);
});

test('editing an interior border updates both adjacent cells once', () => {
  const spec = createTableSpec(2, 2);
  const next = withCellEdge(spec, 0, 'right', { style: 'dashed', widthMm: 0.5 });
  assert.deepEqual(next.cells[0].right, next.cells[1].left);
  assert.equal(next.cells[1].left.style, 'dashed');
  assert.equal(next.cells[1].left.widthMm, 0.5);
  assert.equal(spec.cells[0].right.style, 'solid');
});

test('border presets apply to the chosen range and keep shared edges synchronized', () => {
  const spec = createTableSpec(2, 2);
  const next = applyTableBorders(spec, 0, 'table', 'inner', { style: 'dashed', widthMm: 0.5 });
  assert.deepEqual(next.cells[0].right, next.cells[1].left);
  assert.deepEqual(next.cells[0].bottom, next.cells[2].top);
  assert.equal(next.cells[0].right.style, 'dashed');
  assert.equal(next.cells[0].top.style, 'solid');
  const selected = applyTableBorders(spec, 0, 'cell', 'selected', { style: 'none', widthMm: 0 }, ['top']);
  assert.equal(selected.cells[0].top.style, 'none');
  assert.equal(selected.cells[0].right.style, 'solid');
  assert.equal(spec.cells[0].top.style, 'solid');
});

test('inline cell text updates preserve the existing token binding', () => {
  const spec = createTableSpec(1, 1);
  spec.cells[0].token = 'batch_number';
  const next = withCellText(spec, 0, 'Edited preview');
  assert.equal(next.cells[0].text, 'Edited preview');
  assert.equal(next.cells[0].token, 'batch_number');
  assert.equal(spec.cells[0].text, 'R1C1');
  assert.equal(withCellText(spec, 0, 'x'.repeat(161)), spec);
});

test('spreadsheet range borders preserve shared edges and structural edits stay bounded', () => {
  const spec = createTableSpec(3, 3);
  const bordered = applyRangeBorders(spec, { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 2 }, 'outer');
  assert.equal(bordered.cells[1].top.style, 'solid');
  assert.equal(bordered.cells[4].left.style, 'solid');
  assert.deepEqual(bordered.cells[1].bottom, bordered.cells[4].top);
  const cleared = applyRangeBorders(spec, { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }, 'clear');
  assert.deepEqual(cleared.cells[4].left, cleared.cells[3].right);
  assert.equal(insertTableRow(spec, 1)?.rows, 4);
  assert.equal(insertTableColumn(spec, 1)?.cols, 4);
  assert.equal(deleteTableRow(spec, 1)?.rows, 2);
  assert.equal(deleteTableColumn(spec, 1)?.cols, 2);
  assert.equal(deleteTableRow(createTableSpec(1, 3), 0), null);
  assert.equal(deleteTableColumn(createTableSpec(3, 1), 0), null);
});

test('merge and split preserve anchor bindings and reject malformed span layouts', () => {
  const spec = createTableSpec(3, 3);
  spec.cells[0].text = 'Merged title';
  spec.cells[0].token = 'material_number';
  const merged = mergeTableRange(spec, { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 });
  assert.ok(merged);
  assert.equal(merged.cells[0].rowSpan, 2);
  assert.equal(merged.cells[0].colSpan, 2);
  assert.equal(merged.cells[0].token, 'material_number');
  assert.equal(parseTableSpec(merged)?.cells[0].rowSpan, 2);
  assert.equal(mergeTableRange(merged, { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }), null);
  const split = splitTableCell(merged, 0);
  assert.ok(split);
  assert.equal(split.cells[0].rowSpan, 1);
  assert.equal(split.cells[0].colSpan, 1);
  assert.equal(split.cells[0].token, 'material_number');
  const invalid = structuredClone(spec);
  invalid.cells[0].rowSpan = 4;
  assert.equal(parseTableSpec(invalid), null);
});

test('text formatting applies to every cell in a selected range and survives parsing', () => {
  const spec = createTableSpec(2, 3);
  const formatted = applyTableTextFormat(spec, { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 2 }, {
    textAlign: 'center', fontFamily: 'Inter', fontSizeMm: 4, bold: true, italic: true,
  });
  for (const index of [1, 2, 4, 5]) {
    assert.equal(formatted.cells[index].textAlign, 'center');
    assert.equal(formatted.cells[index].fontFamily, 'Inter');
    assert.equal(formatted.cells[index].fontSizeMm, 4);
    assert.equal(formatted.cells[index].bold, true);
    assert.equal(formatted.cells[index].italic, true);
  }
  assert.equal(parseTableSpec(formatted)?.cells[5].fontFamily, 'Inter');
  assert.equal(spec.cells[1].bold, false);
});
