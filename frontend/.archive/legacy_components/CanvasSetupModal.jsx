import React, { useState, useEffect } from 'react';
import { X, Ruler, RotateCw, Check, FilePlus, AlertCircle, Cpu } from 'lucide-react';

const STANDARD_PRESETS = [
  { id: '200x80', label: '200 × 80 mm', desc: 'Roll Film / Slitting', w: 200, h: 80 },
  { id: '100x150', label: '100 × 150 mm', desc: 'Pallet Shipping (4×6")', w: 100, h: 150 },
  { id: '100x50', label: '100 × 50 mm', desc: 'Carton Box (4×2")', w: 100, h: 50 },
  { id: '80x50', label: '80 × 50 mm', desc: 'Warehouse Rack Bin', w: 80, h: 50 },
  { id: '50x25', label: '50 × 25 mm', desc: 'Asset Tag / Part', w: 50, h: 25 },
];

const DPI_PRESETS = [
  { dpi: 203.2, dpmm: '8 dpmm', label: '203.2 DPI' },
  { dpi: 300.0, dpmm: '11.8 dpmm', label: '300.0 DPI' },
  { dpi: 600.0, dpmm: '23.6 dpmm', label: '600.0 DPI' },
];

export default function CanvasSetupModal({
  isOpen,
  onClose,
  mode = 'resize', // 'resize' | 'new'
  currentWidthMm = 200,
  currentHeightMm = 80,
  onApplyDimensions,
  onCreateNewTemplate,
}) {
  const [widthMm, setWidthMm] = useState(currentWidthMm);
  const [heightMm, setHeightMm] = useState(currentHeightMm);
  const [templateName, setTemplateName] = useState('');
  const [dpi, setDpi] = useState(203.2);

  useEffect(() => {
    if (isOpen) {
      setWidthMm(currentWidthMm);
      setHeightMm(currentHeightMm);
      if (mode === 'new') {
        setTemplateName(`custom_label_${currentWidthMm}x${currentHeightMm}`);
      }
    }
  }, [isOpen, currentWidthMm, currentHeightMm, mode]);

  if (!isOpen) return null;

  const handleSelectPreset = (w, h, id) => {
    setWidthMm(w);
    setHeightMm(h);
    if (mode === 'new') {
      setTemplateName(`label_${id}`);
    }
  };

  const handleSwapOrientation = () => {
    setWidthMm(heightMm);
    setHeightMm(widthMm);
  };

  const handleApply = (e) => {
    e.preventDefault();
    const w = parseFloat(widthMm);
    const h = parseFloat(heightMm);

    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
      alert('Please enter valid positive dimensions for width and height.');
      return;
    }

    if (w < 10 || h < 10) {
      alert('Minimum label dimension is 10 mm.');
      return;
    }

    if (w > 1000 || h > 1000) {
      alert('Maximum label dimension is 1000 mm.');
      return;
    }

    if (mode === 'new') {
      const name = templateName.trim() || `label_${w}x${h}`;
      onCreateNewTemplate({
        name,
        widthMm: w,
        heightMm: h,
        dpi,
      });
    } else {
      onApplyDimensions(w, h, dpi);
    }

    onClose();
  };

  const dotsPerMm = dpi / 25.4;
  const dotsX = Math.round(widthMm * dotsPerMm);
  const dotsY = Math.round(heightMm * dotsPerMm);
  const totalMegaDots = ((dotsX * dotsY) / 1000000).toFixed(3);
  const isLandscape = widthMm >= heightMm;

  // Visual aspect ratio box calculation for HUD
  const maxBoxSize = 130; // px
  let previewBoxW, previewBoxH;
  if (isLandscape) {
    previewBoxW = maxBoxSize;
    previewBoxH = Math.max(22, Math.round((heightMm / (widthMm || 1)) * maxBoxSize));
  } else {
    previewBoxH = maxBoxSize;
    previewBoxW = Math.max(22, Math.round((widthMm / (heightMm || 1)) * maxBoxSize));
  }

  return (
    <div data-testid="canvas-setup-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs select-none p-4 animate-fadeIn">
      {/* CAD Modal Container (Zero-radius Stitch design) */}
      <div className="bg-surface-container-low border border-outline-variant shadow-[0_4px_24px_rgba(0,0,0,0.8)] w-[780px] max-w-full flex flex-col overflow-hidden">
        {/* 1. Header */}
        <div className="flex items-center justify-between p-3.5 px-4 border-b border-outline-variant bg-surface-container-highest shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-secondary flex items-center justify-center text-background shrink-0 font-bold">
              {mode === 'new' ? <FilePlus className="w-4 h-4" /> : <Ruler className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">
                {mode === 'new' ? 'New Blank Label Template' : 'Canvas Dimensions Setup'}
              </h2>
              <p className="font-label-sm text-[10px] text-outline">
                {mode === 'new'
                  ? 'Configure physical dimensions and printhead dot geometry for the canvas'
                  : 'Adjust width, height, and printhead geometry for active die-cut label'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-outline hover:text-on-surface transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Dual-Column Body */}
        <form onSubmit={handleApply} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-y-auto min-h-[380px]">
            {/* Left Column: Configuration Controls */}
            <div className="flex-1 p-4 flex flex-col gap-3.5 border-r border-outline-variant overflow-y-auto bg-surface-container-low">
              {/* Template Name (in new mode) */}
              {mode === 'new' && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-[10px] text-outline uppercase tracking-wider font-semibold">
                    Template Identifier / Slug
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. custom_label_200x80"
                    required
                    className="h-control-h-standard bg-surface border border-outline-variant text-on-surface font-mono text-xs px-2.5 focus:border-primary focus:outline-none w-full placeholder-on-surface-variant transition"
                  />
                </div>
              )}

              {/* Quick Standard Presets */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm text-[10px] text-outline uppercase tracking-wider font-semibold">
                  Standard Die-Cut Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {STANDARD_PRESETS.map((p) => {
                    const isSelected = widthMm === p.w && heightMm === p.h;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPreset(p.w, p.h, p.id)}
                        className={`h-[56px] p-2 flex flex-col items-center justify-center gap-0.5 border transition-colors relative text-center ${
                          isSelected
                            ? 'bg-surface-variant border-primary text-primary'
                            : 'bg-surface border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary" />
                        )}
                        <span className="font-mono text-[11px] font-bold tracking-tight">
                          {p.label}
                        </span>
                        <span className="font-label-sm text-[9px] text-outline truncate max-w-[110px]">
                          {p.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Physical Dimensions Steppers */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm text-[10px] text-outline uppercase tracking-wider font-semibold">
                  Physical Dimensions (mm)
                </label>
                <div className="flex items-center gap-2">
                  {/* Width Box */}
                  <div className="flex flex-1 h-control-h-compact bg-surface border border-outline-variant focus-within:border-primary transition">
                    <div className="w-[28px] bg-surface-variant flex items-center justify-center border-r border-outline-variant text-outline font-mono text-[10px] font-bold">
                      W
                    </div>
                    <input
                      type="number"
                      data-testid="input-width-mm"
                      min="10"
                      max="1000"
                      step="0.5"
                      value={widthMm}
                      onChange={(e) => setWidthMm(parseFloat(e.target.value) || 0)}
                      required
                      className="flex-1 bg-transparent text-right font-mono text-xs text-on-surface px-2 focus:outline-none border-none"
                    />
                    <div className="px-2 flex items-center bg-surface font-mono text-[10px] text-outline">
                      mm
                    </div>
                  </div>

                  {/* Swap Button */}
                  <button
                    type="button"
                    data-testid="btn-modal-swap"
                    onClick={handleSwapOrientation}
                    className="w-[26px] h-[26px] flex items-center justify-center bg-surface-variant border border-outline-variant text-on-surface hover:text-primary hover:border-primary transition shrink-0"
                    title={`Swap to ${isLandscape ? 'Portrait' : 'Landscape'}`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Height Box */}
                  <div className="flex flex-1 h-control-h-compact bg-surface border border-outline-variant focus-within:border-primary transition">
                    <div className="w-[28px] bg-surface-variant flex items-center justify-center border-r border-outline-variant text-outline font-mono text-[10px] font-bold">
                      H
                    </div>
                    <input
                      type="number"
                      data-testid="input-height-mm"
                      min="10"
                      max="1000"
                      step="0.5"
                      value={heightMm}
                      onChange={(e) => setHeightMm(parseFloat(e.target.value) || 0)}
                      required
                      className="flex-1 bg-transparent text-right font-mono text-xs text-on-surface px-2 focus:outline-none border-none"
                    />
                    <div className="px-2 flex items-center bg-surface font-mono text-[10px] text-outline">
                      mm
                    </div>
                  </div>
                </div>
              </div>

              {/* Printhead Resolution (DPI) Switcher */}
              <div className="flex flex-col gap-1.5 mt-auto">
                <label className="font-label-sm text-[10px] text-outline uppercase tracking-wider font-semibold">
                  Printhead Resolution (DPI)
                </label>
                <div className="flex h-control-h-compact bg-surface border border-outline-variant">
                  {DPI_PRESETS.map((p, idx) => {
                    const isSelected = Math.abs(dpi - p.dpi) < 1;
                    return (
                      <button
                        key={p.dpi}
                        type="button"
                        onClick={() => setDpi(p.dpi)}
                        className={`flex-1 font-mono text-[10px] flex items-center justify-center transition-colors ${
                          idx < DPI_PRESETS.length - 1 ? 'border-r border-outline-variant' : ''
                        } ${
                          isSelected
                            ? 'bg-surface-variant border-t-2 border-t-primary text-primary font-bold'
                            : 'bg-transparent text-outline hover:text-on-surface hover:bg-surface-variant'
                        }`}
                      >
                        {p.label} ({p.dpmm})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Dot Matrix Geometry HUD */}
            <div className="w-[290px] bg-surface flex flex-col p-4 gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-primary">
                <Cpu className="w-3.5 h-3.5" />
                <h3 className="font-label-sm text-[10px] text-on-surface uppercase tracking-wider font-bold">
                  Matrix Geometry HUD
                </h3>
              </div>

              {/* Preview Wireframe Box */}
              <div className="flex-1 border border-outline-variant bg-surface-dim relative flex items-center justify-center p-3 min-h-[140px]">
                <div
                  style={{ width: `${previewBoxW}px`, height: `${previewBoxH}px` }}
                  className="border-2 border-primary bg-primary/10 flex items-center justify-center relative transition-all duration-200"
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[9px] text-primary bg-surface-dim px-1">
                    {dotsX} px
                  </div>
                  <div className="absolute top-1/2 -left-3 -translate-y-1/2 -translate-x-full font-mono text-[9px] text-primary bg-surface-dim px-1 whitespace-nowrap">
                    {dotsY} px
                  </div>
                  <span className="font-mono text-[10px] text-primary/80 font-bold">
                    {widthMm}×{heightMm}
                  </span>
                </div>
              </div>

              {/* Tech Specs */}
              <div className="flex flex-col gap-1 bg-surface-container-low border border-outline-variant p-2.5 font-mono text-[10px]">
                <div className="flex justify-between items-center border-b border-outline-variant/60 pb-1">
                  <span className="text-outline">Dot Width</span>
                  <span className="text-on-surface font-semibold">{dotsX} dots</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline-variant/60 pb-1 pt-0.5">
                  <span className="text-outline">Dot Height</span>
                  <span className="text-on-surface font-semibold">{dotsY} dots</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline-variant/60 pb-1 pt-0.5">
                  <span className="text-outline">Total Surface</span>
                  <span className="text-secondary font-semibold">{totalMegaDots}M Dots</span>
                </div>
                <div className="flex justify-between items-center border-b border-outline-variant/60 pb-1 pt-0.5">
                  <span className="text-outline">Aspect Ratio</span>
                  <span className="text-on-surface">
                    {(widthMm / (heightMm || 1)).toFixed(2)}:1 ({isLandscape ? 'Landscape' : 'Portrait'})
                  </span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-outline">Printhead</span>
                  <span className="text-tertiary font-semibold">
                    {dotsPerMm >= 20 ? '24 dpmm (600 DPI)' : dotsPerMm >= 11 ? '12 dpmm (300 DPI)' : '8 dpmm (203 DPI)'}
                  </span>
                </div>
                {widthMm > 104 && (
                  <div className="mt-1 pt-1 border-t border-secondary/30 text-[9px] text-secondary flex items-center gap-1 font-sans">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Width &gt; 104mm (Requires 6" / 8" printhead)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Footer Action Bar */}
          <div className="h-[44px] bg-surface-container-highest border-t border-outline-variant flex items-center justify-end px-4 gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-[26px] px-3 bg-surface-container-low border border-outline-variant text-outline font-mono text-[11px] hover:text-on-surface hover:border-outline transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-apply-dimensions"
              className="h-[26px] px-4 bg-tertiary text-background font-mono text-[11px] font-bold hover:bg-tertiary-fixed-dim transition flex items-center gap-1 shadow-xs"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{mode === 'new' ? 'Create Template' : 'Apply Dimensions'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
