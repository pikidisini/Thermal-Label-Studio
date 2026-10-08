import { translate as t, useTranslation } from "../../shared/i18n";
import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { StandardPresetsGrid } from './canvas-setup/StandardPresetsGrid';
import { CustomDimensionForm } from './canvas-setup/CustomDimensionForm';
import { MatrixGeometryHud } from './canvas-setup/MatrixGeometryHud';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Field, IconButton } from '../../shared/ui';

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
  useTranslation();
  const [widthMm, setWidthMm] = useState(currentWidthMm);
  const [heightMm, setHeightMm] = useState(currentHeightMm);
  const [templateName, setTemplateName] = useState('Untitled-Label-01');

  const { dpi: currentDpi, setDpi: applyDpi } = useSimulationStore();
  const [dpi, setDpi] = useState(currentDpi);
  const { templateTitle, setTemplateTitle } = useTemplateStore();

  useEffect(() => {
    if (!isOpen) return;
    setTemplateName(mode === 'new' ? 'Untitled Label' : templateTitle || 'Untitled Label');
    setDpi(currentDpi);
    setWidthMm(currentWidthMm);
    setHeightMm(currentHeightMm);
  }, [currentWidthMm, currentHeightMm, isOpen, mode, templateTitle, currentDpi]);

  if (!isOpen) return null;

  const validProperties = templateName.trim().length> 0 && templateName.trim().length <= 160
    && Number.isFinite(widthMm) && widthMm>= 10 && widthMm <= 500
    && Number.isFinite(heightMm) && heightMm>= 10 && heightMm <= 500;

  const handleApply = () => {
    if (!validProperties) return;
    setTemplateTitle(templateName.trim());
    applyDpi(dpi);
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


  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center backdrop-blur-sm p-4" data-ui-backdrop="true">
      {/* MODAL CONTAINER - 0px border radius, Stitch CAD layout */}
      <Dialog
        data-testid="canvas-setup-modal"
        className="w-[820px] max-w-full flex flex-col animate-in fade-in zoom-in-95"
       data-ui-motion="true">
        {/* 1. HEADER */}
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-secondary flex items-center justify-center text-background">
              <span className="material-symbols-outlined text-[18px]">
                {mode === 'new' ? "new_label" : "aspect_ratio"}
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-sm text-on-surface">
                {mode === 'new' ? t("New Blank Label Template") : t("Template Properties")}
              </h2>
              <p className="text-[11px] text-outline">{t("Configure physical dimensions and printhead dot geometry for the canvas")} </p>
            </div>
          </div>
          <IconButton
            onClick={onClose}
            label={t("Close dialog")}

          >
            <X size={18} />
          </IconButton>
        </DialogHeader>

        {/* MODAL BODY - TWO COLUMNS */}
        <div className="flex flex-col md:flex-row flex-1 min-h-[420px]">
          {/* LEFT COLUMN: CONFIGURATION */}
          <div className="flex-1 p-4 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-outline-variant overflow-y-auto">
            {/* Template Name */}
            <Field label={t("Template Name")} className="flex flex-col gap-1">
              <input
                type="text"
                data-testid="input-template-name"
                maxLength={160}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("Untitled-Label-01")}
                className="h-[28px] w-full placeholder-on-surface-variant"
               data-ui-control="input" data-variant="default" />
            </Field>

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
              <label data-ui-label="true" className="text-[10px] font-semibold text-outline uppercase tracking-wider">{t("Printhead Resolution (DPI)")} </label>
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
                      className={`flex-1 flex items-center justify-center`}
                     data-ui-control="button" data-variant="default">
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
            aspectRatio={widthMm / heightMm}
          />
        </div>

        {/* 7. FOOTER */}
        <DialogFooter className="h-[48px] flex items-center justify-end gap-2">
          <Button
            type="button"
            onClick={onClose}
            className="h-[28px] flex items-center justify-center"
           variant="default">{t("Cancel")} </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={!validProperties}
            data-testid="btn-apply-dimensions"
            tone="success" className="h-[28px] text-background flex items-center justify-center gap-1"
           variant="default">
            <Check size={14} />
            <span>{mode === 'new' ? t("Create Template") : t("Apply Properties")}</span>
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

export default CanvasSetupModal;
