import React, { useLayoutEffect, useRef } from 'react';
import type { fabric } from 'fabric';
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useRulers } from '../../hooks/useRulers';
import { useFabricCanvas } from '../../hooks/useFabricCanvas';
import { useTouchpadGestures } from '../../hooks/canvas/useTouchpadGestures';
import { CanvasViewport } from './CanvasViewport';

interface StudioCanvasProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm?: number;
  gridSizeMm?: number;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  triggerRenderSimulation?: () => void;
  onDropElement?: (data: any) => void;
}

export function StudioCanvas({
  canvasRef,
  pxPerMm = 4,
  gridSizeMm = 2.5,
  onCanvasReady,
  triggerRenderSimulation,
  onDropElement,
}: StudioCanvasProps) {
  const { zoom, setZoom, fitTrigger, reset100Trigger, setSelectedObject } = useStudioStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const topRulerRef = useRef<HTMLCanvasElement | null>(null);
  const leftRulerRef = useRef<HTMLCanvasElement | null>(null);

  const canvasWidthPx = labelWidthMm * pxPerMm;
  const canvasHeightPx = labelHeightMm * pxPerMm;

  const { drawRulers } = useRulers({
    viewportRef,
    canvasContainerRef,
    topRulerRef,
    leftRulerRef,
    labelWidthMm,
    labelHeightMm,
    pxPerMm,
    zoom,
  });

  useFabricCanvas({
    canvasElRef,
    canvasContainerRef,
    viewportRef,
    canvasRef,
    pxPerMm,
    gridSizeMm,
    onCanvasReady,
    triggerRenderSimulation,
    drawRulers,
  });

  const {
    panOffset,
    isSpaceDown,
    isPanning,
    handleOuterMouseDown,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useTouchpadGestures({
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
  });

  // Ruler geometry depends on the committed CSS transform and dimensions of
  // the label sheet. Redraw after React applies zoom, pan, or template size
  // changes so the ruler does not retain the previous canvas position.
  useLayoutEffect(() => {
    const fabricCanvas = canvasRef.current;
    if (fabricCanvas) {
      fabricCanvas.setDimensions({
        width: canvasWidthPx * zoom,
        height: canvasHeightPx * zoom,
      });
      fabricCanvas.setZoom(zoom);
      fabricCanvas.calcOffset();
      fabricCanvas.requestRenderAll();
    }
  }, [canvasRef, canvasWidthPx, canvasHeightPx, zoom, labelWidthMm, labelHeightMm]);

  useLayoutEffect(() => {
    drawRulers();
  }, [drawRulers, zoom, panOffset.x, panOffset.y, labelWidthMm, labelHeightMm]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const data = JSON.parse(dataStr);
        onDropElement?.(data);
      }
    } catch (err) {
      console.warn('Drag-drop parse error:', err);
    }
  };

  return (
    <CanvasViewport
      viewportRef={viewportRef}
      canvasContainerRef={canvasContainerRef}
      canvasElRef={canvasElRef}
      topRulerRef={topRulerRef}
      leftRulerRef={leftRulerRef}
      labelWidthMm={labelWidthMm}
      labelHeightMm={labelHeightMm}
      pxPerMm={pxPerMm}
      zoom={zoom}
      panOffset={panOffset}
      isSpaceDown={isSpaceDown}
      isPanning={isPanning}
      onOuterMouseDown={handleOuterMouseDown}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
