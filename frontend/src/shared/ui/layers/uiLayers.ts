/**
 * Single layering contract for editor chrome and transient UI.
 * Keep values here; components must not introduce one-off z-index values.
 */
export const UI_LAYER = {
  canvas: 0,
  chrome: 10,
  flyout: 20,
  tooltip: 30,
  modal: 40,
  toast: 50,
} as const;
