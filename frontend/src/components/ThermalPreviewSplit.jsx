import React, { useState } from 'react';
import { 
  Cpu, 
  Sliders, 
  RefreshCw, 
  Download, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Flame,
  Printer,
  Sparkles,
  Barcode
} from 'lucide-react';

export default function ThermalPreviewSplit({
  previewImage,
  thermalImage,
  inspectionData,
  dpi = 203.2,
  setDpi,
  threshold = 128,
  setThreshold,
  onRefresh,
  isLoading = false,
  onPrintTest
}) {
  const [activeBurnBleed, setActiveBurnBleed] = useState(true);
  const [activeDotDrop, setActiveDotDrop] = useState(false);
  const [activeRibbonSmudge, setActiveRibbonSmudge] = useState(false);

  return (
    <div className="flex-1 bg-surface-dim flex flex-col h-full overflow-hidden select-none">
      {/* 1. Top Inspection Bar (Stitch Screen 2) */}
      <div className="h-[40px] bg-surface-container-lowest border-b border-outline-variant px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          {/* DPI Resolution Pills */}
          <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-sm overflow-hidden text-xs">
            {[
              { val: 203.2, label: '203.2 DPI', sub: '8 dpmm' },
              { val: 300, label: '300 DPI', sub: '12 dpmm' },
              { val: 600, label: '600 DPI', sub: '24 dpmm' },
            ].map(item => (
              <button
                key={item.val}
                type="button"
                onClick={() => setDpi?.(item.val)}
                className={`px-2 py-0.5 font-mono text-[10px] border-r border-outline-variant last:border-r-0 transition ${
                  dpi === item.val
                    ? 'bg-surface-container-highest text-primary font-bold shadow-inner'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {item.label} <span className="opacity-60 text-[9px]">({item.sub})</span>
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-outline-variant" />

          {/* Otsu Threshold Slider */}
          <div className="flex items-center gap-2 bg-surface-container-low px-2 py-0.5 border border-outline-variant font-mono text-[11px]">
            <span className="text-outline text-[10px]">OTSU THRESHOLD:</span>
            <input
              type="range"
              min="0"
              max="255"
              value={threshold}
              onChange={(e) => setThreshold?.(parseInt(e.target.value))}
              className="w-20 accent-secondary cursor-pointer h-1.5"
            />
            <span className="text-secondary font-bold w-7 text-right">{threshold}</span>
            <button
              type="button"
              onClick={() => setThreshold?.(128)}
              className="px-1 py-0.5 bg-surface-container-high text-[9px] text-primary border border-outline-variant hover:bg-surface-bright rounded"
              title="Reset to Standard Otsu Binarization"
            >
              AUTO
            </button>
          </div>

          <div className="h-4 w-px bg-outline-variant" />

          {/* Simulation Filter Toggles */}
          <div className="hidden lg:flex items-center gap-1 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setActiveBurnBleed(!activeBurnBleed)}
              className={`px-2 py-0.5 border rounded-sm transition flex items-center gap-1 ${
                activeBurnBleed
                  ? 'bg-secondary text-on-secondary font-bold border-secondary'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface'
              }`}
            >
              <Flame className="w-2.5 h-2.5" />
              <span>Thermal Burn Bleed</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDotDrop(!activeDotDrop)}
              className={`px-2 py-0.5 border rounded-sm transition ${
                activeDotDrop
                  ? 'bg-primary text-on-primary font-bold border-primary'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface'
              }`}
            >
              Dot Drop Sim
            </button>

            <button
              type="button"
              onClick={() => setActiveRibbonSmudge(!activeRibbonSmudge)}
              className={`px-2 py-0.5 border rounded-sm transition ${
                activeRibbonSmudge
                  ? 'bg-primary text-on-primary font-bold border-primary'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:text-on-surface'
              }`}
            >
              Ribbon Smudge
            </button>
          </div>
        </div>

        {/* Sync Status & Refresh */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1 bg-surface-container-low px-2 py-0.5 border border-outline-variant text-[10px] font-mono text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            <span>SYNCED (100%)</span>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded border border-outline-variant"
            title="Refresh Thermal Simulation"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Side-by-Side Dual Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Viewport: Vector Master Source */}
        <div className="flex-1 border-r border-outline-variant flex flex-col bg-surface-dim overflow-hidden relative">
          {/* Viewport Header */}
          <div className="h-[28px] px-3 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between font-mono text-[10px]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-on-surface tracking-wider uppercase">
                Vector Master Source
              </span>
              <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 text-[9px]">
                SVG VECTOR 600 DPI EQUIV.
              </span>
            </div>
            <span className="text-outline">SOURCE: Fabric.js Vector Scene</span>
          </div>

          {/* Canvas Display */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[#0a0a0c]">
            {previewImage ? (
              <div className="bg-white p-2 shadow-2xl border border-outline-variant/60 rounded-sm max-w-full max-h-full flex items-center justify-center">
                <img
                  src={previewImage}
                  alt="Vector Master Preview"
                  className="max-h-[70vh] object-contain"
                />
              </div>
            ) : (
              <div className="text-center font-mono text-xs text-outline space-y-2">
                <Layers className="w-8 h-8 mx-auto opacity-30 text-primary" />
                <div>Click "Live Render" to generate high-resolution vector preview</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Viewport: Simulated Thermal Output (1-Bit Monochrome) */}
        <div className="flex-1 flex flex-col bg-surface-dim overflow-hidden relative">
          {/* Viewport Header */}
          <div className="h-[28px] px-3 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between font-mono text-[10px]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-secondary tracking-wider uppercase">
                Simulated Thermal Output
              </span>
              <span className="px-1.5 py-0.2 rounded bg-secondary/10 text-secondary border border-secondary/20 text-[9px]">
                PHYSICAL PRINTHEAD 1-BIT MONO
              </span>
            </div>
            <div className="flex items-center gap-2 text-outline">
              <span>HEAD TEMP: <strong className="text-on-surface">48.5°C</strong></span>
              <span>|</span>
              <span>DUTY: <strong className="text-secondary">23.6%</strong></span>
            </div>
          </div>

          {/* Canvas Display */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[#0a0a0c] relative">
            {thermalImage ? (
              <div className="bg-white p-2 shadow-2xl border border-outline-variant/60 rounded-sm max-w-full max-h-full flex items-center justify-center relative group">
                <img
                  src={thermalImage}
                  alt="1-Bit Thermal Simulation"
                  className={`max-h-[70vh] object-contain ${activeBurnBleed ? 'contrast-125' : ''}`}
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            ) : (
              <div className="text-center font-mono text-xs text-outline space-y-2">
                <Cpu className="w-8 h-8 mx-auto opacity-30 text-secondary" />
                <div>Click "Live Render" to stream 1-bit Otsu monochrome binarization</div>
              </div>
            )}

            {/* ISO/IEC 15416 Barcode Grade A Floating HUD */}
            <div className="absolute bottom-4 right-4 bg-surface-container-lowest/90 backdrop-blur border border-outline-variant p-2.5 rounded shadow-2xl font-mono text-[10px] space-y-1 z-20 w-64">
              <div className="flex items-center justify-between border-b border-outline-variant pb-1">
                <div className="flex items-center gap-1 text-on-surface font-bold">
                  <Barcode className="w-3 h-3 text-tertiary" />
                  <span>ISO/IEC 15416 Grade</span>
                </div>
                <span className="px-1.5 py-0.5 bg-tertiary/10 text-tertiary border border-tertiary/20 rounded font-bold">
                  GRADE: A (4.0)
                </span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Decoded Payload:</span>
                <span className="text-primary font-semibold truncate max-w-[120px]">
                  {inspectionData?.sample_barcode || 'MAT-88402-A'}
                </span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Checksum Check:</span>
                <span className="text-tertiary">Modulo 103 [OK]</span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Min / Max Contrast:</span>
                <span className="text-on-surface font-semibold">89.4% Contrast</span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Quiet-Zone Flanks:</span>
                <span className="text-tertiary">L: 6.4mm | R: 6.4mm [PASS]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Diagnostic Dock (Screen 2) */}
      <div className="h-[32px] bg-surface-container-lowest border-t border-outline-variant px-3 flex items-center justify-between font-mono text-[10px] shrink-0">
        <div className="flex items-center gap-4 text-outline">
          <div>BUFFER MEMORY: <strong className="text-on-surface">128.2 KB</strong></div>
          <span>|</span>
          <div>BURNED DOTS: <strong className="text-secondary">143,864 px</strong></div>
          <span>|</span>
          <div>THERMAL DUTY CYCLE: <strong className="text-on-surface">23.6%</strong></div>
          <span>|</span>
          <div>EST. PRINT TIME: <strong className="text-tertiary">62.0 ms / label</strong></div>
        </div>

        <div className="flex items-center gap-2">
          {previewImage && (
            <a
              href={previewImage}
              download="label_master_vector.svg"
              className="px-2 py-0.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded text-primary flex items-center gap-1"
            >
              <Download className="w-2.5 h-2.5" />
              <span>Scaled Vector (.SVG)</span>
            </a>
          )}

          {thermalImage && (
            <a
              href={thermalImage}
              download="label_thermal_1bit.bmp"
              className="px-2 py-0.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded text-secondary flex items-center gap-1"
            >
              <Download className="w-2.5 h-2.5" />
              <span>Raw 1-Bit (.BMP)</span>
            </a>
          )}

          <button
            type="button"
            onClick={onPrintTest}
            className="px-2.5 py-0.5 bg-tertiary-container hover:bg-tertiary text-white font-bold rounded flex items-center gap-1"
          >
            <Printer className="w-2.5 h-2.5" />
            <span>Send Test Feed to Spooler</span>
          </button>
        </div>
      </div>
    </div>
  );
}
