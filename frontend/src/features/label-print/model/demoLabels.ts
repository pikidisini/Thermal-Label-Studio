/** UI illustrations only; never SAP results or printer payloads. */
export function demoLabelImage(batch: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const c = canvas.getContext('2d');
  if (!c) return '';
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 640, 360);
  c.fillStyle = '#000000'; c.font = 'bold 28px Arial'; c.fillText('SAMPLE LABEL', 28, 48);
  c.fillRect(28, 65, 584, 2); c.font = '20px Arial'; c.fillText('MATERIAL: DEMO FILM', 28, 104);
  c.fillText('BATCH', 28, 148); c.font = 'bold 28px monospace'; c.fillText(batch, 28, 192, 584);
  c.font = '20px Arial'; c.fillText('WIDTH: 1,000 MM', 28, 238); c.fillText('LENGTH: 3,000 M', 330, 238);
  c.fillRect(28, 270, 584, 2); c.font = '17px Arial'; c.fillText('DEMO ONLY - NOT RENDERED FROM IPL/ZPL', 28, 316);
  return canvas.toDataURL('image/png');
}
