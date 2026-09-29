import React from 'react';
import { applyTableBorders } from '../model/tableSpec';
import type { TableSpec } from '../model/tableSpec';
interface TableInspectorProps { spec: TableSpec; onUpdateProperty: (prop: string, value: any) => void; }

export function TableInspector({ spec, onUpdateProperty }: TableInspectorProps) {
 const [activeTableCell, setActiveTableCell] = React.useState(0);
 const [tableSizeDraft, setTableSizeDraft] = React.useState<Record<string, string>>({});
 const [borderTarget, setBorderTarget] = React.useState<'cell' | 'row' | 'column' | 'table'>('cell');
 const [borderSides, setBorderSides] = React.useState<'outer' | 'inner' | 'all' | 'selected'>('all');
 const [borderStyle, setBorderStyle] = React.useState<'none' | 'solid' | 'dashed'>('solid');
 const [borderWidth, setBorderWidth] = React.useState('0.25');
 const [selectedSides, setSelectedSides] = React.useState<Array<'top' | 'right' | 'bottom' | 'left'>>(['top', 'right', 'bottom', 'left']);

 const updateCell = (index: number, field: string, value: string) => {
   const next = structuredClone(spec) as any;
   const [kind] = field.split(':');
   next.cells[index][kind] = value;
   onUpdateProperty('tableSpec', next);
 };

 const resizeDimension = (axis: 'rows' | 'cols', value: string) => {
   const count = Math.min(20, Math.max(1, Math.floor(Number(value) || 1)));
   const next = structuredClone(spec);
   if (axis === 'cols') {
     next.cols = count;
     next.columnWidthsMm = Array.from({ length: count }, (_, i) => spec.columnWidthsMm[i] || 20);
     next.cells = Array.from({ length: next.rows * count }, (_, i) => {
       const row = Math.floor(i / count), col = i % count;
       return row < spec.rows && col < spec.cols ? spec.cells[row * spec.cols + col] : { ...JSON.parse(JSON.stringify(spec.cells[0])), text: `R${row + 1}C${col + 1}`, token: '' };
     });
   } else {
     next.rows = count;
     next.rowHeightsMm = Array.from({ length: count }, (_, i) => spec.rowHeightsMm[i] || 8);
     next.cells = Array.from({ length: count * next.cols }, (_, i) => {
       const row = Math.floor(i / next.cols), col = i % next.cols;
       return row < spec.rows && col < spec.cols ? spec.cells[row * spec.cols + col] : { ...JSON.parse(JSON.stringify(spec.cells[0])), text: `R${row + 1}C${col + 1}`, token: '' };
     });
   }
   setActiveTableCell(old => Math.min(old, next.cells.length - 1));
   onUpdateProperty('tableSpec', next);
 };
 return (
        <section data-testid="inspector-table-config" className="space-y-2 border-t border-outline-variant pt-3">
          <div className="font-semibold text-[11px]">Table · {spec.rows} × {spec.cols}</div>
          <div className="grid grid-cols-2 gap-2">
            {(['rows', 'cols'] as const).map(axis => (
              <label key={axis} className="text-[9px] capitalize">
                {axis}
                <input aria-label={`Table ${axis}`} type="number" min="1" max="20" value={spec[axis]} onChange={e => resizeDimension(axis, e.target.value)} className="w-full bg-surface-container border px-1 py-1" />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {spec.columnWidthsMm.map((w, i) => { const key = `c${i}`; return <label key={`cw${i}`} className="text-[9px]">Column {i + 1} (mm)<input type="number" min="1" max="200" step="0.5" value={tableSizeDraft[key] ?? String(w)} onChange={e => setTableSizeDraft(d => ({ ...d, [key]: e.target.value }))} onBlur={() => { const n = Math.min(200, Math.max(1, Number(tableSizeDraft[key]) || w)); const next = structuredClone(spec); next.columnWidthsMm[i] = n; setTableSizeDraft(d => { const copy = { ...d }; delete copy[key]; return copy; }); onUpdateProperty('tableSpec', next); }} className="w-full bg-surface-container border px-1 py-1" /></label>; })}
            {spec.rowHeightsMm.map((h, i) => { const key = `r${i}`; return <label key={`rh${i}`} className="text-[9px]">Row {i + 1} (mm)<input type="number" min="1" max="100" step="0.5" value={tableSizeDraft[key] ?? String(h)} onChange={e => setTableSizeDraft(d => ({ ...d, [key]: e.target.value }))} onBlur={() => { const n = Math.min(100, Math.max(1, Number(tableSizeDraft[key]) || h)); const next = structuredClone(spec); next.rowHeightsMm[i] = n; setTableSizeDraft(d => { const copy = { ...d }; delete copy[key]; return copy; }); onUpdateProperty('tableSpec', next); }} className="w-full bg-surface-container border px-1 py-1" /></label>; })}
          </div>
          <label className="text-[9px]">Select cell<select aria-label="Selected table cell" value={Math.min(activeTableCell, spec.cells.length - 1)} onChange={e => setActiveTableCell(Number(e.target.value))} className="w-full bg-surface-container border px-1 py-1">{spec.cells.map((_cell, i) => <option key={i} value={i}>Cell {Math.floor(i / spec.cols) + 1},{i % spec.cols + 1}</option>)}</select></label>
          {spec.cells.slice(Math.min(activeTableCell, spec.cells.length - 1), Math.min(activeTableCell, spec.cells.length - 1) + 1).map((cell) => { const actualIndex = Math.min(activeTableCell, spec.cells.length - 1); return <div key={actualIndex} className="border-t border-outline-variant pt-2 space-y-1">
            <div className="font-semibold">Cell {Math.floor(actualIndex / spec.cols) + 1},{actualIndex % spec.cols + 1}</div>
            <input aria-label={`Cell ${actualIndex + 1} preview text`} maxLength={160} value={cell.text} onChange={e => updateCell(actualIndex, 'text', e.target.value)} className="w-full bg-surface-container border px-1 py-1" />
            <input aria-label={`Cell ${actualIndex + 1} token`} maxLength={80} placeholder="Token e.g. material_code" value={cell.token} onChange={e => updateCell(actualIndex, 'token', e.target.value.trim())} className="w-full bg-surface-container border px-1 py-1 font-mono" />
            <div className="space-y-2 rounded border border-outline-variant p-2">
              <div className="font-semibold">Borders</div>
              <div className="grid grid-cols-2 gap-1">
                <label className="text-[9px]">Apply to<select aria-label="Border target" value={borderTarget} onChange={e => setBorderTarget(e.target.value as typeof borderTarget)} className="w-full bg-surface-container border px-1 py-1"><option value="cell">Cell</option><option value="row">Row</option><option value="column">Column</option><option value="table">Table</option></select></label>
                <label className="text-[9px]">Borders<select aria-label="Border sides preset" value={borderSides} onChange={e => setBorderSides(e.target.value as typeof borderSides)} className="w-full bg-surface-container border px-1 py-1"><option value="all">All</option><option value="outer">Outer</option><option value="inner">Inner</option><option value="selected">Selected sides</option></select></label>
                <label className="text-[9px]">Line<select aria-label="Border style" value={borderStyle} onChange={e => setBorderStyle(e.target.value as typeof borderStyle)} className="w-full bg-surface-container border px-1 py-1"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="none">None</option></select></label>
                <label className="text-[9px]">Width (mm)<input aria-label="Border width" type="number" min="0" max="5" step="0.1" value={borderWidth} onChange={e => setBorderWidth(e.target.value)} className="w-full bg-surface-container border px-1 py-1" /></label>
              </div>
              <div className="flex flex-wrap gap-2">{(['top','right','bottom','left'] as const).map(side => <label key={side} className="flex items-center gap-1 text-[9px] capitalize"><input type="checkbox" checked={selectedSides.includes(side)} onChange={e => setSelectedSides(old => e.target.checked ? [...old, side] : old.filter(item => item !== side))} />{side}</label>)}</div>
              <button type="button" aria-label="Apply borders" onClick={() => onUpdateProperty('tableSpec', applyTableBorders(spec, actualIndex, borderTarget, borderSides, { style: borderStyle, widthMm: Math.min(5, Math.max(0, Number(borderWidth) || 0)) }, selectedSides))} className="border border-primary px-2 py-1 text-[9px] text-primary">Apply borders</button>
            </div>
          </div>; })}
        </section>
  );
}
