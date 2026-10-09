import test from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Group, ActiveSelection, util } from 'fabric';
import { alignObjectToLabel, setTransformAnchor, TRANSFORM_ANCHORS } from '../src/features/canvas/editor/objectGeometry.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const rectangle = (options = {}) => new Rect({ width: 100, height: 40, left: 73, top: 61, stroke: '#000', strokeWidth: 8, ...options });

test('all six alignments use rotated, skewed, stroked scene bounds and preserve the other axis', () => {
  for (const angle of [0, 45, 90, 135]) for (const originX of ['left', 'center', 'right']) {
    for (const alignment of ['left', 'center', 'right', 'top', 'middle', 'bottom']) {
      const object = rectangle({ angle, originX, originY: 'bottom', skewX: 17, skewY: 9, scaleX: 1.7, scaleY: 0.8 });
      object.setCoords();
      const before = object.getBoundingRect();
      alignObjectToLabel(object, alignment, 400, 320);
      const bounds = object.getBoundingRect();
      if (alignment === 'left') near(bounds.left, 0);
      if (alignment === 'center') near(bounds.left + bounds.width / 2, 200);
      if (alignment === 'right') near(bounds.left + bounds.width, 400);
      if (alignment === 'top') near(bounds.top, 0);
      if (alignment === 'middle') near(bounds.top + bounds.height / 2, 160);
      if (alignment === 'bottom') near(bounds.top + bounds.height, 320);
      near(['left', 'center', 'right'].includes(alignment) ? bounds.top : bounds.left,
        ['left', 'center', 'right'].includes(alignment) ? before.top : before.left);
    }
  }
});

test('all nine anchors retain transformed world coordinates, including grouped children', () => {
  for (const grouped of [false, true]) {
    const object = rectangle({ angle: 47, skewX: 21, scaleX: 1.4, flipY: true });
    if (grouped) new Group([object, rectangle({ left: 210 })], { angle: 29, scaleY: 1.3 });
    const before = object.getCoords();
    for (const anchor of Object.keys(TRANSFORM_ANCHORS)) {
      setTransformAnchor(object, anchor);
      object.getCoords().forEach((point, index) => { near(point.x, before[index].x); near(point.y, before[index].y); });
      assert.deepEqual([object.originX, object.originY], TRANSFORM_ANCHORS[anchor]);
    }
  }
});

test('groups and active selections align as a unit without changing member spacing', () => {
  for (const Container of [Group, ActiveSelection]) {
    const members = [rectangle(), rectangle({ left: 220, top: 150, angle: 90 })];
    const object = new Container(members, { angle: 30, scaleX: 1.2 });
    object.setCoords();
    const before = members.map(member => member.getCenterPoint());
    alignObjectToLabel(object, 'right', 400, 320);
    near(object.getBoundingRect().left + object.getBoundingRect().width, 400);
    const after = members.map(member => member.getCenterPoint());
    near(after[1].x - after[0].x, before[1].x - before[0].x);
    near(after[1].y - after[0].y, before[1].y - before[0].y);
  }
});

test('anchor coordinates survive JSON history restoration and SVG geometry stays fixed', async () => {
  const object = rectangle({ angle: 45, skewX: 13 });
  const svg = object.toSVG();
  setTransformAnchor(object, 'bottom-right');
  assert.equal(object.toSVG(), svg);
  const snapshot = object.toObject();
  const [restored] = await util.enlivenObjects([snapshot]);
  assert.equal(restored.originX, 'right');
  assert.equal(restored.originY, 'bottom');
  // Fabric JSON rounds coordinates to its configured serialization precision.
  near(restored.left, snapshot.left);
  near(restored.top, snapshot.top);
});
