import { useEffect, useRef, useState, useCallback } from 'react';
import type { fabric } from 'fabric';
import { useWheelZoom } from './useWheelZoom';
import { useAutoFitZoom } from './useAutoFitZoom';

interface UseTouchpadGesturesProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  zoom: number;
  setZoom: (z: number) => void;
  canvasWidthPx: number;
  canvasHeightPx: number;
  drawRulers: (mouseX?: number, mouseY?: number, liveZoom?: number) => void;
  fitTrigger: number;
  reset100Trigger: number;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm: number;
  setSelectedObject: (obj: any) => void;
}

export function useTouchpadGestures({
  viewportRef,
  canvasContainerRef,
  canvasRef,
  zoom,
  setZoom,
  canvasWidthPx,
  canvasHeightPx,
  drawRulers,
  fitTrigger,
  reset100Trigger,
  labelWidthMm,
  labelHeightMm,
  pxPerMm,
  setSelectedObject,
}: UseTouchpadGesturesProps) {
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef({ x: 0, y: 0 });

  // Sync zoomRef only on external store changes (buttons, toolbar), not during active gesture renders
  useEffect(() => {
    if (Math.abs(zoom - zoomRef.current) > 0.005) {
      zoomRef.current = zoom;
    }
  }, [zoom]);

  const isSpacePressedRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const { handleResetFit, handleReset100 } = useAutoFitZoom({
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
  });

  useWheelZoom({
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
  });

  const handleOuterMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !isSpacePressedRef.current) {
      if (canvasContainerRef.current && !canvasContainerRef.current.contains(e.target as Node)) {
        if (canvasRef.current) {
          const active = canvasRef.current.getActiveObject() as any;
          if (active) {
            if (active.isEditing) active.exitEditing();
            canvasRef.current.discardActiveObject();
            canvasRef.current.requestRenderAll();
            setSelectedObject(null);
          }
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
      const isFabricEditing = canvasRef.current && (canvasRef.current.getActiveObject() as any)?.isEditing;

      if (e.code === 'Space' && !isInput && !isFabricEditing) {
        if (!isSpacePressedRef.current) {
          isSpacePressedRef.current = true;
          setIsSpaceDown(true);
          if (canvasRef.current) {
            canvasRef.current.defaultCursor = 'grab';
            canvasRef.current.selection = false;
          }
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        setIsSpaceDown(false);
        isPanningRef.current = false;
        setIsPanning(false);
        if (canvasRef.current) {
          canvasRef.current.defaultCursor = 'default';
          canvasRef.current.selection = true;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [canvasRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (canvasRef.current) canvasRef.current.calcOffset();

    if (e.button === 1 || (isSpacePressedRef.current && e.button === 0)) {
      isPanningRef.current = true;
      setIsPanning(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) {
        canvasRef.current.selection = false;
        canvasRef.current.defaultCursor = 'grabbing';
      }
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const nextX = panOffsetRef.current.x + dx;
      const nextY = panOffsetRef.current.y + dy;
      panOffsetRef.current = { x: nextX, y: nextY };
      setPanOffset({ x: nextX, y: nextY });

      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      drawRulers();
    }
  };

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      if (canvasRef.current) {
        canvasRef.current.selection = true;
        canvasRef.current.defaultCursor = isSpacePressedRef.current ? 'grab' : 'default';
        canvasRef.current.calcOffset();
      }
    }
  };

  return {
    panOffset,
    isSpaceDown,
    isPanning,
    handleOuterMouseDown,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleResetFit,
    handleReset100,
  };
}
