import React, { useState, useMemo } from 'react';
import {
  MousePointer,
  Type,
  Barcode,
  QrCode,
  Square,
  Minus,
  Circle,
  Table,
  Image as ImageIcon,
  AlertTriangle,
  Database,
  CheckCircle2,
  Search,
  X,
  Plus,
  Flame,
  Layers,
  ChevronDown
} from 'lucide-react';
import { INDUSTRIAL_SYMBOLS } from '../utils/industrialSymbols';

export default function LeftToolbox({
  activeTool = 'select',
  setActiveTool,
  onAddText,
  onAddDynamicField,
  onAddBarcode,
  onAddQrCode,
  onAddRect,
  onAddLine,
  onAddCircle,
  onAddTable,
  onAddIsoSymbol,
  onUploadImage,
  sampleContracts,
  activeContractKey,
  onSelectContract,
  jsonData = {},
  onResetZoom,
  usedTokens = new Set()
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All'); // 'All' | 'Material' | 'Batch' | 'Logistics' | 'Qty' | 'Hazard'

  // Dynamic token schema extractor: Extract from active contract jsonData or default fields
  const allTokens = useMemo(() => {
    const fields = [
      { key: 'material_number', label: 'Material Number', type: 'CHAR18', cat: 'Material', desc: 'SAP MatNo (18 chars)' },
      { key: 'material_description', label: 'Material Desc', type: 'CHAR40', cat: 'Material', desc: 'Item description' },
      { key: 'batch_number', label: 'Batch / Lot', type: 'CHAR10', cat: 'Batch', desc: 'Charge / Batch ID' },
      { key: 'production_date', label: 'Production Date', type: 'DATS', cat: 'Batch', desc: 'Manufacturing date' },
      { key: 'expiration_date', label: 'Expiration Date', type: 'DATS', cat: 'Batch', desc: 'Expiry / SLED' },
      { key: 'vendor_name', label: 'Vendor / Supplier', type: 'CHAR35', cat: 'Logistics', desc: 'Supplier name' },
      { key: 'storage_location', label: 'Storage Loc', type: 'CHAR4', cat: 'Logistics', desc: 'LGORT / Plant' },
      { key: 'destination_plant', label: 'Dest Plant', type: 'CHAR4', cat: 'Logistics', desc: 'Receiving plant' },
      { key: 'purchase_order', label: 'Purchase Order', type: 'CHAR10', cat: 'Logistics', desc: 'PO Number' },
      { key: 'quantity', label: 'Quantity', type: 'DEC10', cat: 'Qty', desc: 'Net quantity' },
      { key: 'unit', label: 'Unit of Measure', type: 'UNIT3', cat: 'Qty', desc: 'Base UOM' },
      { key: 'gross_weight_kg', label: 'Gross Weight', type: 'DEC13.3', cat: 'Qty', desc: 'Gross weight in KG' },
      { key: 'net_weight_kg', label: 'Net Weight', type: 'DEC13.3', cat: 'Qty', desc: 'Net weight in KG' },
      { key: 'ghs_hazard_class', label: 'GHS Hazard Cat', type: 'GHS_CAT', cat: 'Hazard', desc: 'Hazardous category' },
    ];

    // Merge any extra keys from active jsonData dynamically
    if (jsonData && typeof jsonData === 'object') {
      Object.keys(jsonData).forEach(k => {
        if (!fields.some(f => f.key === k)) {
          let cat = 'Logistics';
          if (k.includes('date')) cat = 'Batch';
          else if (k.includes('qty') || k.includes('weight') || k.includes('count')) cat = 'Qty';
          else if (k.includes('mat') || k.includes('item') || k.includes('desc')) cat = 'Material';
          else if (k.includes('hazard') || k.includes('ghs')) cat = 'Hazard';

          fields.push({
            key: k,
            label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            type: 'VAR_STR',
            cat: cat,
            desc: 'Contract custom field'
          });
        }
      });
    }

    return fields;
  }, [jsonData]);

  // Filter tokens based on search query and category
  const filteredTokens = useMemo(() => {
    return allTokens.filter(t => {
      const matchCat = activeCategory === 'All' || t.cat === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || 
        t.key.toLowerCase().includes(q) || 
        t.label.toLowerCase().includes(q) || 
        t.type.toLowerCase().includes(q) ||
        String(jsonData[t.key] || '').toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [allTokens, searchQuery, activeCategory, jsonData]);

  // Handle Drag Start
  const handleDragStart = (e, tokenData) => {
    e.dataTransfer.setData('application/json', JSON.stringify(tokenData));
    e.dataTransfer.setData('text/plain', `{{${tokenData.token}}}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex h-full select-none shrink-0 z-30 shadow-md">
      {/* 1. 48px Slim CAD Icon Dock */}
      <aside className="w-[48px] bg-surface-container-lowest border-r border-outline-variant flex flex-col items-center py-2 justify-between shrink-0">
        <div className="flex flex-col items-center w-full">
          {/* Group 1: Selection Tools */}
          <div className="flex flex-col items-center gap-1 w-full">
            <button
              type="button"
              onClick={() => setActiveTool?.('select')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'select'
                  ? 'bg-surface-container-highest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
              title="Vector Select Tool [V]"
            >
              {activeTool === 'select' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
              )}
              <MousePointer className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Select [V]
              </span>
            </button>
          </div>

          <div className="w-[24px] h-[1px] bg-outline-variant/60 my-1.5" />

          {/* Group 2: Dynamic Variable / Code Generators */}
          <div className="flex flex-col items-center gap-1 w-full">
            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'text' ? 'select' : 'text')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'text'
                  ? 'bg-surface-container-highest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
              title="Text Label [T]"
            >
              {activeTool === 'text' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
              )}
              <Type className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Text Box [T]
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'barcode' ? 'select' : 'barcode')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'barcode'
                  ? 'bg-surface-container-highest text-primary shadow-sm'
                  : 'text-primary hover:bg-surface-container'
              }`}
              title="1D Linear Barcode [B]"
            >
              {activeTool === 'barcode' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
              )}
              <Barcode className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                1D Barcode [B]
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'qrcode' ? 'select' : 'qrcode')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'qrcode'
                  ? 'bg-surface-container-highest text-indigo-300 shadow-sm'
                  : 'text-indigo-400 hover:bg-surface-container'
              }`}
              title="2D DataMatrix / QR [M]"
            >
              {activeTool === 'qrcode' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-400" />
              )}
              <QrCode className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                2D Matrix / QR [M]
              </span>
            </button>
          </div>

          <div className="w-[24px] h-[1px] bg-outline-variant/60 my-1.5" />

          {/* Group 3: Geometric Primitives & Tables */}
          <div className="flex flex-col items-center gap-1 w-full">
            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'rect' ? 'select' : 'rect')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'rect'
                  ? 'bg-surface-container-highest text-emerald-300 shadow-sm'
                  : 'text-emerald-400 hover:bg-surface-container'
              }`}
              title="Rectangle Frame [R]"
            >
              {activeTool === 'rect' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-emerald-400" />
              )}
              <Square className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Box Frame [R]
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'line' ? 'select' : 'line')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'line'
                  ? 'bg-surface-container-highest text-amber-300 shadow-sm'
                  : 'text-amber-400 hover:bg-surface-container'
              }`}
              title="Separator Line [L]"
            >
              {activeTool === 'line' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-amber-400" />
              )}
              <Minus className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Separator Line [L]
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'circle' ? 'select' : 'circle')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'circle'
                  ? 'bg-surface-container-highest text-rose-300 shadow-sm'
                  : 'text-rose-400 hover:bg-surface-container'
              }`}
              title="Ellipse / Seal Badge [C]"
            >
              {activeTool === 'circle' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rose-400" />
              )}
              <Circle className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Circle / Badge [C]
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool?.(activeTool === 'table' ? 'select' : 'table')}
              className={`relative group w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
                activeTool === 'table'
                  ? 'bg-surface-container-highest text-teal-300 shadow-sm'
                  : 'text-teal-400 hover:bg-surface-container'
              }`}
              title="Table Grid [G]"
            >
              {activeTool === 'table' && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-teal-400" />
              )}
              <Table className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Manifest Table [G]
              </span>
            </button>
          </div>

          <div className="w-[24px] h-[1px] bg-outline-variant/60 my-1.5" />

          {/* Group 4: Industrial Assets */}
          <div className="flex flex-col items-center gap-1 w-full">
            <button
              type="button"
              onClick={() => onAddIsoSymbol?.('ghs_toxic')}
              className="relative group w-[38px] h-[32px] flex items-center justify-center text-secondary hover:bg-surface-container rounded-sm transition"
              title="GHS Hazardous Safety Diamond"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                GHS Hazard Symbol
              </span>
            </button>

            <label className="relative group w-[38px] h-[32px] flex items-center justify-center text-cyan-400 hover:bg-surface-container rounded-sm transition cursor-pointer">
              <ImageIcon className="w-4 h-4" />
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={onUploadImage}
                className="hidden"
              />
              <span className="absolute left-[52px] bg-surface-container-highest text-on-surface px-1.5 py-0.5 rounded shadow-lg text-[10px] font-mono opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                Upload Graphic Logo
              </span>
            </label>
          </div>
        </div>

        {/* Bottom Dock Controls */}
        <div className="flex flex-col items-center gap-1 w-full">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`w-[38px] h-[32px] flex items-center justify-center rounded-sm transition ${
              isDrawerOpen ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
            title="Toggle SAP Contract Drawer"
          >
            <Database className="w-4 h-4" />
          </button>

          <div className="w-[20px] h-[1px] bg-outline-variant my-0.5" />

          <button
            type="button"
            onClick={onResetZoom}
            className="w-[38px] h-[26px] flex items-center justify-center text-on-surface-variant hover:text-on-surface font-mono text-[10px]"
            title="Reset Zoom to 100% (1:1)"
          >
            1:1
          </button>
        </div>
      </aside>

      {/* 2. Enhanced 250px Expandable SAP Token Drawer (Stitch Updated Layout) */}
      {isDrawerOpen && (
        <section className="w-[250px] bg-surface-container-low border-r border-outline-variant flex flex-col shadow-lg shrink-0">
          {/* Header */}
          <div className="h-[32px] px-2.5 bg-surface-container flex items-center justify-between border-b border-outline-variant shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface font-bold">
                SAP Tokens
              </span>
              <span className="text-[9px] font-mono bg-surface-container-highest text-on-surface-variant px-1 rounded">
                {allTokens.length}
              </span>
            </div>
            <span className="font-mono text-[9px] text-primary px-1.5 py-0.2 bg-surface-container-highest border border-outline-variant rounded">
              v1.1 BIND
            </span>
          </div>

          {/* Interactive Search Bar */}
          <div className="p-1.5 bg-surface-container-lowest border-b border-outline-variant">
            <div className="flex items-center bg-surface border border-outline-variant px-2 py-1 rounded-sm focus-within:border-primary transition">
              <Search className="w-3 h-3 text-outline mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="Filter tokens (e.g. lot, date)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[11px] text-on-surface focus:outline-none placeholder:text-outline-variant font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-outline hover:text-on-surface ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Tabs (Zero-radius CAD style) */}
          <div className="flex items-center bg-surface-container-lowest border-b border-outline-variant px-1 py-1 gap-1 overflow-x-auto text-[10px] font-mono shrink-0">
            {['All', 'Material', 'Batch', 'Logistics', 'Qty'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-1.5 py-0.5 rounded-sm transition shrink-0 ${
                  activeCategory === cat
                    ? 'bg-primary text-on-primary font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Token Cards Stream */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
            {filteredTokens.length === 0 ? (
              <div className="p-4 text-center font-mono text-xs text-outline">
                No tokens match "{searchQuery}"
              </div>
            ) : (
              filteredTokens.map(t => {
                const sampleVal = jsonData[t.key] !== undefined ? String(jsonData[t.key]) : '---';
                const isBound = usedTokens.has(t.key);

                return (
                  <div
                    key={t.key}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, { token: t.key, label: t.label, targetType: 'text' })}
                    className="p-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 hover:border-primary/50 rounded cursor-grab active:cursor-grabbing transition group shadow-sm"
                  >
                    {/* Token Top Row */}
                    <div className="flex items-center justify-between">
                      <span className="text-primary font-mono text-[10px] group-hover:text-tertiary font-bold tracking-tight">
                        {`{{${t.key}}}`}
                      </span>
                      <span className="text-on-surface-variant font-label-sm text-[9px] font-mono px-1 rounded bg-surface-container-lowest">
                        {t.type}
                      </span>
                    </div>

                    {/* Sample Value & Audit Status */}
                    <div className="mt-1 flex items-center justify-between text-on-surface font-mono text-[10px] bg-surface-container-lowest px-1.5 py-0.5 rounded">
                      <span className="truncate max-w-[135px] text-gray-300" title={sampleVal}>
                        {sampleVal}
                      </span>
                      {isBound ? (
                        <span className="flex items-center gap-0.5 text-tertiary text-[9px] font-semibold shrink-0" title="Token is bound to canvas element">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Bound</span>
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full border border-outline-variant shrink-0" title="Unbound token" />
                      )}
                    </div>

                    {/* Multi-Action Target Injection Buttons (Visible on hover) */}
                    <div className="mt-1.5 pt-1 border-t border-outline-variant/40 flex items-center justify-between opacity-80 group-hover:opacity-100 transition text-[9px] font-mono">
                      <span className="text-outline text-[8px] uppercase">Add as:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAddDynamicField?.(`{{${t.key}}}`, t.label)}
                          className="px-1.5 py-0.5 bg-surface-container-high hover:bg-primary hover:text-on-primary text-primary rounded border border-outline-variant transition font-semibold"
                          title={`Insert {{${t.key}}} as dynamic Text label`}
                        >
                          +Text
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddBarcode?.(`{{${t.key}}}`)}
                          className="px-1.5 py-0.5 bg-surface-container-high hover:bg-primary hover:text-on-primary text-primary rounded border border-outline-variant transition font-semibold"
                          title={`Insert {{${t.key}}} as 1D Barcode`}
                        >
                          +Bar
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddQrCode?.(`{{${t.key}}}`)}
                          className="px-1.5 py-0.5 bg-surface-container-high hover:bg-indigo-400 hover:text-white text-indigo-300 rounded border border-outline-variant transition font-semibold"
                          title={`Insert {{${t.key}}} as 2D QR Code`}
                        >
                          +QR
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Quick GHS Hazard Pictograms Row */}
            <div className="pt-2 border-t border-outline-variant/60">
              <div className="text-[10px] uppercase font-bold text-secondary mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>GHS Hazard Pictograms</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'ghs_toxic', label: 'TOXIC' },
                  { id: 'ghs_flammable', label: 'FLAM' },
                  { id: 'ghs_exclamation', label: 'WARN' },
                  { id: 'ghs_corrosive', label: 'CORR' },
                  { id: 'ghs_environmental', label: 'ENV' },
                  { id: 'ghs_health_hazard', label: 'HLTH' }
                ].map(sym => (
                  <button
                    key={sym.id}
                    type="button"
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, { symbolId: sym.id, label: sym.label, targetType: 'symbol' })}
                    onClick={() => onAddIsoSymbol?.(sym.id, sym.label)}
                    className="p-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-center rounded text-[9px] hover:border-secondary transition text-gray-200 font-mono"
                    title={`Add GHS ${sym.label}`}
                  >
                    {sym.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
