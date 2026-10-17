import React from 'react';
import { graphicsApi } from '../api/graphicsApi';
import type { GraphicAsset } from '../model/graphicTypes';
import { API_BASE } from '../../../shared/api';
import { Button } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';

export function GraphicsSection({ onAdd }: { onAdd?: (asset: GraphicAsset) => Promise<void> }) {
  const t = useTranslation();
  const [items, setItems] = React.useState<GraphicAsset[]>([]);
  const [query, setQuery] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [revision, setRevision] = React.useState(0);
  const [more, setMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [selected, setSelected] = React.useState<GraphicAsset | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setMore(false);
    if (offset === 0) setItems([]);
    graphicsApi.list(query, offset, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(current => offset === 0 ? result : [...current, ...result.filter(item => !current.some(old => old.id === item.id))]);
      setMore(result.length === 100);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Graphics request failed.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, offset, revision]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Graphics request failed.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    void run(async () => {
      await graphicsApi.upload(file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Graphic', file);
      setQuery(''); setOffset(0); setRevision(value => value + 1);
      setMessage(onAdd ? 'Graphic uploaded. Add it to the label from the library.' : 'Graphic uploaded. It is available in the Studio Graphics library.');
    });
  };

  return <div data-testid="graphics-library" className="space-y-2 p-2 text-xs" aria-busy={busy || loading}>
    <p className="text-on-surface-variant">{t('Graphics are copied into the label. Existing templates do not change.')}</p>
    <label className="block">{t('Search graphics')}
      <input data-testid="graphics-search" value={query} maxLength={160} disabled={busy} onChange={event => { setQuery(event.target.value); setOffset(0); setSelected(null); }} className="w-full rounded border border-outline-variant bg-surface px-2 py-1" />
    </label>
    <div className="flex gap-1">
      <Button variant="compact" data-testid="graphics-upload" disabled={busy} onClick={() => input.current?.click()}>{t('Upload image')}</Button>
      <Button variant="compact" disabled={busy || loading} onClick={() => { setOffset(0); setRevision(value => value + 1); }}>{t('Refresh')}</Button>
      <input ref={input} data-testid="graphics-upload-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} className="hidden" />
    </div>
    {error && <p role="alert" className="text-on-surface">{t(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {loading && <p role="status">{t('Loading graphics...')}</p>}
    <div className="graphics-library-content"><div className="graphics-library-grid grid grid-cols-2 gap-2">
      {items.map(item => <Button key={item.id} disabled={busy || loading} data-testid={`graphics-asset-${item.id}`}
        aria-pressed={onAdd ? undefined : selected?.id === item.id}
        onClick={() => { if (onAdd) void run(async () => { await onAdd(item); setMessage('Graphic added to the label.'); }); else setSelected(item); }}
        title={t(onAdd ? 'Add graphic to label' : 'View graphic details')} className="rounded border border-outline-variant p-1 text-left">
        <div className="grid h-14 place-items-center overflow-hidden bg-white"><img alt="" loading="lazy" src={`${API_BASE}/graphics/${encodeURIComponent(item.id)}/content`} className="max-h-full max-w-full" /></div>
        <span className="block truncate">{item.name}</span>
      </Button>)}
    </div>
    {!onAdd && selected && <section className="graphics-library-detail" aria-label={t('Graphic details')}>
      <h3>{selected.name}</h3>
      <div className="graphics-library-preview"><img alt={selected.name} src={`${API_BASE}/graphics/${encodeURIComponent(selected.id)}/content`} /></div>
      <dl><dt>{t('Dimensions')}</dt><dd>{selected.width ?? '—'} × {selected.height ?? '—'} px</dd>
        <dt>{t('File type')}</dt><dd>{selected.content_type}</dd>
        <dt>{t('File size')}</dt><dd>{selected.byte_length} {t('bytes')}</dd>
        <dt>{t('Created')}</dt><dd>{new Date(selected.updated_at).toLocaleString()}</dd>
        <dt>{t('Asset ID')}</dt><dd>{selected.id}</dd></dl>
      <p>{t('Use the Graphics dock in Studio to add an embedded copy to a label.')}</p>
    </section>}</div>
    {!items.length && !loading && !error && <p>{t('No graphics found. Upload a PNG, JPEG or WebP image.')}</p>}
    {more && <Button variant="compact" disabled={busy || loading} onClick={() => setOffset(value => value + 100)}>{t('Load more')}</Button>}
  </div>;
}
