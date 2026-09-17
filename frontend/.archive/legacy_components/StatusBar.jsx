import React from 'react';
import { 
  Crosshair, 
  Layers, 
  Cpu, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw,
  CheckCircle2,
  Keyboard
} from 'lucide-react';

export default function StatusBar({
  cursorPos = { xMm: '0.0', yMm: '0.0' },
  labelWidthMm = 200,
  labelHeightMm = 80,
  selectedObject = null,
  activeContractKey = 'goods_receipt',
  zoom = 1.0,
  setZoom,
  onFitZoom,
  onResetZoom,
  onOpenShortcuts,
  isRendering = false,
}) {
  const dotsW = Math.round(labelWidthMm * 8);
  const dotsH = Math.round(labelHeightMm * 8);

  const getTargetSummary = () => {
    if (!selectedObject) {
      return `SHEET: ${labelWidthMm}×${labelHeightMm}mm (${dotsW}×${dotsH}px)`;
    }
    const type = selectedObject.type || 'element';
    if (selectedObject.isBarcode) {
      return `BARCODE: ${selectedObject.barcodeType || 'code128'} [${selectedObject.barcodeValue || ''}]`;
    }
    if (selectedObject.dataField) {
      return `DYNAMIC TOKEN: {{${selectedObject.dataField}}}`;
    }
    if (type === 'i-text' || type === 'text') {
      return `TEXT: "${selectedObject.text?.slice(0, 15) || ''}"`;
    }
    return `TARGET: ${type.toUpperCase()}`;
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-[24px] bg-surface-container-lowest border-t border-outline-variant px-3 flex items-center justify-between font-mono text-[10px] text-on-surface-variant z-50 select-none">
      {/* Left: Real-time Cursor Coordinates & Target Element */}
      <div className="flex items-center gap-3">
        {/* Cursor Coordinates */}
        <div className="flex items-center gap-1.5 text-on-surface">
          <Crosshair className="w-2.5 h-2.5 text-secondary shrink-0" />
          <span>POS:</span>
          <span>X: <strong className="text-white">{cursorPos.xMm}</strong> mm</span>
          <span className="text-outline">|</span>
          <span>Y: <strong className="text-white">{cursorPos.yMm}</strong> mm</span>
        </div>

        <span className="text-outline-variant">|</span>

        {/* Selected Target Summary */}
        <div className="flex items-center gap-1.5 text-on-surface-variant truncate max-w-[320px]">
          <span className="text-primary font-semibold">{getTargetSummary()}</span>
        </div>
      </div>

      {/* Center: Hardware Thermal Engine Readiness */}
      <div className="hidden md:flex items-center gap-2">
        {isRendering ? (
          <span className="flex items-center gap-1.5 text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping" />
            <span>Rendering 1-Bit Printhead Stream...</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            <span>Thermal Engine Ready (203.2 DPI / 8 dpmm)</span>
          </span>
        )}
      </div>

      {/* Right: Quick Zoom Controls & 1:1 Reset */}
      <div className="flex items-center gap-2 font-mono">
        <button
          onClick={() => setZoom && setZoom(Math.max(0.2, Math.round((zoom - 0.1) * 10) / 10))}
          className="hover:text-white p-0.5"
          title="Zoom Out"
        >
          <ZoomOut className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={onResetZoom}
          className="text-on-surface hover:text-primary font-bold px-1 py-0.5 bg-surface-container border border-outline-variant rounded"
          title="Reset Zoom 100%"
        >
          ZOOM: {Math.round(zoom * 100)}% (1:1)
        </button>

        <button
          onClick={() => setZoom && setZoom(Math.min(3.0, Math.round((zoom + 0.1) * 10) / 10))}
          className="hover:text-white p-0.5"
          title="Zoom In"
        >
          <ZoomIn className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={onFitZoom}
          className="hover:text-white p-0.5 text-primary"
          title="Fit Label to Viewport"
        >
          <Maximize2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </footer>
  );
}
