import { useEffect, useRef, useCallback } from 'react';
import type { fabric } from 'fabric';

interface UseAutoFitZoomProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  zoomRef: React.MutableRefObject<number>;
  panOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
  setPanOffset: (p: { x: number; y: number }) => void;
  setZoom: (z: number) => void;
  canvasWidthPx: number;
  canvasHeightPx: number;
  drawRulers: (mouseX?: number, mouseY?: number, liveZoom?: number) => void;
  fitTrigger: number;
  reset100Trigger: number;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm: number;
}

export function useAutoFitZoom({
  viewportRef,
  canvasContainerRef,
  canvasRef,
  zoomRef,
  panOffsetRef,
  setPanOffset,
  setZoom,
  canvasWidthPx,
  canvasHeightPx,
  drawRulers,
  fitTrigger,
  reset100Trigger,
  labelWidthMm,
  labelHeightMm,
  pxPerMm,
}: UseAutoFitZoomProps) {
  const getAutoFitZoom = useCallback(() => {
    if (!viewportRef.current) return 1.0;
    const vRect = viewportRef.current.getBoundingClientRect();
    if (!vRect.width || !vRect.height) return 1.0;

    const availableW = Math.max(100, vRect.width - 48);
    const availableH = Math.max(100, vRect.height - 48);
    const targetW = labelWidthMm * pxPerMm;
    const targetH = labelHeightMm * pxPerMm;
    if (targetW <= 0 || targetH <= 0) return 1.0;

    const fitX = availableW / targetW;
    const fitY = availableH / targetH;
    const clampedZoom = Math.min(4.0, Math.max(0.15, Math.min(fitX, fitY)));
    return Math.round(clampedZoom * 20) / 20;
  }, [labelWidthMm, labelHeightMm, pxPerMm, viewportRef]);

  const handleResetFit = useCallback(() => {
    const autoZ = getAutoFitZoom();
    zoomRef.current = autoZ;
    panOffsetRef.current = { x: 0, y: 0 };
    setPanOffset({ x: 0, y: 0 });

    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.width = `${canvasWidthPx * autoZ}px`;
      canvasContainerRef.current.style.height = `${canvasHeightPx * autoZ}px`;
      canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(0px, 0px, 0)`;
    }

    if (canvasRef.current) {
      const c = canvasRef.current;
      c.setDimensions({
        width: canvasWidthPx * autoZ,
        height: canvasHeightPx * autoZ,
      });
      c.setZoom(autoZ);
      c.calcOffset();
      c.renderAll();
    }

    drawRulers(-1, -1, autoZ);
    setZoom(autoZ);
  }, [getAutoFitZoom, canvasWidthPx, canvasHeightPx, drawRulers, setZoom, canvasRef, canvasContainerRef, panOffsetRef, setPanOffset, zoomRef]);

  const handleReset100 = useCallback(() => {
    zoomRef.current = 1.0;
    panOffsetRef.current = { x: 0, y: 0 };
    setPanOffset({ x: 0, y: 0 });

    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.width = `${canvasWidthPx}px`;
      canvasContainerRef.current.style.height = `${canvasHeightPx}px`;
      canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(0px, 0px, 0)`;
    }

    if (canvasRef.current) {
      const c = canvasRef.current;
      c.setDimensions({
        width: canvasWidthPx,
        height: canvasHeightPx,
      });
      c.setZoom(1.0);
      c.calcOffset();
      c.renderAll();
    }

    drawRulers(-1, -1, 1.0);
    setZoom(1.0);
  }, [canvasWidthPx, canvasHeightPx, drawRulers, setZoom, canvasRef, canvasContainerRef, panOffsetRef, setPanOffset, zoomRef]);

  const lastFitTriggerRef = useRef(fitTrigger);
  useEffect(() => {
    if (fitTrigger > 0 && fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      handleResetFit();
    }
  }, [fitTrigger, handleResetFit]);

  const lastReset100TriggerRef = useRef(reset100Trigger);
  useEffect(() => {
    if (reset100Trigger > 0 && reset100Trigger !== lastReset100TriggerRef.current) {
      lastReset100TriggerRef.current = reset100Trigger;
      handleReset100();
    }
  }, [reset100Trigger, handleReset100]);

  // Automatically fit label to viewport on initial mount and whenever label dimensions change
  useEffect(() => {
    let active = true;
    const rafId = requestAnimationFrame(() => {
      if (active) {
        handleResetFit();
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [labelWidthMm, labelHeightMm, handleResetFit]);

  return { getAutoFitZoom, handleResetFit, handleReset100 };
}
