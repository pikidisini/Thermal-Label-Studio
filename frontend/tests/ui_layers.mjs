import assert from 'node:assert/strict';
import test from 'node:test';
import { UI_LAYER } from '../src/shared/ui/layers/uiLayers.ts';
import { getOverlayPosition } from '../src/shared/ui/layers/AnchoredOverlay.tsx';
import { isFontMenuInteractionTarget } from '../src/features/text/ui/TextFormatControls.tsx';

test('F3.36 UI layer contract orders every overlay tier deterministically', () => {
  assert.equal(UI_LAYER.canvas, 0);
  assert.ok(UI_LAYER.chrome > UI_LAYER.canvas);
  assert.ok(UI_LAYER.flyout > UI_LAYER.chrome);
  assert.ok(UI_LAYER.tooltip > UI_LAYER.flyout);
  assert.ok(UI_LAYER.modal > UI_LAYER.tooltip);
  assert.ok(UI_LAYER.toast > UI_LAYER.modal);
});

test('F3.36 anchored overlay is fixed below its trigger viewport position', () => {
  const anchor = {
    getBoundingClientRect: () => ({ left: 128, bottom: 64 }),
  };

  assert.deepEqual(getOverlayPosition(anchor), { left: 128, top: 68 });
});

test('F3.36 font trigger remains an in-menu interaction so it can toggle closed', () => {
  const triggerNode = {};
  const menuNode = {};
  const trigger = { contains: (node) => node === triggerNode };
  const menu = { contains: (node) => node === menuNode };

  assert.equal(isFontMenuInteractionTarget(triggerNode, trigger, menu), true);
  assert.equal(isFontMenuInteractionTarget(menuNode, trigger, menu), true);
  assert.equal(isFontMenuInteractionTarget({}, trigger, menu), false);
});
