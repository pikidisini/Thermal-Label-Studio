import React, { useState, useEffect } from 'react';
import { X, Ruler, RotateCw, Check, FilePlus, AlertCircle, Maximize2 } from 'lucide-react';

const STANDARD_PRESETS = [
  { id: '200x80', label: '200 x 80 mm', desc: 'Roll Film / Slitting Reel', w: 200, h: 80 },
  { id: '100x150', label: '100 x 150 mm', desc: 'Pallet Shipping (4x6")', w: 100, h: 150 },
  { id: '100x50', label: '100 x 50 mm', desc: 'Master Carton Box (4x2")', w: 100, h: 50 },
  { id: '80x50', label: '80 x 50 mm', desc: 'Warehouse Rack Bin', w: 80, h: 50 },
  { id: '50x25', label: '50 x 25 mm', desc: 'Asset Tag / Component', w: 50, h: 25 },
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

  const handleSelectPreset = (w, h, label) => {
    setWidthMm(w);
    setHeightMm(h);
    if (mode === 'new') {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      setTemplateName(slug);
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
      });
    } else {
      onApplyDimensions(w, h);
    }

    onClose();
  };

  const dotsX = Math.round(widthMm * 8); // 8 dots/mm @ 203.2 DPI
  const dotsY = Math.round(heightMm * 8);
  const isLandscape = widthMm >= heightMm;

  // Visual aspect ratio box calculation
  const maxBoxSize = 140; // px
  let previewBoxW, previewBoxH;
  if (isLandscape) {
    previewBoxW = maxBoxSize;
    previewBoxH = Math.max(24, Math.round((heightMm / (widthMm || 1)) * maxBoxSize));
  } else {
    previewBoxH = maxBoxSize;
    previewBoxW = Math.max(24, Math.round((widthMm / (heightMm || 1)) * maxBoxSize));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-studio-darkest border border-studio-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-studio-border flex items-center justify-between bg-studio-darker">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              {mode === 'new' ? <FilePlus className="w-4 h-4" /> : <Ruler className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {mode === 'new' ? 'New Blank Label Template' : 'Custom Canvas Dimensions'}
              </h2>
              <p className="text-xs text-gray-400">
                {mode === 'new'
                  ? 'Specify custom die-cut size and name for your new template'
                  : 'Adjust width and height in millimeters for any thermal label roll'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-studio-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Template Name (only in new mode) */}
          {mode === 'new' && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Template Name / Code
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. label_slitting_75x35"
                required
                className="w-full px-3 py-2 bg-studio-panel border border-studio-border rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          )}

          {/* Quick Presets Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Quick Standard Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STANDARD_PRESETS.map((p) => {
                const isSelected = widthMm === p.w && heightMm === p.h;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.w, p.h, p.id)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500/60 text-white'
                        : 'bg-studio-panel border-studio-border text-gray-300 hover:border-gray-600 hover:bg-studio-hover'
                    }`}
                  >
                    <span className="text-xs font-semibold">{p.label}</span>
                    <span className="text-[10px] text-gray-400 truncate">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Dimension Inputs & Live Preview Box */}
          <div className="bg-studio-panel/50 border border-studio-border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200">Custom Dimensions (mm)</span>
              <button
                type="button"
                onClick={handleSwapOrientation}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1.5 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/20 transition"
                title="Swap Width & Height"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Swap ({isLandscape ? 'Portrait' : 'Landscape'})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Width (<span className="text-amber-400 font-mono">W</span>)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="0.5"
                    value={widthMm}
                    onChange={(e) => setWidthMm(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full pl-3 pr-10 py-2 bg-studio-darker border border-studio-border rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 text-xs text-gray-400 font-mono pointer-events-none">
                    mm
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Height (<span className="text-amber-400 font-mono">H</span>)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="0.5"
                    value={heightMm}
                    onChange={(e) => setHeightMm(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full pl-3 pr-10 py-2 bg-studio-darker border border-studio-border rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 text-xs text-gray-400 font-mono pointer-events-none">
                    mm
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Aspect Ratio Box & Technical Specs */}
            <div className="pt-2 border-t border-studio-border flex items-center space-x-4">
              {/* Aspect Ratio Box */}
              <div className="w-36 h-28 bg-studio-darkest rounded-lg border border-studio-border flex items-center justify-center p-2 shrink-0">
                <div
                  style={{ width: `${previewBoxW}px`, height: `${previewBoxH}px` }}
                  className="bg-amber-500/20 border-2 border-amber-400/80 rounded flex items-center justify-center text-[10px] text-amber-200 font-mono font-medium shadow-inner transition-all duration-300"
                >
                  {widthMm}x{heightMm}
                </div>
              </div>

              {/* Technical Print Spec Details */}
              <div className="text-xs space-y-1 text-gray-400 font-mono">
                <div className="text-gray-300 font-semibold flex items-center space-x-1">
                  <span>Aspect Ratio:</span>
                  <span className="text-white">
                    {(widthMm / (heightMm || 1)).toFixed(2)} : 1 ({isLandscape ? 'Landscape' : 'Portrait'})
                  </span>
                </div>
                <div>
                  Resolution @ 203 DPI: <span className="text-amber-300">{dotsX} × {dotsY} dots</span>
                </div>
                <div>
                  Resolution @ 300 DPI: <span className="text-gray-300">{Math.round(widthMm * 11.81)} × {Math.round(heightMm * 11.81)} dots</span>
                </div>
                {widthMm > 104 && (
                  <div className="text-[11px] text-amber-400 flex items-center space-x-1 mt-1 font-sans">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Width &gt; 104mm (Requires 6" or 8" wide thermal printhead).</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-studio-hover transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-lg shadow-amber-500/20 transition"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{mode === 'new' ? 'Create Template' : 'Apply Dimensions'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
