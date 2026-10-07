export type SnapAxis = 'x' | 'y';
export type SnapKind = 'anchor' | 'object' | 'label' | 'grid';

export interface SnapCandidate { axis: SnapAxis; value: number; kind: SnapKind; label?: string }
export interface SnapGuide { axis: SnapAxis; value: number; label?: string }
export interface SnapConfig { enabled: boolean; tolerance: number; gridStep: number; labelWidth: number; labelHeight: number; margin: number }
export interface SnapResult { point: { x: number; y: number }; guides: SnapGuide[]; candidates: SnapCandidate[] }
