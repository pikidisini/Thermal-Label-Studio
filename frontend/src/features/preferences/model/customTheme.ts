export type CustomBase = 'industrial-light' | 'industrial-dark';
// Version 2 removes the legacy inspector surface alias after an explicit edit.
export const LEGACY_COLOR_KEYS = ["bar", "tools", "panel", "status", "workspace", "grid", "text", "action", "actionText"] as const;
export const COLOR_KEYS = ["bar", "tools", "panel", "status", "workspace", "grid", "text", "action", "actionText", "warning", "warningFill", "warningText", "canvasSurface", "baseSurface", "inputSurface", "dialogSurface", "overlaySurface", "tooltipSurface", "textSecondary", "textDisabled", "border", "outline", "focus", "primary", "primaryText", "actionHover", "actionFixed", "success", "successFill", "successText", "successFixed", "tertiaryText", "danger"] as const;
export type ColorKey = typeof COLOR_KEYS[number];
export type CustomColors = Record<ColorKey, string>;
export interface CustomTheme { base: CustomBase; colors: CustomColors; version?: 2 }
export const CUSTOM_PRESETS: Record<CustomBase, CustomColors> = {
  "industrial-light": {
    "bar": "#dce0dc",
    "tools": "#e6e8e5",
    "panel": "#e6e8e5",
    "status": "#dce0dc",
    "workspace": "#f1f2f0",
    "grid": "#bac1bd",
    "text": "#242a2e",
    "action": "#8496a4",
    "actionText": "#16212b",
    "warning": "#69583e",
    "warningFill": "#a49478",
    "warningText": "#282218",
    "canvasSurface": "#dce0dc",
    "baseSurface": "#f1f2f0",
    "inputSurface": "#e6e8e5",
    "dialogSurface": "#fafbf9",
    "overlaySurface": "#dde1dd",
    "tooltipSurface": "#d2d7d3",
    "textSecondary": "#242a2e",
    "textDisabled": "#78817f",
    "border": "#9ca5a7",
    "outline": "#69767c",
    "focus": "#596b7a",
    "primary": "#485d6c",
    "primaryText": "#ffffff",
    "actionHover": "#8496a4",
    "actionFixed": "#8496a4",
    "success": "#4d6252",
    "successFill": "#899a8c",
    "successText": "#19251e",
    "successFixed": "#bcc8be",
    "tertiaryText": "#ffffff",
    "danger": "#7a514d"
  },
  "industrial-dark": {
    "bar": "#14181b",
    "tools": "#22282c",
    "panel": "#22282c",
    "status": "#14181b",
    "workspace": "#191d20",
    "grid": "#384249",
    "text": "#dde1e3",
    "action": "#8496a4",
    "actionText": "#16212b",
    "warning": "#c4b79b",
    "warningFill": "#a49478",
    "warningText": "#282218",
    "canvasSurface": "#14181b",
    "baseSurface": "#191d20",
    "inputSurface": "#22282c",
    "dialogSurface": "#292f34",
    "overlaySurface": "#323a40",
    "tooltipSurface": "#414a51",
    "textSecondary": "#dde1e3",
    "textDisabled": "#839098",
    "border": "#58636b",
    "outline": "#89959d",
    "focus": "#727e99",
    "primary": "#aabbc7",
    "primaryText": "#16212b",
    "actionHover": "#8496a4",
    "actionFixed": "#8496a4",
    "success": "#adbead",
    "successFill": "#899a8c",
    "successText": "#19251e",
    "successFixed": "#bcc8be",
    "tertiaryText": "#19251e",
    "danger": "#ceb3ad"
  }
};
export const COLOR_TOKENS: Record<ColorKey, readonly string[]> = {
  "bar": [
    "--ui-region-menu"
  ],
  "tools": [
    "--ui-region-toolbar"
  ],
  "panel": [
    "--ui-region-inspector"
  ],
  "status": [
    "--ui-region-status"
  ],
  "workspace": [
    "--ui-region-workspace"
  ],
  "grid": [
    "--ui-viewport-dot"
  ],
  "text": [
    "--ui-text-primary"
  ],
  "action": [
    "--ui-primary-container"
  ],
  "actionText": [
    "--ui-on-primary-container"
  ],
  "warning": [
    "--ui-warning"
  ],
  "warningFill": [
    "--ui-warning-container"
  ],
  "warningText": [
    "--ui-on-warning-container"
  ],
  "canvasSurface": [
    "--ui-surface-canvas"
  ],
  "baseSurface": [
    "--ui-surface-base"
  ],
  "inputSurface": [
    "--ui-surface-low"
  ],
  "dialogSurface": [
    "--ui-surface-raised"
  ],
  "overlaySurface": [
    "--ui-surface-overlay"
  ],
  "tooltipSurface": [
    "--ui-surface-highest"
  ],
  "textSecondary": [
    "--ui-text-secondary"
  ],
  "textDisabled": [
    "--ui-text-disabled"
  ],
  "border": [
    "--ui-border-default"
  ],
  "outline": [
    "--ui-outline"
  ],
  "focus": [
    "--ui-focus"
  ],
  "primary": [
    "--ui-primary"
  ],
  "primaryText": [
    "--ui-on-primary"
  ],
  "actionHover": [
    "--ui-primary-hover"
  ],
  "actionFixed": [
    "--ui-primary-fixed"
  ],
  "success": [
    "--ui-success"
  ],
  "successFill": [
    "--ui-success-container"
  ],
  "successText": [
    "--ui-on-success-container"
  ],
  "successFixed": [
    "--ui-success-fixed"
  ],
  "tertiaryText": [
    "--ui-on-tertiary"
  ],
  "danger": [
    "--ui-danger"
  ]
};
export function isHexColor(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
export function newCustomTheme(base: CustomBase = 'industrial-light'): CustomTheme { return { base, version: 2, colors: { ...CUSTOM_PRESETS[base] } }; }
export function parseCustomTheme(value: unknown): CustomTheme | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.base !== 'industrial-light' && candidate.base !== 'industrial-dark') return undefined;
  if (candidate.version !== undefined && candidate.version !== 2) return undefined;
  if (!candidate.colors || typeof candidate.colors !== 'object' || Array.isArray(candidate.colors)) return undefined;
  const supplied = candidate.colors as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(supplied, key);
  if (!LEGACY_COLOR_KEYS.every(key => has(key)) || !COLOR_KEYS.every(key => !has(key) || isHexColor(supplied[key]))) return undefined;
  const defaults = CUSTOM_PRESETS[candidate.base];
  const colors = Object.fromEntries(COLOR_KEYS.map(key => [key, (has(key) ? supplied[key] as string : key === 'textSecondary' ? supplied.text as string : key === 'actionHover' || key === 'actionFixed' ? supplied.action as string : defaults[key]).toLowerCase()])) as CustomColors;
  return { base: candidate.base, ...(candidate.version === 2 ? { version: 2 as const } : {}), colors };
}
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
