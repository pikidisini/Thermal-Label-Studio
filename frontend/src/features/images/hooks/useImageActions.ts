import { useCallback } from 'react';
import * as fabric from 'fabric';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { translate as t } from '../../../shared/i18n';
import { exportFabricToSvg } from '../../canvas/svg/fabricSvgExporter';
import { validateImageFile, validateImageSignature, imagePlacement, validateImageBudget, IMAGE_READ_ERROR, IMAGE_FORMAT_ERROR, IMAGE_SIZE_ERROR } from '../model/imageUpload';

interface UseImageActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: fabric.FabricObject) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

/** Handles standalone, template-local Upload Image / Logo files. */
export function useImageActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
}: UseImageActionsProps) {
  const handleAddImageFile = useCallback(
    async (file: File) => {
      const canvas = canvasRef.current;
      if (!file || !canvas) return;

      let image: fabric.FabricImage | undefined;
      try {
        validateImageFile(file);
        validateImageSignature(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(IMAGE_READ_ERROR));
          reader.onerror = reader.onabort = () => reject(new Error(IMAGE_READ_ERROR));
          reader.readAsDataURL(file);
        });
        image = await fabric.FabricImage.fromURL(dataUrl).catch(() => { throw new Error(IMAGE_READ_ERROR); });
        if (canvasRef.current !== canvas || canvas.disposed) { image.dispose(); return; }
        const { labelWidthMm, labelHeightMm } = useTemplateStore.getState();
        image.set(imagePlacement(image.width, image.height, labelWidthMm * pxPerMm, labelHeightMm * pxPerMm));
        let pixels = 0;
        const countPixels = (object: fabric.FabricObject) => {
          if (object instanceof fabric.FabricImage) {
            const element = object.getElement();
            pixels += ('naturalWidth' in element ? element.naturalWidth * element.naturalHeight : element.width * element.height);
          }
          if (object instanceof fabric.Group) object.getObjects().forEach(countPixels);
        };
        canvas.getObjects().forEach(countPixels);
        validateImageBudget(exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, pxPerMm, { serverBinding: true }), image.toSVG(), pixels, image.width * image.height);
      } catch (error) {
        image?.dispose();
        const message = error instanceof Error ? error.message : '';
        const known = [IMAGE_READ_ERROR, IMAGE_FORMAT_ERROR, IMAGE_SIZE_ERROR, 'Template SVG export failed. Check text and symbol binding properties before saving.'];
        throw new Error(known.includes(message) ? message : IMAGE_READ_ERROR);
      }
      canvas.add(image);
      canvas.setActiveObject(image);
      syncSelection(image);
      saveCanvasHistory();
      canvas.renderAll();
      triggerRenderSimulation?.();
    },
    [canvasRef, pxPerMm, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  const handleUploadImage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleAddImageFile(file).catch(error => window.alert(t(error.message)));
  }, [handleAddImageFile]);

  return { handleUploadImage, handleAddImageFile };
}
