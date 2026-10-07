import React from 'react';
import { graphicsApi } from '../api/graphicsApi';
import type { GraphicAsset, GraphicTemplateImpact } from '../api/graphicsApi';

interface GraphicUpdateCenterModalProps { isOpen: boolean; onClose: () => void; }

export function GraphicUpdateCenterModal({ isOpen, onClose }: GraphicUpdateCenterModalProps) {
  const [items, setItems] = React.useState<GraphicAsset[]>([]);
  const [selected, setSelected] = React.useState<GraphicAsset | null>(null);
  const [impact, setImpact] = React.useState<GraphicTemplateImpact[]>([]);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState('');
  const file = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    try {
      const all = await graphicsApi.list();
      setItems(all);
      setSelected((current) => current ? all.find((asset) => asset.id === current.id) ?? null : null);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Gagal memuat grafik'); }
  }, []);

  React.useEffect(() => { if (isOpen) void refresh(); }, [isOpen, refresh]);
  React.useEffect(() => {
    if (!selected) { setImpact([]); setChosen([]); return; }
    graphicsApi.impact(selected.id).then((result) => {
      setImpact(result.templates);
      setChosen(result.templates.map((template) => template.template_id));
    }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Gagal memuat dampak template'));
  }, [selected]);

  if (!isOpen) return null;
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!selectedFile || !selected) return;
    try { await graphicsApi.uploadVersion(selected.id, selectedFile); await refresh(); setMessage('Versi baru disimpan. Pilih template lalu jalankan preview atau pembaruan.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Upload versi gagal'); }
  };
  const run = async (dryRun: boolean) => {
    if (!selected) return;
    try {
      const data = await graphicsApi.bulkUpdate(selected.id, chosen, dryRun);
      setMessage(dryRun ? `${data.affected.length} template akan diperbarui.` : `${data.updated.length} template diperbarui dengan snapshot revisi sebelumnya.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Bulk update gagal'); }
  };

  return <div data-testid="graphic-update-center" className="fixed inset-0 z-[var(--ui-layer-modal)] grid place-items-center bg-black/60 p-5"><section className="w-full max-w-3xl rounded border border-outline-variant bg-surface-container-lowest p-4"><header className="flex justify-between"><h2 className="font-semibold">Graphic Update Center</h2><button type="button" onClick={onClose}>Tutup</button></header><div className="mt-3 grid grid-cols-[12rem_1fr] gap-4"><aside className="max-h-80 overflow-auto border-r border-outline-variant pr-2">{items.map((asset) => <button key={asset.id} type="button" onClick={() => setSelected(asset)} className="block w-full p-2 text-left hover:bg-surface-container">{asset.name} <small>v{asset.version}</small></button>)}</aside><main>{selected ? <><p><b>{selected.name}</b> · versi aktif v{selected.version}</p><button type="button" className="mt-2 rounded bg-primary px-2 py-1 text-surface" onClick={() => file.current?.click()}>Upload versi baru</button><input className="hidden" ref={file} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onChange={upload} /><p className="mt-3 text-sm">Template terdampak ({impact.length})</p><div className="max-h-40 overflow-auto">{impact.map((template) => <label key={template.template_id} className="block"><input type="checkbox" checked={chosen.includes(template.template_id)} onChange={() => setChosen((current) => current.includes(template.template_id) ? current.filter((id) => id !== template.template_id) : [...current, template.template_id])} /> {template.template_id}</label>)}</div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void run(true)} className="rounded border px-2 py-1">Preview perubahan</button><button type="button" onClick={() => void run(false)} className="rounded bg-primary px-2 py-1 text-surface">Perbarui {chosen.length} template</button></div></> : <p>Pilih grafik global.</p>}{message && <p role="status" className="mt-3 text-sm">{message}</p>}</main></div></section></div>;
}
