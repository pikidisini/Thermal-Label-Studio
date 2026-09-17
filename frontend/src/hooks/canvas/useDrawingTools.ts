import { fabric } from 'fabric';
import { barcodeGenerators } from '../../utils/barcodeGenerators';

interface UseDrawingToolsProps {
  fabricCanvas: fabric.Canvas;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  optionsRef: React.MutableRefObject<any>;
  syncSelection: (obj: any) => void;
}

export function attachDrawingToolListeners({
  fabricCanvas,
  canvasContainerRef,
  optionsRef,
  syncSelection,
}: UseDrawingToolsProps) {
  let isDrawing = false;
  let drawStartPos = { x: 0, y: 0 };
  let previewShape: fabric.Object | null = null;

  const getCanvasPointer = (e: MouseEvent) => {
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const currentZoom = fabricCanvas.getZoom() || 1.0;
      const x = (e.clientX - rect.left) / currentZoom;
      const y = (e.clientY - rect.top) / currentZoom;
      return { x, y };
    }
    return fabricCanvas.getPointer(e);
  };

  const handleMouseDown = (opt: any) => {
    const e = opt.e as MouseEvent;
    if (!e || e.button !== 0) return;
    const currentTool = optionsRef.current.activeTool;
    if (!currentTool || currentTool === 'select') return;

    const ptr = getCanvasPointer(e);
    isDrawing = true;
    drawStartPos = { x: ptr.x, y: ptr.y };
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'rect') {
      const rect = new fabric.Rect({
        left: ptr.x,
        top: ptr.y,
        width: 1,
        height: 1,
        fill: 'transparent',
        stroke: '#000000',
        strokeWidth: 0.5 * curPxPerMm,
      });
      previewShape = rect;
      fabricCanvas.add(rect);
    } else if (currentTool === 'line') {
      const line = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: '#000000',
        strokeWidth: 0.5 * curPxPerMm,
      });
      previewShape = line;
      fabricCanvas.add(line);
    }
  };

  const handleMouseMove = (opt: any) => {
    if (!isDrawing || !previewShape) return;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const start = drawStartPos;
    const currentTool = optionsRef.current.activeTool;

    if (currentTool === 'rect' && previewShape instanceof fabric.Rect) {
      const w = Math.abs(ptr.x - start.x);
      const h = Math.abs(ptr.y - start.y);
      previewShape.set({
        left: Math.min(start.x, ptr.x),
        top: Math.min(start.y, ptr.y),
        width: Math.max(4, w),
        height: Math.max(4, h),
      });
      fabricCanvas.renderAll();
    } else if (currentTool === 'line' && previewShape instanceof fabric.Line) {
      previewShape.set({
        x2: ptr.x,
        y2: ptr.y,
      });
      fabricCanvas.renderAll();
    }
  };

  const handleMouseUp = (opt: any) => {
    if (!isDrawing) return;
    isDrawing = false;
    const e = opt.e as MouseEvent;
    const ptr = getCanvasPointer(e);
    const currentTool = optionsRef.current.activeTool;
    const curPxPerMm = optionsRef.current.pxPerMm;

    if (currentTool === 'text') {
      const text = new fabric.IText('New Label Text', {
        left: ptr.x,
        top: ptr.y,
        fontFamily: 'Arial',
        fontSize: 4 * curPxPerMm,
        fill: '#000000',
      });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      syncSelection(text);
      fabricCanvas.renderAll();
      optionsRef.current.setActiveTool('select');
    } else if (currentTool === 'barcode') {
      const dataUrl = barcodeGenerators.generateCode128DataUrl('12345678', {
        barWidth: 2,
        barHeight: 40,
      });
      if (dataUrl) {
        fabric.Image.fromURL(dataUrl, (img) => {
          img.set({
            left: ptr.x,
            top: ptr.y,
            scaleX: 0.8,
            scaleY: 0.8,
            isBarcode: true,
            barcodeType: 'code128',
            barcodeValue: '12345678',
            dataBarcode: '12345678',
          } as any);
          fabricCanvas.add(img);
          fabricCanvas.setActiveObject(img);
          syncSelection(img);
          fabricCanvas.renderAll();
          optionsRef.current.setActiveTool('select');
        });
      }
    } else if (previewShape) {
      fabricCanvas.setActiveObject(previewShape);
      syncSelection(previewShape);
      previewShape = null;
      fabricCanvas.renderAll();
      optionsRef.current.setActiveTool('select');
    }
  };

  fabricCanvas.on('mouse:down', handleMouseDown);
  fabricCanvas.on('mouse:move', handleMouseMove);
  fabricCanvas.on('mouse:up', handleMouseUp);
}
