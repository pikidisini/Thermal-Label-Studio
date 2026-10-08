import { translate as t, useTranslation } from "../../../shared/i18n";
﻿import React from 'react';

interface MatrixGeometryHudProps {
  dotWidth: number;
  dotHeight: number;
  totalMegaDots: string;
  dotsPerMm: number;
  dpi: number;
  aspectRatio: number;
}

export function MatrixGeometryHud({
  dotWidth,
  dotHeight,
  totalMegaDots,
  dotsPerMm,
  dpi,
  aspectRatio,
}: MatrixGeometryHudProps) {
  useTranslation();
  const previewRatio = Number.isFinite(aspectRatio) && aspectRatio> 0 ? aspectRatio : 1;

  return (
    <div data-testid="container-matrix-geometry-hud" className="w-full md:w-[320px] bg-surface flex flex-col p-4 gap-3">
      <div className="flex items-center gap-1.5 pb-1 border-b border-outline-variant">
        <span className="material-symbols-outlined text-[16px] text-primary-container">memory</span>
        <h3 className="text-[10px] font-semibold text-on-surface uppercase tracking-wider">{t("Matrix Geometry HUD")} </h3>
      </div>

      {/* Proportional Live Wireframe Box */}
      <div className="h-[200px] border border-outline-variant bg-surface-dim relative overflow-hidden">
        {/* Reserve room for dimension markers, then fit both axes with one scale. */}
        <div className="absolute inset-y-6 left-8 right-6 flex items-center justify-center" style={{ containerType: 'size' }}>
          <div
            data-testid="matrix-geometry-wireframe"
            style={{
              width: `min(100cqw, ${100 * previewRatio}cqh)`,
              height: `min(100cqh, ${100 / previewRatio}cqw)`,
              minWidth: 0,
              minHeight: 0,
              flexShrink: 0,
            }}
            className="border border-primary-container bg-primary-container/10 flex items-center justify-center relative"
          >
            {/* Top Width Dimension Marker */}
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-primary-container whitespace-nowrap bg-surface-container-lowest px-1 border border-primary-container/30">
              {dotWidth}    {t("px")}  </div>
            {/* Left Height Dimension Marker */}
            <div className="absolute top-1/2 -left-6 -translate-y-1/2 font-mono text-[9px] text-primary-container whitespace-nowrap bg-surface-container-lowest px-1 border border-primary-container/30 rotate-[-90deg]">
              {dotHeight}    {t("px")}  </div>
            <span className="material-symbols-outlined text-primary-container/40 text-[28px]">
              crop_free
            </span>
          </div>
        </div>
      </div>

      {/* Hardware Tech Specs */}
      <div className="flex flex-col gap-1.5 bg-surface-container-low border border-outline-variant p-3 font-mono text-[11px]">
        <div className="flex justify-between items-center border-b border-outline-variant pb-1">
          <span className="text-outline text-[10px]">{t("Dot Width")}</span>
          <span className="text-on-surface font-semibold">{dotWidth}    {t("px")}  </span>
        </div>
        <div className="flex justify-between items-center border-b border-outline-variant pb-1 pt-0.5">
          <span className="text-outline text-[10px]">{t("Dot Height")}</span>
          <span className="text-on-surface font-semibold">{dotHeight}    {t("px")}  </span>
        </div>
        <div className="flex justify-between items-center border-b border-outline-variant pb-1 pt-0.5">
          <span className="text-outline text-[10px]">{t("Total Surface")}</span>
          <span className="text-secondary font-semibold">{totalMegaDots}{t("M Dots")}</span>
        </div>
        <div className="flex justify-between items-center pt-0.5">
          <span className="text-outline text-[10px]">{t("Printhead")}</span>
          <span className="text-on-surface text-[10px]">{t("Z-Series")} {Math.round(dotsPerMm)}{t("dpmm (")}{dpi} {t("DPI)")} </span>
        </div>
      </div>
    </div>
  );
}
