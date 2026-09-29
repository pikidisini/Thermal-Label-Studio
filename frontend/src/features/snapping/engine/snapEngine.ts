import type { SnapCandidate, SnapConfig, SnapKind, SnapResult } from '../model/snappingModel';

const priority: Record<SnapKind, number> = { anchor: 0, object: 1, label: 2, grid: 3 };

function gridCandidates(config: SnapConfig): SnapCandidate[] {
  if (!config.gridStep || config.gridStep <= 0) return [];
  const result: SnapCandidate[] = [];
  for (const [axis, extent] of [['x', config.labelWidth], ['y', config.labelHeight]] as const) {
    const nearest = Math.round((axis === 'x' ? config.labelWidth : config.labelHeight) / config.gridStep);
    // The actual grid point near the input is added by resolveSnap; these bounds
    // keep guides meaningful at the label edge without generating a dense list.
    result.push({ axis, value: 0, kind: 'grid' }, { axis, value: nearest * config.gridStep, kind: 'grid' });
    void extent;
  }
  return result;
}

function resolveAxis(value: number, axis: 'x' | 'y', candidates: SnapCandidate[], config: SnapConfig) {
  if (!config.enabled) return { value, guide: undefined, candidates };
  const grid = config.gridStep > 0 ? Math.round(value / config.gridStep) * config.gridStep : value;
  const all = [...candidates, ...gridCandidates(config), ...(config.gridStep > 0 ? [{ axis, value: grid, kind: 'grid' as const }] : [])]
    .filter(candidate => candidate.axis === axis)
    .map(candidate => ({ candidate, distance: Math.abs(candidate.value - value) }))
    .filter(entry => entry.distance <= config.tolerance)
    .sort((a, b) => priority[a.candidate.kind] - priority[b.candidate.kind] || a.distance - b.distance);
  const best = all[0]?.candidate;
  return { value: best?.value ?? value, guide: best && best.kind !== 'grid' ? { axis, value: best.value, label: best.label } : undefined, candidates: all.map(entry => entry.candidate) };
}

/** Resolve independent X/Y snap positions. Behavior is controlled exclusively by enabled. */
export function resolveSnap(point: { x: number; y: number }, candidates: SnapCandidate[], config: SnapConfig): SnapResult {
  const x = resolveAxis(point.x, 'x', candidates, config);
  const y = resolveAxis(point.y, 'y', candidates, config);
  return { point: { x: x.value, y: y.value }, guides: [x.guide, y.guide].filter(Boolean) as SnapResult['guides'], candidates: [...x.candidates, ...y.candidates] };
}
