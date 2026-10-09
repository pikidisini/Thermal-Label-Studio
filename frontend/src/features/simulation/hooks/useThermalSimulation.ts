import { useCallback, useEffect, useRef } from 'react';
import type * as fabric from 'fabric';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useContractStore } from '../../../store/useContractStore';
import { useStudioStore } from '../../../store/useStudioStore';
import { runEditorPreview, editorPreviewUrl } from '../api/editorPreviewApi';
import { exportFabricToSvg } from '../../canvas';
import { bindingErrors } from '../../data-tokens/model/bindingValidation';

export function useThermalSimulation(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  pxPerMm = 4
) {
  const {
    dpi,
    setIsRendering,
    setPreviewImage,
    setThermalImage,
    setInspectionData,
    setRenderError,
  } = useSimulationStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { jsonData, outputBlocked } = useContractStore();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef<boolean>(true);
  const controllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  const triggerRenderSimulation = useCallback((force = false) => {
    const generation = ++requestGenerationRef.current;
    controllerRef.current?.abort();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const currentMode = useStudioStore.getState().viewMode;

    // In Design mode, avoid firing expensive rasterizer HTTP calls unless explicitly forced
    if (currentMode !== 'preview' && !force) {
      isDirtyRef.current = true;
      if (mountedRef.current) setIsRendering(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      setIsRendering(true);
      setRenderError(null);
      setPreviewImage(null);
      setThermalImage(null);
      setInspectionData(null);
      try {
        if (useContractStore.getState().outputBlocked) throw new Error('Create a canonical working copy before output.');
        const errors = bindingErrors(canvasRef.current.getObjects(), useContractStore.getState().tokenMap, useContractStore.getState().fieldDescriptions);
        if (errors.length) throw new Error(`Label data is incomplete or invalid: ${errors.join(' ')}`);
        const svgStr = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
        if (!svgStr) return;

        const controller = new AbortController();
        controllerRef.current = controller;
        const admittedData = useContractStore.getState().jsonData;
        const result = await runEditorPreview({ svg: svgStr, widthMm: labelWidthMm, heightMm: labelHeightMm, dpi }, controller.signal);
        if (!mountedRef.current || generation !== requestGenerationRef.current
          || useContractStore.getState().jsonData !== admittedData || useContractStore.getState().outputBlocked) return;
        const url = editorPreviewUrl(result);
        setPreviewImage(url);
        setThermalImage(url);
        setInspectionData(null);
        isDirtyRef.current = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Preview rendering failed.';
        if (mountedRef.current && generation === requestGenerationRef.current) setRenderError(message);
        console.warn('Simulation render notice:', message);
      } finally {
        if (mountedRef.current && generation === requestGenerationRef.current) setIsRendering(false);
      }
    }, 250);
  }, [
    canvasRef,
    labelWidthMm,
    labelHeightMm,
    pxPerMm,
    jsonData,
    dpi,
    setIsRendering,
    setPreviewImage,
    setThermalImage,
    setInspectionData,
    setRenderError,
  ]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    controllerRef.current?.abort();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setPreviewImage(null);
    setThermalImage(null);
    setIsRendering(false);
  }, [jsonData, outputBlocked, setPreviewImage, setThermalImage, setIsRendering]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  return { triggerRenderSimulation, isDirtyRef };
}
