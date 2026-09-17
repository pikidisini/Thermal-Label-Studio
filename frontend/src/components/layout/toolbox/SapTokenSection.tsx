import React from 'react';
import { SAP_FIELD_REGISTRY, getSAPTypeLabel } from '../../../types/sap-contract';
import type { FlatSapTokenMap, RawSapContract } from '../../../utils/sapContractAdapter';

interface SapTokenSectionProps {
  sampleContracts: Record<string, RawSapContract>;
  activeContractKey: string;
  onSelectContract: (key: string) => void;
  jsonData: FlatSapTokenMap;
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
  usedTokens?: Set<string>;
}

interface TokenCardProps {
  fieldKey: string;
  value: string;
  isUsed: boolean;
  onAddSapToken: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
}

function TokenCard({ fieldKey, value, isUsed, onAddSapToken }: TokenCardProps) {
  const typeLabel = getSAPTypeLabel(fieldKey);
  const meta = SAP_FIELD_REGISTRY[fieldKey];

  const handleDrag = (e: React.DragEvent, asType: 'text' | 'barcode' | 'qr') => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'sap-token', token: fieldKey, asType }));
  };

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
        {value}
        {meta && (
          <span className="ml-1 text-outline" title={meta.description}>— {meta.description}</span>
        )}
      </div>

      {/* Insert actions */}
      <div data-testid={`sap-token-actions-${fieldKey}`} className="flex px-2 pb-2 gap-1">
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
              draggable
              onDragStart={(e) => handleDrag(e, t)}
              title={`Insert as ${labels[t]}`}
              className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors border border-outline-variant ${colors[t]}`}
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
  usedTokens = new Set(),
}: SapTokenSectionProps) {
  const tokenKeys = Object.keys(jsonData || {});

  return (
    <div data-testid="container-sap-token-section" className="flex flex-col text-xs w-full">
      {/* Contract selector */}
      <div data-testid="container-sap-contract-selector" className="px-3 py-2 border-b border-outline-variant bg-surface-container-low">
        <label className="text-[9px] font-semibold text-on-surface-variant uppercase tracking-widest block mb-1">
          SAP Contract Schema
        </label>
        <select
          data-testid="select-sap-contract-schema"
          value={activeContractKey}
          onChange={(e) => onSelectContract(e.target.value)}
          className="w-full bg-surface-container border border-outline-variant px-2 py-1.5 text-[11px] text-on-surface font-mono focus:outline-none focus:border-primary cursor-pointer"
        >
          {Object.keys(sampleContracts).map((k) => (
            <option key={k} value={k} className="bg-surface-container">{k.replace(/_/g, ' ').toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Token count header */}
      <div data-testid="sap-tokens-header" className="px-3 py-1.5 flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-lowest">
        <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 13 }}>data_object</span>
        <span data-testid="sap-token-count" className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
          Tokens ({tokenKeys.length})
        </span>
      </div>

      {/* Token list */}
      <div data-testid="container-sap-token-list" className="overflow-y-auto flex-1">
        {tokenKeys.length === 0 ? (
          <div data-testid="sap-token-empty-state" className="p-4 text-center text-[11px] text-on-surface-variant">
            No tokens in schema
          </div>
        ) : (
          tokenKeys.map((key) => (
            <TokenCard
              key={key}
              fieldKey={key}
              value={String(jsonData[key] ?? '')}
              isUsed={usedTokens.has(key)}
              onAddSapToken={onAddSapToken}
            />
          ))
        )}
      </div>
    </div>
  );
}
