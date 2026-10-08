import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { createPortal } from 'react-dom';
import { TemplateMetadata } from '../../../types/template';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { layoutApi } from '../api/layoutApi';
import { validateLocalSvg } from '../lib/validateLocalSvg';
import { Badge, Button, Dialog, DialogHeader, ErrorState, IconButton, Input } from '../../../shared/ui';

type Detail = { raw_svg?: string; svg_content?: string; svg?: string; width_mm?: number; height_mm?: number; label_code?: string; version?: number; status?: string; dpi?: number; created_at?: string; object_key?: string; svg_sha256?: string };
interface Props { templates: TemplateMetadata[]; activeTemplateId: string; onSelectTemplate: (id: string) => void; labelWidthMm: number; labelHeightMm: number }

export function TemplateSelector({ templates, activeTemplateId, onSelectTemplate, labelWidthMm, labelHeightMm }: Readonly<Props>) {
  useTranslation();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<TemplateMetadata | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [library, setLibrary] = React.useState<TemplateMetadata[]>([]);

  const [action, setAction] = React.useState<'rename' | 'delete' | null>(null);
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null); setSelected(null); setDetail(null); setAction(null); setLoading(true);
    setLibrary(templates);
    setLoading(false);
  }, [open]);
  React.useEffect(() => { setLibrary(templates); }, [templates]);

  React.useEffect(() => {
    if (!selected) return;
    let current = true;
    setLoading(true); setDetail(null); setError(null); setAction(null);
    const request = layoutApi.get(selected.id);
    request.then((value) => { if (current) setDetail(value); }).catch((e) => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected]);
  React.useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open, busy]);

  const shown = library.filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.id.toLowerCase().includes(query.toLowerCase()));

  const manageTemplate = async () => {
    if (!selected || !action || busy) return;
    setBusy(true); setError(null);
    try {
      if (action === 'rename') {
        const renamed = await layoutApi.rename(selected.id, title.trim());
        const state = useTemplateStore.getState();
        state.setTemplates(state.templates.map(t => t.id === selected.id ? { ...t, name: renamed.title } : t));
        setSelected({ ...selected, name: renamed.title });
      } else {
        await layoutApi.delete(selected.id);
        const state = useTemplateStore.getState();
        state.setTemplates(state.templates.filter(t => t.id !== selected.id));
        if (state.activeTemplateId === selected.id) state.setActiveTemplateId('');
        setSelected(null); setDetail(null);
      }
      setAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Template update failed.');
    } finally { setBusy(false); }
  };

  return <>
    <div data-testid="container-template-selector" className="flex items-center gap-2">
      <Button data-testid="topbar-open-template-explorer" onClick={() => setOpen(true)} className="flex items-center gap-1.5" variant="default"><span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-14)" }}>folder_open</span>{templates.find((t) => t.id === activeTemplateId)?.name || t("Templates")}</Button>
      <Badge data-ui-numeric="true">{labelWidthMm} × {labelHeightMm} {t("mm")}</Badge>
    </div>
    {open && typeof document !== 'undefined' && createPortal(<div role="dialog" aria-modal="true" aria-label={t("Template explorer")} data-testid="template-explorer-modal-overlay" className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-6" onMouseDown={(e) => { if (!busy && e.target === e.currentTarget) setOpen(false); }} data-ui-backdrop="true">
      <Dialog className="w-full max-w-5xl h-[min(680px,88vh)] flex flex-col">
        <DialogHeader className="flex items-center gap-3"><h2 className="text-sm font-semibold flex-1">{t("Template Explorer")}</h2><Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search templates")} className="w-64" /><IconButton disabled={busy} onClick={() => setOpen(false)} label={t("Close")}>×</IconButton></DialogHeader>
        <div className="flex flex-1 min-h-0">
          <aside className="w-2/5 border-r border-outline-variant overflow-auto p-3"><div className="mt-3 border-t border-outline-variant">{shown.map((template) => <button key={template.id} disabled={busy} onClick={() => setSelected(template)} className={`block w-full text-left`} data-ui-control="button" data-variant="default" data-selected={selected?.id === template.id} data-tone="neutral">{template.name}<span data-ui-caption="true" className="block">{template.is_builtin ? t("Built-in") : t("Custom")}</span></button>)}{!shown.length && <div className="p-3 text-xs text-on-surface-variant">{t("No templates found.")}</div>}</div></aside>
          <section className="flex-1 p-5 flex flex-col min-w-0">{error && <ErrorState title={error} />}{loading && <div className="m-auto text-xs">{t("Loading preview…")}</div>}{selected && detail && !loading && <><div className="flex-1 min-h-0 flex items-center justify-center bg-surface-container border border-outline-variant p-4"><div className="w-full h-full flex items-center justify-center" style={{ containerType: 'size' }}><SafePreview svg={detail.raw_svg || detail.svg_content || detail.svg || ''} widthMm={detail.width_mm} heightMm={detail.height_mm} /></div></div><TemplateDetails key={selected.id} template={selected} detail={detail} />{action && <div className="mt-3 border border-outline-variant p-3 text-xs">
              {action === 'rename' ? <><label data-ui-label="true" htmlFor="template-rename-title">{t("Template name")}</label><Input id="template-rename-title" autoFocus value={title} maxLength={160} disabled={busy} onChange={e => setTitle(e.target.value)} className="mt-2 w-full" /></> : <p>{t('Delete "{name}" from the template library? Version history is retained. The current canvas will remain available.', { name: selected.name })}</p>}
              <div className="mt-3 flex justify-end gap-2"><Button disabled={busy} onClick={() => setAction(null)} variant="default">{t("Cancel")}</Button><Button disabled={busy || (action === 'rename' && !title.trim())} onClick={manageTemplate} variant="default">{busy ? t("Saving...") : action === 'rename' ? t("Save name") : t("Confirm delete")}</Button></div>
            </div>}
            <div className="mt-3 flex items-center gap-2">{!selected.is_builtin && <><Button disabled={busy || loading} onClick={() => { setTitle(selected.name); setAction('rename'); setError(null); }} variant="default">{t("Rename")}</Button><Button disabled={busy || loading} onClick={() => { setAction('delete'); setError(null); }} variant="default">{t("Delete")}</Button></>}<Button disabled={busy || !!action} tone="primary" onClick={() => { onSelectTemplate(selected.id); setOpen(false); }} className="ml-auto" variant="default">{t("Open template")}</Button></div></>}{!selected && !loading && <div className="m-auto text-sm text-on-surface-variant">{t("Select a template to preview it.")}</div>}</section>
        </div>
      </Dialog>
    </div>, document.body)}
  </>;
}
function SafePreview({ svg, widthMm, heightMm }: { svg: string; widthMm?: number; heightMm?: number }) {
  useTranslation();
  const result = validateLocalSvg(svg, widthMm, heightMm);
  if ('error' in result) return <ErrorState title={t("Preview unavailable")} detail={result.error} />;
  const ratio = result.widthMm / result.heightMm;
  return <img
    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
    alt={t("SVG template preview")}
    className="bg-white border border-outline-variant shadow-sm object-contain"
    style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, aspectRatio: String(ratio), height: 'auto', maxHeight: '100%' }}
  />;
}

function TemplateDetails({ template, detail }: { template: TemplateMetadata; detail: Detail }) {
  useTranslation();
  const created = detail.created_at ? new Date(detail.created_at) : null;
  const createdLabel = created && Number.isFinite(created.getTime())
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(created) + ' WIB'
    : 'Unavailable';
  return <div className="mt-4 text-xs max-h-[45%] overflow-auto shrink-0" data-testid="template-details">
    <div className="font-semibold break-words">{template.name}</div>
    <div className="text-on-surface-variant">{detail.width_mm} × {detail.height_mm} {t("mm ·")} {template.is_builtin ? t("Built-in") : t("Custom")}</div>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-on-surface-variant">{t("Template code")}</dt><dd className="font-mono break-all">{detail.label_code || template.id}</dd>
      <dt className="text-on-surface-variant">{t("Version / Status")}</dt><dd>{detail.version ? `v${detail.version}` : t("Unavailable")} · {detail.status || 'Unavailable'}</dd>
      <dt className="text-on-surface-variant">{t("Resolution")}</dt><dd>{detail.dpi ? `${detail.dpi} DPI` : t("Unavailable")}</dd>
      <dt className="text-on-surface-variant">{t("Version created")}</dt><dd>{createdLabel}</dd>
    </dl>
    <details className="mt-2 border-t border-outline-variant pt-2">
      <summary className="cursor-pointer">{t("Storage details")}</summary>
      <dl className="mt-2 space-y-2">
        <div><dt className="text-on-surface-variant">{t("Object path")}</dt><dd className="font-mono break-all select-text">{detail.object_key || 'Unavailable'}</dd></div>
        <div><dt className="text-on-surface-variant">{t("SVG checksum (SHA-256)")}</dt><dd className="font-mono break-all select-text">{detail.svg_sha256 || 'Unavailable'}</dd></div>
      </dl>
    </details>
  </div>;
}
