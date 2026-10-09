import { Icon } from "../../../shared/ui";
import { translate as t, useTranslation } from "../../../shared/i18n";
import { useFieldLabel } from '../model/useFieldLabel';
import React from 'react';
import { SAP_FIELD_REGISTRY, getSAPTypeLabel } from '../../../types/sap-contract';
import type { FlatSapTokenMap, RawSapContract } from '../model/sapContractAdapter';
import { getFieldStatus } from '../model/fieldPresentation';

interface SapTokenSectionProps {
  sampleContracts: Record<string, RawSapContract>;
  activeContractKey: string;
  onSelectContract: (key: string) => void;
  jsonData: FlatSapTokenMap;
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
  onUpdateToken?: (token: string, value: string) => void;
  readOnly?: boolean;
  onAddCustomToken?: (token: string, value: string) => void;
  usedTokens?: Set<string>;
  localImport?: { format: 'v1.1' | 'raw-v2' | 'data'; fileName: string; itemSequence: number; itemCount: number } | null;
  onLocalJsonImport?: (file: File) => Promise<void>;
  savedDatasets?: { id: string; name: string }[];
  selectedDatasetId?: string;
  onSelectSavedDataset?: (id: string) => Promise<void>;
  onReloadDatasets?: () => Promise<void>;
  datasetStatus?: string;
  onSelectLocalItem?: (sequence: number) => void;
  localItemSequences?: number[];
  localImportError?: string | null;
  localImportWarning?: string | null;
  onEnterPreview?: () => void;
  tokenCategories?: Record<string, 'customer' | 'characteristic'>;
  customTokens?: Set<string>;
  onMarkCustomToken?: (key: string) => void;
}

interface TokenCardProps {
  fieldKey: string;
  value: string;
  isUsed: boolean;
  status: string;
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
}

type TokenProfile = 'standard' | 'customer' | 'characteristic' | 'custom';

function TokenCard({ fieldKey, value, isUsed, onAddSapToken, onUpdateToken, status, readOnly }: TokenCardProps & { onUpdateToken?: (token: string, value: string) => void; readOnly?: boolean }) {
  useTranslation();
  const fieldLabel = useFieldLabel();
  const typeLabel = getSAPTypeLabel(fieldKey);
  const meta = SAP_FIELD_REGISTRY[fieldKey];
  const label = fieldLabel(fieldKey);

  const handleDrag = (e: React.DragEvent, asType: 'text' | 'barcode' | 'qr') => {
    if (!/^[a-zA-Z0-9_-]+$/.test(fieldKey)) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'sap-token', token: fieldKey, asType }));
  };
  const canPreviewToken = /^[a-zA-Z0-9_-]+$/.test(fieldKey);

  return (
    <div
      data-testid={`sap-token-card-${fieldKey}`}
      className={`border-b border-outline-variant last:border-0 ${isUsed ? 'bg-tertiary/5' : ''}`}
    >
      {/* Field name row */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span data-testid={`sap-token-label-${fieldKey}`} className="font-mono text-[11px] font-bold text-tertiary truncate">
            {label}
          </span>
          {isUsed && (
            <span data-testid={`sap-token-bound-badge-${fieldKey}`} className="text-[8px] px-1 py-0.5 bg-tertiary/20 text-tertiary font-semibold shrink-0">{t("LINKED")} </span>
          )}
        </div>
        {typeLabel && (
          <span data-testid={`sap-token-type-${fieldKey}`} className="font-mono text-[9px] text-on-surface-variant shrink-0 ml-1">
            {typeLabel}
          </span>
        )}
      </div>

      <details className="px-3 text-[9px] text-on-surface-variant"><summary>{t("Technical field")}</summary><code>{fieldKey}</code></details>
      {/* Sample value */}
      <div data-testid={`sap-token-val-${fieldKey}`} className="px-3 pb-1 text-[10px] text-on-surface-variant font-mono truncate">
        <span className="block text-[9px] mb-1">{t(status)}</span><input readOnly={readOnly} aria-label={t("Preview value for {field}", { field: label })} value={value} onChange={(e) => onUpdateToken?.(fieldKey, e.target.value)} className="w-full"  data-ui-control="input" data-variant="default" />
        {meta && (
          <span className="ml-1 text-outline" title={meta.description}>— {meta.description}</span>
        )}
      </div>

      {/* Insert actions */}
      <div data-testid={`sap-token-actions-${fieldKey}`} className="flex px-2 pb-2 gap-1">
        {!canPreviewToken && <div className="px-2 pb-1 text-[9px] text-secondary">{t("Field name is not supported")}</div>}
        {(['text', 'barcode', 'qr'] as const).map((insertType) => {
          const icons: Record<string, string> = { text: 'title', barcode: 'barcode', qr: 'qr_code_2' };
          const labels: Record<string, string> = { text: 'Text', barcode: 'Bar', qr: 'QR' };
          const colors: Record<string, string> = {
            text:    'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
            barcode: 'text-primary hover:bg-primary/10',
            qr:      'text-secondary hover:bg-secondary/10',
          };
          return (
            <button
              key={insertType}
              data-testid={`btn-insert-token-${fieldKey}-${insertType}`}
              onClick={() => onAddSapToken(fieldKey, insertType)}
              disabled={!canPreviewToken}
              draggable={canPreviewToken}
              onDragStart={(e) => handleDrag(e, insertType)}
              title={t("Insert as {type}", { type: t(labels[insertType]) })}
              className={`flex-1 flex items-center justify-center gap-1 ${colors[insertType]}disabled:cursor-not-allowed`}
             data-ui-control="button" data-variant="compact">
              <Icon  size="small" glyph={icons[insertType]} />
              {t(labels[insertType])}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SapTokenSection({
  sampleContracts,
  activeContractKey,
  onSelectContract,
  jsonData,
  onAddSapToken,
  onUpdateToken,
  readOnly = false,
  onAddCustomToken,
  usedTokens = new Set(),
  localImport = null,
  onLocalJsonImport,
  savedDatasets = [], selectedDatasetId = '', onSelectSavedDataset, onReloadDatasets, datasetStatus,
  onSelectLocalItem,
  localItemSequences = [],
  localImportError = null,
  localImportWarning = null,
  onEnterPreview,
  tokenCategories = {},
  customTokens = new Set(),
  onMarkCustomToken,
}: SapTokenSectionProps) {
  useTranslation();
  const fieldLabel = useFieldLabel();
  const datasetFileInput = React.useRef<HTMLInputElement>(null);
  const schemaKeys = new Set<string>(Object.keys(jsonData || {}));
  usedTokens.forEach((key) => schemaKeys.add(key));
  const tokenKeys = Array.from(schemaKeys).sort((a, b) => a.localeCompare(b));
  const [customName, setCustomName] = React.useState('');
  const [customValue, setCustomValue] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [profile, setProfile] = React.useState<TokenProfile>('standard');
  const addCustom = () => {
    const name = customName.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name) || Array.from(schemaKeys).some((key) => key.toLowerCase() === name.toLowerCase())) return;
    onAddCustomToken?.(name, customValue);
    onMarkCustomToken?.(name);
    setCustomName(''); setCustomValue('');
  };

  const categoryByKey = new Map<string, TokenProfile>();
  tokenKeys.forEach((key) => {
    if (customTokens.has(`${activeContractKey}:${key.toLocaleLowerCase()}`)) { categoryByKey.set(key, 'custom'); return; }
    if (SAP_FIELD_REGISTRY[key]) { categoryByKey.set(key, 'standard'); return; }
    const category = tokenCategories[key];
    categoryByKey.set(key, category ?? 'standard');
  });
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleTokenKeys = tokenKeys.filter((key) => {
    const categoryMatches = profile === 'standard' || categoryByKey.get(key) === profile;
    if (!categoryMatches) return false;
    if (!normalizedSearch) return true;
    const meta = SAP_FIELD_REGISTRY[key];
    const value = jsonData[key] == null ? '' : String(jsonData[key]);
    return `${fieldLabel(key)} ${key} ${value} ${meta?.description ?? ''}`.toLocaleLowerCase().includes(normalizedSearch);
  });

  return (
    <div data-testid="container-sap-token-section" className="flex flex-col text-xs w-full">
      <div className="p-3 border-b border-outline-variant space-y-2">
        <label data-ui-label="true" className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest" htmlFor="input-local-sap-json">{t("Label Data")} </label>
        <input
          ref={datasetFileInput}
          id="input-local-sap-json"
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t("Upload dataset")}
          data-testid="input-local-sap-json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && onLocalJsonImport) void onLocalJsonImport(file);
            event.currentTarget.value = '';
          }}
        />
        <label data-ui-label="true" className="block text-[10px] transition-colors duration-150 hover:border-primary hover:bg-surface-container-high focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"><select aria-label={t("Saved sample datasets")}  data-testid="select-saved-dataset" onFocus={() => { void onReloadDatasets?.(); }} value={selectedDatasetId} onChange={(event) => { void onSelectSavedDataset?.(event.target.value); }} className="w-full" data-ui-control="select" data-variant="default">
            <option value="">{t("Choose a saved dataset")}</option>
            {savedDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
          </select>
        </label>
        <button type="button" data-testid="btn-upload-dataset" onClick={() => datasetFileInput.current?.click()} className="cursor-pointer" data-ui-control="button" data-variant="default">{t("Upload dataset")}</button>
        {datasetStatus && <p role="status" data-testid="dataset-storage-status" className="text-[10px]">{t(datasetStatus)}</p>}
        {localImport && (
          <div className="rounded border border-tertiary/50 bg-tertiary/10 p-2 text-[10px] text-tertiary" data-testid="local-sap-import-banner">
            <div className="font-semibold">{t("Imported data - local preview")}</div>
            <div className="truncate">{localImport.fileName} {t("· item")} {localImport.itemSequence}/{localImport.itemCount}</div>
            <button type="button" onClick={onEnterPreview} className="mt-2 w-full" data-testid="btn-local-sap-preview" data-ui-control="button" data-variant="default">{t("Preview label")}</button>
            {localItemSequences.length> 1 && (
              <label data-ui-label="true" className="mt-2 block text-on-surface-variant">{t("Active item")} <select
                  className="mt-1 w-full"
                  value={localImport.itemSequence}
                  onChange={(event) => onSelectLocalItem?.(Number(event.target.value))}
                  data-testid="select-local-sap-item"
                 data-ui-control="select" data-variant="default">
                  {localItemSequences.map((sequence) => <option key={sequence} value={sequence}>{sequence}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {localImportError && <div role="alert" className="text-[10px] text-secondary" data-testid="local-sap-import-error">{t(localImportError)}</div>}
        {localImportWarning && <div className="text-[10px] text-secondary" data-testid="local-sap-import-warning">{t("Warning:")} {t(localImportWarning)}</div>}
      </div>
      <div className="px-3 py-2 border-b border-outline-variant bg-surface-container-low text-[10px] text-on-surface-variant">{t("Choose a field to add its value to the label. Changes here apply to local preview.")}</div>

      {/* Token count header */}
      <div data-testid="sap-tokens-header" className="px-3 py-1.5 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
        <Icon className=" text-tertiary"  size={13} glyph="data_object" />
        <span data-testid="sap-token-count" className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">{t("Fields (")}{visibleTokenKeys.length}/{tokenKeys.length})
        </span>
      </div>
      <div className="px-3 py-2 border-b border-outline-variant space-y-1.5">
        <label data-ui-label="true" className="sr-only" htmlFor="input-sap-token-search">{t("Search fields")}</label>
        <input id="input-sap-token-search" data-testid="input-sap-token-search" aria-label={t("Search fields")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search fields or values")} className="w-full"  data-ui-control="input" data-variant="default" />
        <label data-ui-label="true" className="sr-only" htmlFor="select-sap-token-profile">{t("Field group")}</label>
        <select id="select-sap-token-profile" data-testid="select-sap-token-profile" aria-label={t("Field group")} value={profile} onChange={(e) => setProfile(e.target.value as TokenProfile)} className="w-full cursor-pointer" data-ui-control="select" data-variant="default">
          <option value="standard">{t("All fields")}</option>
          <option value="customer">{t("Customer")}</option>
          <option value="characteristic">{t("Product characteristics")}</option>
          <option value="custom">{t("Custom")}</option>
        </select>
      </div>
      <div className="px-3 py-2 border-b border-outline-variant space-y-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-on-surface-variant">{t("Add a field")}</div>
        <div className="flex gap-1">
          <input aria-label={t("New field key")} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t("field_key")} className="min-w-0 flex-1"  data-ui-control="input" data-variant="default" />
          <input aria-label={t("New field value")} value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder={t("value")} className="min-w-0 flex-1"  data-ui-control="input" data-variant="default" />
          <button type="button" onClick={addCustom} disabled={!/^[A-Za-z0-9_-]+$/.test(customName.trim()) || Array.from(schemaKeys).some((key) => key.toLowerCase() === customName.trim().toLowerCase())}  data-testid="btn-add-custom-token" data-ui-control="button" data-variant="default">{t("Add")}</button>
        </div>
      </div>

      {/* Token list */}
      <div data-testid="container-sap-token-list" className="overflow-y-auto flex-1">
          {visibleTokenKeys.length === 0 ? (
            <div data-testid="sap-token-empty-state" className="p-4 text-center text-[11px] text-on-surface-variant">
            {tokenKeys.length === 0 ? t("No fields available") : t("No matching fields")}
          </div>
        ) : (
          visibleTokenKeys.map((key) => (
            <TokenCard
              key={key}
              fieldKey={key}
              value={jsonData[key] == null ? '' : String(jsonData[key])}
              status={getFieldStatus(jsonData[key])}
              isUsed={usedTokens.has(key)}
              onAddSapToken={onAddSapToken}
              onUpdateToken={onUpdateToken}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  );
}
