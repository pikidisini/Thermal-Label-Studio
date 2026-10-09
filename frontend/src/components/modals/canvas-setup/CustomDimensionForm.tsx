import { Icon } from "../../../shared/ui";
import { translate as t, useTranslation } from "../../../shared/i18n";
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
  useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label data-ui-label="true" className="text-[10px] font-semibold text-outline uppercase tracking-wider">{t("Physical Dimensions")} </label>
        <button
          type="button"
          onClick={onSwapOrientation}
          title={t("Swap Width & Height")}
          className="flex items-center gap-1"
         data-ui-control="button" data-variant="compact">
          <Icon component={ArrowLeftRight}  size="small" />
          <span>{t("Swap Orientation")}</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Width */}
        <div className="flex flex-1 h-[30px] bg-surface border border-outline-variant focus-within:border-primary-container transition-colors">
          <div className="w-[32px] bg-surface-container-high flex items-center justify-center border-r border-outline-variant select-none">
            <span className="text-[10px] font-semibold text-outline">{t("W")}</span>
          </div>
          <input
            type="number"
            min="10"
            max="500"
            step="1"
            data-testid="input-width-mm"
            value={widthMm}
            onChange={(e) => setWidthMm(Math.max(1, Number(e.target.value)))}
            className="flex-1 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
           data-ui-control="input" data-variant="default" />
          <div className="px-2 flex items-center bg-surface select-none">
            <span className="font-mono text-[10px] text-outline">{t("mm")}</span>
          </div>
        </div>

        {/* Swap Icon Button */}
        <button
          type="button"
          onClick={onSwapOrientation}
          title={t("Swap Dimensions")}
          className="w-[30px] h-[30px] flex items-center justify-center shrink-0"
         data-ui-control="button" data-variant="default">
          <Icon size="control" glyph="swap_horiz" />
        </button>

        {/* Height */}
        <div className="flex flex-1 h-[30px] bg-surface border border-outline-variant focus-within:border-primary-container transition-colors">
          <div className="w-[32px] bg-surface-container-high flex items-center justify-center border-r border-outline-variant select-none">
            <span className="text-[10px] font-semibold text-outline">{t("H")}</span>
          </div>
          <input
            type="number"
            min="10"
            max="500"
            step="1"
            data-testid="input-height-mm"
            value={heightMm}
            onChange={(e) => setHeightMm(Math.max(1, Number(e.target.value)))}
            className="flex-1 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
           data-ui-control="input" data-variant="default" />
          <div className="px-2 flex items-center bg-surface select-none">
            <span className="font-mono text-[10px] text-outline">{t("mm")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
