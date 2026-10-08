import { translate as t, useTranslation } from "../../../shared/i18n";
import { useFieldLabel } from '../../../features/data-tokens';
import { translate as translateLabel } from "../../../shared/i18n";
import React from 'react';
import { PropField } from './PropField';
import { getSAPTypeLabel } from '../../../types/sap-contract';
import { LineInspector } from '../../../features/line';
import { Badge, Button } from '../../../shared/ui';
import { getFieldStatus } from '../../../features/data-tokens';
import { FieldComposer } from '../../../features/data-tokens/ui/FieldComposer';
import { compositionFields } from '../../../features/data-tokens/model/composition';

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
  useTranslation();
  const fieldLabel = useFieldLabel();
  const initialToken = (selectedObject?.dataField || selectedObject?.dataBarcode || selectedObject?.dataQr) as string | undefined;
  const [tokenDraft, setTokenDraft] = React.useState(initialToken || '');
  React.useEffect(() => setTokenDraft(initialToken || ''), [initialToken]);
  if (!selectedObject) {
    return (
      <div data-testid="container-inspector-empty-state" className="p-6 flex flex-col items-center gap-2 text-center">
        <span className="material-symbols-outlined text-outline" style={{ fontSize: "var(--ui-icon-32)" }}>touch_app</span>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">{t("Select an element on canvas to inspect its properties.")} </p>
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
  const sapSampleValue = sapField ? jsonData[sapField] : undefined;

  return (
    <div data-testid="container-object-property-form" className="p-3 space-y-4 text-xs">
      {/* Section header */}
      <div data-testid="inspector-props-header" className="flex items-center gap-1.5 pb-1 border-b border-outline-variant">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "var(--ui-icon-14)" }}>tune</span>
        <span className="font-semibold text-on-surface text-[11px]">{t("Transform Inspector")}</span>
      </div>

      {/* Position + Size grid */}
      <div data-testid="container-inspector-props-grid" className="grid grid-cols-2 gap-2">
        <PropField badge="X" label={t("Position X (mm)")} value={leftMm} testId="inspector-x" step={0.5}
          onChange={(v) => onUpdateProperty('leftMm', v)} />
        <PropField badge="Y" label={t("Position Y (mm)")} value={topMm} testId="inspector-y" step={0.5}
          onChange={(v) => onUpdateProperty('topMm', v)} />
        <PropField badge="W" label={t("Width (mm)")}  value={widthMm}  testId="inspector-w" readOnly />
        <PropField badge="H" label={t("Height (mm)")} value={heightMm} testId="inspector-h" readOnly />
        <PropField badge="∠" label={t("Rotation (°)")} value={angle} testId="inspector-rotation" step={1}
          onChange={(v) => onUpdateProperty('angle', Number(v))} />
        <PropField badge="S" label={t("Stroke (mm)")} value={strokeMm} testId="inspector-stroke" step={0.1}
          onChange={(v) => onUpdateProperty('strokeWidthMm', v)} />
      </div>

      {selectedObject.type === 'line' && <LineInspector selectedObject={selectedObject} pxPerMm={pxPerMm} onUpdateProperty={onUpdateProperty} />}

      {/* Barcode config */}
      {selectedObject.isBarcode && (
        <div data-testid="container-inspector-barcode-config" className="space-y-2 border-t border-outline-variant pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: "var(--ui-icon-13)" }}>barcode</span>
            <span className="font-semibold text-on-surface text-[11px]">{t("Barcode Config")}</span>
          </div>
          <div>
            <label data-ui-label="true" className="block text-[9px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1">{t("Standard")}</label>
            <select
              data-testid="inspector-select-barcode-type"
              value={selectedObject.barcodeType || 'code128'}
              onChange={(e) => onUpdateProperty('barcodeType', e.target.value)}
              className="w-full"
             data-ui-control="select" data-variant="default">
              {BARCODE_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-surface-container">{translateLabel(t.label)}</option>)}
            </select>
          </div>
          <FieldComposer template={selectedObject.payloadTemplate ?? (initialToken ? `{{${initialToken}}}` : (selectedObject.barcodeValue || ''))} fields={Object.keys(jsonData)} onChange={(value) => onUpdateProperty('payloadTemplate', value)} />
          <details className="text-[10px] text-on-surface-variant">
            <summary>{t("Technical expression")}</summary>
            <textarea data-testid="inspector-input-barcode-payload" aria-label={t("Technical expression")} value={selectedObject.payloadTemplate ?? (initialToken ? `{{${initialToken}}}` : (selectedObject.barcodeValue || ''))} onChange={(e) => onUpdateProperty('payloadTemplate', e.target.value)} rows={2} className="w-full"  data-ui-control="textarea" data-variant="default" />
          </details>
        </div>
      )}

      {!selectedObject.isBarcode && ['text', 'i-text', 'textbox'].includes(selectedObject.type) && <div className="border-t border-outline-variant pt-3 space-y-2">
        <div className="font-semibold">{t("Text content")}</div>
        {typeof selectedObject.payloadTemplate === 'string' ? <>
          <FieldComposer template={selectedObject.payloadTemplate} fields={Object.keys(jsonData)} onChange={(value) => onUpdateProperty('payloadTemplate', value)} />
          <div className="text-[10px] text-on-surface-variant">{t("Linked fields:")} {compositionFields(selectedObject.payloadTemplate).map(fieldLabel).join(', ') || t('None')}</div>
        </> : <Button onClick={() => onUpdateProperty('payloadTemplate', sapField ? `{{${sapField}}}` : String(selectedObject.text || ''))} variant="default">{t("Build with fields and text")}</Button>}
      </div>}

      {/* Dynamic binding */}
      {(sapField || ['i-text', 'text', 'textbox'].includes(selectedObject.type) || selectedObject.isBarcode) && (
        <div data-testid="container-inspector-sap-binding" className="space-y-1 border-t border-outline-variant pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: "var(--ui-icon-13)" }}>link</span>
            <span className="font-semibold text-tertiary text-[11px]">{t("Data Source")}</span>
            {sapTypeLabel && (
              <Badge data-testid="inspector-sap-type-badge" tone="success" className="ml-auto">
                {sapTypeLabel}
              </Badge>
            )}
          </div>
            <div data-testid="inspector-sap-binding-card" className="bg-surface-container-lowest border border-tertiary/25 p-2 space-y-1">
            <label data-ui-label="true" className="block text-[10px] text-on-surface-variant" htmlFor="inspector-data-source">{typeof selectedObject.payloadTemplate === 'string' ? t("Replace content with one field") : t("Linked field")}</label>
            <div className="flex gap-1">
              <select id="inspector-data-source" data-testid="inspector-field-select" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} className="min-w-0 flex-1" data-ui-control="select" data-variant="default">
                <option value="">{t("Choose a field")}</option>
                {Array.from(new Set([...Object.keys(jsonData), ...(sapField ? [sapField] : [])])).filter((key) => /^[A-Za-z0-9_-]+$/.test(key)).sort().map((key) => <option key={key} value={key}>{fieldLabel(key)}</option>)}
              </select>
              <Button disabled={!tokenDraft} onClick={() => onUpdateProperty(selectedObject.isBarcode ? (selectedObject.barcodeType === 'qrcode' ? "dataQr" : "dataBarcode") : "dataField", tokenDraft)} tone="success"  variant="default">{t("Link")}</Button>
            </div>
            {sapField && <div data-testid="inspector-field-status" className="text-[10px] text-on-surface-variant">{fieldLabel(sapField)} · {getFieldStatus(sapSampleValue)}</div>}
            {sapSampleValue != null && <div data-testid="inspector-sap-sample-val" className="text-[10px] text-on-surface truncate">{t("Value:")} {String(sapSampleValue)}</div>}
            <details className="text-[10px] text-on-surface-variant">
              <summary>{t("Technical field")}</summary>
              <input data-testid="inspector-sap-token-name" aria-label={t("Technical field key")} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && /^[A-Za-z0-9_-]+$/.test(tokenDraft.trim())) onUpdateProperty(selectedObject.isBarcode ? (selectedObject.barcodeType === 'qrcode' ? "dataQr" : "dataBarcode") : "dataField", tokenDraft.trim()); }} className="w-full"  data-ui-control="input" data-variant="default" />
              <Button disabled={!/^[A-Za-z0-9_-]+$/.test(tokenDraft.trim())} onClick={() => onUpdateProperty(selectedObject.isBarcode ? (selectedObject.barcodeType === 'qrcode' ? "dataQr" : "dataBarcode") : "dataField", tokenDraft.trim())} variant="default">{t("Apply field")}</Button>
            </details>
            <label data-ui-label="true" className="block text-[9px] text-on-surface-variant uppercase tracking-widest">{t("Local preview override")}</label>
            <input data-testid="inspector-input-token-value" aria-label={t("Token preview value")} value={selectedObject.text || selectedObject.barcodeValue || ''} onChange={(e) => onUpdateProperty(selectedObject.isBarcode ? "barcodeValue" : "text", e.target.value)} className="w-full"  data-ui-control="input" data-variant="default" />
            {selectedObject.validationError && <div role="alert" className="text-[10px] text-secondary">{t(selectedObject.validationError)}</div>}
            {selectedObject.previewOverride && (sapField || typeof selectedObject.payloadTemplate === 'string') && <Button onClick={() => onUpdateProperty('previewOverride', false)}  variant="default">{t("Reset preview value")}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
