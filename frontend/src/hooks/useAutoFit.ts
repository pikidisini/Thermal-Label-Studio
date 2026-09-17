import { useCallback } from 'react';
import type { ViewMode } from '../types/label';

interface UseAutoFitProps {
  labelWidthMm: number;
  labelHeightMm: number;
  viewMode?: ViewMode;
  pxPerMm?: number;
}

export function useAutoFit({
  labelWidthMm,
  labelHeightMm,
  viewMode = 'design',
  pxPerMm = 4,
}: UseAutoFitProps) {
  const calculateAutoFitZoom = useCallback(
    (wMm = labelWidthMm, hMm = labelHeightMm, mode = viewMode) => {
      // Accurate sidebar & layout metrics: Left toolbox (56px) + Right Inspector (320px) + margins
      const leftToolboxW = 56;
      const rightInspectorW = 320;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const totalSidebarsW = leftToolboxW + rightInspectorW;
      const availableW = Math.max(300, winW - totalSidebarsW - 64);
      const availableH = Math.max(200, winH - 120 - 48);

      const targetW = (wMm || 200) * pxPerMm;
      const targetH = (hMm || 80) * pxPerMm;

      if (targetW <= 0 || targetH <= 0) return 1.0;

      const fitZoomX = (availableW * 0.92) / targetW;
      const fitZoomY = (availableH * 0.92) / targetH;
      const calculatedZoom = Math.min(fitZoomX, fitZoomY);

      const clampedZoom = Math.min(4.0, Math.max(0.15, calculatedZoom));
      return Math.round(clampedZoom * 20) / 20; // 0.05 step
    },
    [labelWidthMm, labelHeightMm, viewMode, pxPerMm]
  );

  return { calculateAutoFitZoom };
}
