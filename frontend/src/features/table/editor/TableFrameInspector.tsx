import React from 'react';
import { parseTableModel, styleTableEdges, setTableEdge, insertTableRow, insertTableColumn, deleteTableRow, deleteTableColumn, distributeTracks, splitTableRegion, mergeTableRange, regionForCell, type EdgeStyle, type TableLineStyle, type TableModelV2, type TableRange } from '../model/tableModelV2';
import { useStudioStore } from '../../../store/useStudioStore';

type TableFrameSelection = { id?: string; isTable: true; tableVersion: 2; tableSpec: unknown };

export function TableFrameInspector({ selectedObject, pxPerMm, onUpdateProperty }: { selectedObject: TableFrameSelection; pxPerMm: number; onUpdateProperty: (prop: string, value: unknown) => void }) {
  const [edgeScope, setEdgeScope] = React.useState<'all' | 'outer' | 'inner' | 'perimeter'>('all');
  const [lineWidthUnit, setLineWidthUnit] = React.useState<'mm' | 'px'>('mm');
  const tableEditMode = useStudioStore(state => state.tableEditMode);
  const tableEditSelection = useStudioStore(state => state.tableEditSelection);
  const tableSelectedEdge = useStudioStore(state => state.tableSelectedEdge);
  const setTableSelectedEdge = useStudioStore(state => state.setTableSelectedEdge);
  const setTableEditMode = useStudioStore(state => state.setTableEditMode);
  const tableModel = parseTableModel(selectedObject.tableSpec);
  if (!tableModel) return null;
  const updateTableModel = (model: TableModelV2 | null, preserveSelectedEdge = false) => { if (model && JSON.stringify(model) !== JSON.stringify(tableModel)) { if (!preserveSelectedEdge) setTableSelectedEdge(null); onUpdateProperty('tableV2Model', model); } };
  const selectedRange: TableRange | undefined = tableEditSelection && tableEditSelection.tableId === selectedObject.id ? tableEditSelection.range : undefined;
  const actionRange: TableRange = selectedRange || { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 };
  const insertIndex = (axis: 'row' | 'column', after: boolean) => {
    if (!selectedRange) return axis === 'row' ? tableModel.rows : tableModel.cols;
    return axis === 'row' ? (after ? selectedRange.rowEnd + 1 : selectedRange.rowStart) : (after ? selectedRange.colEnd + 1 : selectedRange.colStart);
  };
  const deleteSelectedTracks = (axis: 'row' | 'column') => {
    const start = selectedRange ? (axis === 'row' ? selectedRange.rowStart : selectedRange.colStart) : (axis === 'row' ? tableModel.rows - 1 : tableModel.cols - 1);
    const end = selectedRange ? (axis === 'row' ? selectedRange.rowEnd : selectedRange.colEnd) : start;
    let next: TableModelV2 | null = tableModel;
    for (let index = end; index >= start && next; index--) next = axis === 'row' ? deleteTableRow(next, index) : deleteTableColumn(next, index);
    return next;
  };
  const activeEdgeSelection = tableSelectedEdge && tableSelectedEdge.tableId === selectedObject.id ? tableSelectedEdge : null;
  const edgeSelected = activeEdgeSelection !== null;
  const selectedEdge = activeEdgeSelection ? (activeEdgeSelection.target.kind === 'horizontal' ? tableModel.horizontalEdges[activeEdgeSelection.target.row]?.[activeEdgeSelection.target.col] : tableModel.verticalEdges[activeEdgeSelection.target.row]?.[activeEdgeSelection.target.col]) : null;
  const baseEdge = selectedEdge || tableModel.horizontalEdges[0]?.[0];
  const docPixelWidth = (baseEdge?.widthMm ?? 0.25) * pxPerMm;
  const mergeCanRun = !!selectedRange && (selectedRange.rowEnd > selectedRange.rowStart || selectedRange.colEnd > selectedRange.colStart);
  const splitRegion = regionForCell(tableModel, actionRange.rowStart, actionRange.colStart);
  const splitCanRun = !!splitRegion && (splitRegion.rowSpan > 1 || splitRegion.colSpan > 1);
  const updateTableLines = (style: EdgeStyle) => updateTableModel(activeEdgeSelection ? setTableEdge(tableModel, activeEdgeSelection.target, style) : styleTableEdges(tableModel, style, edgeScope, selectedRange), edgeSelected);

  return <section data-testid="table-v2-inspector" className="space-y-2 border-t border-outline-variant pt-3">
    <div className="font-semibold text-[11px]">Table · {tableModel.rows} × {tableModel.cols}</div>
    <p className="text-[9px] text-on-surface-variant">Kerangka garis saja. Pilih rentang secara visual dalam mode edit untuk menggabungkan, memisahkan, atau mengatur track.</p>
    <output data-testid="table-v2-track-sizes" className="block text-[9px] text-on-surface-variant">Kolom: {tableModel.columnWidthsMm.map(value => value.toFixed(1)).join(' / ')} mm · Baris: {tableModel.rowHeightsMm.map(value => value.toFixed(1)).join(' / ')} mm</output>
    {selectedRange && <output data-testid="table-v2-selected-range" className="block text-[9px] text-primary">Selection: rows {selectedRange.rowStart + 1}–{selectedRange.rowEnd + 1}, columns {selectedRange.colStart + 1}–{selectedRange.colEnd + 1}</output>}
    {activeEdgeSelection && <output data-testid="table-v2-selected-edge" className="block text-[9px] text-primary">Selected {activeEdgeSelection.target.kind} edge at {activeEdgeSelection.target.row + 1}:{activeEdgeSelection.target.col + 1}</output>}
    <button type="button" data-testid="table-v2-edit-mode" aria-pressed={tableEditMode} onClick={() => setTableEditMode(!tableEditMode)} className="w-full border border-primary p-1">{tableEditMode ? 'Selesai mengedit kerangka' : 'Edit kerangka'}</button>
    <details data-testid="table-v2-structure-menu" className="border border-outline-variant p-1">
      <summary className="cursor-pointer select-none p-1 font-medium">Opsi tabel</summary>
      <div className="grid grid-cols-2 gap-1 pt-1">
        <button type="button" data-testid="table-v2-merge-range" disabled={!mergeCanRun} onClick={() => selectedRange && updateTableModel(mergeTableRange(tableModel, selectedRange))} className="border border-outline-variant p-1 disabled:opacity-50">Gabungkan rentang</button>
        <button type="button" data-testid="table-v2-split-range" disabled={!splitCanRun} onClick={() => updateTableModel(splitTableRegion(tableModel, actionRange.rowStart, actionRange.colStart))} className="border border-outline-variant p-1 disabled:opacity-50">Pisahkan sel</button>
        <button type="button" data-testid="table-v2-add-row-before" disabled={!selectedRange} onClick={() => updateTableModel(insertTableRow(tableModel, insertIndex('row', false)))} className="border border-outline-variant p-1 disabled:opacity-50">+ Baris sebelum pilihan</button>
        <button type="button" data-testid="table-v2-add-row" disabled={!selectedRange} onClick={() => updateTableModel(insertTableRow(tableModel, insertIndex('row', true)))} className="border border-outline-variant p-1 disabled:opacity-50">+ Baris sesudah pilihan</button>
        <button type="button" data-testid="table-v2-add-column-before" disabled={!selectedRange} onClick={() => updateTableModel(insertTableColumn(tableModel, insertIndex('column', false)))} className="border border-outline-variant p-1 disabled:opacity-50">+ Kolom sebelum pilihan</button>
        <button type="button" data-testid="table-v2-add-column" disabled={!selectedRange} onClick={() => updateTableModel(insertTableColumn(tableModel, insertIndex('column', true)))} className="border border-outline-variant p-1 disabled:opacity-50">+ Kolom sesudah pilihan</button>
        <button type="button" data-testid="table-v2-delete-row" disabled={!selectedRange} onClick={() => updateTableModel(deleteSelectedTracks('row'))} className="border border-outline-variant p-1 disabled:opacity-50">Hapus baris pilihan</button>
        <button type="button" data-testid="table-v2-delete-column" disabled={!selectedRange} onClick={() => updateTableModel(deleteSelectedTracks('column'))} className="border border-outline-variant p-1 disabled:opacity-50">Hapus kolom pilihan</button>
        <button type="button" data-testid="table-v2-distribute-rows" onClick={() => updateTableModel(distributeTracks(tableModel, 'row'))} className="border border-outline-variant p-1">Samakan tinggi baris</button>
        <button type="button" data-testid="table-v2-distribute-columns" onClick={() => updateTableModel(distributeTracks(tableModel, 'column'))} className="border border-outline-variant p-1">Samakan lebar kolom</button>
      </div>
    </details>
    <div className="grid grid-cols-2 gap-1 items-end text-[9px]">
      <label>Sasaran garis<select aria-label="Line scope" value={edgeScope} onChange={e => { const value = e.target.value; if (value === 'all' || value === 'outer' || value === 'inner' || value === 'perimeter') setEdgeScope(value); }} className="w-full bg-surface-container border border-outline-variant p-1"><option value="all">Semua garis terlihat</option><option value="outer">Bingkai luar</option><option value="inner">Garis internal</option><option value="perimeter" disabled={!selectedRange}>Keliling rentang terpilih</option></select></label>
      <label>Gaya garis<select data-testid="table-v2-line-style" value={baseEdge?.style || 'solid'} onChange={e => { const value = e.target.value; if (value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'none') updateTableLines({ style: value as TableLineStyle }); }} className="w-full bg-surface-container border border-outline-variant p-1"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="none">None</option></select></label>
      <label>Warna<input aria-label="Line color" type="color" value={baseEdge?.color || '#000000'} onChange={e => updateTableLines({ color: e.target.value })} className="w-full h-7 bg-surface-container border border-outline-variant" /></label>
      <label>Satuan tebal garis<select aria-label="Line width unit" value={lineWidthUnit} onChange={e => { const value = e.target.value; if (value === 'mm' || value === 'px') setLineWidthUnit(value); }} className="w-full bg-surface-container border border-outline-variant p-1"><option value="mm">mm</option><option value="px">px dokumen</option></select></label>
      <label>Tebal garis ({lineWidthUnit})<input aria-label="Line width" type="number" min={lineWidthUnit === 'mm' ? 0.05 : 0.2} max={lineWidthUnit === 'mm' ? 5 : 5 * pxPerMm} step={lineWidthUnit === 'mm' ? 0.05 : 0.2} value={lineWidthUnit === 'mm' ? (baseEdge?.widthMm ?? 0.25) : Number(docPixelWidth.toFixed(2))} onChange={e => updateTableLines({ widthMm: lineWidthUnit === 'mm' ? Number(e.target.value) : Number(e.target.value) / pxPerMm })} className="w-full bg-surface-container border border-outline-variant p-1" /></label>
    </div>
  </section>;
}
