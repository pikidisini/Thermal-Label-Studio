import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';

export interface ThermalPreviewDeckProps {
  onRefresh?: () => void;
  onPrintTest?: () => void;
}

export function ThermalPreviewDeck({
  onRefresh,
  onPrintTest,
}: ThermalPreviewDeckProps) {
  const {
    previewImage,
    thermalImage,
    inspectionData,
    dpi,
    setDpi,
    threshold,
    setThreshold,
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
                className={`px-2.5 py-1 text-[11px] font-medium transition-all border-r border-outline-variant last:border-r-0 ${
                  dpi === item.val
                    ? 'bg-primary text-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {item.label} <span className="opacity-60 text-[9px]">({item.sub})</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-outline-variant mx-0.5" />

          {/* Otsu Threshold Slider */}
          <div className="flex items-center gap-2 bg-surface-container px-2 py-1 border border-outline-variant font-mono text-[11px]">
            <span className="text-outline text-[10px] font-semibold tracking-wider">OTSU:</span>
            <input
              type="range"
              min="0"
              max="255"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="w-20 accent-secondary cursor-pointer h-1.5"
            />
            <span className="text-secondary font-bold w-6 text-right">{threshold}</span>
            <button
              type="button"
              onClick={() => setThreshold(128)}
              className="px-1.5 py-0.5 bg-surface-container-high hover:bg-surface-bright text-[10px] text-primary border border-outline-variant font-semibold tracking-wider transition"
              title="Reset to Standard Otsu Binarization"
            >
              AUTO
            </button>
          </div>

          <div className="h-4 w-px bg-outline-variant mx-0.5" />

          {/* Thermal Burn Bleed Filter Toggle */}
          <div className="hidden lg:flex items-center">
            <button
              type="button"
              onClick={() => setActiveBurnBleed(!activeBurnBleed)}
              className={`px-2.5 py-1 text-[11px] font-medium border transition flex items-center gap-1.5 ${
                activeBurnBleed
                  ? 'bg-secondary text-surface font-semibold border-secondary'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_fire_department</span>
              <span>Burn Bleed</span>
            </button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefresh}
            disabled={isRendering}
            className="h-7 px-2.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-[11px] font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-primary ${isRendering ? 'animate-spin' : ''}`} style={{ fontSize: 14 }}>refresh</span>
            <span>Re-simulate</span>
          </button>

          <button
            onClick={onPrintTest}
            className="h-7 px-3 bg-primary hover:bg-primary-fixed text-surface text-[11px] font-semibold flex items-center gap-1.5 shadow-md transition"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
            <span>Spool Test</span>
          </button>
        </div>
      </div>

      {/* 2. Dual Viewport Inspection Panels (Symmetric dark CAD backdrop) */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-surface">
        {renderError && (
          <div role="alert" className="absolute z-10 top-12 left-3 right-3 border border-secondary bg-surface-container-high px-3 py-2 text-xs text-secondary font-mono">
            Preview gagal: {renderError}
          </div>
        )}
        {/* Left: Vector Reference (Anti-Aliased RGB) */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-outline-variant overflow-hidden shadow-inner">
          <div className="h-8 bg-surface-container-low px-3 flex items-center justify-between border-b border-outline-variant text-[11px] font-mono tracking-wide">
            <span className="text-primary font-bold flex items-center gap-2 tracking-wider">
              <span className="w-1.5 h-1.5 bg-primary" />
              VECTOR DESIGN RENDER (RGB)
            </span>
            <span className="text-outline text-[10px]">Reference Stage</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 bg-surface overflow-auto">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Vector Render"
                className="max-w-full max-h-full object-contain shadow-2xl bg-white border border-outline-variant/60"
              />
            ) : (
              <div className="text-center font-mono text-outline text-xs">
                {isRendering ? 'Rendering Vector Preview...' : 'No Preview Available'}
              </div>
            )}
          </div>
        </div>

        {/* Right: Thermal Printhead Physical Simulation (1-Bit Monochrome) */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-outline-variant overflow-hidden shadow-inner">
          <div className="h-8 bg-surface-container-low px-3 flex items-center justify-between border-b border-outline-variant text-[11px] font-mono tracking-wide">
            <span className="text-secondary font-bold flex items-center gap-2 tracking-wider">
              <span className="w-1.5 h-1.5 bg-secondary animate-pulse" />
              1-BIT THERMAL SIMULATION ({dpi} DPI)
            </span>
            <span className="text-outline text-[10px]">Hardware Emulation</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 bg-surface overflow-auto relative">
            {thermalImage ? (
              <div className="relative shadow-2xl bg-white border border-outline-variant/60">
                <img
                  src={thermalImage}
                  alt="Thermal Simulation"
                  className={`max-w-full max-h-full object-contain ${
                    activeBurnBleed ? 'filter contrast-150 blur-[0.3px]' : ''
                  }`}
                />
              </div>
            ) : (
              <div className="text-center font-mono text-outline text-xs">
                {isRendering ? 'Computing 1-Bit Thermal Simulation...' : 'No Simulation Available'}
              </div>
            )}
          </div>

          {/* Bottom Diagnostics Strip */}
          {inspectionData && (
            <div className="h-7 bg-surface-container-low px-3 border-t border-outline-variant flex items-center justify-between text-[11px] font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-semibold text-tertiary">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                    check_circle
                  </span>
                  <span>SVG Inspection: PASSED</span>
                </span>
                <span className="text-outline">|</span>
                <span className="text-on-surface">
                  Tokens: {inspectionData.tokens.length}
                </span>
                <span className="text-outline">|</span>
                <span className="text-secondary">
                  Barcodes/QR: {inspectionData.barcode_fields.length + inspectionData.qr_fields.length}
                </span>
              </div>
              <span className="text-outline text-[10px]">Engine: Thermal Rasterizer v2.0</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThermalPreviewDeck;
