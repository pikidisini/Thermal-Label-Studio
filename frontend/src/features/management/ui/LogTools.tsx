import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Input, Select, UI_LAYER, type ControlTone } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';

export function useLogFilters(section: 'audit' | 'activity') {
  const defaults = { q:'', mode:'', status:'', source:'', object:'', action:'', from:'', to:'', page:'1', size:'25' };
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(`${section}_${key}`) ?? value])) as typeof defaults;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(filters)) {
      const name = `${section}_${key}`;
      if (value === defaults[key]) url.searchParams.delete(name); else url.searchParams.set(name, value);
    }
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [filters, section]);
  const update = (key: keyof typeof defaults, value: string) => setFilters(previous => ({...previous, page:'1', [key]:value}));
  const pageSize = filters.size === '50' ? 50 : 25;
  const pageNumber = /^\d{1,3}$/.test(filters.page) ? Math.max(1, Number(filters.page)) : 1;
  return { filters, update, reset: () => setFilters(defaults), pageSize, pageNumber };
}

export function inLogRange(value: string, from: string, to: string) {
  const time = new Date(value).getTime();
  return (!from || time >= new Date(from).getTime()) && (!to || time <= new Date(to).getTime());
}

export function LogTime({ value }: Readonly<{ value: string }>) {
  const t = useTranslation();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>—</>;
  const locale = t('Time') === 'Waktu' ? 'id-ID' : 'en-GB';
  return <time dateTime={value} title={value} className="management-log-time"><span>{date.toLocaleDateString(locale, {day:'2-digit',month:'short',year:'numeric'})}</span><small>{date.toLocaleTimeString(locale, {hour12:false})}</small></time>;
}

export function LogDuration({ value }: Readonly<{ value: number }>) {
  const t = useTranslation();
  const number = (value >= 1000 ? value / 1000 : value).toLocaleString(t('Time') === 'Waktu' ? 'id-ID' : 'en-GB', {maximumFractionDigits:2});
  return <span className="management-log-duration" title={`${value} ms`}>{number} {value >= 1000 ? 's' : 'ms'}</span>;
}

export function CopyValue({ value, compact = false }: Readonly<{ value: string; compact?: boolean }>) {
  const t = useTranslation();
  const [message, setMessage] = useState('');
  useEffect(() => setMessage(''), [value]);
  return <span className="management-log-copy"><code title={value}>{compact && value.length > 18 ? `${value.slice(0,8)}…${value.slice(-6)}` : value}</code><Button variant="compact" aria-label={`${t('Copy')} ${value}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); } catch { setMessage('Copy unavailable'); }
  }}>{t('Copy')}</Button><output >{message && t(message)}</output></span>;
}

export function LogStatus({ value }: Readonly<{ value: string }>) {
  const tones: Record<string, ControlTone> = { UNCERTAIN: 'warning', FAILED: 'danger',
    FAILED_BEFORE_SEND: 'danger', STOPPED: 'danger', PARTIAL: 'warning', ATTENTION: 'warning',
    COMPLETED: 'success', PREVIEWED: 'success', SIMULATED: 'success' };
  const tone = tones[value] ?? 'neutral';
  return <Badge tone={tone}>{value}</Badge>;
}

export function LogRow({ selected, onSelect, children }: Readonly<{ selected: boolean; onSelect: () => void; children: ReactNode }>) {
  return <tr tabIndex={0} aria-selected={selected} data-log-selected={selected} onClick={event => {
    if ((event.target as HTMLElement).closest('button,a,input,select')) return;
    event.currentTarget.focus({preventScroll:true}); onSelect();
  }} onKeyDown={event => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(); }
  }}>{children}</tr>;
}

export function LogRange({ model, children }: Readonly<{ model: ReturnType<typeof useLogFilters>; children?: ReactNode }>) {
  const t = useTranslation();
  const {filters, update} = model;
  return <div className="management-log-filters"><div className="management-log-filter-main">{children}</div><div className="management-log-filter-range">
    <label>{t('From')}<Input type="datetime-local" aria-label={t('From')} value={filters.from} onChange={e => update('from',e.target.value)} /></label>
    <label>{t('Until')}<Input type="datetime-local" aria-label={t('Until')} value={filters.to} min={filters.from || undefined} onChange={e => update('to',e.target.value)} /></label>
    <Button onClick={model.reset}>{t('Reset filters')}</Button>
    <small>{t('Time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
    {filters.from && filters.to && filters.from > filters.to && <span role="alert">{t('The end time must follow the start time.')}</span>}
  </div></div>;
}

export function logPage<T>(entries: T[], model: ReturnType<typeof useLogFilters>) {
  const pages = Math.max(1, Math.ceil(entries.length / model.pageSize));
  const page = Math.min(model.pageNumber, pages);
  return { page, pages, rows: entries.slice((page-1)*model.pageSize,page*model.pageSize) };
}

export function LogPagination({ model, count, loaded }: Readonly<{ model: ReturnType<typeof useLogFilters>; count: number; loaded: number }>) {
  const t = useTranslation();
  const {page, pages} = logPage(new Array(count),model);
  return <div className="management-log-pagination"><output >{t('Showing {count} of {loaded} loaded records', {count,loaded})} · {t('Page {page} of {pages}',{page,pages})}</output><label>{t('Rows per page')} <Select aria-label={t('Rows per page')} value={String(model.pageSize)} onChange={e => model.update('size',e.target.value)}><option>25</option><option>50</option></Select></label><Button disabled={page === 1} onClick={() => model.update('page',String(page-1))}>{t('Previous page')}</Button><Button disabled={page === pages} onClick={() => model.update('page',String(page+1))}>{t('Next page')}</Button></div>;
}

export function LogDrawer({ title, identity, onClose, children }: Readonly<{ title: string; identity: string; onClose: () => void; children: ReactNode }>) {
  const t = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (focused?.matches('tr[data-log-selected]')) returnFocus.current = focused;
  }, [identity]);
  useEffect(() => {
    if (!closing) return;
    let active = true;
    const animations = drawerRef.current?.getAnimations() ?? [];
    // Wait for the exit animation before unmounting. Reduced/zero motion has
    // no running animation; cancellation (e.g. a preference change) also ends it.
    void Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (active) onCloseRef.current();
    });
    return () => { active = false; };
  }, [closing]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    returnFocus.current = previous;
    closeRef.current?.focus({preventScroll:true});
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setClosing(true); } };
    window.addEventListener('keydown',escape);
    return () => { window.removeEventListener('keydown',escape); const target = returnFocus.current; if (target?.isConnected) target.focus({preventScroll:true}); };
  }, []);
  return <dialog open ref={drawerRef} aria-modal="false" aria-label={t(title)} data-ui-motion data-closing={closing} className="management-log-drawer" style={{zIndex:UI_LAYER.flyout}}>
    <div className="management-log-drawer-header"><div><h3>{t(title)}</h3><small className="font-mono">{identity}</small></div><button ref={closeRef} type="button" data-ui-control="button" data-tone="neutral" className="ui-control" disabled={closing} onClick={() => setClosing(true)}>{t('Close')}</button></div>
    <div className="management-log-drawer-body">{children}</div>
  </dialog>;
}
