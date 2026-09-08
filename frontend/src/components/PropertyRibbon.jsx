import React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  RotateCw,
  Ruler,
  Grid,
  Sliders,
  Maximize2
} from 'lucide-react';

export default function PropertyRibbon({
  selectedObject,
  onUpdateProperty,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
  labelWidthMm = 200,
  labelHeightMm = 80,
  onUpdateCanvasDimensions,
  onOpenDimensionModal,
  pxPerMm = 4,
  isSnapEnabled = true,
  onToggleSnap,
  areGuidesEnabled = true,
  onToggleGuides
}) {
  const dotsW = Math.round(labelWidthMm * 8);
  const dotsH = Math.round(labelHeightMm * 8);

  const obj = selectedObject;
  const isText = obj && (obj.type === 'i-text' || obj.type === 'text');
  const isBarcode = obj && obj.isBarcode;
  const isShape = obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'line');

  // Convert pixel dimensions to mm
  const xMm = obj ? ((obj.left || 0) / pxPerMm).toFixed(2) : '0.00';
  const yMm = obj ? ((obj.top || 0) / pxPerMm).toFixed(2) : '0.00';
  const wMm = obj ? (((obj.width || 0) * (obj.scaleX || 1)) / pxPerMm).toFixed(2) : '0.00';
  const hMm = obj ? (((obj.height || 0) * (obj.scaleY || 1)) / pxPerMm).toFixed(2) : '0.00';
  const angle = obj ? Math.round(obj.angle || 0) : 0;

  return (
    <div className="fixed top-[40px] left-0 right-0 h-[36px] px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-low z-40 select-none overflow-x-auto">
      {/* Left: Dimension Indicator & Coordinate Inputs */}
      <div className="flex items-center gap-3">
        {/* Label Dimension Pill */}
        <div className="flex items-center gap-1.5 bg-surface px-2 py-0.5 border border-outline-variant font-mono text-[11px]">
          <span className="text-outline font-semibold text-[10px] pr-0.5">DIM</span>
          <button
            onClick={() => onOpenDimensionModal?.('resize')}
            className="text-primary hover:underline font-bold"
            title="Click to resize label sheet"
          >
            {labelWidthMm} × {labelHeightMm} mm
          </button>
          <span className="text-outline">@</span>
          <span className="text-on-surface-variant font-semibold">203.2 DPI</span>
          <span className="text-outline-variant text-[10px] hidden sm:inline">(8 dpmm)</span>

          <button
            onClick={() => onUpdateCanvasDimensions?.(labelHeightMm, labelWidthMm)}
            title="Swap Orientation (Landscape ↔ Portrait)"
            className="ml-1 p-0.5 hover:bg-surface-container text-outline hover:text-secondary rounded"
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* CAD Coordinate Inputs (Active Object or Default) */}
        {obj ? (
          <div className="flex items-center gap-1 font-mono text-[11px]">
            {/* X */}
            <div className="flex items-center bg-surface border border-outline-variant h-[22px] px-1.5 rounded-sm">
              <span className="text-outline font-semibold text-[10px] pr-1">X</span>
              <input
                type="number"
                step="0.5"
                value={xMm}
                onChange={(e) => onUpdateProperty('left', parseFloat(e.target.value || 0) * pxPerMm)}
                className="w-12 bg-transparent text-right text-on-surface focus:outline-none"
              />
              <span className="text-outline-variant text-[9px] pl-0.5">mm</span>
            </div>

            {/* Y */}
            <div className="flex items-center bg-surface border border-outline-variant h-[22px] px-1.5 rounded-sm">
              <span className="text-outline font-semibold text-[10px] pr-1">Y</span>
              <input
                type="number"
                step="0.5"
                value={yMm}
                onChange={(e) => onUpdateProperty('top', parseFloat(e.target.value || 0) * pxPerMm)}
                className="w-12 bg-transparent text-right text-on-surface focus:outline-none"
              />
              <span className="text-outline-variant text-[9px] pl-0.5">mm</span>
            </div>

            {/* W */}
            <div className="flex items-center bg-surface border border-outline-variant h-[22px] px-1.5 rounded-sm">
              <span className="text-outline font-semibold text-[10px] pr-1">W</span>
              <input
                type="number"
                step="0.5"
                value={wMm}
                onChange={(e) => {
                  const val = parseFloat(e.target.value || 0) * pxPerMm;
                  onUpdateProperty('scaleX', val / (obj.width || 1));
                }}
                className="w-12 bg-transparent text-right text-on-surface focus:outline-none"
              />
              <span className="text-outline-variant text-[9px] pl-0.5">mm</span>
            </div>

            {/* H */}
            <div className="flex items-center bg-surface border border-outline-variant h-[22px] px-1.5 rounded-sm">
              <span className="text-outline font-semibold text-[10px] pr-1">H</span>
              <input
                type="number"
                step="0.5"
                value={hMm}
                onChange={(e) => {
                  const val = parseFloat(e.target.value || 0) * pxPerMm;
                  onUpdateProperty('scaleY', val / (obj.height || 1));
                }}
                className="w-12 bg-transparent text-right text-on-surface focus:outline-none"
              />
              <span className="text-outline-variant text-[9px] pl-0.5">mm</span>
            </div>

            {/* Angle */}
            <div className="flex items-center bg-surface border border-outline-variant h-[22px] px-1.5 rounded-sm">
              <span className="text-outline font-semibold text-[10px] pr-1">∠</span>
              <input
                type="number"
                step="15"
                value={angle}
                onChange={(e) => onUpdateProperty('angle', parseFloat(e.target.value || 0))}
                className="w-10 bg-transparent text-right text-on-surface focus:outline-none"
              />
              <span className="text-outline-variant text-[9px] pl-0.5">°</span>
            </div>

            {/* Specific Object Controls: Barcode Symbology */}
            {isBarcode && (
              <div className="flex items-center gap-1 pl-2 border-l border-outline-variant">
                <span className="text-on-surface-variant text-[10px]">Symbology:</span>
                <div className="h-[22px] px-1.5 bg-surface border border-outline-variant text-primary font-mono text-[10px] flex items-center font-bold">
                  {(obj.barcodeType || 'CODE128').toUpperCase()} Auto
                </div>
              </div>
            )}

            {/* Specific Object Controls: Typography */}
            {isText && (
              <div className="flex items-center gap-1 pl-2 border-l border-outline-variant">
                <button
                  onClick={() => onUpdateProperty('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold')}
                  className={`p-1 rounded ${obj.fontWeight === 'bold' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Bold"
                >
                  <Bold className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onUpdateProperty('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic')}
                  className={`p-1 rounded ${obj.fontStyle === 'italic' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Italic"
                >
                  <Italic className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onUpdateProperty('underline', !obj.underline)}
                  className={`p-1 rounded ${obj.underline ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Underline"
                >
                  <Underline className="w-3 h-3" />
                </button>
                <div className="h-3 w-px bg-outline-variant" />
                <button
                  onClick={() => onUpdateProperty('textAlign', 'left')}
                  className={`p-1 rounded ${obj.textAlign === 'left' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Align Left"
                >
                  <AlignLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onUpdateProperty('textAlign', 'center')}
                  className={`p-1 rounded ${obj.textAlign === 'center' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Align Center"
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onUpdateProperty('textAlign', 'right')}
                  className={`p-1 rounded ${obj.textAlign === 'right' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  title="Align Right"
                >
                  <AlignRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-outline text-code-matrix font-mono hidden md:inline">
            Click any vector element to inspect &amp; edit sub-millimeter geometry
          </div>
        )}
      </div>

      {/* Right: Snap & Guides Toggles */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleSnap}
          className={`h-[22px] px-2 bg-surface border border-outline-variant font-label-sm text-label-sm flex items-center gap-1 rounded-sm transition ${
            isSnapEnabled ? 'text-primary border-primary/40' : 'text-on-surface-variant'
          }`}
          title="Toggle Grid Snapping (1.0mm)"
        >
          <Grid className="w-3 h-3" />
          <span>Snap: 1.0mm</span>
        </button>

        <button
          type="button"
          onClick={onToggleGuides}
          className={`h-[22px] px-2 bg-surface border border-outline-variant font-label-sm text-label-sm flex items-center gap-1 rounded-sm transition ${
            areGuidesEnabled ? 'text-primary border-primary/40' : 'text-on-surface-variant'
          }`}
          title="Toggle Alignment Guides"
        >
          <Ruler className="w-3 h-3" />
          <span>Guides</span>
        </button>
      </div>
    </div>
  );
}
