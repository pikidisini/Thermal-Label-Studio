import { useCallback, useEffect, useRef } from 'react';
import type { fabric } from 'fabric';
import { useSimulationStore } from '../store/useSimulationStore';
import { useTemplateStore } from '../store/useTemplateStore';
import { useContractStore } from '../store/useContractStore';
import { useStudioStore } from '../store/useStudioStore';
import { apiClient } from '../utils/apiClient';
import { exportFabricToSvg } from '../utils/fabricSvgExporter';

export function useThermalSimulation(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  pxPerMm = 4
) {
  const {
    dpi,
    threshold,
    setIsRendering,
    setPreviewImage,
    setThermalImage,
    setInspectionData,
    setRenderError,
  } = useSimulationStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { jsonData } = useContractStore();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const previewUrlRef = useRef<string | null>(null);
  const thermalUrlRef = useRef<string | null>(null);

  const replaceObjectUrl = useCallback((urlRef: React.MutableRefObject<string | null>, blob: Blob, setter: (url: string) => void) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    urlRef.current = nextUrl;
    setter(nextUrl);
  }, []);

  const triggerRenderSimulation = useCallback((force = false) => {
    const currentMode = useStudioStore.getState().viewMode;

    // In Design mode, avoid firing expensive rasterizer HTTP calls unless explicitly forced
    if (currentMode !== 'preview' && !force) {
      isDirtyRef.current = true;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      setIsRendering(true);
      setRenderError(null);
      try {
        const svgStr = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm);
        if (!svgStr) return;

        const [previewBlob, thermalBlob, inspRes] = await Promise.all([
          apiClient.renderSimulation(svgStr, jsonData, { dpi, threshold, widthMm: labelWidthMm, heightMm: labelHeightMm }),
          apiClient.renderPreviewBlob(svgStr, jsonData, { dpi, threshold, widthMm: labelWidthMm, heightMm: labelHeightMm }),
          apiClient.inspectSvgTokens(svgStr).catch(() => null),
        ]);

        replaceObjectUrl(previewUrlRef, previewBlob, setPreviewImage);
        replaceObjectUrl(thermalUrlRef, thermalBlob, setThermalImage);
        if (inspRes) {
          setInspectionData(inspRes);
        }
        isDirtyRef.current = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Preview rendering failed.';
        setRenderError(message);
        console.warn('Simulation render notice:', message);
      } finally {
        setIsRendering(false);
      }
    }, 250);
  }, [
    canvasRef,
    labelWidthMm,
    labelHeightMm,
    pxPerMm,
    jsonData,
    dpi,
    threshold,
    setIsRendering,
    setPreviewImage,
    setThermalImage,
    setInspectionData,
    setRenderError,
    replaceObjectUrl,
  ]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (thermalUrlRef.current) URL.revokeObjectURL(thermalUrlRef.current);
  }, []);

  return { triggerRenderSimulation, isDirtyRef };
}
