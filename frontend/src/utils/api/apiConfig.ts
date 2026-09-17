export const API_BASE = '/api/v1';

export const FALLBACK_TEMPLATES = [
  { id: 'label_roll_80x200', name: 'Label Roll 80X200', filename: 'label_roll_80x200.svg', is_builtin: true, width_mm: 80, height_mm: 200 },
];

// Tidak ada SVG fallback palsu: jika backend mati, integrasi harus terlihat gagal.
export const FALLBACK_SVGS: Record<string, string> = {};
