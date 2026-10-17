export function isShortcutInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (!!target.closest('input, textarea, select, [role="textbox"]') || target.isContentEditable);
}

export function isEditorKeyboardBlocked(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || isShortcutInput(event.target) ||
    !!document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]');
}
