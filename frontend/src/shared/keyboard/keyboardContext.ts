export function isShortcutInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (!!target.closest('input, textarea, select, [role="textbox"]') || target.isContentEditable);
}

export function arrowKeyDelta(key: string, step: number): { x: number; y: number } {
  switch (key) {
    case 'ArrowLeft': return { x: -step, y: 0 };
    case 'ArrowRight': return { x: step, y: 0 };
    case 'ArrowUp': return { x: 0, y: -step };
    case 'ArrowDown': return { x: 0, y: step };
    default: return { x: 0, y: 0 };
  }
}

export function isEditorKeyboardBlocked(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || isShortcutInput(event.target) ||
    !!document.querySelector('dialog[open][aria-modal="true"], [role="dialog"][aria-modal="true"], [role="menu"]');
}
