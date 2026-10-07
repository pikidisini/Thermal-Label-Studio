import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSnap } from '../src/features/snapping/engine/snapEngine.ts';

const config = { enabled: true, tolerance: 8, gridStep: 10, labelWidth: 300, labelHeight: 200, margin: 20 };

test('F3.34 pure engine resolves axes independently and honors candidate priority', () => {
  const result = resolveSnap({ x: 53, y: 47 }, [
    { axis: 'x', value: 50, kind: 'grid' },
    { axis: 'x', value: 55, kind: 'object' },
    { axis: 'x', value: 54, kind: 'anchor' },
    { axis: 'y', value: 50, kind: 'label' },
  ], config);
  assert.deepEqual(result.point, { x: 54, y: 50 });
  assert.deepEqual(result.guides.map(guide => guide.axis), ['x', 'y']);
});

test('F3.34 Snap disabled leaves points unchanged', () => {
  const result = resolveSnap({ x: 23, y: 27 }, [{ axis: 'x', value: 20, kind: 'anchor' }], { ...config, enabled: false });
  assert.deepEqual(result.point, { x: 23, y: 27 });
  assert.equal(result.guides.length, 0);
});

test('F3.34 Guides visibility is independent from Snap coordinate resolution', () => {
  // Guides is deliberately a UI-only toggle. The engine still resolves grid
  // coordinates while the caller elects not to render result.guides.
  const result = resolveSnap({ x: 23, y: 27 }, [], config);
  const guidesEnabled = false;
  const renderedGuides = guidesEnabled ? result.guides : [];
  assert.deepEqual(result.point, { x: 20, y: 30 });
  assert.deepEqual(renderedGuides, []);
});
