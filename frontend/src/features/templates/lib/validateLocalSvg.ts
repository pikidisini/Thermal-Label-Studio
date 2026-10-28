export interface ValidatedSvg { svg: string; widthMm: number; heightMm: number }
export function validateLocalSvg(svg: string, fallbackWidthMm = 200, fallbackHeightMm = 80): ValidatedSvg | { error: string } {
  if (svg.length > 5 * 1024 * 1024) return { error: 'SVG exceeds 5 MiB.' };
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'); const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return { error: 'SVG root is invalid.' };
  if (doc.querySelector('script,foreignObject,style') || /<!DOCTYPE|<!ENTITY|@import|url\s*\(/i.test(svg)) return { error: 'SVG contains active or external content.' };
  const referenceError = validateReferences(root);
  if (referenceError) { return { error: referenceError }; }
  const parse = (value: string | null) => value && /mm$/i.test(value.trim()) ? Number(value.trim().replace(/mm$/i, '')) : Number.NaN;
  let widthMm = parse(root.getAttribute('width')); let heightMm = parse(root.getAttribute('height'));
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) { widthMm = fallbackWidthMm; heightMm = fallbackHeightMm; }
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 1 || heightMm < 1 || widthMm > 1000 || heightMm > 1000) return { error: 'SVG dimensions must be 1-1000 mm.' };
  return { svg, widthMm, heightMm };
}

function isEmbeddedRaster(element: Element, value: string): boolean {
  const embedded = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/is.exec(value);
  const body = embedded?.[1]?.replace(/[\t\n\r ]/g, '') || '';
  return element.tagName.toLowerCase() === 'image' && body.length > 0
    && body.length <= 5 * 1024 * 1024 && /^[a-z0-9+/]+={0,2}$/i.test(body);
}

function validateReferences(root: Element): string | null {
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      if (/^on/i.test(attr.name)) { return 'Event attributes are not allowed.'; }
      const value = attr.value.trim();
      if (/^(href|src|xlink:href)$/i.test(attr.name) && value && !value.startsWith('#') && !isEmbeddedRaster(element, value)) {
        return 'External references are not allowed.';
      }
    }
  }
  return null;
}
