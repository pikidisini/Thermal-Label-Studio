import type { ActivityEntry } from '../api/managementApi';

export function activityPrinter(entry: ActivityEntry): string {
  const targets = new Set<string>();
  if (entry.target_id) targets.add(entry.target_id);
  for (const item of entry.items ?? []) {
    if (item.target_id) targets.add(item.target_id);
  }
  if (targets.size) return Array.from(targets).join(', ');
  if (entry.target) return `${entry.target.host}:${entry.target.port}`;
  return '—';
}

// Each recorded item is one batch, regardless of copies. Replay sends nothing new.
export function submittedBatches(entry: ActivityEntry): number | null {
  if (entry.mode !== 'print' || entry.replayed) return 0;
  if (entry.items) return entry.items.filter(item => item.status === 'SUBMITTED').length;
  const submitted = entry.summary?.submitted;
  if (typeof submitted === 'number' && Number.isInteger(submitted) && submitted >= 0) {
    return submitted;
  }
  return null;
}
