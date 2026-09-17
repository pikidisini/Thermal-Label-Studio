import { useCallback, useRef } from 'react';
import { fabric } from 'fabric';
import { useTemplateStore } from '../store/useTemplateStore';
import { useStudioStore } from '../store/useStudioStore';
import { useContractStore } from '../store/useContractStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { apiClient } from '../utils/apiClient';
import { exportFabricToSvg } from '../utils/fabricSvgExporter';
import { importSvgIntoFabricCanvas } from '../utils/fabricSvgImporter';
import { CANVAS_SERIALIZE_PROPS } from '../types/fabric-custom';
import { adaptSapContract } from '../utils/sapContractAdapter';
import type { JsonObject } from '../types/api';
import type { RawSapContract } from '../utils/sapContractAdapter';

export function useTemplateManager(
  canvasRef: React.MutableRefObject<fabric.Canvas | null>,
  calculateAutoFitZoom: (wMm?: number, hMm?: number, mode?: any) => number,
  triggerRenderSimulation: () => void,
  pxPerMm = 4
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
  const { setSampleContracts, setJsonData, setTokenMap, updateUsedTokensFromCanvas } = useContractStore();
  const { clearHistory, pushState } = useHistoryStore();

  const pendingSvgRef = useRef<{ svg: string; wMm: number; hMm: number } | null>(null);

  const loadSvgIntoCanvas = useCallback(
    (svgString: string, widthMm: number, heightMm: number) => {
      if (!canvasRef.current) {
        pendingSvgRef.current = { svg: svgString, wMm: widthMm, hMm: heightMm };
        return;
      }
      const canvas = canvasRef.current;
      const targetWidthPx = widthMm * pxPerMm;
      const targetHeightPx = heightMm * pxPerMm;
      const currentZoom = calculateAutoFitZoom(widthMm, heightMm, viewMode);

      canvas.setDimensions({
        width: targetWidthPx * currentZoom,
        height: targetHeightPx * currentZoom,
      });
      canvas.setZoom(currentZoom);
      canvas.clear();
      canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

      importSvgIntoFabricCanvas(canvas, svgString, targetWidthPx, targetHeightPx, () => {
        updateUsedTokensFromCanvas(canvas);
        try {
          clearHistory();
          const initJson = JSON.stringify(canvas.toJSON(CANVAS_SERIALIZE_PROPS as any));
          pushState(initJson);
        } catch (e) {
          console.warn('Initial history snapshot notice:', e);
        }
        triggerRenderSimulation();
        triggerFit();
      });
    },
    [canvasRef, pxPerMm, calculateAutoFitZoom, viewMode, updateUsedTokensFromCanvas, clearHistory, pushState, triggerRenderSimulation, triggerFit]
  );

  const loadTemplateById = useCallback(
    async (templateId: string) => {
      try {
        setSelectedObject(null);
        setActiveTemplateId(templateId);
        const data = await apiClient.getTemplate(templateId);
        const svg = data?.raw_svg || data?.svg_content;
        if (svg) {
          const wMm = data.width_mm || 200;
          const hMm = data.height_mm || 80;
          setDimensions(wMm, hMm);
          setZoom(calculateAutoFitZoom(wMm, hMm, viewMode));
          loadSvgIntoCanvas(svg, wMm, hMm);
        }
      } catch (err) {
        console.error('Failed to load template:', err);
      }
    },
    [setSelectedObject, setActiveTemplateId, setDimensions, setZoom, calculateAutoFitZoom, viewMode, loadSvgIntoCanvas]
  );

  const initData = useCallback(async () => {
    try {
      const tList = await apiClient.listTemplates();
      setTemplates(tList.templates || []);

      const cData = await apiClient.getSampleContracts();
      const sourceContracts = cData.goods_receipt || cData.pallet_shipment
        ? cData
        : { goods_receipt: cData };
      const contracts = Object.fromEntries(
        Object.entries(sourceContracts).map(([key, value]) => [key, adaptSapContract(value as JsonObject).rawContract])
      ) as Record<string, RawSapContract>;
      setSampleContracts(contracts);
      const activeContract = contracts.goods_receipt || Object.values(contracts)[0];
      if (activeContract) {
        const adapted = adaptSapContract(activeContract);
        setJsonData(adapted.rawContract);
        setTokenMap(adapted.tokenMap);
      }

      if (tList.templates && tList.templates.length > 0) {
        loadTemplateById(tList.templates[0].id);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }, [setTemplates, setSampleContracts, setJsonData, setTokenMap, loadTemplateById]);

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
    async (templateName: string, description?: string) => {
      if (!canvasRef.current) return;
      const svgStr = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
      const templateId = templateName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      await apiClient.saveTemplate(templateId, svgStr, {
        name: templateName,
        description,
        width_mm: labelWidthMm,
        height_mm: labelHeightMm,
      });
      const tList = await apiClient.listTemplates();
      setTemplates(tList.templates || []);
      setActiveTemplateId(templateId);
    },
    [canvasRef, labelWidthMm, labelHeightMm, pxPerMm, setTemplates, setActiveTemplateId]
  );
  const updateCanvasDimensions = useCallback(
    (wMm: number, hMm: number) => {
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
      setDimensions(wMm, hMm);
      const currentZoom = calculateAutoFitZoom(wMm, hMm, viewMode);
      setZoom(currentZoom);
      if (canvasRef.current) {
        canvasRef.current.clear();
        canvasRef.current.setBackgroundColor('#ffffff', canvasRef.current.renderAll.bind(canvasRef.current));
        canvasRef.current.setDimensions({
          width: wMm * pxPerMm * currentZoom,
          height: hMm * pxPerMm * currentZoom,
        });
        canvasRef.current.setZoom(currentZoom);
        canvasRef.current.calcOffset();
        canvasRef.current.renderAll();
      }
      clearHistory();
      setSelectedObject(null);
    },
    [setDimensions, calculateAutoFitZoom, viewMode, setZoom, canvasRef, pxPerMm, clearHistory, setSelectedObject]
  );

  return {
    pendingSvgRef,
    loadTemplateById,
    loadSvgIntoCanvas,
    initData,
    handleSelectDimensionPreset,
    updateCanvasDimensions,
    createNewTemplate,
    saveCurrentTemplate,
  };
}
