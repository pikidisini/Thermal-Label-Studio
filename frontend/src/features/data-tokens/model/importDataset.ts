import { readLocalSapJsonSource } from './localSapJsonParser';
import { studioDatasetApi } from '../api/studioDatasetApi';
/** Upload action has only a dataset persistence capability, never an output capability. */
export async function importDataset(file: File, callbacks: {
  current: () => boolean;
  apply: (parsed: Awaited<ReturnType<typeof readLocalSapJsonSource>>['parsed']) => void;
  status: (message: string) => void;
  saved: (summary: Awaited<ReturnType<typeof studioDatasetApi.create>>) => void;
}, create = studioDatasetApi.create): Promise<void> {
  const { source, parsed } = await readLocalSapJsonSource(file);
  if (!callbacks.current()) return;
  callbacks.apply(parsed);
  if (parsed.outputBlocked) { callbacks.status('Historical sample: read-only local exploration.'); return; }
  if (parsed.format !== 'data') { callbacks.status('Unsaved - legacy JSON formats support local exploration only.'); return; }
  callbacks.status('Saving sample dataset...');
  try {
    const saved = await create(file.name.replace(/\.json$/i, '').slice(0, 160) || 'Sample dataset', file.name, source);
    if (callbacks.current()) { callbacks.saved(saved); callbacks.status('Saved sample dataset'); }
  } catch { if (callbacks.current()) callbacks.status('Unsaved - sample dataset could not be stored. Data is available for local preview.'); }
}
