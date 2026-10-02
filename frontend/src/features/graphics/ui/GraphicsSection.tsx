import React from 'react';
import { graphicsApi } from '../api/graphicsApi';
import type { GraphicAsset } from '../api/graphicsApi';

interface GraphicsSectionProps {
  onAdd: (asset: GraphicAsset) => void;
}

export function GraphicsSection({ onAdd }: GraphicsSectionProps) {
  const [items, setItems] = React.useState<GraphicAsset[]>([]);
  const [query, setQuery] = React.useState('');
  const [error, setError] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(() => {
    graphicsApi.list().then(setItems).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Gagal memuat grafik');
    });
  }, []);

  React.useEffect(refresh, [refresh]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    try {
      await graphicsApi.upload(file.name.replace(/\.[^.]+$/, ''), file);
      setError('');
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload gagal');
    }
  };

  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return <div data-testid="graphics-library" className="space-y-2 p-2 text-xs">
    <div className="flex gap-1">
      <input data-testid="graphics-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari grafik..." className="min-w-0 flex-1 rounded border border-outline-variant bg-surface px-2 py-1" />
      <button type="button" data-testid="graphics-upload" onClick={() => input.current?.click()} className="rounded bg-primary px-2 py-1 text-surface">Upload</button>
      <input ref={input} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onChange={upload} className="hidden" />
    </div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="grid grid-cols-2 gap-2">
      {filtered.map((item) => <button key={item.id} type="button" data-testid={`graphics-asset-${item.id}`} onClick={() => onAdd(item)} title={`Tambahkan ${item.name}`} className="rounded border border-outline-variant p-1 text-left hover:bg-surface-container-high">
        <div className="grid h-14 place-items-center overflow-hidden bg-white/90"><img alt="" src={`/api/v1/graphics/${item.id}/content`} className="max-h-full max-w-full" /></div>
        <span className="block truncate">{item.name}</span><small>v{item.version}</small>
      </button>)}
    </div>
    {!filtered.length && !error && <p className="text-on-surface-variant">Belum ada grafik global.</p>}
  </div>;
}
