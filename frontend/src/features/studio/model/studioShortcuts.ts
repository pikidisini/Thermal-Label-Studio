export interface ShortcutBinding {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface StudioShortcut {
  id: string;
  group: string;
  description: string;
  bindings: ShortcutBinding[];
  designOnly?: boolean;
  repeat?: boolean;
}

const mod = (key: string, shift = false): ShortcutBinding => ({ key, mod: true, shift });
const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

// Consumed by both the keyboard handler and help UI. Gesture handlers stay in canvas/editor.
export const STUDIO_SHORTCUTS: StudioShortcut[] = [
  ...[
    ['select', 'v', 'Select tool'], ['text', 't', 'Text tool'],
    ['barcode', 'b', 'Barcode tool'], ['qrcode', 'q', 'QR code tool'],
    ['line', 'l', 'Line tool'],
  ].map(([id, key, description]) => ({ id, group: 'Tools', description, bindings: [{ key }], designOnly: true })),
  { id: 'escape', group: 'Tools', description: 'Cancel the active tool or deselect objects', bindings: [{ key: 'Escape' }], designOnly: true },
  { id: 'undo', group: 'Editing', description: 'Undo last change', bindings: [mod('z')], designOnly: true },
  { id: 'redo', group: 'Editing', description: 'Redo previously undone change', bindings: [mod('y'), mod('z', true)], designOnly: true },
  { id: 'duplicate', group: 'Editing', description: 'Duplicate selected objects (+10 mm)', bindings: [mod('d')], designOnly: true },
  { id: 'copy', group: 'Editing', description: 'Copy selected objects', bindings: [mod('c')], designOnly: true },
  { id: 'paste', group: 'Editing', description: 'Paste copied objects (+10 mm)', bindings: [mod('v')], designOnly: true },
  { id: 'delete', group: 'Editing', description: 'Delete selected objects', bindings: [{ key: 'Delete' }, { key: 'Backspace' }], designOnly: true },
  { id: 'selectAll', group: 'Editing', description: 'Select all selectable objects', bindings: [mod('a')], designOnly: true },
  { id: 'save', group: 'Editing', description: 'Open Save Template', bindings: [mod('s')] },
  { id: 'nudge', group: 'Position', description: 'Move selection by 1 mm', bindings: arrows.map(key => ({ key })), designOnly: true, repeat: true },
  { id: 'nudgeFast', group: 'Position', description: 'Move selection by 5 mm', bindings: arrows.map(key => ({ key, shift: true })), designOnly: true, repeat: true },
  { id: 'nudgeFine', group: 'Position', description: 'Move selection by 0.2 mm', bindings: arrows.map(key => ({ key, alt: true })), designOnly: true, repeat: true },
  { id: 'zoomIn', group: 'View', description: 'Zoom in', bindings: [mod('='), mod('+', true), mod('+')], repeat: true },
  { id: 'zoomOut', group: 'View', description: 'Zoom out', bindings: [mod('-'), mod('_', true)], repeat: true },
  { id: 'fit', group: 'View', description: 'Fit and center canvas', bindings: [mod('0')] },
  { id: 'actualSize', group: 'View', description: 'Zoom to 100% and center canvas', bindings: [mod('1')] },
  { id: 'help', group: 'Help', description: 'Open keyboard shortcuts', bindings: [{ key: '?', shift: true }, { key: '?' }] },
];

export function matchStudioShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'>) {
  if (event.isComposing || (event.ctrlKey && event.metaKey)) return undefined;
  return STUDIO_SHORTCUTS.find(shortcut => shortcut.bindings.some(binding =>
    event.key.toLowerCase() === binding.key.toLowerCase() &&
    (event.ctrlKey || event.metaKey) === !!binding.mod &&
    event.shiftKey === !!binding.shift && event.altKey === !!binding.alt
  ));
}

export function formatShortcut(binding: ShortcutBinding, mac = false): string {
  const key = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
  return [binding.mod && (mac ? 'Cmd' : 'Ctrl'), binding.alt && (mac ? 'Option' : 'Alt'), binding.shift && 'Shift', key].filter(Boolean).join('+');
}
