import React from 'react';
import { CanvasRuler } from './CanvasRuler';

interface CanvasViewportProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  topRulerRef: React.RefObject<HTMLCanvasElement | null>;
  leftRulerRef: React.RefObject<HTMLCanvasElement | null>;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm: number;
  zoom: number;
  panOffset?: { x: number; y: number };
  isSpaceDown: boolean;
  isPanning: boolean;
  onOuterMouseDown: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const BLEED_MM = 2;

export function CanvasViewport({
  viewportRef,
  canvasContainerRef,
  canvasElRef,
  topRulerRef,
  leftRulerRef,
  labelWidthMm,
  labelHeightMm,
  pxPerMm,
  zoom,
  panOffset = { x: 0, y: 0 },
  isSpaceDown,
  isPanning,
  onOuterMouseDown,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDragOver,
  onDrop,
}: CanvasViewportProps) {
  const canvasWidthPx  = labelWidthMm  * pxPerMm;
  const canvasHeightPx = labelHeightMm * pxPerMm;
  const bleedPx        = BLEED_MM * pxPerMm * zoom;

  const cursor = isPanning ? 'cursor-grabbing' : isSpaceDown ? 'cursor-grab' : 'cursor-crosshair';

  return (
    <div
      ref={viewportRef}
      data-testid="container-canvas-viewport"
      className={`relative flex-1 overflow-hidden select-none bg-surface ${cursor}`}
      onMouseDown={(e) => { onOuterMouseDown(e); onMouseDown(e); }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        backgroundImage: 'radial-gradient(#2d323f 1px, transparent 1px)',
        backgroundSize:  '16px 16px',
      }}
    >
      {/* Rulers */}
      <div data-testid="container-top-ruler">
        <CanvasRuler ref={topRulerRef} orientation="horizontal" />
      </div>
      <div data-testid="container-left-ruler">
        <CanvasRuler ref={leftRulerRef} orientation="vertical" />
      </div>

      {/* Label sheet */}
      <div
        ref={canvasContainerRef}
        id="canvas-container-root"
        data-testid="canvas-container"
        className="absolute top-1/2 left-1/2 bg-white"
        style={{
          width:     `${canvasWidthPx  * zoom}px`,
          height:    `${canvasHeightPx * zoom}px`,
          transform: `translate(-50%, -50%) translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
          boxShadow: [
            '0 0 0 1px rgba(0,0,0,0.55)',
            '0 8px 32px rgba(0,0,0,0.6)',
            '0 2px  8px rgba(0,0,0,0.4)',
          ].join(', '),
        }}
      >
        {/* Corner registration marks */}
        {([
          'top-0 left-0    border-t border-l',
          'top-0 right-0   border-t border-r',
          'bottom-0 left-0  border-b border-l',
          'bottom-0 right-0 border-b border-r',
        ] as const).map((cls, i) => (
          <div
            key={i}
            data-testid={`corner-reg-mark-${i}`}
            className={`absolute w-3 h-3 border-outline-variant pointer-events-none ${cls}`}
            style={{ borderColor: '#9ca3af', borderWidth: 1 }}
          />
        ))}

        {/* 2mm peripheral bleed guide line */}
        <div
          data-testid="safe-bleed-margin-line"
          className="absolute pointer-events-none"
          style={{
            inset:  bleedPx,
            border: '1px dashed rgba(156,163,175,0.40)',
          }}
          title="2mm peripheral safe margin"
        />

        {/* Fabric canvas element */}
        <canvas ref={canvasElRef} id="main-fabric-canvas" data-testid="fabric-canvas-element" />
      </div>
    </div>
  );
}
