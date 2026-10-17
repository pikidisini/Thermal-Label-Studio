import type { CustomTheme } from './customTheme';

/** Immutable builtin; draft copies may be edited into Custom. */
export const SIGNATURE_THEME: CustomTheme = Object.freeze({
  base: 'industrial-light',
  colors: Object.freeze({ bar: '#ededed', tools: '#ffffff', panel: '#ffffff', status: '#ededed', workspace: '#ededed', grid: '#9e9e9e', text: '#030303', action: '#749faa', actionText: '#ffffff', warning: '#89806c', warningFill: '#89806c', warningText: '#ffffff' }),
});
export function signatureDraft(): CustomTheme { return { base: SIGNATURE_THEME.base, colors: { ...SIGNATURE_THEME.colors } }; }
