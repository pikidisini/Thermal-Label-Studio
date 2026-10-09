import { Icon } from "../../shared/ui";
import { translate as t, useTranslation } from "../../shared/i18n";
import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';

export interface ThermalPreviewDeckProps {
  onRefresh?: () => void;
  onPrint?: () => void;
}

export function ThermalPreviewDeck({
  onRefresh,
  onPrint,
}: ThermalPreviewDeckProps) {
  useTranslation();
  const {
    previewImage,
    thermalImage,
    inspectionData,
    dpi,
    setDpi,
    isRendering,
    renderError,
  } = useSimulationStore();

  const [activeBurnBleed, setActiveBurnBleed] = useState(true);

  return (
    <div className="flex-1 bg-surface flex flex-col h-full overflow-hidden select-none">
      {/* 1. Top Inspection HUD Bar (Uniform h-9 height & CAD theme tokens) */}
      <div className="h-9 bg-surface-container-low border-b border-outline-variant px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* DPI Resolution Selector */}
          <div className="flex items-center bg-surface-container border border-outline-variant text-[11px] font-mono">
            {[
              { val: 203.2, label: '203.2 DPI', sub: '8 dpmm' },
              { val: 300, label: '300 DPI', sub: '12 dpmm' },
              { val: 600, label: '600 DPI', sub: '24 dpmm' },
            ].map((item) => (
              <button
                key={item.val}
                type="button"
                onClick={() => setDpi(item.val)}

               data-ui-control="button" data-variant="toggle" data-selected={dpi === item.val} data-tone="neutral">
                {item.label} <span className="opacity-60 text-[9px]">({item.sub})</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-outline-variant mx-0.5" />

          <span className="text-[11px] font-mono text-on-surface-variant">{t("1-bit cutoff: 128")}</span>

          {/* Thermal Display effect Filter Toggle */}
          <div className="hidden lg:flex items-center">
            <button
              type="button"
              onClick={() => setActiveBurnBleed(!activeBurnBleed)}
              className={`flex items-center gap-1.5`}
             data-ui-control="button" data-variant="toggle" data-selected={activeBurnBleed} data-tone="warning">
              <Icon  size={14} glyph="local_fire_department" />
              <span>{t("Display effect")}</span>
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefresh}
            disabled={isRendering}
            className="h-7 flex items-center gap-1.5"
           data-ui-control="button" data-variant="toggle">
            <Icon className={` text-primary ${isRendering ? "animate-spin" : ''}`}  data-ui-motion="true" glyph="refresh" />
            <span>{t("Re-simulate")}</span>
          </button>

          <button
            onClick={onPrint}
            data-testid="btn-preview-print"
            title={t("Print label")}
            className="h-7 flex items-center gap-1.5"
           data-ui-control="button" data-variant="toggle">
            <Icon  size={14} glyph="print" />
            <span>{t("Print label")}</span>
          </button>
        </div>
      </div>

      {/* 2. Dual Viewport Inspection Panels (Symmetric dark CAD backdrop) */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-surface">
        {renderError && (
          <div role="alert" className="absolute z-[var(--ui-layer-tooltip)] top-12 left-3 right-3 border border-secondary bg-surface-container-high px-3 py-2 text-xs text-secondary font-mono">{t("Preview failed:")} {renderError}
          </div>
        )}
        {/* Left: Vector Reference (Anti-Aliased RGB) */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-outline-variant overflow-hidden shadow-inner">
          <div className="h-8 bg-surface-container-low px-3 flex items-center justify-between border-b border-outline-variant text-[11px] font-mono tracking-wide">
            <span className="text-primary font-bold flex items-center gap-2 tracking-wider">
              <span className="w-1.5 h-1.5 bg-primary" />{t("BACKEND BITMAP REFERENCE")} </span>
            <span className="text-outline text-[10px]">{t("Server output")}</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 bg-surface overflow-auto">
            {previewImage ? (
              <img
                src={previewImage}
                alt={t("Backend bitmap reference")}
                className="max-w-full max-h-full object-contain shadow-2xl bg-white border border-outline-variant/60"
              />
            ) : (
              <div className="text-center font-mono text-outline text-xs">
                {isRendering ? t("Rendering bitmap preview...") : t("No Preview Available")}
              </div>
            )}
          </div>
        </div>

        {/* Right: Thermal Printhead Physical Simulation (1-Bit Monochrome) */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-outline-variant overflow-hidden shadow-inner">
          <div className="h-8 bg-surface-container-low px-3 flex items-center justify-between border-b border-outline-variant text-[11px] font-mono tracking-wide">
            <span className="text-secondary font-bold flex items-center gap-2 tracking-wider">
              <span className="w-1.5 h-1.5 bg-secondary animate-pulse"  data-ui-motion="true" />{t("1-BIT THERMAL SIMULATION (")}{dpi} {t("DPI)")} </span>
            <span className="text-outline text-[10px]">{t("Visual review")}</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 bg-surface overflow-auto relative">
            {thermalImage ? (
              <div className="relative shadow-2xl bg-white border border-outline-variant/60">
                <img
                  src={thermalImage}
                  alt={t("Thermal Simulation")}
                  className={`max-w-full max-h-full object-contain ${
                    activeBurnBleed ? "filter contrast-150 blur-[0.3px]" : ''
                  }`}
                />
              </div>
            ) : (
              <div className="text-center font-mono text-outline text-xs">
                {isRendering ? t("Computing 1-Bit Thermal Simulation...") : t("No Simulation Available")}
              </div>
            )}
          </div>

          {/* Bottom Diagnostics Strip */}
          {inspectionData && (
            <div className="h-7 bg-surface-container-low px-3 border-t border-outline-variant flex items-center justify-between text-[11px] font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-semibold text-tertiary">
                  <Icon  size={13} glyph="check_circle" />
                  <span>{t("SVG Inspection: PASSED")}</span>
                </span>
                <span className="text-outline">|</span>
                <span className="text-on-surface">{t("Tokens:")} {inspectionData.tokens.length}
                </span>
                <span className="text-outline">|</span>
                <span className="text-secondary">{t("Code slots (SVG inspection):")} {inspectionData.barcode_fields.length + inspectionData.qr_fields.length}
                </span>
              </div>
              <span className="text-outline text-[10px]">{t("Engine: Thermal Rasterizer v2.0")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThermalPreviewDeck;
