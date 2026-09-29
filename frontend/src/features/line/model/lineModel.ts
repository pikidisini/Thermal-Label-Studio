export type LineStyle = 'solid' | 'dashed' | 'dotted';

export const LINE_STYLE_DASH: Record<LineStyle, number[] | undefined> = {
  solid: undefined,
  dashed: [8, 5],
  dotted: [2, 4],
};

export function clampLineWidthMm(value: number): number {
  return Math.min(5, Math.max(0.05, Number.isFinite(value) ? value : 0.5));
}

export function lineStyleFromObject(object: any): LineStyle {
  const dash = object?.strokeDashArray;
  if (Array.isArray(dash) && dash.length) return dash[0] <= 3 ? 'dotted' : 'dashed';
  return 'solid';
}
