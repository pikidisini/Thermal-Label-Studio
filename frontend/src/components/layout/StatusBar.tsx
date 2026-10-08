import { translate as t, useTranslation } from "../../shared/i18n";
import { useFieldLabel } from '../../features/data-tokens';
import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Button, IconButton } from '../../shared/ui';

export function StatusBar() {
  useTranslation();
  const fieldLabel = useFieldLabel();
  const { cursorPos, selectedObject, zoom, setZoom, triggerFit, triggerReset100 } = useStudioStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { isRendering } = useSimulationStore();

  const dotsW = Math.round(labelWidthMm * 8);
  const dotsH = Math.round(labelHeightMm * 8);

  const getTargetSummary = (): string => {
    if (!selectedObject) {
      return `${t("SHEET")}: ${labelWidthMm} \u00d7 ${labelHeightMm} mm  (${dotsW} \u00d7 ${dotsH} px @ 203 DPI)`;
    }
    const obj = selectedObject as any;
    if (obj.isBarcode) {
      const typeStr = typeof obj.barcodeType === 'string' ? obj.barcodeType : 'code128';
      const valStr = typeof obj.barcodeValue === 'string' ? obj.barcodeValue : '';
      return `${t("BARCODE")}: ${typeStr.toUpperCase()}  [${valStr}]`;
    }
    if (obj.dataField) return `${t("LINKED FIELD")}: ${fieldLabel(obj.dataField)}`;
    const objectType = typeof obj.type === 'string' ? obj.type : 'element';
    if (objectType === 'i-text' || objectType === 'text') return `${t("TEXT")}: "${(typeof obj.text === 'string' ? obj.text : '').slice(0, 20)}"`;
    return `${t("TARGET")}: ${objectType.toUpperCase()}`;
  };

  return (
    <footer
      data-testid="container-status-bar"
      className="h-[24px] bg-surface-container-lowest border-t border-outline-variant px-3 flex items-center justify-between font-mono text-[10px] text-on-surface-variant select-none shrink-0 z-[var(--ui-layer-chrome)]"
    >
      {/* Left: Cursor position + target summary */}
      <div data-testid="statusbar-left-section" className="flex items-center gap-3 overflow-hidden">
        <div data-testid="statusbar-cursor-pos" className="flex items-center gap-1.5 shrink-0">
          <span className="material-symbols-outlined text-secondary shrink-0" style={{ fontSize: "var(--ui-icon-11)" }}>my_location</span>
          <span>{t("X:")}</span>
          <strong data-testid="statusbar-val-x" className="text-on-surface tabular-nums">{cursorPos.xMm}</strong>
          <span className="text-outline px-0.5">|</span>
          <span>{t("Y:")}</span>
          <strong data-testid="statusbar-val-y" className="text-on-surface tabular-nums">{cursorPos.yMm}</strong>
          <span className="text-outline">{t("mm")}</span>
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
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping shrink-0"  data-ui-motion="true" />
            <span>{t("Rendering 1-Bit Printhead Stream…")}</span>
          </span>
        ) : (
          <span data-testid="statusbar-engine-ready" className="flex items-center gap-1.5 text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
            <span>{t("Thermal Engine Ready — 203.2 DPI / 8 dpmm")}</span>
          </span>
        )}
      </div>

      {/* Right: Zoom controls */}
      <div data-testid="statusbar-zoom-controls" className="flex items-center gap-1 shrink-0">
        <IconButton
          data-testid="statusbar-btn-zoom-out"
          onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))}
          label={t("Zoom Out (-)")}
          variant="compact"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-12)" }}>remove</span>
        </IconButton>

        <Button
          data-testid="statusbar-btn-zoom-reset"
          onClick={triggerReset100}
          className="tabular-nums"
          title={t("Reset Zoom to 100%")}
          aria-label={t("Reset Zoom to 100%")}
         variant="compact">
          {Math.round(zoom * 100)}%
        </Button>

        <IconButton
          data-testid="statusbar-btn-zoom-in"
          onClick={() => setZoom((z) => Math.min(3.0, Math.round((z + 0.1) * 10) / 10))}
          label={t("Zoom In (+)")}
          variant="compact"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-12)" }}>add</span>
        </IconButton>

        <IconButton
          data-testid="statusbar-btn-zoom-fit"
          onClick={triggerFit}
          label={t("Fit Label to Viewport (F)")}
          variant="compact" className="ml-1"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-12)" }}>fit_screen</span>
        </IconButton>
      </div>
    </footer>
  );
}

export default StatusBar;
