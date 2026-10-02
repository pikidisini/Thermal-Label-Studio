import React from 'react';
import { PropField } from './PropField';
import { getSAPTypeLabel } from '../../../types/sap-contract';
import { LineInspector } from '../../../features/line';
import { Badge, Button } from '../../../shared/ui';

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
  const initialToken = (selectedObject?.dataField || selectedObject?.dataBarcode || selectedObject?.dataQr) as string | undefined;
  const [tokenDraft, setTokenDraft] = React.useState(initialToken || '');
  React.useEffect(() => setTokenDraft(initialToken || ''), [initialToken]);
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

  const sapField       = initialToken;
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

      {selectedObject.type === 'line' && <LineInspector selectedObject={selectedObject} pxPerMm={pxPerMm} onUpdateProperty={onUpdateProperty} />}

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
            <textarea
              data-testid="inspector-input-barcode-payload"
              value={typeof selectedObject.payloadTemplate === 'string' ? selectedObject.payloadTemplate : (selectedObject.barcodeValue || '')}
              onChange={(e) => onUpdateProperty('payloadTemplate', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && selectedObject.barcodeType !== 'qrcode') e.preventDefault(); }}
              rows={selectedObject.barcodeType === 'qrcode' ? 4 : 2}
              className="w-full bg-surface-container border border-outline-variant px-2 py-1.5 text-[11px] text-on-surface font-mono focus:outline-none focus:border-primary"
            />
            {selectedObject.barcodeType === 'qrcode' ? (
              <p className="text-[9px] leading-relaxed text-on-surface-variant">Example: <code>batch : &#123;&#123;batch_number&#125;&#125;{`\n`}roll : &#123;&#123;roll_no&#125;&#125;</code>. Enter adds a new line.</p>
            ) : (
              <p className="text-[9px] leading-relaxed text-on-surface-variant">Token composition uses Code 128 and one line, for example: <code>BATCH-&#123;&#123;batch_number&#125;&#125;-&#123;&#123;roll_no&#125;&#125;</code>.</p>
            )}
          </div>
        </div>
      )}

      {/* Dynamic binding */}
      {(sapField || selectedObject.type === 'i-text' || selectedObject.isBarcode) && (
        <div data-testid="container-inspector-sap-binding" className="space-y-1 border-t border-outline-variant pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 13 }}>link</span>
            <span className="font-semibold text-tertiary text-[11px]">Dynamic Binding</span>
            {sapTypeLabel && (
              <Badge data-testid="inspector-sap-type-badge" tone="success" className="ml-auto px-1 font-mono text-[9px]">
                {sapTypeLabel}
              </Badge>
            )}
          </div>
            <div data-testid="inspector-sap-binding-card" className="bg-surface-container-lowest border border-tertiary/25 p-2 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Token</span>
              <input data-testid="inspector-sap-token-name" aria-label="Token placeholder" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (/^[A-Za-z0-9_-]+$/.test(tokenDraft.trim())) onUpdateProperty(selectedObject.isBarcode ? (selectedObject.barcodeType === 'qrcode' ? 'dataQr' : 'dataBarcode') : 'dataField', tokenDraft.trim()); } }} className="min-w-0 flex-1 bg-surface-container border border-outline-variant px-1 text-[11px] text-tertiary font-mono" />
              <Button onClick={() => { if (/^[A-Za-z0-9_-]+$/.test(tokenDraft.trim())) onUpdateProperty(selectedObject.isBarcode ? (selectedObject.barcodeType === 'qrcode' ? 'dataQr' : 'dataBarcode') : 'dataField', tokenDraft.trim()); }} tone="success" className="border-tertiary px-1 text-[9px] text-tertiary">Apply</Button>
            </div>
            {sapSampleValue != null && (
              <div data-testid="inspector-sap-sample-val" className="font-mono text-[10px] text-on-surface-variant truncate">
                Val: <span className="text-on-surface">{String(sapSampleValue)}</span>
              </div>
            )}
            <label className="block text-[9px] text-on-surface-variant uppercase tracking-widest">Element preview value</label>
            <input data-testid="inspector-input-token-value" aria-label="Token preview value" value={selectedObject.text || selectedObject.barcodeValue || ''} onChange={(e) => onUpdateProperty(selectedObject.isBarcode ? 'barcodeValue' : 'text', e.target.value)} className="w-full bg-surface-container border border-outline-variant px-1.5 py-1 text-[10px] text-on-surface font-mono" />
            {selectedObject.validationError && <div role="alert" className="text-[10px] text-secondary">{selectedObject.validationError}</div>}
            {selectedObject.previewOverride && sapField && <Button onClick={() => onUpdateProperty('previewOverride', false)} className="border-outline-variant px-2 py-1 text-[9px] text-on-surface-variant hover:bg-surface-container-high">Reset preview value</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
