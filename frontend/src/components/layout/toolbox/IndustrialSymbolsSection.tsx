import React from 'react';
import { INDUSTRIAL_SYMBOLS } from '../../../utils/industrialSymbols';

interface IndustrialSymbolsSectionProps {
  onAddIsoSymbol: (symbolKey: string) => void;
}

interface SymbolGroupProps {
  keys: string[];
  dotClass: string;
  prefix: string;
  groupId: string;
  onAddIsoSymbol: (k: string) => void;
}

function SymbolGroup({ keys, dotClass, prefix, groupId, onAddIsoSymbol }: SymbolGroupProps) {
  const handleDragStart = (e: React.DragEvent, symbolKey: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'symbol', symbolKey }));
  };

  return (
    <div data-testid={`container-symbol-group-${groupId}`} className="grid grid-cols-1 gap-0.5">
      {keys.map((key) => {
        const label = key.replace(prefix, '').replace(/_/g, ' ');
        return (
          <button
            key={key}
            data-testid={`btn-symbol-${key}`}
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onClick={() => onAddIsoSymbol(key)}
            title={`Insert: ${label}`}
            className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-left capitalize"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function IndustrialSymbolsSection({ onAddIsoSymbol }: IndustrialSymbolsSectionProps) {
  const ghsKeys = Object.keys(INDUSTRIAL_SYMBOLS).filter((k) => k.startsWith('ghs_'));
  const isoKeys = Object.keys(INDUSTRIAL_SYMBOLS).filter((k) => !k.startsWith('ghs_'));

  return (
    <div data-testid="container-industrial-symbols-section" className="flex flex-col gap-0 text-xs w-full">
      {/* GHS section header */}
      <div data-testid="symbols-header-ghs" className="flex items-center gap-1.5 px-3 py-2 border-b border-outline-variant">
        <span className="material-symbols-outlined text-secondary" style={{ fontSize: 14 }}>warning</span>
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">GHS Hazard</span>
      </div>
      <SymbolGroup keys={ghsKeys} dotClass="bg-secondary" prefix="ghs_" groupId="ghs" onAddIsoSymbol={onAddIsoSymbol} />

      {/* ISO section header */}
      <div data-testid="symbols-header-iso" className="flex items-center gap-1.5 px-3 py-2 border-t border-b border-outline-variant mt-1">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>inventory_2</span>
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">ISO Shipping</span>
      </div>
      <SymbolGroup keys={isoKeys} dotClass="bg-primary" prefix="iso_" groupId="iso" onAddIsoSymbol={onAddIsoSymbol} />
    </div>
  );
}
