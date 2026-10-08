import { translate as t } from '../../../shared/i18n';
import { useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useStudioStore } from '../../../store/useStudioStore';
import { useContractStore } from '../../../store/useContractStore';
import { useHistoryStore } from '../../../store/useHistoryStore';
import { layoutApi } from '../api/layoutApi';
import { exportFabricToSvg, importSvgIntoFabricCanvas } from '../../canvas';
import { CANVAS_SERIALIZE_PROPS } from '../../../types/fabric-custom';
import { resolveSapTokenDisplayValue } from '../../data-tokens';

export function useTemplateManager(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  calculateAutoFitZoom: (wMm?: number, hMm?: number, mode?: any) => number,
  triggerRenderSimulation: () => void,
  pxPerMm = 4,
) {
  const {
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    labelWidthMm,
    labelHeightMm,
    setLabelWidthMm,
    setLabelHeightMm,
    setDimensions,
  } = useTemplateStore();

  const { viewMode, setZoom, setSelectedObject, triggerFit } = useStudioStore();
  const { tokenMap, fieldDescriptions, updateUsedTokensFromCanvas } = useContractStore();
  const { clearHistory, pushState } = useHistoryStore();

  const pendingSvgRef = useRef<{ svg: string; wMm: number; hMm: number } | null>(null);
  const templateRequestRef = useRef(0);

  const loadSvgIntoCanvas = useCallback(
    (svgString: string, widthMm: number, heightMm: number, isCurrent: () => boolean = () => true, onCommitted: () => void = () => undefined) => {
      if (!canvasRef.current) {
        pendingSvgRef.current = { svg: svgString, wMm: widthMm, hMm: heightMm };
        return;
      }
      const canvas = canvasRef.current;
      const targetWidthPx = widthMm * pxPerMm;
      const targetHeightPx = heightMm * pxPerMm;
      const currentZoom = calculateAutoFitZoom(widthMm, heightMm, viewMode);

      importSvgIntoFabricCanvas(canvas, svgString, targetWidthPx, targetHeightPx, () => {
        if (!isCurrent()) return;
        updateUsedTokensFromCanvas(canvas);
        try {
          clearHistory();
          const initJson = JSON.stringify(canvas.toObject([...CANVAS_SERIALIZE_PROPS]));
          pushState(initJson);
        } catch (e) {
          console.warn('Initial history snapshot notice:', e);
        }
        triggerRenderSimulation();
        triggerFit();
        onCommitted();
      }, isCurrent, () => {
        canvas.setDimensions({
          width: targetWidthPx * currentZoom,
          height: targetHeightPx * currentZoom,
        });
        canvas.setZoom(currentZoom);
        canvas.clear();
        canvas.backgroundColor = '#ffffff'; canvas.requestRenderAll();
      }, (field) => {
        return resolveSapTokenDisplayValue(tokenMap[field], field, fieldDescriptions);
      }, (message) => window.alert(t("SVG could not be imported: {error}", { error: t(message) })));
    }, [canvasRef, pxPerMm, calculateAutoFitZoom, viewMode, tokenMap, fieldDescriptions, updateUsedTokensFromCanvas, clearHistory, pushState, triggerRenderSimulation, triggerFit]
  );

  const loadTemplateById = useCallback(
    async (templateId: string) => {
      const requestId = ++templateRequestRef.current;
      try {
        const data = await layoutApi.get(templateId);
        if (requestId !== templateRequestRef.current) return;
        const svg = data.svg;
        if (svg) {
          const wMm = data.width_mm || 200;
          const hMm = data.height_mm || 80;
          loadSvgIntoCanvas(
            svg,
            wMm,
            hMm,
            () => requestId === templateRequestRef.current,
            () => {
              setSelectedObject(null);
              setDimensions(wMm, hMm);
              setZoom(calculateAutoFitZoom(wMm, hMm, viewMode));
              setActiveTemplateId(templateId);
              useTemplateStore.getState().setTemplateTitle(data.title);
              useSimulationStore.getState().setDpi(data.dpi);
            }
          );
        }
      } catch (err) {
        console.error('Failed to load template:', err);
      }
    },
    [setSelectedObject, setActiveTemplateId, setDimensions, setZoom, calculateAutoFitZoom, viewMode, loadSvgIntoCanvas]
  );

  const handleSelectDimensionPreset = useCallback(
    (wMm: number, hMm: number) => {
      setLabelWidthMm(wMm);
      setLabelHeightMm(hMm);
      const matching = templates.find((t: any) => t.width_mm === wMm && t.height_mm === hMm);
      if (matching) {
        loadTemplateById(matching.id);
      } else {
        const currentZoom = calculateAutoFitZoom(wMm, hMm, viewMode);
        setZoom(currentZoom);
        if (canvasRef.current) {
          canvasRef.current.setDimensions({
            width: wMm * pxPerMm * currentZoom,
            height: hMm * pxPerMm * currentZoom,
          });
          canvasRef.current.setZoom(currentZoom);
          canvasRef.current.calcOffset();
          canvasRef.current.renderAll();
        }
      }
    },
    [setLabelWidthMm, setLabelHeightMm, templates, loadTemplateById, calculateAutoFitZoom, viewMode, setZoom, canvasRef, pxPerMm]
  );

  const saveCurrentTemplate = useCallback(
    async (templateCode: string, templateTitle?: string) => {
      if (!canvasRef.current) return;
      const svgStr = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
      await layoutApi.save({
        label_code: templateCode,
        title: templateTitle || templateCode,
        svg: svgStr,
        width_mm: labelWidthMm,
        height_mm: labelHeightMm,
        dpi: useSimulationStore.getState().dpi,
      });
      const tList = { templates: (await layoutApi.list()).map((layout) => ({ id: layout.label_code, name: layout.title, width_mm: layout.width_mm, height_mm: layout.height_mm, updatedAt: layout.created_at })) };
      setTemplates(tList.templates || []);
      setActiveTemplateId(templateCode);
      useTemplateStore.getState().setTemplateTitle(templateTitle || templateCode);
    },
    [canvasRef, labelWidthMm, labelHeightMm, pxPerMm, setTemplates, setActiveTemplateId]
  );
  const updateCanvasDimensions = useCallback(
    (wMm: number, hMm: number) => {
      ++templateRequestRef.current;
      pendingSvgRef.current = null;
      setDimensions(wMm, hMm);
      const currentZoom = calculateAutoFitZoom(wMm, hMm, viewMode);
      setZoom(currentZoom);
      if (canvasRef.current) {
        canvasRef.current.setDimensions({
          width: wMm * pxPerMm * currentZoom,
          height: hMm * pxPerMm * currentZoom,
        });
        canvasRef.current.setZoom(currentZoom);
        canvasRef.current.calcOffset();
        canvasRef.current.renderAll();
      }
    },
    [setDimensions, calculateAutoFitZoom, viewMode, setZoom, canvasRef, pxPerMm]
  );

  const createNewTemplate = useCallback(
    (wMm: number, hMm: number) => {
      ++templateRequestRef.current;
      pendingSvgRef.current = null;
      setDimensions(wMm, hMm);
      const currentZoom = calculateAutoFitZoom(wMm, hMm, viewMode);
      setZoom(currentZoom);
      if (canvasRef.current) {
        canvasRef.current.clear();
        canvasRef.current.backgroundColor = '#ffffff'; canvasRef.current.requestRenderAll();
        canvasRef.current.setDimensions({
          width: wMm * pxPerMm * currentZoom,
          height: hMm * pxPerMm * currentZoom,
        });
        canvasRef.current.setZoom(currentZoom);
        canvasRef.current.calcOffset();
        canvasRef.current.renderAll();
      }
      clearHistory();
      if (canvasRef.current) pushState(JSON.stringify(canvasRef.current.toObject([...CANVAS_SERIALIZE_PROPS])));
      setActiveTemplateId('');
      updateUsedTokensFromCanvas(canvasRef.current);
      triggerRenderSimulation();
      setSelectedObject(null);
    },
    [setDimensions, calculateAutoFitZoom, viewMode, setZoom, canvasRef, pxPerMm, clearHistory, pushState, setActiveTemplateId, updateUsedTokensFromCanvas, triggerRenderSimulation, setSelectedObject]
  );

  return {
    pendingSvgRef,
    loadTemplateById,
    loadSvgIntoCanvas,
    handleSelectDimensionPreset,
    updateCanvasDimensions,
    createNewTemplate,
    saveCurrentTemplate,
  };
}
