import React from 'react';
import { TemplateMetadata } from '../../../types/template';
import { apiClient } from '../../../utils/apiClient';
import { validateLocalSvg } from '../../../utils/validateLocalSvg';

type Folder = { id: string; name: string; path: string; parent_id?: string | null };
type Detail = TemplateMetadata & { raw_svg?: string; svg_content?: string; width_mm?: number; height_mm?: number };
interface Props { templates: TemplateMetadata[]; activeTemplateId: string; onSelectTemplate: (id: string) => void; labelWidthMm: number; labelHeightMm: number }

export function TemplateSelector({ templates, activeTemplateId, onSelectTemplate, labelWidthMm, labelHeightMm }: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<TemplateMetadata | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [targetFolder, setTargetFolder] = React.useState('');
  const [newFolder, setNewFolder] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [library, setLibrary] = React.useState<TemplateMetadata[]>([]);

  const refreshFolders = React.useCallback(async () => {
    try { setFolders(await apiClient.listTemplateFolders()); } catch (e) { setError(e instanceof Error ? e.message : 'Folder tidak dapat dimuat.'); }
  }, []);
  React.useEffect(() => { if (!open) return; setError(null); setLibrary([]); setSelected(null); setDetail(null); setLoading(true); void refreshFolders(); apiClient.listTemplatesStrict().then((result) => setLibrary(result.templates || [])).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [open, refreshFolders]);
  React.useEffect(() => {
    if (!selected) return;
    let current = true;
    setLoading(true); setDetail(null);
    apiClient.getTemplateStrict(selected.id).then((value) => { if (current) setDetail(value); }).catch((e) => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected]);
  React.useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open]);

  const shown = library.filter((t) => ((!query && !activeFolder) || (query ? true : t.folder_id === activeFolder)) && (!query || t.name.toLowerCase().includes(query.toLowerCase()) || t.id.toLowerCase().includes(query.toLowerCase())));
  const createFolder = async () => { if (!newFolder.trim()) return; try { const folder = await apiClient.createTemplateFolder(newFolder.trim(), activeFolder || undefined); setFolders((old) => [...old, folder]); setNewFolder(''); } catch (e) { setError(e instanceof Error ? e.message : 'Folder gagal dibuat.'); } };
  const moveTemplate = async () => { if (!selected || selected.is_builtin || targetFolder === (selected.folder_id || '')) return; try { await apiClient.moveTemplate(selected.id, targetFolder || undefined); const result = await apiClient.listTemplatesStrict(); setLibrary(result.templates || []); setSelected((result.templates || []).find((t: TemplateMetadata) => t.id === selected.id) || null); await refreshFolders(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Template gagal dipindahkan.'); } };

  return <>
    <div data-testid="container-template-selector" className="flex items-center gap-2">
      <button data-testid="topbar-open-template-explorer" onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-2 py-1 bg-surface-container border border-outline-variant text-xs"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder_open</span>{templates.find((t) => t.id === activeTemplateId)?.name || 'Templates'}</button>
      <div data-testid="topbar-badge-dimensions" className="font-mono text-[10px] px-2 py-1 bg-surface-container-low border border-outline-variant">{labelWidthMm} × {labelHeightMm} mm</div>
    </div>
    {open && <div role="dialog" aria-modal="true" aria-label="Template explorer" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-5xl h-[min(680px,88vh)] bg-surface border border-outline-variant shadow-2xl flex flex-col">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant"><h2 className="text-sm font-semibold flex-1">Template explorer</h2><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" className="w-64 px-2 py-1 text-xs bg-surface-container border border-outline-variant" /><button onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        <div className="flex flex-1 min-h-0">
          <aside className="w-2/5 border-r border-outline-variant overflow-auto p-3"><div className="flex gap-1 mb-3"><input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder" className="flex-1 px-2 py-1 text-xs bg-surface-container border border-outline-variant" /><button onClick={createFolder} aria-label="Buat folder" className="px-2 text-xs border">＋</button></div><button onClick={() => setActiveFolder(null)} className="block w-full text-left text-xs px-2 py-1">All templates</button>{folders.map((folder) => <button key={folder.id} onClick={() => setActiveFolder(folder.id)} className={`block w-full text-left text-xs px-2 py-1 pl-4 ${activeFolder === folder.id ? 'bg-primary/15 font-semibold' : ''}`}>📁 {folder.path}</button>)}<div className="mt-3 border-t border-outline-variant">{shown.map((template) => <button key={template.id} onClick={() => { setSelected(template); setTargetFolder(template.folder_id || ''); }} className={`block w-full text-left px-2 py-2 text-xs border-b border-outline-variant ${selected?.id === template.id ? 'bg-primary/15' : ''}`}>{template.name}<span className="block text-[10px] text-on-surface-variant">{template.is_builtin ? 'Built-in' : 'Custom'}</span></button>)}{!shown.length && <div className="p-3 text-xs text-on-surface-variant">No templates found.</div>}</div></aside>
          <section className="flex-1 p-5 flex flex-col min-w-0">{error && <div className="text-xs text-error mb-2">{error}</div>}{loading && <div className="m-auto text-xs">Loading preview…</div>}{selected && detail && !loading && <><div className="flex-1 min-h-0 flex items-center justify-center bg-white border p-4"><SafePreview svg={detail.raw_svg || detail.svg_content || ''} /></div><div className="pt-4 text-xs"><div className="font-semibold">{selected.name}</div><div className="text-on-surface-variant">{detail.width_mm} × {detail.height_mm} mm · {selected.is_builtin ? 'Built-in' : 'Custom'}</div>{!selected.is_builtin && <div className="flex gap-2 mt-2"><select value={targetFolder} onChange={(e) => setTargetFolder(e.target.value)} className="text-xs border px-2"><option value="">Root folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}</select><button onClick={moveTemplate} aria-label="Pindahkan template" className="text-xs px-3 py-1 border">Move</button></div>}</div><button onClick={() => { onSelectTemplate(selected.id); setOpen(false); }} className="mt-3 self-end px-4 py-2 text-xs bg-primary text-on-primary">Open template</button></>}{!selected && !loading && <div className="m-auto text-sm text-on-surface-variant">Select a template to preview it.</div>}</section>
        </div>
      </div>
    </div>}
  </>;
}
function SafePreview({ svg }: { svg: string }) { const result = validateLocalSvg(svg); return 'error' in result ? <div className="text-xs text-error">Preview unavailable: {result.error}</div> : <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`} alt="SVG template preview" className="max-h-full max-w-full object-contain" />; }
