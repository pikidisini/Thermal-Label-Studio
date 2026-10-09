export type CustomBase = 'industrial-light' | 'industrial-dark';
export const COLOR_KEYS = ['bar', 'tools', 'panel', 'status', 'workspace', 'grid', 'text', 'action', 'actionText', 'warning', 'warningFill', 'warningText'] as const;
const ADDED_COLOR_KEYS: readonly string[] = ['warning', 'warningFill', 'warningText'];
export type ColorKey = typeof COLOR_KEYS[number];
export type CustomColors = Record<ColorKey, string>;
export interface CustomTheme { base: CustomBase; colors: CustomColors }
export const CUSTOM_PRESETS: Record<CustomBase, CustomColors> = {
  'industrial-light': { bar: '#dce0dc', tools: '#e6e8e5', panel: '#e6e8e5', status: '#dce0dc', workspace: '#f1f2f0', grid: '#bac1bd', text: '#242a2e', action: '#8496a4', actionText: '#16212b', warning: '#69583e', warningFill: '#a49478', warningText: '#282218' },
  'industrial-dark': { bar: '#14181b', tools: '#22282c', panel: '#22282c', status: '#14181b', workspace: '#191d20', grid: '#384249', text: '#dde1e3', action: '#8496a4', actionText: '#16212b', warning: '#c4b79b', warningFill: '#a49478', warningText: '#282218' },
};
export const COLOR_TOKENS: Record<ColorKey, readonly string[]> = {
  bar: ['--ui-region-menu'], tools: ['--ui-region-toolbar'], panel: ['--ui-region-inspector'], status: ['--ui-region-status'], workspace: ['--ui-region-workspace'], grid: ['--ui-viewport-dot'],
  text: ['--ui-text-primary', '--ui-text-secondary'],
  action: ['--ui-primary-container', '--ui-primary-fixed', '--ui-primary-hover'], actionText: ['--ui-on-primary-container'],
  warning: ['--ui-warning'], warningFill: ['--ui-warning-container'], warningText: ['--ui-on-warning-container'],
};
export function isHexColor(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
export function newCustomTheme(base: CustomBase = 'industrial-light'): CustomTheme { return { base, colors: { ...CUSTOM_PRESETS[base] } }; }
export function parseCustomTheme(value: unknown): CustomTheme | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.base !== 'industrial-light' && candidate.base !== 'industrial-dark') return undefined;
  if (!candidate.colors || typeof candidate.colors !== 'object' || Array.isArray(candidate.colors)) return undefined;
  const colors = candidate.colors as Record<string, unknown>;
  const base = candidate.base;
  if (!COLOR_KEYS.every(key => ADDED_COLOR_KEYS.includes(key) && !Object.prototype.hasOwnProperty.call(colors, key) || isHexColor(colors[key]))) return undefined;
  return { base, colors: Object.fromEntries(COLOR_KEYS.map(key => [key, (Object.prototype.hasOwnProperty.call(colors, key) ? colors[key] as string : CUSTOM_PRESETS[base][key]).toLowerCase()])) as CustomColors };
}
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
