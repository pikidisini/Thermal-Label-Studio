import React from 'react';
import { createPortal } from 'react-dom';
import { TemplateMetadata } from '../../../types/template';
import { layoutApi } from '../api/layoutApi';
import { validateLocalSvg } from '../../../utils/validateLocalSvg';
import { Badge, Button, Dialog, DialogHeader, ErrorState, IconButton, Input } from '../../../shared/ui';

type Detail = { raw_svg?: string; svg_content?: string; svg?: string; width_mm?: number; height_mm?: number };
interface Props { templates: TemplateMetadata[]; activeTemplateId: string; onSelectTemplate: (id: string) => void; labelWidthMm: number; labelHeightMm: number }

export function TemplateSelector({ templates, activeTemplateId, onSelectTemplate, labelWidthMm, labelHeightMm }: Readonly<Props>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<TemplateMetadata | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [library, setLibrary] = React.useState<TemplateMetadata[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setError(null); setSelected(null); setDetail(null); setLoading(true);
    setLibrary(templates);
    setLoading(false);
  }, [open, templates]);

  React.useEffect(() => {
    if (!selected) return;
    let current = true;
    setLoading(true); setDetail(null);
    const request = layoutApi.get(selected.id);
    request.then((value) => { if (current) setDetail(value); }).catch((e) => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected]);
  React.useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open]);

  const shown = library.filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.id.toLowerCase().includes(query.toLowerCase()));

  return <>
    <div data-testid="container-template-selector" className="flex items-center gap-2">
      <Button data-testid="topbar-open-template-explorer" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder_open</span>{templates.find((t) => t.id === activeTemplateId)?.name || 'Templates'}</Button>
      <Badge className="font-mono">{labelWidthMm} × {labelHeightMm} mm</Badge>
    </div>
    {open && typeof document !== 'undefined' && createPortal(<div role="dialog" aria-modal="true" aria-label="Template explorer" data-testid="template-explorer-modal-overlay" className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <Dialog className="w-full max-w-5xl h-[min(680px,88vh)] bg-surface flex flex-col">
        <DialogHeader className="flex items-center gap-3"><h2 className="text-sm font-semibold flex-1">Template Explorer</h2><Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" className="w-64 text-xs" /><IconButton onClick={() => setOpen(false)} label="Close">×</IconButton></DialogHeader>
        <div className="flex flex-1 min-h-0">
          <aside className="w-2/5 border-r border-outline-variant overflow-auto p-3"><div className="mt-3 border-t border-outline-variant">{shown.map((template) => <button key={template.id} onClick={() => setSelected(template)} className={`block w-full text-left px-2 py-2 text-xs border-b border-outline-variant ${selected?.id === template.id ? 'bg-primary/15' : ''}`}>{template.name}<span className="block text-[10px] text-on-surface-variant">{template.is_builtin ? 'Built-in' : 'Custom'}</span></button>)}{!shown.length && <div className="p-3 text-xs text-on-surface-variant">No templates found.</div>}</div></aside>
          <section className="flex-1 p-5 flex flex-col min-w-0">{error && <ErrorState title={error} />}{loading && <div className="m-auto text-xs">Loading preview…</div>}{selected && detail && !loading && <><div className="flex-1 min-h-0 flex items-center justify-center bg-white border p-4"><SafePreview svg={detail.raw_svg || detail.svg_content || detail.svg || ''} /></div><div className="pt-4 text-xs"><div className="font-semibold">{selected.name}</div><div className="text-on-surface-variant">{detail.width_mm} × {detail.height_mm} mm · {selected.is_builtin ? 'Built-in' : 'Custom'}</div></div><Button tone="primary" onClick={() => { onSelectTemplate(selected.id); setOpen(false); }} className="mt-3 self-end text-xs">Open template</Button></>}{!selected && !loading && <div className="m-auto text-sm text-on-surface-variant">Select a template to preview it.</div>}</section>
        </div>
      </Dialog>
    </div>, document.body)}
  </>;
}
function SafePreview({ svg }: { svg: string }) { const result = validateLocalSvg(svg); return 'error' in result ? <ErrorState title="Preview unavailable" detail={result.error} /> : <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`} alt="SVG template preview" className="max-h-full max-w-full object-contain" />; }
