import React from 'react';
import { ArrowLeftRight } from 'lucide-react';

interface CustomDimensionFormProps {
  widthMm: number;
  heightMm: number;
  setWidthMm: (w: number) => void;
  setHeightMm: (h: number) => void;
  onSwapOrientation: () => void;
}

export function CustomDimensionForm({
  widthMm,
  heightMm,
  setWidthMm,
  setHeightMm,
  onSwapOrientation,
}: CustomDimensionFormProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-outline uppercase tracking-wider">
          Physical Dimensions
        </label>
        <button
          type="button"
          onClick={onSwapOrientation}
          title="Swap Width & Height"
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-fixed transition-colors"
        >
          <ArrowLeftRight size={12} />
          <span>Swap Orientation</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Width */}
        <div className="flex flex-1 h-[30px] bg-surface border border-outline-variant focus-within:border-primary-container transition-colors">
          <div className="w-[32px] bg-surface-variant flex items-center justify-center border-r border-outline-variant select-none">
            <span className="text-[10px] font-semibold text-outline">W</span>
          </div>
          <input
            type="number"
            min="10"
            max="500"
            step="1"
            data-testid="input-width-mm"
            value={widthMm}
            onChange={(e) => setWidthMm(Math.max(1, Number(e.target.value)))}
            className="flex-1 bg-transparent text-right font-mono text-xs text-on-surface px-2 focus:outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="px-2 flex items-center bg-surface select-none">
            <span className="font-mono text-[10px] text-outline">mm</span>
          </div>
        </div>

        {/* Swap Icon Button */}
        <button
          type="button"
          onClick={onSwapOrientation}
          title="Swap Dimensions"
          className="w-[30px] h-[30px] flex items-center justify-center bg-surface-variant border border-outline-variant text-on-surface hover:text-primary-container hover:border-primary-container transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
        </button>

        {/* Height */}
        <div className="flex flex-1 h-[30px] bg-surface border border-outline-variant focus-within:border-primary-container transition-colors">
          <div className="w-[32px] bg-surface-variant flex items-center justify-center border-r border-outline-variant select-none">
            <span className="text-[10px] font-semibold text-outline">H</span>
          </div>
          <input
            type="number"
            min="10"
            max="500"
            step="1"
            data-testid="input-height-mm"
            value={heightMm}
            onChange={(e) => setHeightMm(Math.max(1, Number(e.target.value)))}
            className="flex-1 bg-transparent text-right font-mono text-xs text-on-surface px-2 focus:outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="px-2 flex items-center bg-surface select-none">
            <span className="font-mono text-[10px] text-outline">mm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
