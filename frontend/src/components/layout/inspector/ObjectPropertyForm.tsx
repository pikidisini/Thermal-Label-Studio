import React from 'react';
import { PropField } from './PropField';
import { getSAPTypeLabel } from '../../../types/sap-contract';

interface ObjectPropertyFormProps {
  selectedObject: any;
  pxPerMm: number;
  jsonData: Record<string, any>;
  onUpdateProperty: (prop: string, val: any) => void;
}

const BARCODE_TYPES = [
  { value: 'code128', label: 'Code 128 (Alpha-Numeric)' },
  { value: 'ean13',   label: 'EAN-13 (Standard Retail)'  },
  { value: 'code39',  label: 'Code 39 (Industrial)'      },
  { value: 'qrcode',  label: 'QR Code 2D'               },
];

export function ObjectPropertyForm({ selectedObject, pxPerMm, jsonData, onUpdateProperty }: ObjectPropertyFormProps) {
  if (!selectedObject) {
    return (
      <div data-testid="container-inspector-empty-state" className="p-6 flex flex-col items-center gap-2 text-center">
        <span className="material-symbols-outlined text-outline" style={{ fontSize: 32 }}>touch_app</span>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          Select an element on canvas to inspect its properties.
        </p>
      </div>
    );
  }

  const leftMm   = ((selectedObject.left  || 0) / pxPerMm).toFixed(1);
  const topMm    = ((selectedObject.top   || 0) / pxPerMm).toFixed(1);
  const widthMm  = (((selectedObject.width  || 0) * (selectedObject.scaleX || 1)) / pxPerMm).toFixed(1);
  const heightMm = (((selectedObject.height || 0) * (selectedObject.scaleY || 1)) / pxPerMm).toFixed(1);
  const angle    = Math.round(selectedObject.angle || 0);
  const strokeMm = ((selectedObject.strokeWidth || 0) / pxPerMm).toFixed(1);

  const sapField       = selectedObject.dataField as string | undefined;
  const sapTypeLabel   = sapField ? getSAPTypeLabel(sapField) : '';
  const sapSampleValue = sapField ? jsonData[sapField] : null;

  return (
    <div data-testid="container-object-property-form" className="p-3 space-y-4 text-xs">
      {/* Section header */}
      <div data-testid="inspector-props-header" className="flex items-center gap-1.5 pb-1 border-b border-outline-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>tune</span>
        <span className="font-semibold text-on-surface text-[11px]">Transform Inspector</span>
      </div>

      {/* Position + Size grid */}
      <div data-testid="container-inspector-props-grid" className="grid grid-cols-2 gap-2">
        <PropField badge="X" label="Position X (mm)" value={leftMm} testId="inspector-x" step={0.5}
          onChange={(v) => onUpdateProperty('leftMm', v)} />
        <PropField badge="Y" label="Position Y (mm)" value={topMm} testId="inspector-y" step={0.5}
          onChange={(v) => onUpdateProperty('topMm', v)} />
        <PropField badge="W" label="Width (mm)"  value={widthMm}  testId="inspector-w" readOnly />
        <PropField badge="H" label="Height (mm)" value={heightMm} testId="inspector-h" readOnly />
        <PropField badge="∠" label="Rotation (°)" value={angle} testId="inspector-rotation" step={1}
          onChange={(v) => onUpdateProperty('angle', Number(v))} />
        <PropField badge="S" label="Stroke (mm)" value={strokeMm} testId="inspector-stroke" step={0.1}
          onChange={(v) => onUpdateProperty('strokeWidthMm', v)} />
      </div>

      {/* Barcode config */}
      {selectedObject.isBarcode && (
        <div data-testid="container-inspector-barcode-config" className="space-y-2 border-t border-outline-variant pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: 13 }}>barcode</span>
            <span className="font-semibold text-on-surface text-[11px]">Barcode Config</span>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1">Standard</label>
            <select
              data-testid="inspector-select-barcode-type"
              value={selectedObject.barcodeType || 'code128'}
              onChange={(e) => onUpdateProperty('barcodeType', e.target.value)}
              className="w-full bg-surface-container border border-outline-variant px-2 py-1.5 text-[11px] text-on-surface font-mono focus:outline-none focus:border-primary"
            >
              {BARCODE_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-surface-container">{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1">Value Payload</label>
            <input
              data-testid="inspector-input-barcode-payload"
              type="text"
              value={selectedObject.barcodeValue || ''}
              onChange={(e) => onUpdateProperty('barcodeValue', e.target.value)}
              className="w-full bg-surface-container border border-outline-variant px-2 py-1.5 text-[11px] text-on-surface font-mono focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* SAP dynamic binding */}
      {sapField && (
        <div data-testid="container-inspector-sap-binding" className="space-y-1 border-t border-outline-variant pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 13 }}>link</span>
            <span className="font-semibold text-tertiary text-[11px]">SAP Dynamic Binding</span>
            {sapTypeLabel && (
              <span data-testid="inspector-sap-type-badge" className="ml-auto font-mono text-[9px] px-1 py-0.5 bg-tertiary/10 text-tertiary border border-tertiary/30">
                {sapTypeLabel}
              </span>
            )}
          </div>
          <div data-testid="inspector-sap-binding-card" className="bg-surface-container-lowest border border-tertiary/25 p-2 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Token</span>
              <span data-testid="inspector-sap-token-name" className="font-mono text-[11px] text-tertiary font-bold ml-1">{`{{${sapField}}}`}</span>
            </div>
            {sapSampleValue != null && (
              <div data-testid="inspector-sap-sample-val" className="font-mono text-[10px] text-on-surface-variant truncate">
                Val: <span className="text-on-surface">{String(sapSampleValue)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
