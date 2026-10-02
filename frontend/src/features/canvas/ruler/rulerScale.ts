/**
 * Keeps numbered ruler labels readable through the standard 1/2/5 sequence.
 * The result is expressed in label millimetres and can be shared by both axes.
 */
export function getMajorStepMm(pxPerMmAtZoom: number, minimumLabelGapPx = 44): number {
  const rawStep = minimumLabelGapPx / Math.max(pxPerMmAtZoom, 0.001);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}
