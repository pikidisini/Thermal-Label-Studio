import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { StandardPresetsGrid } from './canvas-setup/StandardPresetsGrid';
import { CustomDimensionForm } from './canvas-setup/CustomDimensionForm';
import { MatrixGeometryHud } from './canvas-setup/MatrixGeometryHud';
import { useSimulationStore } from '../../store/useSimulationStore';

interface CanvasSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'resize' | 'new';
  currentWidthMm: number;
  currentHeightMm: number;
  onApplyDimensions: (w: number, h: number) => void;
  onCreateNewTemplate?: (w: number, h: number) => void;
}

export function CanvasSetupModal({
  isOpen,
  onClose,
  mode,
  currentWidthMm,
  currentHeightMm,
  onApplyDimensions,
  onCreateNewTemplate,
}: CanvasSetupModalProps) {
  const [widthMm, setWidthMm] = useState(currentWidthMm);
  const [heightMm, setHeightMm] = useState(currentHeightMm);
  const [templateName, setTemplateName] = useState('Untitled-Label-01');

  const { dpi, setDpi } = useSimulationStore();

  useEffect(() => {
    setWidthMm(currentWidthMm);
    setHeightMm(currentHeightMm);
  }, [currentWidthMm, currentHeightMm, isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (mode === 'new' && onCreateNewTemplate) {
      onCreateNewTemplate(widthMm, heightMm);
    } else {
      onApplyDimensions(widthMm, heightMm);
    }
    onClose();
  };

  const handleSwapOrientation = () => {
    const temp = widthMm;
    setWidthMm(heightMm);
    setHeightMm(temp);
  };

  // Hardware Dot Matrix Calculations
  const dotsPerMm = dpi / 25.4;
  const dotWidth = Math.round(widthMm * dotsPerMm);
  const dotHeight = Math.round(heightMm * dotsPerMm);
  const totalMegaDots = ((dotWidth * dotHeight) / 1000000).toFixed(3);

  // Proportional aspect ratio preview calculation
  const aspectRatio = widthMm / heightMm;
  let previewWidthPercent = 90;
  let previewHeightPercent = 90;
  if (aspectRatio >= 1) {
    previewWidthPercent = 90;
    previewHeightPercent = Math.max(25, Math.min(85, Math.round(90 / aspectRatio)));
  } else {
    previewHeightPercent = 85;
    previewWidthPercent = Math.max(25, Math.min(90, Math.round(85 * aspectRatio)));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      {/* MODAL CONTAINER - 0px border radius, Stitch CAD layout */}
      <div
        data-testid="canvas-setup-modal"
        className="bg-surface-container-low border border-outline-variant shadow-[0_4px_24px_rgba(0,0,0,0.8)] w-[820px] max-w-full flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* 1. HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-outline-variant bg-surface-container-highest">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-secondary flex items-center justify-center text-background">
              <span className="material-symbols-outlined text-[18px]">
                {mode === 'new' ? 'new_label' : 'aspect_ratio'}
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-sm text-on-surface">
                {mode === 'new' ? 'New Blank Label Template' : 'Label Dimensions Setup'}
              </h2>
              <p className="text-[11px] text-outline">
                Configure physical dimensions and printhead dot geometry for the canvas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-outline hover:text-on-surface p-1 transition-colors"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY - TWO COLUMNS */}
        <div className="flex flex-col md:flex-row flex-1 min-h-[420px]">
          {/* LEFT COLUMN: CONFIGURATION */}
          <div className="flex-1 p-4 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-outline-variant overflow-y-auto">
            {/* Template Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-outline uppercase tracking-wider">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Untitled-Label-01"
                className="h-[28px] bg-surface border border-outline-variant text-on-surface font-mono text-xs px-2 focus:border-primary-container focus:outline-none w-full placeholder-on-surface-variant transition-colors"
              />
            </div>

            {/* Quick Die-Cut Presets */}
            <StandardPresetsGrid
              widthMm={widthMm}
              heightMm={heightMm}
              onSelectPreset={(w, h) => {
                setWidthMm(w);
                setHeightMm(h);
              }}
            />

            {/* Custom Dimensions Form */}
            <CustomDimensionForm
              widthMm={widthMm}
              heightMm={heightMm}
              setWidthMm={setWidthMm}
              setHeightMm={setHeightMm}
              onSwapOrientation={handleSwapOrientation}
            />

            {/* Printhead Resolution (DPI) */}
            <div className="flex flex-col gap-1 mt-auto pt-2 border-t border-outline-variant">
              <label className="text-[10px] font-semibold text-outline uppercase tracking-wider">
                Printhead Resolution (DPI)
              </label>
              <div className="flex h-[28px] bg-surface border border-outline-variant">
                {[
                  { value: 203.2, label: '203.2 DPI (8 dpmm)' },
                  { value: 300, label: '300 DPI (12 dpmm)' },
                  { value: 600, label: '600 DPI (24 dpmm)' },
                ].map((item) => {
                  const isActive = Math.abs(dpi - item.value) < 1;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setDpi(item.value)}
                      className={`flex-1 font-mono text-[10px] flex items-center justify-center transition-colors border-r last:border-r-0 border-outline-variant ${
                        isActive
                          ? 'bg-surface-variant text-on-surface font-semibold border-t-2 border-t-primary-container'
                          : 'text-outline hover:text-on-surface hover:bg-surface-variant/40'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: DOT MATRIX GEOMETRY HUD */}
          <MatrixGeometryHud
            dotWidth={dotWidth}
            dotHeight={dotHeight}
            totalMegaDots={totalMegaDots}
            dotsPerMm={dotsPerMm}
            dpi={dpi}
            previewWidthPercent={previewWidthPercent}
            previewHeightPercent={previewHeightPercent}
          />
        </div>

        {/* 7. FOOTER */}
        <div className="h-[48px] bg-surface-container-highest border-t border-outline-variant flex items-center justify-end px-4 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[28px] px-3 bg-surface-container-low border border-outline-variant text-outline text-xs hover:border-outline hover:text-on-surface transition-colors flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            data-testid="btn-apply-dimensions"
            className="h-[28px] px-4 bg-tertiary text-background text-xs font-semibold hover:bg-tertiary-fixed transition-colors flex items-center justify-center gap-1 shadow-sm"
          >
            <Check size={14} />
            <span>{mode === 'new' ? 'Create Template' : 'Apply Dimensions'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CanvasSetupModal;

