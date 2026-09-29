import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableModel, mergeTableRange, styleTableEdges } from '../src/features/table/model/tableModelV2.ts';
import { makeTableGroupV2 } from '../src/features/table/canvas/tableRenderer.ts';

test('v2 renderer keeps model bounds when every edge is none', () => {
  let model = createTableModel(2, 3);
  model = styleTableEdges(model, { style: 'none', widthMm: 0 }, 'all');
  const group = makeTableGroupV2(model, 4);
  assert.equal(group.tableVersion, 2);
  assert.equal(group.width, 240);
  assert.equal(group.height, 64);
  assert.equal(group.getObjects().filter(object => object.type === 'line').length, 0);
});

test('v2 renderer draws visible shared segments once and excludes merged interior', () => {
  const merged = mergeTableRange(createTableModel(2, 2), { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 });
  const group = makeTableGroupV2(merged, 4);
  assert.equal(group.getObjects().filter(object => object.type === 'line').length, 4);
});
