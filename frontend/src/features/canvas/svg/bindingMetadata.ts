import { parseBoundedJson } from '../../data-tokens';

export interface SymbolSpec { version: 1; type: 'code128' | 'code39' | 'ean13' | 'qrcode'; options: Record<string, string | number | boolean> }
export function textLayout(object: any) {
  const origin = (value: unknown) => typeof value === 'number' ? value : ({ left: 0, top: 0, center: .5, right: 1, bottom: 1 } as any)[String(value)];
  const originX = origin(object.originX), originY = origin(object.originY);
  const dims = object._getTransformedDimensions();
  const dw = object._getTransformedDimensions({ width: object.width + 1 });
  const dh = object._getTransformedDimensions({ height: object.height + 1 });
  const angle = object.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const [a, b, cc, d] = object.calcOwnMatrix(), det = a*d-b*cc;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Unsupported text transform.');
  const vector = (dx: number, dy: number) => {
    const x = (.5-originX)*dx, y = (.5-originY)*dy;
    const rx = c*x-s*y, ry = s*x+c*y;
    return [(d*rx-cc*ry)/det, (-b*rx+a*ry)/det];
  };
  const value = { version: 1, profile: 'fabric7', width: object.width, height: object.height,
    advance_width: vector(dw.x-dims.x, dw.y-dims.y), advance_height: vector(dh.x-dims.x, dh.y-dims.y),
    origin_x: originX, origin_y: originY, char_spacing: object.charSpacing || 0 };
  validateTextLayout(value);
  return value;
}
export function validateTextLayout(value: any) {
  if (!value || Object.keys(value).sort().join(',') !== 'advance_height,advance_width,char_spacing,height,origin_x,origin_y,profile,version,width' || value.version !== 1 || value.profile !== 'fabric7') throw new Error('Invalid text layout.');
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6;
  if (!finite(value.width) || value.width <= 0 || !finite(value.height) || value.height <= 0 || !finite(value.origin_x) || value.origin_x < 0 || value.origin_x > 1 || !finite(value.origin_y) || value.origin_y < 0 || value.origin_y > 1 || !finite(value.char_spacing) || value.char_spacing < -1000 || value.char_spacing > 10000) throw new Error('Invalid text layout.');
  for (const name of ['advance_width', 'advance_height']) if (!Array.isArray(value[name]) || value[name].length !== 2 || !value[name].every(finite)) throw new Error('Invalid text layout.');
  return value;
}
export function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Invalid binding metadata.');
  return value;
}
export function encodeSpec(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > 16384) throw new Error('Binding metadata exceeds its limit.');
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}
export function decodeSpec(value: string): any {
  if (value.length > 21848 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid binding metadata.');
  const binary = atob(value);
  if (btoa(binary) !== value || binary.length > 16384) throw new Error('Invalid binding metadata.');
  const spec = parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as any;
  if (!spec || Array.isArray(spec) || spec.version !== 1) throw new Error('Unsupported binding metadata version.');
  return spec;
}
export function payloadSpec(template: string): { version: 1; template: string } {
  if (typeof template === 'string' && /[\uD800-\uDFFF]/u.test(template)) throw new Error('Invalid binding Unicode.');
  if (typeof template !== 'string' || template.includes('\0') || Array.from(template).length > 4096 || new TextEncoder().encode(template).length > 16384 || !/^([^{}]|\{\{\s*[A-Za-z0-9_-]+\s*\}\})*(?![\s\S])/.test(template)) throw new Error('Invalid binding composition.');
  for (const match of template.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)) key(match[1]);
  return { version: 1, template };
}
export function validateSymbolSpec(value: any): SymbolSpec {
  if (!value || value.version !== 1 || Object.keys(value).sort().join(',') !== 'options,type,version' || !value.options || Array.isArray(value.options)) throw new Error('Invalid symbol metadata.');
  const o = value.options;
  const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 4096;
  if (value.type === 'qrcode') {
    if (Object.keys(o).sort().join(',') !== 'ecc,encoding,margin,mask,qr_version,segmentation,size' || !['L', 'M', 'Q', 'H'].includes(o.ecc) || o.encoding !== 'utf8' || !['auto', 'byte'].includes(o.segmentation) || o.margin !== 1 || !positive(o.size)) throw new Error('Unsupported QR options.');
    for (const [name, min, max] of [['qr_version', 1, 40], ['mask', 0, 7]] as const) if (o[name] !== 'auto' && (!Number.isInteger(o[name]) || o[name] < min || o[name] > max)) throw new Error('Invalid QR options.');
  } else if (['code128', 'code39', 'ean13'].includes(value.type)) {
    const checksum = value.type === 'ean13' ? 'verified' : value.type === 'code39' ? false : 'native';
    if (Object.keys(o).sort().join(',') !== 'bar_height,checksum,display_value,font_size,margin,module_width' || !positive(o.module_width) || !positive(o.bar_height) || o.margin !== 2 || o.display_value !== false || o.font_size !== 12 || o.checksum !== checksum) throw new Error('Unsupported barcode options.');
  } else throw new Error('Unsupported symbol type.');
  return value;
}
export function creationSymbolSpec(type: string): SymbolSpec {
  return validateSymbolSpec({ version: 1, type, options: type === 'qrcode'
    ? { ecc: 'M', margin: 1, size: 150, encoding: 'utf8', segmentation: 'auto', qr_version: 'auto', mask: 'auto' }
    : { module_width: 2, bar_height: 40, margin: 2, display_value: false, font_size: 12, checksum: type === 'ean13' ? 'verified' : type === 'code39' ? false : 'native' } });
}
export function validateMetadataDocument(document: Document): void {
  const nodes = Array.from(document.querySelectorAll('*'));
  if (nodes.length > 10000 || document.querySelector('parsererror')) throw new Error('Invalid SVG metadata.');
  const rootVersion = document.documentElement.getAttribute('data-binding-version');
  const profile = document.documentElement.getAttribute('data-editor-coordinate-profile');
  if (profile !== null && profile !== 'fabric7') throw new Error('Unsupported coordinate profile.');
  if (rootVersion !== null && rootVersion !== '1') throw new Error('Unsupported binding metadata version.');
  const owners = new Set<Element>();
  const allowed = new Set(['data-text-layout', 'data-editor-coordinate-profile', 'data-binding-version', 'data-field', 'data-placeholder', 'data-is-dynamic', 'data-payload-spec', 'data-text-spec', 'data-symbol-spec', 'data-barcode', 'data-qr', 'data-barcode-type', 'data-barcode-value', 'data-is-barcode', 'data-editor-group']);
  for (const node of nodes) {
    if (node.localName === 'image') {
      const href = node.getAttribute('href');
      const xlink = node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (href !== null && xlink !== null && href !== xlink) throw new Error('Conflicting image sources.');
    }
    for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-') && !allowed.has(attr.name)) throw new Error('Unsupported binding metadata.');
    const fields = ['data-field', 'data-placeholder', 'data-barcode', 'data-qr'].map((name) => node.getAttribute(name)).filter((v) => v !== null);
    fields.forEach(key);
    if (new Set(fields).size > 1) throw new Error('Conflicting binding fields.');
    const encoded = node.getAttribute('data-payload-spec');
    const symbol = node.getAttribute('data-symbol-spec');
    const text = node.getAttribute('data-text-spec');
    const layout = node.getAttribute('data-text-layout');
    if (layout !== null) {
      if (profile !== 'fabric7' || symbol !== null || !(fields.length || encoded !== null)) throw new Error('Conflicting text layout.');
      validateTextLayout(decodeSpec(layout));
    }
    const dynamic = fields.length > 0 || encoded !== null || symbol !== null;
    for (const flag of ['data-is-dynamic', 'data-is-barcode', 'data-editor-group']) if (node.hasAttribute(flag) && node.getAttribute(flag) !== 'true') throw new Error('Invalid metadata flag.');
    let ancestor = node.parentElement;
    let depth = 1;
    while (ancestor) {
      if (++depth > 32 || dynamic && owners.has(ancestor)) throw new Error('Nested binding owners are unsupported.');
      ancestor = ancestor.parentElement;
    }
    if (dynamic) owners.add(node);
    if (node !== document.documentElement && node.hasAttribute('data-binding-version')) throw new Error('Conflicting binding version.');
    if (node !== document.documentElement && node.hasAttribute('data-editor-coordinate-profile')) throw new Error('Conflicting coordinate profile.');
    if (dynamic && document.documentElement.getAttribute('data-binding-version') !== '1') throw new Error('Legacy dynamic SVG needs explicit metadata migration.');
    if (encoded !== null) {
      const spec = decodeSpec(encoded);
      if (Object.keys(spec).sort().join(',') !== 'template,version') throw new Error('Invalid payload metadata.');
      payloadSpec(spec.template);
      if (fields.length && !new RegExp(`^\\{\\{\\s*${fields[0]}\\s*\\}\\}(?![\\s\\S])`).test(spec.template)) throw new Error('Conflicting payload metadata.');
    }
    if (symbol !== null) {
      const spec = validateSymbolSpec(decodeSpec(symbol));
      if (node.children.length !== 1 || node.children[0].localName !== 'image' || node.children[0].children.length !== 0) throw new Error('Unsupported symbol owner shape.');
      if (node.localName !== 'g' || spec.type !== node.getAttribute('data-barcode-type') || text !== null || fields.length === 0 && encoded === null || node.hasAttribute('data-qr') && spec.type !== 'qrcode' || node.hasAttribute('data-barcode') && spec.type === 'qrcode') throw new Error('Conflicting symbol metadata.');
    } else if (dynamic) {
      if (node.localName !== 'text' || text === null || node.hasAttribute('data-is-barcode') || node.hasAttribute('data-barcode-type')) throw new Error('Incomplete binding metadata.');
      const spec = decodeSpec(text);
      if (Object.keys(spec).sort().join(',') !== 'font_size,line_height,text_align,version' || !['left', 'center', 'right'].includes(spec.text_align) || !Number.isFinite(spec.font_size) || spec.font_size <= 0 || spec.font_size > 4096 || !Number.isFinite(spec.line_height) || spec.line_height <= 0 || spec.line_height > 4096 || node.children.length > 100 || Array.from(node.children).some((child) => child.localName !== 'tspan')) throw new Error('Invalid text metadata.');
      const declarations = (node.getAttribute('style') ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => part.split(':').map((value) => value.trim()));
      const styleFonts = declarations.filter(([name]) => name === 'font-size').map(([, value]) => Number(value));
      const fonts = [...styleFonts, ...(node.hasAttribute('font-size') ? [Number(node.getAttribute('font-size'))] : [])];
      if (!fonts.length || fonts.some((value) => value !== spec.font_size)) throw new Error('Conflicting text metrics.');
      for (const span of Array.from(node.children)) {
        if (['font-size', 'font-family', 'font-weight', 'font-style'].some((name) => span.hasAttribute(name)) || /(?:^|;)\s*font-(?:size|family|weight|style)\s*:/.test(span.getAttribute('style') ?? '')) throw new Error('Dynamic rich text requires a proven profile.');
      }
    }
    if (!dynamic && ['data-is-dynamic', 'data-is-barcode', 'data-barcode-type', 'data-barcode-value', 'data-text-spec'].some((name) => node.hasAttribute(name))) throw new Error('Incomplete binding metadata.');
  }
}
