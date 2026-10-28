import { parseBoundedJson } from '../../data-tokens';

export interface SymbolSpec { version: 1; type: 'code128' | 'code39' | 'ean13' | 'qrcode'; options: Record<string, string | number | boolean> }
export function textLayout(object: any) {
  const origins: Record<string, number> = { left: 0, top: 0, center: .5, right: 1, bottom: 1 };
  const origin = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return origins[value];
    return undefined;
  };
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
  if (!value || Object.keys(value).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'advance_height,advance_width,char_spacing,height,origin_x,origin_y,profile,version,width' || value.version !== 1 || value.profile !== 'fabric7') throw new Error('Invalid text layout.');
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
  return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(''));
}
export function decodeSpec(value: string): any {
  if (value.length > 21848 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid binding metadata.');
  const binary = atob(value);
  if (btoa(binary) !== value || binary.length > 16384) throw new Error('Invalid binding metadata.');
  const spec = parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, (c) => c.codePointAt(0)!))) as any;
  if (!spec || Array.isArray(spec) || spec.version !== 1) throw new Error('Unsupported binding metadata version.');
  return spec;
}
export function payloadSpec(template: string): { version: 1; template: string } {
  if (typeof template === 'string' && /[\uD800-\uDFFF]/u.test(template)) throw new Error('Invalid binding Unicode.');
  if (typeof template !== 'string' || template.includes('\0') || Array.from(template).length > 4096 || new TextEncoder().encode(template).length > 16384 || !/^([^{}]|\{\{\s*[A-Za-z0-9_-]+\s*\}\})*(?![\s\S])/.test(template)) throw new Error('Invalid binding composition.');
  for (const match of template.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)) key(match[1]);
  return { version: 1, template };
}
function symbolChecksum(type: string): 'verified' | false | 'native' {
  if (type === 'ean13') return 'verified';
  if (type === 'code39') return false;
  return 'native';
}

function positiveOption(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 4096;
}

function validateQrOptions(options: any): void {
  if (Object.keys(options).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'ecc,encoding,margin,mask,qr_version,segmentation,size'
      || !['L', 'M', 'Q', 'H'].includes(options.ecc) || options.encoding !== 'utf8'
      || !['auto', 'byte'].includes(options.segmentation) || options.margin !== 1 || !positiveOption(options.size)) {
    throw new Error('Unsupported QR options.');
  }
  for (const [name, min, max] of [['qr_version', 1, 40], ['mask', 0, 7]] as const) {
    if (options[name] !== 'auto' && (!Number.isInteger(options[name]) || options[name] < min || options[name] > max)) {
      throw new Error('Invalid QR options.');
    }
  }
}

function validateBarcodeOptions(options: any, type: string): void {
  if (Object.keys(options).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'bar_height,checksum,display_value,font_size,margin,module_width'
      || !positiveOption(options.module_width) || !positiveOption(options.bar_height) || options.margin !== 2
      || options.display_value !== false || options.font_size !== 12 || options.checksum !== symbolChecksum(type)) {
    throw new Error('Unsupported barcode options.');
  }
}

export function validateSymbolSpec(value: any): SymbolSpec {
  if (value?.version !== 1 || Object.keys(value).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'options,type,version'
      || !value?.options || Array.isArray(value.options)) throw new Error('Invalid symbol metadata.');
  if (value.type === 'qrcode') validateQrOptions(value.options);
  else if (['code128', 'code39', 'ean13'].includes(value.type)) validateBarcodeOptions(value.options, value.type);
  else throw new Error('Unsupported symbol type.');
  return value;
}
export function creationSymbolSpec(type: string): SymbolSpec {
  return validateSymbolSpec({ version: 1, type, options: type === 'qrcode'
    ? { ecc: 'M', margin: 1, size: 150, encoding: 'utf8', segmentation: 'auto', qr_version: 'auto', mask: 'auto' }
    : { module_width: 2, bar_height: 40, margin: 2, display_value: false, font_size: 12, checksum: symbolChecksum(type) } });
}
export function validateMetadataDocument(document: Document): void {
  const nodes = Array.from(document.querySelectorAll<SVGElement | HTMLElement>('*'));
  if (nodes.length > 10000 || document.querySelector('parsererror')) throw new Error('Invalid SVG metadata.');
  const rootVersion = (document.documentElement.dataset.bindingVersion ?? null);
  const profile = (document.documentElement.dataset.editorCoordinateProfile ?? null);
  if (profile !== null && profile !== 'fabric7') throw new Error('Unsupported coordinate profile.');
  if (rootVersion !== null && rootVersion !== '1') throw new Error('Unsupported binding metadata version.');
  const owners = new Set<Element>();
  const allowed = new Set(['data-text-layout', 'data-editor-coordinate-profile', 'data-binding-version', 'data-field', 'data-placeholder', 'data-is-dynamic', 'data-payload-spec', 'data-text-spec', 'data-symbol-spec', 'data-barcode', 'data-qr', 'data-barcode-type', 'data-barcode-value', 'data-is-barcode', 'data-editor-group']);
  for (const node of nodes) {
    validateMetadataNode(node, document.documentElement, profile, owners, allowed);
  }
}

type MetadataElement = SVGElement | HTMLElement;
function validateMetadataNode(node: MetadataElement, root: HTMLElement, profile: string | null, owners: Set<Element>, allowed: Set<string>): void {
  validateImageSources(node);
  for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-') && !allowed.has(attr.name)) throw new Error('Unsupported binding metadata.');
  const fields = ['data-field', 'data-placeholder', 'data-barcode', 'data-qr'].map((name) => node.getAttribute(name)).filter((v) => v !== null);
  fields.forEach(key);
  if (new Set(fields).size > 1) throw new Error('Conflicting binding fields.');
  const encoded = (node.dataset.payloadSpec ?? null);
  const symbol = (node.dataset.symbolSpec ?? null);
  const text = (node.dataset.textSpec ?? null);
  const layout = (node.dataset.textLayout ?? null);
  validateNodeLayout(layout, profile, symbol, fields, encoded);
  const dynamic = fields.length > 0 || encoded !== null || symbol !== null;
  validateNodeOwnership(node, root, dynamic, owners);
  validateNodePayload(encoded, fields);
  if (symbol !== null) { validateSymbolOwner(node, symbol, text, fields, encoded); }
  else if (dynamic) { validateTextOwner(node, text); }
  if (!dynamic && ['data-is-dynamic', 'data-is-barcode', 'data-barcode-type', 'data-barcode-value', 'data-text-spec'].some((name) => node.hasAttribute(name))) throw new Error('Incomplete binding metadata.');
}

function validateImageSources(node: MetadataElement): void {
  if (node.localName === 'image') {
    const href = node.getAttribute('href');
    const xlink = node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (href !== null && xlink !== null && href !== xlink) throw new Error('Conflicting image sources.');
  }
}

function validateNodeLayout(layout: string | null, profile: string | null, symbol: string | null, fields: string[], encoded: string | null): void {
  if (layout !== null) {
    if (profile !== 'fabric7' || symbol !== null || !(fields.length || encoded !== null)) throw new Error('Conflicting text layout.');
    validateTextLayout(decodeSpec(layout));
  }
}

function validateNodeOwnership(node: MetadataElement, root: HTMLElement, dynamic: boolean, owners: Set<Element>): void {
  for (const flag of ['data-is-dynamic', 'data-is-barcode', 'data-editor-group']) if (node.hasAttribute(flag) && node.getAttribute(flag) !== 'true') throw new Error('Invalid metadata flag.');
  let ancestor = node.parentElement;
  let depth = 1;
  while (ancestor) {
    if (++depth > 32 || dynamic && owners.has(ancestor)) throw new Error('Nested binding owners are unsupported.');
    ancestor = ancestor.parentElement;
  }
  if (dynamic) owners.add(node);
  if (node !== root && (node.dataset.bindingVersion !== undefined)) throw new Error('Conflicting binding version.');
  if (node !== root && (node.dataset.editorCoordinateProfile !== undefined)) throw new Error('Conflicting coordinate profile.');
  if (dynamic && (root.dataset.bindingVersion ?? null) !== '1') throw new Error('Legacy dynamic SVG needs explicit metadata migration.');
}

function validateNodePayload(encoded: string | null, fields: string[]): void {
  if (encoded !== null) {
    const spec = decodeSpec(encoded);
    if (Object.keys(spec).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'template,version') throw new Error('Invalid payload metadata.');
    payloadSpec(spec.template);
    if (fields.length && !new RegExp(String.raw`^\{\{\s*${fields[0]}\s*\}\}(?![\s\S])`).test(spec.template)) throw new Error('Conflicting payload metadata.');
  }
}

function validateSymbolOwner(node: MetadataElement, symbol: string, text: string | null, fields: string[], encoded: string | null): void {
  const spec = validateSymbolSpec(decodeSpec(symbol));
  if (node.children.length !== 1 || node.children[0].localName !== 'image' || node.children[0].children.length !== 0) throw new Error('Unsupported symbol owner shape.');
  if (node.localName !== 'g' || spec.type !== (node.dataset.barcodeType ?? null) || text !== null || fields.length === 0 && encoded === null || (node.dataset.qr !== undefined) && spec.type !== 'qrcode' || (node.dataset.barcode !== undefined) && spec.type === 'qrcode') throw new Error('Conflicting symbol metadata.');
}

function validateTextOwner(node: MetadataElement, text: string | null): void {
  if (node.localName !== 'text' || text === null || (node.dataset.isBarcode !== undefined) || (node.dataset.barcodeType !== undefined)) throw new Error('Incomplete binding metadata.');
  const spec = decodeSpec(text);
  if (Object.keys(spec).sort((left, right) => Number(left > right) - Number(left < right)).join(',') !== 'font_size,line_height,text_align,version' || !['left', 'center', 'right'].includes(spec.text_align) || !Number.isFinite(spec.font_size) || spec.font_size <= 0 || spec.font_size > 4096 || !Number.isFinite(spec.line_height) || spec.line_height <= 0 || spec.line_height > 4096 || node.children.length > 100 || Array.from(node.children).some((child) => child.localName !== 'tspan')) throw new Error('Invalid text metadata.');
  const declarations = (node.getAttribute('style') ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => part.split(':').map((value) => value.trim()));
  const styleFonts = declarations.filter(([name]) => name === 'font-size').map(([, value]) => Number(value));
  const fonts = [...styleFonts, ...(node.hasAttribute('font-size') ? [Number(node.getAttribute('font-size'))] : [])];
  if (!fonts.length || fonts.some((value) => value !== spec.font_size)) throw new Error('Conflicting text metrics.');
  for (const span of Array.from(node.children)) {
    if (['font-size', 'font-family', 'font-weight', 'font-style'].some((name) => span.hasAttribute(name)) || /(?:^|;)\s*font-(?:size|family|weight|style)\s*:/.test(span.getAttribute('style') ?? '')) throw new Error('Dynamic rich text requires a proven profile.');
  }
}
