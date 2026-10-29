import { designPreviewSample } from '../../data-tokens/model/designPreview';
import { decodeSpec, validateMetadataDocument } from './bindingMetadata';
import * as fabric from 'fabric';

function restorePayloadTemplate(obj: fabric.FabricObject, payloadSpec: string | null) {
  if (!payloadSpec) { return; }
  const parsed = decodeSpec(payloadSpec);
  obj.set('payloadTemplate', parsed.template);
}

function restoreTextAlignment(elem: Element, obj: fabric.FabricObject) {
  const anchor = elem.getAttribute('text-anchor') || (elem as HTMLElement).style?.textAnchor;
  const textAlign = elem.getAttribute('text-align') || (elem as HTMLElement).style?.textAlign;
  if (anchor === 'end' || textAlign === 'end' || textAlign === 'right') { obj.set('textAlign', 'right'); }
  else if (anchor === 'middle' || textAlign === 'center') { obj.set('textAlign', 'center'); }
}

function sourceViewBox(svgString: string): { x: number; y: number; width: number; height: number } | null {
  try {
    const root = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    const values = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? { x: values[0], y: values[1], width: values[2], height: values[3] }
      : null;
  } catch { return null; }
}

function nearestAncestorWith(element: Element | null, attribute: string): Element | null {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute(attribute)) return current;
    current = current.parentElement;
  }
  return null;
}

function restoreCanonicalText(elem: Element, obj: fabric.FabricObject, metrics: any, textLayout: string | null) {
  const spans = Array.from(elem.querySelectorAll('tspan'));
  obj.set({ fontSize: metrics.font_size, lineHeight: metrics.line_height, textAlign: metrics.text_align });
  if (!spans.length || !spans.every((span) => span.hasAttribute('y'))) return;
  const layout = textLayout ? decodeSpec(textLayout) : null;
  const step = metrics.font_size * 1.13 * metrics.line_height;
  const firstY = layout ? -layout.height / 2 + metrics.font_size * 1.13 * (1 - .222) : Number(spans[0].getAttribute('y'));
  const count = layout ? Math.round((layout.height / (metrics.font_size * 1.13) - 1) / metrics.line_height) + 1 : 1;
  if (!Number.isFinite(count) || count < 1 || count > 100) { throw new Error('Unsupported canonical text line count.'); }
  const lines = Array.from({ length: count }, () => '');
  for (const span of spans) {
    const index = Math.round((Number(span.getAttribute('y')) - firstY) / step);
    if (index < 0 || index > 99) { throw new Error('Unsupported canonical text baseline.'); }
    while (lines.length <= index) lines.push('');
    lines[index] += span.textContent ?? '';
  }
  obj.set('text', lines.join('\n'));

}

function restoreCanonicalGeometry(elem: Element, obj: fabric.FabricObject, document: Document,
  groupKey: (source: Element, kind: 'group') => string) {
  const chain: Element[] = [];
  let cursor: Element | null = elem.parentElement;
  while (cursor) { chain.unshift(cursor); cursor = cursor.parentElement; }
  let world: fabric.TMat2D = [1, 0, 0, 1, 0, 0];
  const groupPath: { key: string; matrix: fabric.TMat2D }[] = [];
  for (const source of chain) {
    const transform = source.getAttribute('transform');
    if (transform && document.documentElement.dataset.editorCoordinateProfile === 'fabric7') {
      const parsed = /^matrix\(([^)]+)\)$/.exec(transform.trim());
      if (!parsed) { throw new Error('Canonical Fabric transform is unsupported.'); }
      const matrix = parsed[1].trim().split(/[ ,]+/).map(Number);
      if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value))) { throw new Error('Invalid canonical transform.'); }
      world = fabric.util.multiplyTransformMatrices(world, matrix as fabric.TMat2D);
    }
    if (source.attributes.getNamedItem('data-editor-group') !== null) { groupPath.push({ key: groupKey(source, 'group'), matrix: world }); }
  }
  if (document.documentElement.dataset.editorCoordinateProfile === 'fabric7') {
    (obj as any).__canonicalWorldMatrix = world;
    (obj as any).__canonicalGroupPath = groupPath;
  }
}

function restoreBarcodeHints(obj: fabric.FabricObject, barcodeAttr: string | null, previewValue: string | null,
  qrAttr: string | null, barcodeType: string | null, payloadSpec: string | null) {
  if (barcodeAttr) {
    (obj as any).set('dataBarcode', barcodeAttr);
    (obj as any).set('barcodeValue', barcodeAttr);
    (obj as any).set('isBarcode', true);
    (obj as any).set('barcodeType', barcodeType || 'code128');
  }
  if (previewValue && !barcodeAttr && !qrAttr) {
    (obj as any).set('barcodeValue', previewValue);
    (obj as any).set('isBarcode', true);
    (obj as any).set('barcodeType', barcodeType || 'code128');
  }
  restorePayloadTemplate(obj, payloadSpec);
  if (qrAttr) {
    (obj as any).set('dataQr', qrAttr);
    (obj as any).set('barcodeValue', qrAttr);
    (obj as any).set('isBarcode', true);
    (obj as any).set('barcodeType', 'qrcode');
  }
  if (previewValue && qrAttr) { (obj as any).set('barcodeValue', previewValue); }
}

export function importSvgIntoFabricCanvas(
  canvas: fabric.Canvas,
  svgString: string,
  targetWidthPx: number,
  targetHeightPx: number,
  onComplete: () => void,
  ...callbacks: [
    isCurrent?: () => boolean,
    prepareCanvas?: () => void,
    resolveFieldValue?: (field: string) => string | undefined,
    onError?: (message: string) => void,
  ]
) {
  const [isCurrent = () => true, prepareCanvas = () => undefined, resolveFieldValue = () => undefined, onError = () => undefined] = callbacks;
  const viewBox = sourceViewBox(svgString);
  const document = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  try { validateMetadataDocument(document); } catch { onError('Template binding metadata is invalid or needs explicit migration.'); return; }
  // XML serializers may rename the XLink prefix (for example ns1:href).
  // Fabric reads literal attribute names, so expose the namespace-resolved
  // image source as SVG 2 href before parsing, including stored older layouts.
  document.querySelectorAll('image').forEach((image) => {
    const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (href) { image.setAttribute('href', href); }
  });
  // Fabric exports the baseline coordinates on tspan but its SVG text parser
  // reads only the parent text. Preserve those offsets before applying the
  // surrounding group transform, instead of treating its center as the baseline.
  document.querySelectorAll('text').forEach((text) => {
    const span = text.querySelector('tspan');
    if (!span) { return; }
    for (const coordinate of ['x', 'y']) {
      const value = span.getAttribute(coordinate);
      if (!text.hasAttribute(coordinate) && value !== null && Number.isFinite(Number(value))) {
        text.setAttribute(coordinate, value);
      }
    }
  });
  if (viewBox) {
    // Fabric parses physical mm at CSS DPI; the editor uses its own px/mm.
    // Parse in viewBox units and apply the editor scale exactly once below.
    document.documentElement.setAttribute('width', String(viewBox.width));
    document.documentElement.setAttribute('height', String(viewBox.height));
  }
  const parserSvg = new XMLSerializer().serializeToString(document);
  // Fabric calls the reviver for the concrete SVG children, while editor
  // metadata is attached to parent <g> elements. Keep a stable key for each
  // marked editor group while importing ordinary SVG geometry.
  const metadataKeys = new WeakMap<Element, string>();
  let metadataSequence = 0;
  const groupKey = (source: Element, kind: 'group') => {
    let key = metadataKeys.get(source);
    if (!key) {
      key = `${kind}-${metadataSequence++}`;
      metadataKeys.set(source, key);
    }
    return key;
  };
  void fabric.loadSVGFromString(
    parserSvg,
    (elem: Element, obj: fabric.FabricObject) => {
      if (!elem || !obj) { return; }
      // Fabric invokes the reviver for the inner <image>/<rect>, while our
      // exporter attaches binding metadata to the surrounding <g>. Read only
      // the allowlisted metadata from the immediate parent as a round-trip
      // fallback so the imported object remains editable.
      const parent = elem.parentElement;
      const attr = (name: string) => elem.getAttribute(name) || parent?.getAttribute(name) || null;
      const barcodeAttr = attr('data-barcode');
      const previewValue = attr('data-barcode-value');
      const qrAttr = attr('data-qr');
      const fieldAttr = attr('data-field');
      const placeholderAttr = attr('data-placeholder');
      const elemId = elem.getAttribute('id') || '';
      const barcodeType = attr('data-barcode-type') || attr('barcodeType');
      const payloadSpec = attr('data-payload-spec');
      const symbolSpec = attr('data-symbol-spec');
      if (symbolSpec) {
        obj.set('symbolSpec', decodeSpec(symbolSpec));
        // Canonical symbol specs identify symbols even without optional editor hints.
        obj.set('isBarcode', true);
      }
      const textSpec = attr('data-text-spec');
      const textLayout = attr('data-text-layout');
      if (textLayout) {
        const layout = decodeSpec(textLayout);
        obj.set({ originX: layout.origin_x, originY: layout.origin_y, charSpacing: layout.char_spacing });
      }
      if (textSpec) {
        const metrics = decodeSpec(textSpec);
        restoreCanonicalText(elem, obj, metrics, textLayout);
      }
      restoreCanonicalGeometry(elem, obj, document, groupKey);
      const editorGroupSource = nearestAncestorWith(elem, 'data-editor-group');
      if (editorGroupSource) {
        (obj as any).__editorGroupKey = groupKey(editorGroupSource, 'group');
        (obj as any).__editorGroupKind = 'group';
      }
      const isBarcodeAttr = attr('data-is-barcode') === 'true' || !!barcodeAttr || !!qrAttr || !!previewValue;
      const dynamicField = placeholderAttr || fieldAttr;
      const isDynamicAttr = attr('data-is-dynamic') === 'true' || !!dynamicField;

      if (elemId) { (obj as any).set('id', elemId); }

      restoreBarcodeHints(obj, barcodeAttr, previewValue, qrAttr, barcodeType, payloadSpec);
      if (dynamicField) {
        (obj as any).set('dataField', dynamicField);
        (obj as any).set('dataPlaceholder', dynamicField);
        (obj as any).set('isDynamic', true);
      }
      if (isBarcodeAttr) { (obj as any).set('isBarcode', true); }
      if (isDynamicAttr) { (obj as any).set('isDynamic', true); }
      if (barcodeType) { (obj as any).set('barcodeType', barcodeType); }

      restoreTextAlignment(elem, obj);
    }
  ).then(({ objects, options }) => {
      if (!isCurrent()) { return; }
      if (objects && objects.length > 0) {
        prepareCanvas();
        const origW = viewBox?.width || options.width || targetWidthPx;
        const origH = viewBox?.height || options.height || targetHeightPx;
        const fitScale = Math.min(targetWidthPx / origW, targetHeightPx / origH) || 1;
        const rawItems = objects.filter((item): item is fabric.FabricObject => item !== null);

        // Restore only the editor groups marked in the SVG. A normal SVG root
        // is flattened, so marked editor groups are rebuilt from their own
        // children without swallowing unrelated elements.
        type Entry = { key: string; matrix: fabric.TMat2D; children: (Entry | fabric.FabricObject)[] };
        const roots: (Entry | fabric.FabricObject)[] = [];
        const entries = new Map<string, Entry>();
        rawItems.forEach((obj: any) => {
          if (obj.__canonicalWorldMatrix) { fabric.util.applyTransformToObject(obj, obj.__canonicalWorldMatrix); }
          let target = roots;
          const path = obj.__canonicalGroupPath as { key: string; matrix: fabric.TMat2D }[] | undefined;
          for (const group of path || []) {
            let entry = entries.get(group.key);
            if (!entry) { entry = { ...group, children: [] }; entries.set(group.key, entry); target.push(entry); }
            target = entry.children;
          }
          target.push(obj);
        });
        const build = (entry: Entry | fabric.FabricObject): fabric.FabricObject => {
          if (!('children' in entry)) { return entry; }
          const children = entry.children.map(build);
          const inverse = fabric.util.invertTransform(entry.matrix);
          children.forEach((child) => fabric.util.applyTransformToObject(child, fabric.util.multiplyTransformMatrices(inverse, child.calcTransformMatrix())));
          const group = new fabric.Group(children);
          group.isEditorGroup = true;
          fabric.util.applyTransformToObject(group, entry.matrix);
          return group;
        };
        const items = roots.map(build);
        canvas.clear();
        canvas.backgroundColor = '#ffffff'; canvas.requestRenderAll();

        const refreshText = (obj: fabric.FabricObject) => {
          (obj as fabric.Group).getObjects?.().forEach(refreshText);
          if (obj.type === 'text' || obj.type === 'i-text') {
            const textObj = obj as fabric.FabricText;
            textObj.designPreviewText = designPreviewSample(textObj.text);
            const field = (obj as any).dataPlaceholder || (obj as any).dataField;
            const resolved = field ? resolveFieldValue(field) : undefined;
            if (field) { textObj.set('text', resolved ?? textObj.designPreviewText); }
            if (typeof (obj as any).payloadTemplate === 'string') {
              let missing = false;
              const text = (obj as any).payloadTemplate.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g,
                (_match: string, key: string) => { const value = resolveFieldValue(key); if (value === undefined) { missing = true; } return value ?? ''; });
              textObj.set('text', missing ? textObj.designPreviewText : text);
            }
            if (textObj.stroke && (!textObj.fill || textObj.fill === 'none' || textObj.fill === 'transparent')) {
              textObj.set({
                fill: '#000000',
                stroke: undefined,
                strokeWidth: 0,
              });
            }
          }
        };
        items.forEach((obj) => {
          if (!obj) { return; }
          refreshText(obj);
          obj.scaleX = (obj.scaleX || 1) * fitScale;
          obj.scaleY = (obj.scaleY || 1) * fitScale;
          obj.left = (obj.left || 0) * fitScale;
          obj.top = (obj.top || 0) * fitScale;
          obj.setCoords();
          const refreshChildren = (parent: any) => parent.getObjects?.().forEach((child: any) => { child.setCoords(); refreshChildren(child); });
          refreshChildren(obj);
          canvas.add(obj);
        });
      } else {
        prepareCanvas();
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
      }

      if (!isCurrent()) { return; }
      canvas.calcOffset();
      canvas.renderAll();
      onComplete();
  }).catch(() => onError('SVG could not be imported.'));
}
