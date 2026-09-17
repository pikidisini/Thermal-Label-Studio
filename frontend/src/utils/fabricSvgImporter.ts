import { fabric } from 'fabric';

export function importSvgIntoFabricCanvas(
  canvas: fabric.Canvas,
  svgString: string,
  targetWidthPx: number,
  targetHeightPx: number,
  onComplete: () => void
) {
  fabric.loadSVGFromString(
    svgString,
    (objects, options) => {
      if (objects && objects.length > 0) {
        const group = fabric.util.groupSVGElements(objects, options);
        const origW = group.width || targetWidthPx;
        const origH = group.height || targetHeightPx;
        const fitScale = Math.min(targetWidthPx / origW, targetHeightPx / origH) || 1.0;

        group.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
        });

        const items = group.getObjects();
        group._restoreObjectsState();
        canvas.clear();
        canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

        items.forEach((obj) => {
          if (!obj) return;
          if (obj.type === 'text' || obj.type === 'i-text') {
            const textObj = obj as fabric.Text;
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
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        fabric.Image.fromURL(url, (img) => {
          img.set({
            left: 0,
            top: 0,
            scaleX: targetWidthPx / (img.width || 1),
            scaleY: targetHeightPx / (img.height || 1),
          });
          canvas.add(img);
          canvas.renderAll();
          URL.revokeObjectURL(url);
        });
      }

      canvas.calcOffset();
      canvas.renderAll();
      onComplete();
    },
    (elem: Element, obj: fabric.Object) => {
      if (!elem || !obj) return;
      const barcodeAttr = elem.getAttribute('data-barcode') || elem.getAttribute('data-barcode-value');
      const qrAttr = elem.getAttribute('data-qr');
      const fieldAttr = elem.getAttribute('data-field');
      const elemId = elem.getAttribute('id') || '';
      const barcodeType = elem.getAttribute('data-barcode-type') || elem.getAttribute('barcodeType');
      const isBarcodeAttr = elem.getAttribute('data-is-barcode') === 'true' || !!barcodeAttr || !!qrAttr;
      const isDynamicAttr = elem.getAttribute('data-is-dynamic') === 'true' || !!fieldAttr;

      if (elemId) (obj as any).set('id', elemId);

      if (barcodeAttr) {
        (obj as any).set('dataBarcode', barcodeAttr);
        (obj as any).set('barcodeValue', barcodeAttr);
        (obj as any).set('isBarcode', true);
        (obj as any).set('barcodeType', barcodeType || 'code128');
      }
      if (qrAttr) {
        (obj as any).set('dataQr', qrAttr);
        (obj as any).set('barcodeValue', qrAttr);
        (obj as any).set('isBarcode', true);
        (obj as any).set('barcodeType', 'qrcode');
      }
      if (fieldAttr) {
        (obj as any).set('dataField', fieldAttr);
        (obj as any).set('isDynamic', true);
      }
      if (isBarcodeAttr) (obj as any).set('isBarcode', true);
      if (isDynamicAttr) (obj as any).set('isDynamic', true);
      if (barcodeType) (obj as any).set('barcodeType', barcodeType);

      const anchor = elem.getAttribute('text-anchor') || (elem as HTMLElement).style?.textAnchor;
      const textAlign = elem.getAttribute('text-align') || (elem as HTMLElement).style?.textAlign;
      if (anchor === 'end' || textAlign === 'end' || textAlign === 'right') {
        (obj as any).set('textAlign', 'right');
      } else if (anchor === 'middle' || textAlign === 'center') {
        (obj as any).set('textAlign', 'center');
      }
    }
  );
}
