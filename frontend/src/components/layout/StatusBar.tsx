import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useSimulationStore } from '../../store/useSimulationStore';

export function StatusBar() {
  const { cursorPos, selectedObject, zoom, setZoom, triggerFit, triggerReset100 } = useStudioStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { isRendering } = useSimulationStore();

  const dotsW = Math.round(labelWidthMm * 8);
  const dotsH = Math.round(labelHeightMm * 8);

  const getTargetSummary = (): string => {
    if (!selectedObject) {
      return `SHEET: ${labelWidthMm} \u00d7 ${labelHeightMm} mm  (${dotsW} \u00d7 ${dotsH} px @ 203 DPI)`;
    }
    const obj = selectedObject as any;
    if (obj.isBarcode) {
      const typeStr = typeof obj.barcodeType === 'string' ? obj.barcodeType : 'code128';
      const valStr = typeof obj.barcodeValue === 'string' ? obj.barcodeValue : '';
      return `BARCODE: ${typeStr.toUpperCase()}  [${valStr}]`;
    }
    if (obj.dataField) return `DYNAMIC TOKEN: {{${obj.dataField}}}`;
    const t = typeof obj.type === 'string' ? obj.type : 'element';
    if (t === 'i-text' || t === 'text') return `TEXT: "${(typeof obj.text === 'string' ? obj.text : '').slice(0, 20)}"`;
    return `TARGET: ${t.toUpperCase()}`;
  };

  return (
    <footer
      data-testid="container-status-bar"
      className="h-[24px] bg-surface-container-lowest border-t border-outline-variant px-3 flex items-center justify-between font-mono text-[10px] text-on-surface-variant select-none shrink-0 z-50"
    >
      {/* Left: Cursor position + target summary */}
      <div data-testid="statusbar-left-section" className="flex items-center gap-3 overflow-hidden">
        <div data-testid="statusbar-cursor-pos" className="flex items-center gap-1.5 shrink-0">
          <span className="material-symbols-outlined text-secondary shrink-0" style={{ fontSize: 11 }}>my_location</span>
          <span>X:</span>
          <strong data-testid="statusbar-val-x" className="text-on-surface tabular-nums">{cursorPos.xMm}</strong>
          <span className="text-outline px-0.5">|</span>
          <span>Y:</span>
          <strong data-testid="statusbar-val-y" className="text-on-surface tabular-nums">{cursorPos.yMm}</strong>
          <span className="text-outline">mm</span>
        </div>

        <span className="text-outline-variant shrink-0">|</span>

        <span data-testid="statusbar-target-summary" className="text-primary font-semibold truncate">
          {getTargetSummary()}
        </span>
      </div>

      {/* Center: Thermal engine status */}
      <div data-testid="statusbar-center-section" className="hidden md:flex items-center gap-1.5 shrink-0">
        {isRendering ? (
          <span data-testid="statusbar-engine-rendering" className="flex items-center gap-1.5 text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping shrink-0" />
            <span>Rendering 1-Bit Printhead Stream&hellip;</span>
          </span>
        ) : (
          <span data-testid="statusbar-engine-ready" className="flex items-center gap-1.5 text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
            <span>Thermal Engine Ready &mdash; 203.2 DPI / 8 dpmm</span>
          </span>
        )}
      </div>

      {/* Right: Zoom controls */}
      <div data-testid="statusbar-zoom-controls" className="flex items-center gap-1 shrink-0">
        <button
          data-testid="statusbar-btn-zoom-out"
          onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))}
          className="hover:text-on-surface p-0.5 transition-colors"
          title="Zoom Out (-)"
          aria-label="Zoom Out"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>remove</span>
        </button>

        <button
          data-testid="statusbar-btn-zoom-reset"
          onClick={triggerReset100}
          className="text-on-surface hover:text-primary font-bold px-1.5 py-0.5 bg-surface-container border border-outline-variant transition-colors tabular-nums"
          title="Reset Zoom to 100%"
          aria-label="Reset Zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          data-testid="statusbar-btn-zoom-in"
          onClick={() => setZoom((z) => Math.min(3.0, Math.round((z + 0.1) * 10) / 10))}
          className="hover:text-on-surface p-0.5 transition-colors"
          title="Zoom In (+)"
          aria-label="Zoom In"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
        </button>

        <button
          data-testid="statusbar-btn-zoom-fit"
          onClick={triggerFit}
          className="hover:text-primary p-0.5 text-primary transition-colors ml-1"
          title="Fit Label to Viewport (F)"
          aria-label="Fit Label to Viewport"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>fit_screen</span>
        </button>
      </div>
    </footer>
  );
}

export default StatusBar;
