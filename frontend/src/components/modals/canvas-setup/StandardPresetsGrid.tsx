import React from 'react';
import { CANVAS_PRESETS } from '../../../types/template';

interface StandardPresetsGridProps {
  widthMm: number;
  heightMm: number;
  onSelectPreset: (w: number, h: number) => void;
}

export function StandardPresetsGrid({
  widthMm,
  heightMm,
  onSelectPreset,
}: StandardPresetsGridProps) {
  const getPresetIcon = (w: number, h: number) => {
    if (w > h) return 'crop_landscape';
    if (w < h) return 'crop_portrait';
    return 'crop_square';
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold text-outline uppercase tracking-wider">
        Standard Die-Cut Presets
      </label>
      <div className="grid grid-cols-3 gap-2">
        {CANVAS_PRESETS.map((p) => {
          const isSelected = widthMm === p.widthMm && heightMm === p.heightMm;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPreset(p.widthMm, p.heightMm)}
              className={`flex flex-col items-center justify-center gap-1 p-2 h-[64px] transition-all relative border ${
                isSelected
                  ? 'bg-surface-variant border-primary-container text-primary-container shadow-inner'
                  : 'bg-surface border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface hover:bg-surface-bright/30'
              }`}
            >
              {isSelected && (
                <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary-container" />
              )}
              <span className="material-symbols-outlined text-[18px]">
                {getPresetIcon(p.widthMm, p.heightMm)}
              </span>
              <span className="font-mono text-[10px] font-medium leading-none">
                {p.widthMm}×{p.heightMm} mm
              </span>
              <span className="text-[9px] text-outline truncate max-w-full px-1">
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
