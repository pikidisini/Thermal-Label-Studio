import React from 'react';

interface TableGridPickerProps { active: boolean; onSelect: (rows: number, columns: number, placement: 'drag' | 'center') => void }

export function TableGridPicker({ active, onSelect }: TableGridPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [size, setSize] = React.useState({ rows: 1, columns: 1 });
  const [position, setPosition] = React.useState({ left: 0, top: 0 });
  const trigger = React.useRef<HTMLButtonElement>(null);
  const dialog = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  const choose = React.useCallback(() => {
    onSelect(size.rows, size.columns, 'drag');
    close(false);
  }, [close, onSelect, size]);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const rect = dialog.current?.getBoundingClientRect();
      if (!rect) return;
      const maxTop = Math.max(8, window.innerHeight - rect.height - 40);
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      setPosition(current => ({ left: Math.min(current.left, maxLeft), top: Math.min(current.top, maxTop) }));
    });
  }, [open]);

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="table-grid-cell-1-1"]')?.focus());
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog.current?.contains(document.activeElement)) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      const next = { ...size };
      if (event.key === 'ArrowRight') next.columns = Math.min(10, next.columns + 1);
      else if (event.key === 'ArrowLeft') next.columns = Math.max(1, next.columns - 1);
      else if (event.key === 'ArrowDown') next.rows = Math.min(8, next.rows + 1);
      else if (event.key === 'ArrowUp') next.rows = Math.max(1, next.rows - 1);
      else if (event.key === 'Enter') { event.preventDefault(); choose(); return; }
      else return;
      event.preventDefault(); setSize(next);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [choose, close, open, size]);

  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.min(window.innerWidth - 250, rect.right + 8), top: Math.min(window.innerHeight - 260, rect.top) });
    setSize({ rows: 1, columns: 1 }); setOpen(true);
  };
  const label = `Buat Tabel ${size.columns} × ${size.rows}`;

  return <>
    <button ref={trigger} type="button" data-testid="btn-add-table" aria-haspopup="dialog" aria-expanded={open} onClick={show}
      className={`w-12 h-12 flex flex-col items-center justify-center transition-colors group relative ${active ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`} title="Table Grid">
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>table</span>
      <span className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 border border-outline-variant">Table Grid</span>
    </button>
    {open && <div ref={dialog} role="dialog" aria-label="Pilih ukuran tabel" data-testid="table-grid-picker" style={{ position: 'fixed', left: Math.max(8, position.left), top: Math.max(8, position.top), zIndex: 1000 }}
      className="w-[238px] rounded border border-outline-variant bg-surface-container-lowest p-3 shadow-2xl text-on-surface">
      <div className="text-[12px] font-semibold" data-testid="table-grid-size-label">{label}</div>
      <div className="text-[10px] text-on-surface-variant mt-0.5" aria-live="polite">{size.columns} kolom, {size.rows} baris</div>
      <div role="grid" aria-label="Ukuran tabel hingga 10 kolom dan 8 baris" className="grid grid-cols-10 gap-1 mt-2">
        {Array.from({ length: 80 }, (_, index) => {
          const row = Math.floor(index / 10) + 1, column = index % 10 + 1;
          const active = row <= size.rows && column <= size.columns;
          return <button key={index} type="button" role="gridcell" aria-label={`${column} kolom, ${row} baris`} aria-selected={active}
            data-testid={`table-grid-cell-${column}-${row}`}
            onMouseEnter={() => setSize({ rows: row, columns: column })}
            onFocus={() => setSize({ rows: row, columns: column })}
            onClick={() => { setSize({ rows: row, columns: column }); onSelect(row, column, 'drag'); close(false); }}
            className={`h-4 w-4 border ${active ? 'bg-primary border-primary' : 'bg-surface-container border-outline-variant hover:border-primary'}`} />;
        })}
      </div>
      <button type="button" onClick={() => { onSelect(size.rows, size.columns, 'center'); close(false); }} className="w-full mt-3 border border-primary px-2 py-1 text-[10px] text-primary">Letakkan di tengah · {label}</button>
      <button type="button" onClick={() => close()} className="sr-only" aria-label="Tutup pemilih tabel" />
    </div>}
  </>;
}
