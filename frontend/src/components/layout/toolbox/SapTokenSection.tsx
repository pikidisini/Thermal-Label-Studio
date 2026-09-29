import React from 'react';
import { SAP_FIELD_REGISTRY, getSAPTypeLabel } from '../../../types/sap-contract';
import type { FlatSapTokenMap, RawSapContract } from '../../../utils/sapContractAdapter';
import { adaptSapContract } from '../../../utils/sapContractAdapter';

interface SapTokenSectionProps {
  sampleContracts: Record<string, RawSapContract>;
  activeContractKey: string;
  onSelectContract: (key: string) => void;
  jsonData: FlatSapTokenMap;
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
  onUpdateToken?: (token: string, value: string) => void;
  onAddCustomToken?: (token: string, value: string) => void;
  usedTokens?: Set<string>;
  localImport?: { format: 'v1.1' | 'raw-v2'; fileName: string; itemSequence: number; itemCount: number } | null;
  onLocalJsonImport?: (file: File) => Promise<void>;
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
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
}

type TokenProfile = 'standard' | 'customer' | 'characteristic' | 'custom';

function TokenCard({ fieldKey, value, isUsed, onAddSapToken, onUpdateToken, isAbsent = false }: TokenCardProps & { onUpdateToken?: (token: string, value: string) => void; isAbsent?: boolean }) {
  const typeLabel = getSAPTypeLabel(fieldKey);
  const meta = SAP_FIELD_REGISTRY[fieldKey];

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
            {`{{${fieldKey}}}`}
          </span>
          {isUsed && (
            <span data-testid={`sap-token-bound-badge-${fieldKey}`} className="text-[8px] px-1 py-0.5 bg-tertiary/20 text-tertiary font-semibold shrink-0">
              BOUND
            </span>
          )}
        </div>
        {typeLabel && (
          <span data-testid={`sap-token-type-${fieldKey}`} className="font-mono text-[9px] text-on-surface-variant shrink-0 ml-1">
            {typeLabel}
          </span>
        )}
      </div>

      {/* Sample value */}
      <div data-testid={`sap-token-val-${fieldKey}`} className="px-3 pb-1 text-[10px] text-on-surface-variant font-mono truncate">
        {isAbsent && <span className="mr-1 text-secondary">ABSENT · </span>}<input aria-label={`Value {{${fieldKey}}}`} value={value} onChange={(e) => onUpdateToken?.(fieldKey, e.target.value)} className="w-full bg-transparent border-b border-outline-variant px-0.5 text-[10px] text-on-surface font-mono focus:outline-none focus:border-primary" />
        {meta && (
          <span className="ml-1 text-outline" title={meta.description}>— {meta.description}</span>
        )}
      </div>

      {/* Insert actions */}
      <div data-testid={`sap-token-actions-${fieldKey}`} className="flex px-2 pb-2 gap-1">
        {!canPreviewToken && <div className="px-2 pb-1 text-[9px] text-secondary">Nama field belum didukung preview</div>}
        {(['text', 'barcode', 'qr'] as const).map((t) => {
          const icons: Record<string, string> = { text: 'title', barcode: 'barcode', qr: 'qr_code_2' };
          const labels: Record<string, string> = { text: 'Text', barcode: 'Bar', qr: 'QR' };
          const colors: Record<string, string> = {
            text:    'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
            barcode: 'text-primary hover:bg-primary/10',
            qr:      'text-secondary hover:bg-secondary/10',
          };
          return (
            <button
              key={t}
              data-testid={`btn-insert-token-${fieldKey}-${t}`}
              onClick={() => onAddSapToken(fieldKey, t)}
              disabled={!canPreviewToken}
              draggable={canPreviewToken}
              onDragStart={(e) => handleDrag(e, t)}
              title={`Insert as ${labels[t]}`}
              className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors border border-outline-variant ${colors[t]} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{icons[t]}</span>
              {labels[t]}
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
  onAddCustomToken,
  usedTokens = new Set(),
  localImport = null,
  onLocalJsonImport,
  onSelectLocalItem,
  localItemSequences = [],
  localImportError = null,
  localImportWarning = null,
  onEnterPreview,
  tokenCategories = {},
  customTokens = new Set(),
  onMarkCustomToken,
}: SapTokenSectionProps) {
  const schemaKeys = new Set<string>(Object.keys(SAP_FIELD_REGISTRY));
  Object.values(sampleContracts).forEach((contract) => Object.keys(adaptSapContract(contract).tokenMap).forEach((key) => schemaKeys.add(key)));
  Object.keys(jsonData || {}).forEach((key) => schemaKeys.add(key));
  usedTokens.forEach((key) => schemaKeys.add(key));
  const tokenKeys = Array.from(schemaKeys).sort();
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
    return `${key} ${value} ${meta?.description ?? ''}`.toLocaleLowerCase().includes(normalizedSearch);
  });

  return (
    <div data-testid="container-sap-token-section" className="flex flex-col text-xs w-full">
      <div className="p-3 border-b border-outline-variant space-y-2">
        <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest" htmlFor="input-local-sap-json">
          Data uji lokal JSON
        </label>
        <input
          id="input-local-sap-json"
          type="file"
          accept=".json,application/json"
          className="w-full text-[10px] text-on-surface-variant"
          data-testid="input-local-sap-json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && onLocalJsonImport) void onLocalJsonImport(file);
            event.currentTarget.value = '';
          }}
        />
        <p className="text-[10px] leading-relaxed text-on-surface-variant">JSON diparse di browser; saat Preview dipilih, data dikirim ke render service lokal aplikasi. Tidak membuat batch atau mengganti canvas.</p>
        {localImport && (
          <div className="rounded border border-tertiary/50 bg-tertiary/10 p-2 text-[10px] text-tertiary" data-testid="local-sap-import-banner">
            <div className="font-semibold">Data uji lokal / belum memakai aturan profil produksi</div>
            <div className="truncate">{localImport.fileName} · item {localImport.itemSequence}/{localImport.itemCount}</div>
            <button type="button" onClick={onEnterPreview} className="mt-2 w-full border border-tertiary/60 px-2 py-1 text-[10px] font-semibold text-tertiary hover:bg-tertiary/10" data-testid="btn-local-sap-preview">Lihat preview desain</button>
            {localItemSequences.length > 1 && (
              <label className="mt-2 block text-on-surface-variant">
                Item aktif
                <select
                  className="mt-1 w-full bg-surface-container border border-outline-variant px-1 py-1 text-on-surface"
                  value={localImport.itemSequence}
                  onChange={(event) => onSelectLocalItem?.(Number(event.target.value))}
                  data-testid="select-local-sap-item"
                >
                  {localItemSequences.map((sequence) => <option key={sequence} value={sequence}>{sequence}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {localImportError && <div role="alert" className="text-[10px] text-secondary" data-testid="local-sap-import-error">{localImportError}</div>}
        {localImportWarning && <div className="text-[10px] text-amber-300" data-testid="local-sap-import-warning">Peringatan: {localImportWarning}</div>}
      </div>
      <div className="px-3 py-2 border-b border-outline-variant bg-surface-container-low text-[10px] text-on-surface-variant">Placeholders tersedia dari schema data dan JSON aktif. Nilai dapat diedit untuk preview lokal.</div>

      {/* Token count header */}
      <div data-testid="sap-tokens-header" className="px-3 py-1.5 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
        <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 13 }}>data_object</span>
        <span data-testid="sap-token-count" className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
          Tokens ({visibleTokenKeys.length}/{tokenKeys.length})
        </span>
      </div>
      <div className="px-3 py-2 border-b border-outline-variant space-y-1.5">
        <label className="sr-only" htmlFor="input-sap-token-search">Cari token</label>
        <input id="input-sap-token-search" data-testid="input-sap-token-search" aria-label="Cari token" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari token, nilai, atau deskripsi" className="w-full bg-surface-container border border-outline-variant px-2 py-1 text-[10px] font-mono" />
        <label className="sr-only" htmlFor="select-sap-token-profile">Profil token</label>
        <select id="select-sap-token-profile" data-testid="select-sap-token-profile" aria-label="Profil token" value={profile} onChange={(e) => setProfile(e.target.value as TokenProfile)} className="w-full bg-surface-container border border-outline-variant px-2 py-1 text-[10px] text-on-surface">
          <option value="standard">Standar (semua token)</option>
          <option value="customer">Customer</option>
          <option value="characteristic">Spesifikasi / Characteristic Produk</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="px-3 py-2 border-b border-outline-variant space-y-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-on-surface-variant">Tambah placeholder</div>
        <div className="flex gap-1">
          <input aria-label="Nama placeholder baru" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="nama_field" className="min-w-0 flex-1 bg-surface-container border border-outline-variant px-1.5 py-1 text-[10px] font-mono" />
          <input aria-label="Nilai placeholder baru" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="nilai" className="min-w-0 flex-1 bg-surface-container border border-outline-variant px-1.5 py-1 text-[10px] font-mono" />
          <button type="button" onClick={addCustom} disabled={!/^[A-Za-z0-9_-]+$/.test(customName.trim()) || Array.from(schemaKeys).some((key) => key.toLowerCase() === customName.trim().toLowerCase())} className="border border-primary px-2 text-[10px] text-primary disabled:opacity-40" data-testid="btn-add-custom-token">Tambah</button>
        </div>
      </div>

      {/* Token list */}
      <div data-testid="container-sap-token-list" className="overflow-y-auto flex-1">
          {visibleTokenKeys.length === 0 ? (
            <div data-testid="sap-token-empty-state" className="p-4 text-center text-[11px] text-on-surface-variant">
            {tokenKeys.length === 0 ? 'No tokens in schema' : 'Tidak ada token sesuai filter'}
          </div>
        ) : (
          visibleTokenKeys.map((key) => (
            <TokenCard
              key={key}
              fieldKey={key}
              value={jsonData[key] == null ? '' : String(jsonData[key])}
              isAbsent={usedTokens.has(key) && !Object.prototype.hasOwnProperty.call(jsonData, key)}
              isUsed={usedTokens.has(key)}
              onAddSapToken={onAddSapToken}
              onUpdateToken={onUpdateToken}
            />
          ))
        )}
      </div>
    </div>
  );
}
