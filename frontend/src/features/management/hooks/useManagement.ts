import { authFetch as fetch } from '../../../shared/auth/client';
import React from 'react';
import { API_BASE, HttpError } from '../../../shared/api';
import type { PersistedLayoutSummary } from '../../templates';
import { managementApi, type AuditEvent, type Snapshot, type KeyResult } from '../api/managementApi';
import { sections, type Section, type Editor } from '../model/navigation';
import { useTemplatePreview } from '../templates/useTemplatePreview';

function initialSection(): Section { const section = new URLSearchParams(window.location.search).get('section'); return sections.find(s => s.id === section)?.id ?? 'overview'; }

export function useManagement() {
  const [section, setSection] = React.useState<Section>(initialSection);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [templates, setTemplates] = React.useState<PersistedLayoutSummary[]>([]);
  const [audit, setAudit] = React.useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [needsRefresh, setNeedsRefresh] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [issuedKey, setIssuedKey] = React.useState<Pick<KeyResult, 'source' | 'key'> | null>(null);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [search, setSearch] = React.useState('');
  const [services, setServices] = React.useState({ application: false, layouts: false });
  const [checkedAt, setCheckedAt] = React.useState('');
  const locked = React.useRef(false);
  const refreshController = React.useRef<AbortController | null>(null);
  const alive = React.useRef(true);
  const writable = !!snapshot?.writable && !needsRefresh && !saving && !loading && errors.length === 0;
  const policy = snapshot?.document.policy;

  const refresh = React.useCallback(async () => {
    refreshController.current?.abort();
    const controller = new AbortController(); refreshController.current = controller;
    setLoading(true); setErrors([]); setEditor(null); setNeedsRefresh(false); setIssuedKey(null);
    const results = await Promise.allSettled([
      managementApi.snapshot(controller.signal),
      fetch(`${API_BASE}/layouts`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Layout storage is unavailable.'); return response.json() as Promise<PersistedLayoutSummary[]>; }),
      managementApi.audit(controller.signal),
      fetch('/health', { signal: controller.signal }).then(response => response.ok),
    ]);
    if (controller.signal.aborted || !alive.current) return;
    setSnapshot(results[0].status === 'fulfilled' ? results[0].value : null);
    setTemplates(results[1].status === 'fulfilled' ? results[1].value : []);
    setAudit(results[2].status === 'fulfilled' ? results[2].value : []);
    setAuditError(results[2].status === 'rejected');
    setServices({ application: results[3].status === 'fulfilled' && results[3].value, layouts: results[1].status === 'fulfilled' });
    setErrors(results.slice(0, 3).filter(result => result.status === 'rejected').map(result => (result as PromiseRejectedResult).reason instanceof Error ? (result as PromiseRejectedResult).reason.message : 'Unable to load content'));
    setCheckedAt(new Date().toLocaleString()); setLoading(false);
  }, []);
  React.useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; refreshController.current?.abort(); }; }, [refresh]);
  React.useEffect(() => {
    const clearKey = () => setIssuedKey(null);
    const restoredPage = (event: PageTransitionEvent) => { if (event.persisted) clearKey(); };
    window.addEventListener('pagehide', clearKey);
    window.addEventListener('pageshow', restoredPage);
    return () => { window.removeEventListener('pagehide', clearKey); window.removeEventListener('pageshow', restoredPage); };
  }, []);
  const { preview, previewError } = useTemplatePreview(editor);

  function navigate(next: Section) { if (next !== section && !window.dispatchEvent(new Event('management:before-navigate', { cancelable: true }))) return; setSection(next); setEditor(null); setIssuedKey(null); setSearch(''); setMessage(''); const url = new URL(window.location.href); url.searchParams.set('section',next); window.history.replaceState(null, '', url.pathname + url.search); }
  function open(next: Editor) {
    setEditor(next); setMessage(''); setIssuedKey(null);
  }
  async function mutate<T>(action: () => Promise<T>, completed?: (result: T) => void) {
    if (locked.current || !writable) return;
    locked.current = true; setSaving(true); setMessage('');
    try { const result = await action(); await refresh(); if (alive.current) { setMessage('Changes saved.'); completed?.(result); } }
    catch (error) { if (alive.current) { setMessage(error instanceof Error ? error.message : 'Management request failed. Refresh before trying again.'); setNeedsRefresh(!(error instanceof HttpError && error.isInputError)); } }
    finally { locked.current = false; if (alive.current) setSaving(false); }
  }
  const matches = (value: string) => value.toLowerCase().includes(search.toLowerCase());
  const date = (value: string) => new Date(value).toLocaleString();
  const actionsDisabled = !writable;
  return { section, snapshot, templates, audit, auditError, errors, loading, saving, needsRefresh, message, editor, search, services, checkedAt, preview, previewError, writable, policy, refresh, navigate, open, mutate, matches, date, actionsDisabled, setEditor, setSearch, setMessage, issuedKey, setIssuedKey };
}
export type ManagementController = ReturnType<typeof useManagement>;
