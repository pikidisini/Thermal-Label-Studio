import { translate as t, useTranslation } from "../../shared/i18n";
﻿import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { TextFormatControls } from '../../features/text';
import { BarcodePropertyControls } from '../../features/barcode';
import { GeometryFormatControls } from './ribbon/GeometryFormatControls';
import { CoordinateBadge } from './ribbon/CoordinateBadge';
import { RibbonDivider } from './ribbon/RibbonDivider';
import { Toggle } from '../../shared/ui';

interface PropertyRibbonProps {
  selectedObject: any;
  onUpdateProperty: (prop: string, val: any) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  pxPerMm?: number;
  canvas?: any | null;
}

function SnapToggle() {
  useTranslation();
  const { isSnapEnabled, toggleSnap } = useStudioStore();
  return (
    <Toggle
      data-testid="ribbon-toggle-snap"
      selected={isSnapEnabled}
      onClick={toggleSnap}
      title={t("Toggle Grid Snapping (S)")}
      aria-label={t("Toggle Grid Snapping")}
      className="flex items-center gap-1">
      <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-13)" }}>grid_on</span>
      <span>{t("Snap")}</span>
    </Toggle>
  );
}

function GuidesToggle() {
  useTranslation();
  const { areGuidesEnabled, toggleGuides } = useStudioStore();
  return (
    <Toggle
      data-testid="ribbon-toggle-guides"
      selected={areGuidesEnabled} tone="success"
      onClick={toggleGuides}
      title={t("Toggle Smart Guides (G)")}
      aria-label={t("Toggle Smart Guides")}
      className="flex items-center gap-1">
      <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-13)" }}>straighten</span>
      <span>{t("Guides")}</span>
    </Toggle>
  );
}

export function PropertyRibbon({
  selectedObject,
  onUpdateProperty,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
  pxPerMm = 4,
  canvas = null,
}: PropertyRibbonProps) {
  useTranslation();
  const objType = selectedObject?.type ?? null;

  return (
    <div
      data-testid="container-property-ribbon"
      className="relative z-[var(--ui-layer-chrome)] h-9 bg-surface-container-low border-b border-outline-variant px-3 flex items-center justify-between text-xs select-none"
    >
      {/* Left: type chip + property controls */}
      <div data-testid="container-ribbon-left-section" className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
        {/* Object type chip */}
        <div data-testid="ribbon-object-type-chip" className="flex items-center gap-1 text-on-surface-variant font-medium mr-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "var(--ui-icon-14)" }}>
            {objType === 'text' || objType === 'i-text' ? "title"
              : objType === 'image' ? "image"
              : objType === 'rect' ? "crop_square"
              : objType === 'circle' ? "circle"
              : objType === 'line' ? "horizontal_rule"
              : "near_me"}
          </span>
          <span data-testid="ribbon-object-type-text" className="text-[11px]">
            {objType ? (objType === 'i-text' ? t("Text") : objType) : t("No Selection")}
          </span>
        </div>

        {selectedObject && (
          <>
            <TextFormatControls
              selectedObject={selectedObject}
              pxPerMm={pxPerMm}
              onUpdateProperty={onUpdateProperty}
            />
            <BarcodePropertyControls
              selectedObject={selectedObject}
              onUpdateProperty={onUpdateProperty}
            />
            <GeometryFormatControls
              selectedObject={selectedObject}
              pxPerMm={pxPerMm}
              onUpdateProperty={onUpdateProperty}
              onBringForward={onBringForward}
              onSendBackward={onSendBackward}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </>
        )}
      </div>

      {/* Right: coordinate badge + view toggles */}
      <div data-testid="container-ribbon-right-section" className="flex shrink-0 items-center gap-2">
        <CoordinateBadge canvas={canvas} />
        <RibbonDivider />
        <SnapToggle />
        <GuidesToggle />
      </div>
    </div>
  );
}
