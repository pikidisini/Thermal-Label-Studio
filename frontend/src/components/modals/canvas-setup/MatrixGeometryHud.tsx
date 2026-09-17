import React from 'react';

interface MatrixGeometryHudProps {
  dotWidth: number;
  dotHeight: number;
  totalMegaDots: string;
  dotsPerMm: number;
  dpi: number;
  previewWidthPercent: number;
  previewHeightPercent: number;
}

export function MatrixGeometryHud({
  dotWidth,
  dotHeight,
  totalMegaDots,
  dotsPerMm,
  dpi,
  previewWidthPercent,
  previewHeightPercent,
}: MatrixGeometryHudProps) {
  return (
    <div data-testid="container-matrix-geometry-hud" className="w-full md:w-[320px] bg-surface flex flex-col p-4 gap-3">
      <div className="flex items-center gap-1.5 pb-1 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[16px] text-primary-container">memory</span>
        <h3 className="text-[10px] font-semibold text-on-surface uppercase tracking-wider">
          Matrix Geometry HUD
        </h3>
      </div>

      {/* Proportional Live Wireframe Box */}
      <div className="h-[200px] border border-outline-variant bg-surface-dim relative flex items-center justify-center p-3 overflow-hidden">
        <div
          style={{
            width: `${previewWidthPercent}%`,
            height: `${previewHeightPercent}%`,
          }}
          className="border border-primary-container bg-primary-container/10 flex items-center justify-center relative transition-all duration-200"
        >
          {/* Top Width Dimension Marker */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-primary-container whitespace-nowrap bg-surface-container-lowest px-1 border border-primary-container/30">
            {dotWidth} px
          </div>
          {/* Left Height Dimension Marker */}
          <div className="absolute top-1/2 -left-6 -translate-y-1/2 font-mono text-[9px] text-primary-container whitespace-nowrap bg-surface-container-lowest px-1 border border-primary-container/30 rotate-[-90deg]">
            {dotHeight} px
          </div>
          <span className="material-symbols-outlined text-primary-container/40 text-[28px]">
            crop_free
          </span>
        </div>
      </div>

      {/* Hardware Tech Specs */}
      <div className="flex flex-col gap-1.5 bg-surface-container-low border border-outline-variant p-3 font-mono text-[11px]">
        <div className="flex justify-between items-center border-b border-outline-variant pb-1">
          <span className="text-outline text-[10px]">Dot Width</span>
          <span className="text-on-surface font-semibold">{dotWidth} px</span>
        </div>
        <div className="flex justify-between items-center border-b border-outline-variant pb-1 pt-0.5">
          <span className="text-outline text-[10px]">Dot Height</span>
          <span className="text-on-surface font-semibold">{dotHeight} px</span>
        </div>
        <div className="flex justify-between items-center border-b border-outline-variant pb-1 pt-0.5">
          <span className="text-outline text-[10px]">Total Surface</span>
          <span className="text-secondary font-semibold">{totalMegaDots}M Dots</span>
        </div>
        <div className="flex justify-between items-center pt-0.5">
          <span className="text-outline text-[10px]">Printhead</span>
          <span className="text-on-surface text-[10px]">
            Z-Series {Math.round(dotsPerMm)}dpmm ({dpi} DPI)
          </span>
        </div>
      </div>
    </div>
  );
}
