import { useCallback } from 'react';
import * as fabric from 'fabric';
import type { GraphicAsset } from '../api/graphicsApi';
import { graphicsApi } from '../api/graphicsApi';

interface UseGraphicActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: fabric.FabricObject) => void;
  saveCanvasHistory: () => void;
  getStrategicPlacement: (wMm?: number, hMm?: number, quad?: string) => { leftPx: number; topPx: number };
}

export function useGraphicActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  getStrategicPlacement,
}: UseGraphicActionsProps) {
  const handleAddGraphic = useCallback(async (asset: GraphicAsset) => {
    if (!canvasRef.current) return;
    const full = asset.data_uri ? asset : await graphicsApi.get(asset.id);
    const { leftPx, topPx } = getStrategicPlacement(30, 30, 'center');
    void fabric.FabricImage.fromURL(full.data_uri).then((img) => { if (!canvasRef.current) return; const scale=Math.min((30*pxPerMm)/(img.width||100),(30*pxPerMm)/(img.height||100)); img.set({left:leftPx,top:topPx,scaleX:scale,scaleY:scale,graphicAssetId:full.id,graphicAssetName:full.name,graphicAssetVersion:full.version,graphicEmbeddedSrc:full.data_uri} as any); canvasRef.current.add(img);canvasRef.current.setActiveObject(img);syncSelection(img);saveCanvasHistory();canvasRef.current.renderAll();triggerRenderSimulation?.(); });
  },[canvasRef,pxPerMm,getStrategicPlacement,syncSelection,saveCanvasHistory,triggerRenderSimulation]);

  return { handleAddGraphic };
}
