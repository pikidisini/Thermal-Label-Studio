import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { TextFormatControls } from './ribbon/TextFormatControls';
import { BarcodePropertyControls } from './ribbon/BarcodePropertyControls';
import { GeometryFormatControls } from './ribbon/GeometryFormatControls';
import { CoordinateBadge } from './ribbon/CoordinateBadge';
import { RibbonDivider } from './ribbon/RibbonDivider';

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
  const { isSnapEnabled, toggleSnap } = useStudioStore();
  return (
    <button
      data-testid="ribbon-toggle-snap"
      onClick={toggleSnap}
      title="Toggle Grid Snapping (S)"
      aria-label="Toggle Grid Snapping"
      className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors ${
        isSnapEnabled
          ? 'bg-primary/15 text-primary border border-primary/30'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>grid_on</span>
      <span>Snap</span>
    </button>
  );
}

function GuidesToggle() {
  const { areGuidesEnabled, toggleGuides } = useStudioStore();
  return (
    <button
      data-testid="ribbon-toggle-guides"
      onClick={toggleGuides}
      title="Toggle Smart Guides (G)"
      aria-label="Toggle Smart Guides"
      className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors ${
        areGuidesEnabled
          ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>straighten</span>
      <span>Guides</span>
    </button>
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
  const objType = selectedObject?.type ?? null;

  return (
    <div
      data-testid="container-property-ribbon"
      className="h-9 bg-surface-container-low border-b border-outline-variant px-3 flex items-center justify-between text-xs select-none z-10"
    >
      {/* Left: type chip + property controls */}
      <div data-testid="container-ribbon-left-section" className="flex items-center gap-0">
        {/* Object type chip */}
        <div data-testid="ribbon-object-type-chip" className="flex items-center gap-1 text-on-surface-variant font-medium mr-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>
            {objType === 'text' || objType === 'i-text' ? 'title'
              : objType === 'image' ? 'image'
              : objType === 'rect' ? 'crop_square'
              : objType === 'circle' ? 'circle'
              : objType === 'line' ? 'horizontal_rule'
              : 'near_me'}
          </span>
          <span data-testid="ribbon-object-type-text" className="text-[11px]">
            {objType ? (objType === 'i-text' ? 'Text' : objType) : 'No Selection'}
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
      <div data-testid="container-ribbon-right-section" className="flex items-center gap-2">
        <CoordinateBadge canvas={canvas} />
        <RibbonDivider />
        <SnapToggle />
        <GuidesToggle />
      </div>
    </div>
  );
}
