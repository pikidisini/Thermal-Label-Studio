export interface FontOption {
  value: string;
  label: string;
  category: 'Sans serif' | 'Serif' | 'Monospace' | 'Display';
}

// The first two web fonts are loaded by index.html. The remaining entries use
// common workstation fonts and fall back through the browser when unavailable.
export const FONT_OPTIONS: readonly FontOption[] = [
  { value: 'Arial', label: 'Arial', category: 'Sans serif' },
  { value: 'Inter', label: 'Inter', category: 'Sans serif' },
  { value: 'Helvetica', label: 'Helvetica', category: 'Sans serif' },
  { value: 'Verdana', label: 'Verdana', category: 'Sans serif' },
  { value: 'Tahoma', label: 'Tahoma', category: 'Sans serif' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS', category: 'Sans serif' },
  { value: 'Georgia', label: 'Georgia', category: 'Serif' },
  { value: 'Garamond', label: 'Garamond', category: 'Serif' },
  { value: 'Palatino Linotype', label: 'Palatino Linotype', category: 'Serif' },
  { value: 'Times New Roman', label: 'Times New Roman', category: 'Serif' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Monospace' },
  { value: 'Courier New', label: 'Courier New', category: 'Monospace' },
  { value: 'Impact', label: 'Impact', category: 'Display' },
];
