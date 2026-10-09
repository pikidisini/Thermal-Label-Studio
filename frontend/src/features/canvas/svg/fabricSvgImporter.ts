import * as fabric from 'fabric';

function restorePayloadTemplate(obj: fabric.FabricObject, payloadSpec: string | null) {
  if (!payloadSpec) return;
  try {
    const bytes = Uint8Array.from(atob(payloadSpec), (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed?.version === 1 && typeof parsed.template === 'string') obj.set('payloadTemplate', parsed.template);
  } catch { /* malformed metadata is ignored; normal SVG remains importable */ }
}

function restoreTextAlignment(elem: Element, obj: fabric.FabricObject) {
  const anchor = elem.getAttribute('text-anchor') || (elem as HTMLElement).style?.textAnchor;
  const textAlign = elem.getAttribute('text-align') || (elem as HTMLElement).style?.textAlign;
  if (anchor === 'end' || textAlign === 'end' || textAlign === 'right') obj.set('textAlign', 'right');
  else if (anchor === 'middle' || textAlign === 'center') obj.set('textAlign', 'center');
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

export function importSvgIntoFabricCanvas(
  canvas: fabric.Canvas,
  svgString: string,
  targetWidthPx: number,
  targetHeightPx: number,
  onComplete: () => void,
  isCurrent: () => boolean = () => true,
  prepareCanvas: () => void = () => undefined,
  resolveFieldValue: (field: string) => string | undefined = () => undefined,
  onError: (message: string) => void = () => undefined
) {
  const viewBox = sourceViewBox(svgString);
  const document = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  // XML serializers may rename the XLink prefix (for example ns1:href).
  // Fabric reads literal attribute names, so expose the namespace-resolved
  // image source as SVG 2 href before parsing, including stored older layouts.
  document.querySelectorAll('image').forEach((image) => {
    const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (href) image.setAttribute('href', href);
  });
  // Fabric exports the baseline coordinates on tspan but its SVG text parser
  // reads only the parent text. Preserve those offsets before applying the
  // surrounding group transform, instead of treating its center as the baseline.
  document.querySelectorAll('text').forEach((text) => {
    const span = text.querySelector('tspan');
    if (!span) return;
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
  const nearestAncestorWith = (element: Element | null, attribute: string): Element | null => {
    let current: Element | null = element;
    while (current) {
      if (current.hasAttribute(attribute)) return current;
      current = current.parentElement;
    }
    return null;
  };

  void fabric.loadSVGFromString(
    parserSvg,
    (elem: Element, obj: fabric.FabricObject) => {
      if (!elem || !obj) return;
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
      const editorGroupSource = nearestAncestorWith(elem, 'data-editor-group');
      if (editorGroupSource) {
        (obj as any).__editorGroupKey = groupKey(editorGroupSource, 'group');
        (obj as any).__editorGroupKind = 'group';
      }
      const isBarcodeAttr = attr('data-is-barcode') === 'true' || !!barcodeAttr || !!qrAttr || !!previewValue;
      const dynamicField = placeholderAttr || fieldAttr;
      const isDynamicAttr = attr('data-is-dynamic') === 'true' || !!dynamicField;

      if (elemId) (obj as any).set('id', elemId);

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
      if (previewValue && qrAttr) (obj as any).set('barcodeValue', previewValue);
      if (dynamicField) {
        (obj as any).set('dataField', dynamicField);
        (obj as any).set('dataPlaceholder', dynamicField);
        (obj as any).set('isDynamic', true);
      }
      if (isBarcodeAttr) (obj as any).set('isBarcode', true);
      if (isDynamicAttr) (obj as any).set('isDynamic', true);
      if (barcodeType) (obj as any).set('barcodeType', barcodeType);

      restoreTextAlignment(elem, obj);
    }
  ).then(({ objects, options }) => {
      if (!isCurrent()) return;
      if (objects && objects.length > 0) {
        prepareCanvas();
        const origW = viewBox?.width || options.width || targetWidthPx;
        const origH = viewBox?.height || options.height || targetHeightPx;
        const fitScale = Math.min(targetWidthPx / origW, targetHeightPx / origH) || 1;
        const rawItems = objects.filter((item): item is fabric.FabricObject => item !== null);

        // Restore only the editor groups marked in the SVG. A normal SVG root
        // is flattened, so marked editor groups are rebuilt from their own
        // children without swallowing unrelated elements.
        const grouped = new Map<string, { kind: 'group'; members: any[] }>();
        rawItems.forEach((obj: any) => {
          const key = obj.__editorGroupKey as string | undefined;
          if (!key) return;
          const entry = grouped.get(key) || { kind: 'group', members: [] };
          entry.members.push(obj);
          grouped.set(key, entry);
        });
        const rebuiltByKey = new Map<string, any>();
        grouped.forEach((entry) => {
          if (entry.members.length < 1) return;
          const rebuiltGroup: any = new fabric.Group(entry.members, { originX: 'left', originY: 'top' });
          rebuiltGroup.isEditorGroup = true;
          const key = (entry.members[0] as any).__editorGroupKey as string | undefined;
          if (key) rebuiltByKey.set(key, rebuiltGroup);
        });
        // Replace each editor group's first source member in place. Appending
        // reconstructed groups keep their source ordering relative to later
        // text, barcode, and image objects on every SVG round-trip.
        const insertedGroups = new Set<string>();
        const items = rawItems.flatMap((obj) => {
          const key = (obj as any).__editorGroupKey as string | undefined;
          if (!key) return [obj];
          if (insertedGroups.has(key)) return [];
          insertedGroups.add(key);
          const rebuiltGroup = rebuiltByKey.get(key);
          return rebuiltGroup ? [rebuiltGroup] : [];
        });
        canvas.clear();
        canvas.backgroundColor = '#ffffff'; canvas.requestRenderAll();

        items.forEach((obj) => {
          if (!obj) return;
          if (obj.type === 'text' || obj.type === 'i-text') {
            const textObj = obj as fabric.FabricText;
            const field = (obj as any).dataPlaceholder || (obj as any).dataField;
            const resolved = field ? resolveFieldValue(field) : undefined;
            if (field && resolved !== undefined) textObj.set('text', resolved);
            if (typeof (obj as any).payloadTemplate === 'string') {
              textObj.set('text', (obj as any).payloadTemplate.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g,
                (_match: string, key: string) => resolveFieldValue(key) ?? 'No data'));
            }
            if (textObj.stroke && (!textObj.fill || textObj.fill === 'none' || textObj.fill === 'transparent')) {
              textObj.set({
                fill: '#000000',
                stroke: undefined,
                strokeWidth: 0,
              });
            }
          }
          obj.scaleX = (obj.scaleX || 1) * fitScale;
          obj.scaleY = (obj.scaleY || 1) * fitScale;
          obj.left = (obj.left || 0) * fitScale;
          obj.top = (obj.top || 0) * fitScale;
          obj.setCoords();
          canvas.add(obj);
        });
      } else {
        prepareCanvas();
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
      }

      if (!isCurrent()) return;
      canvas.calcOffset();
      canvas.renderAll();
      onComplete();
  }).catch(() => onError('SVG could not be imported.'));
}
