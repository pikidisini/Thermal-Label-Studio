import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { RibbonDivider } from './RibbonDivider';
import { IconButton } from '../../../shared/ui';

interface GeometryFormatControlsProps {
  selectedObject: any;
  pxPerMm: number;
  onUpdateProperty: (prop: string, val: any) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ActionBtn({
  icon, title, onClick, testId, danger,
}: { icon: string; title: string; onClick: () => void; testId: string; danger?: boolean }) {
  useTranslation();
  return (
    <IconButton
      data-testid={testId}
      onClick={onClick}
      label={title}

     tone={danger ? 'danger' : 'neutral'}>
      <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-15)" }}>{icon}</span>
    </IconButton>
  );
}

export function GeometryFormatControls({
  selectedObject,
  pxPerMm,
  onUpdateProperty,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
}: GeometryFormatControlsProps) {
  useTranslation();
  const currentStrokeMm = Number(((selectedObject.strokeWidth || 0) / pxPerMm).toFixed(1));

  const handleIncrementStroke = () => {
    onUpdateProperty('strokeWidthMm', Math.min(20, Number((currentStrokeMm + 0.1).toFixed(1))));
  };

  const handleDecrementStroke = () => {
    onUpdateProperty('strokeWidthMm', Math.max(0, Number((currentStrokeMm - 0.1).toFixed(1))));
  };

  return (
    <div data-testid="container-geometry-format-controls" className="flex items-center gap-1.5 pl-2">
      <RibbonDivider />

      {/* Stroke width with themed CAD stepper */}
      <div data-testid="container-ribbon-stroke-width" className="flex items-center gap-1">
        <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-mono">{t("Stroke")}</span>
        <div data-ui-control-group="compact" className="flex items-stretch border border-outline-variant bg-surface-container focus-within:border-primary-container h-[var(--ui-height-compact)]">
          <input
            data-testid="ribbon-input-stroke-width-mm"
            type="number"
            min="0"
            max="20"
            step="0.1"
            value={currentStrokeMm}
            onChange={(e) => onUpdateProperty('strokeWidthMm', e.target.value)}
            className="w-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
           data-ui-control="input" data-variant="compact" />
          <div className="flex flex-col border-l border-outline-variant w-3.5 divide-y divide-outline-variant bg-surface-container-high/40">
            <button
              type="button"
              onClick={handleIncrementStroke}
              title={t("Increase Stroke (+0.1mm)")}
              className="flex-1 flex items-center justify-center"
             data-ui-control="button" data-variant="stepper">
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 0L6 4H0L3 0Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDecrementStroke}
              title={t("Decrease Stroke (-0.1mm)")}
              className="flex-1 flex items-center justify-center"
             data-ui-control="button" data-variant="stepper">
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 4L0 0H6L3 4Z" />
              </svg>
            </button>
          </div>
        </div>
        <span className="text-[9px] text-on-surface-variant font-mono">{t("mm")}</span>
      </div>

      <RibbonDivider />

      {/* Z-order + object actions */}
      <div data-testid="container-ribbon-zorder-actions" className="flex items-center gap-0.5">
        <ActionBtn icon="flip_to_front" title={t("Bring Forward")} testId="ribbon-btn-bring-forward" onClick={onBringForward} />
        <ActionBtn icon="flip_to_back"  title={t("Send Backward")} testId="ribbon-btn-send-backward" onClick={onSendBackward} />
        <ActionBtn icon="content_copy"  title={t("Duplicate")}     testId="ribbon-btn-duplicate"     onClick={onDuplicate} />
      </div>

      <RibbonDivider />

      <ActionBtn icon="delete" title={t("Delete Element")} testId="ribbon-btn-delete" onClick={onDelete} danger />
    </div>
  );
}
