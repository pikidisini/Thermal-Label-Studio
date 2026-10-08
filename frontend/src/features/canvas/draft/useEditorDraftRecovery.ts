import { useCallback, useEffect, useRef, useState } from 'react';
import type * as fabric from 'fabric';
import { parseEditorDraft, serializeEditorDraft, editorDraftKey, clearEditorDraft, type EditorDraft } from './editorDraftRecovery';
import { useHistoryStore } from '../../../store/useHistoryStore';

export function useEditorDraftRecovery(userId: string | null, canvasRef: React.MutableRefObject<fabric.Canvas | null>, meta: { templateId: string; widthMm: number; heightMm: number; viewMode: 'design' | 'preview' }) {
  const restoredRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const hydratingRef = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const [status, setStatus] = useState<'idle' | 'saved' | 'restored' | 'quota'>('idle');

  const persist = useCallback(() => {
    if (!userId || !canvasRef.current) return;
    if (hydratingRef.current) return;
    try {
      window.sessionStorage.setItem(editorDraftKey(userId), serializeEditorDraft(canvasRef.current, { userId, templateId: metaRef.current.templateId, widthMm: metaRef.current.widthMm, heightMm: metaRef.current.heightMm, viewMode: metaRef.current.viewMode }));
      setStatus('saved');
    } catch { setStatus('quota'); }
  }, [canvasRef, userId]);

  const schedule = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(persist, 350);
    // Keep the latest edit safe even if the tab is reloaded before the debounce fires.
    persist();
  }, [persist]);

  const restore = useCallback((canvas: fabric.Canvas, onComplete?: (draft: EditorDraft) => void): EditorDraft | null => {
    if (restoredRef.current || !userId) return null;
    restoredRef.current = true;
    let draft: EditorDraft | null = null;
    try { draft = parseEditorDraft(window.sessionStorage.getItem(editorDraftKey(userId)), userId); } catch { draft = null; }
    if (draft) {
      hydratingRef.current = true;
      useHistoryStore.getState().lockHistory();
      try {
        void canvas.loadFromJSON(draft.canvas).then(() => {
          canvas.renderAll();
          setStatus('restored');
          onComplete?.(draft);
          hydratingRef.current = false;
          useHistoryStore.getState().unlockHistory();
        }).catch(() => { hydratingRef.current = false; useHistoryStore.getState().unlockHistory(); setStatus('idle'); });
      } catch (error) {
        hydratingRef.current = false;
        useHistoryStore.getState().unlockHistory();
        throw error;
      }
    }
    return draft;
  }, [userId]);

  useEffect(() => {
    const onPageHide = () => persist();
    window.addEventListener('pagehide', onPageHide);
    return () => { window.removeEventListener('pagehide', onPageHide); if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, [persist]);

  const discard = useCallback(() => { if (userId) clearEditorDraft(userId); setStatus('idle'); }, [userId]);
  return { restore, schedule, persist, discard, status };
}
