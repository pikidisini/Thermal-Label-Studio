import type * as fabric from 'fabric';
import { CANVAS_SERIALIZE_PROPS } from '../../../types/fabric-custom';

export const EDITOR_DRAFT_VERSION = 1;
export const EDITOR_DRAFT_PREFIX = 'thermal-label-studio:editor-draft:';

export interface EditorDraft {
  version: number;
  userId: string;
  savedAt: number;
  templateId: string;
  widthMm: number;
  heightMm: number;
  viewMode: 'design' | 'preview';
  canvas: Record<string, unknown>;
}

export function editorDraftKey(userId: string): string {
  return `${EDITOR_DRAFT_PREFIX}${encodeURIComponent(userId)}`;
}

export function serializeEditorDraft(canvas: fabric.Canvas, input: Omit<EditorDraft, 'version' | 'savedAt' | 'canvas'>): string {
  const liveObjects = canvas.getObjects();
  const serialized = canvas.toObject([...CANVAS_SERIALIZE_PROPS]) as unknown as { objects?: Array<Record<string, unknown>> };
  if (Array.isArray(serialized.objects)) serialized.objects = serialized.objects.filter((_object, index) => {
    const live = liveObjects[index] as any;
    return live?.isLineDrawingPreview !== true;
  });
  return JSON.stringify({
    ...input,
    version: EDITOR_DRAFT_VERSION,
    savedAt: Date.now(),
    canvas: serialized,
  });
}

export function parseEditorDraft(raw: string | null, userId: string): EditorDraft | null {
  if (!raw || raw.length > 5 * 1024 * 1024) return null;
  try {
    const value = JSON.parse(raw) as Partial<EditorDraft>;
    if (value.version !== EDITOR_DRAFT_VERSION || value.userId !== userId || !value.canvas || typeof value.canvas !== 'object') return null;
    if (typeof value.templateId !== 'string' || !Number.isFinite(value.widthMm) || !Number.isFinite(value.heightMm) || value.widthMm <= 0 || value.heightMm <= 0) return null;
    if (value.viewMode !== 'design' && value.viewMode !== 'preview') return null;
    const objects = (value.canvas as { objects?: unknown }).objects;
    if (objects !== undefined && !Array.isArray(objects)) return null;
    if (Array.isArray(objects)) {
      if (objects.length > 1000) return null;
      for (const item of objects) {
        if (!item || typeof item !== 'object') return null;
        const object = item as Record<string, unknown>;
      }
    }
    return value as EditorDraft;
  } catch { return null; }
}

export function clearEditorDraft(userId: string): void {
  try { window.sessionStorage.removeItem(editorDraftKey(userId)); } catch { /* storage may be unavailable */ }
}
