import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_SHORTCUTS, matchStudioShortcut, formatShortcut } from '../src/features/studio/model/studioShortcuts.ts';

const key = (key, overrides = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, ...overrides });

test('shortcut combinations are unique and resolve to their documented action', () => {
  const combinations = new Set();
  for (const shortcut of STUDIO_SHORTCUTS) for (const binding of shortcut.bindings) {
    const combination = formatShortcut(binding);
    assert.ok(!combinations.has(combination), `Duplicate binding ${combination}`);
    combinations.add(combination);
    assert.equal(matchStudioShortcut(key(binding.key, { ctrlKey: !!binding.mod, shiftKey: !!binding.shift, altKey: !!binding.alt }))?.id, shortcut.id);
    if (binding.mod) assert.equal(matchStudioShortcut(key(binding.key, { metaKey: true, shiftKey: !!binding.shift, altKey: !!binding.alt }))?.id, shortcut.id);
  }
});

test('unexpected modifiers and IME composition cannot trigger editor commands', () => {
  for (const event of [key('d', { ctrlKey: true, altKey: true }), key('s', { ctrlKey: true, shiftKey: true }), key('v', { altKey: true }), key('Delete', { ctrlKey: true }), key('z', { ctrlKey: true, isComposing: true }), key('s', { ctrlKey: true, metaKey: true })]) {
    assert.equal(matchStudioShortcut(event), undefined);
  }
  assert.equal(matchStudioShortcut(key('m')), undefined);
  assert.equal(matchStudioShortcut(key('g')), undefined);
});

test('continuous repeat is allowed only for movement and zoom', () => {
  assert.deepEqual(STUDIO_SHORTCUTS.filter(item => item.repeat).map(item => item.id), ['nudge', 'nudgeFast', 'nudgeFine', 'zoomIn', 'zoomOut']);
  assert.equal(formatShortcut({ key: 'z', mod: true, shift: true }, true), 'Cmd+Shift+Z');
});
