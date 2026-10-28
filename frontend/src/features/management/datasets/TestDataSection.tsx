import { authFetch as fetch } from '../../../shared/auth/client';
import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../../shared/api';
import { useTranslation } from '../../../shared/i18n';
import { Button, Field, Input, Select } from '../../../shared/ui/primitives';
import './test-data.css';

type Scalar = string | number | boolean | null;
type Item = { item_id: string; label_code: string; copies: number; data: Record<string, Scalar> };
type Payload = { sender: { system: string }; request_id: string; mode: string; items: Item[]; field_descriptions?: Record<string, string> };
type Dataset = { id: string; name: string; original_filename: string; updated_at: string; payload: Payload };
const initial = (): Payload => ({ sender: { system: 'TEST_DATA' }, request_id: 'test-data', mode: 'simulation', items: [{ item_id: '0010245801', label_code: '', copies: 1, data: {} }] });

function scalarType(value: Scalar): string {
  return value === null ? 'null' : typeof value;
}

function emptyScalar(type: string): Scalar {
  if (type === 'null') return null;
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  return '';
}

function scalarText(value: Scalar): string {
  if (value === null) return 'null';
  return typeof value === 'string' ? value : String(value);
}

function NumberValue({ value, label, disabled, onChange, onValidity }: Readonly<{ value: number; label: string; disabled: boolean; onChange: (value: number) => void; onValidity: (valid: boolean) => void }>) {
  const [raw, setRaw] = useState(String(value));
  const validity = useRef(onValidity); validity.current = onValidity;
  useEffect(() => { setRaw(String(value)); }, [value]);
  useEffect(() => () => validity.current(true), []);
  return <Input aria-label={label} disabled={disabled} inputMode="decimal" value={raw} onChange={event => {
    const text = event.target.value; setRaw(text);
    const valid = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text)) && (!Number.isInteger(Number(text)) || Math.abs(Number(text)) <= Number.MAX_SAFE_INTEGER);
    onValidity(valid); if (valid) { onChange(Number(text)); }
  }} />;
}

async function checked(response: Response) {
  if (!response.ok) { throw new Error(response.status === 409 ? 'Dataset changed. Reload before saving.' : 'Dataset request failed. Reload to verify before retrying.'); }
  return response.json();
}

export function TestDataSection() {
  const t = useTranslation();
  const [list, setList] = useState<Array<Omit<Dataset, 'payload'>>>([]);
  const [current, setCurrent] = useState<Dataset | null>(null);
  const [name, setName] = useState('');
  const [payload, setPayload] = useState<Payload>(initial);
  const [selected, setSelected] = useState(0);
  const [field, setField] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [invalidNumbers, setInvalidNumbers] = useState<Record<string, boolean>>({});
  const invalid = Object.values(invalidNumbers).some(Boolean);
  const file = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const item = payload.items[selected];
  useEffect(() => { let active = true; fetch(`${API_BASE}/studio-sample-datasets`).then(checked).then(value => { if (active) { setList(value); } }).catch(() => { if (active) { setMessage('Sample dataset storage is unavailable.'); } }); return () => { active = false; revision.current++; }; }, []);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  useEffect(() => { const guard = (event: Event) => { if (busy || (dirty && !window.confirm(t('Discard unsaved dataset changes?')))) { event.preventDefault(); } }; window.addEventListener('management:before-navigate', guard); return () => window.removeEventListener('management:before-navigate', guard); }, [dirty, busy, t]);
  function change(next: Payload) { setPayload(next); setDirty(true); setMessage(''); }
  function editItem(next: Item) { change({ ...payload, items: payload.items.map((entry, i) => i === selected ? next : entry) }); }
  function renderValueEditor(value: Scalar, key: string) {
    if (typeof value === 'boolean') {
      return <Select aria-label={`${t('Value')} ${key}`} disabled={busy} value={String(value)} onChange={event => editItem({ ...item!, data: { ...item!.data, [key]: event.target.value === 'true' } })}><option>true</option><option>false</option></Select>;
    }
    if (typeof value === 'number') {
      return <NumberValue value={value} label={`${t('Value')} ${key}`} disabled={busy} onChange={next => editItem({ ...item!, data: { ...item!.data, [key]: next } })} onValidity={valid => { if (!valid) { setDirty(true); } setInvalidNumbers(previous => ({ ...previous, [`${selected}:${key}`]: !valid })); }} />;
    }
    return <Input aria-label={`${t('Value')} ${key}`} disabled={busy || value === null} value={scalarText(value)} onChange={event => { const next = typeof value === 'number' ? Number(event.target.value) : event.target.value; if (typeof next === 'number' && (!event.target.value.trim() || !Number.isFinite(next))) { return; } editItem({ ...item!, data: { ...item!.data, [key]: next } }); }} />;
  }
  const mayDiscard = () => !dirty || window.confirm(t('Discard unsaved dataset changes?'));
  async function open(id: string) {
    if (!mayDiscard()) { return; }
    const version = ++revision.current; setBusy(true);
    try { const data = await fetch(`${API_BASE}/studio-sample-datasets/${encodeURIComponent(id)}`).then(checked); if (version !== revision.current) { return; } setCurrent(data); setName(data.name); setPayload(data.payload); setSelected(0); setDirty(false); setUncertain(false); setMessage(''); }
    catch { if (version === revision.current) { setMessage('Sample dataset storage is unavailable.'); } }
    finally { if (version === revision.current) { setBusy(false); } }
  }
  async function save() {
    if (invalid) { return; }
    setBusy(true); setMessage('');
    try {
      const datasetPath = current ? '/' + current.id : '';
      const response = await fetch(`${API_BASE}/studio-sample-datasets${datasetPath}`, { method: current ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, original_filename: current?.original_filename ?? 'test-data.json', payload, ...(current ? { expected_updated_at: current.updated_at } : {}) }) });
      if (response.status === 422 || response.status === 413) { setMessage('Invalid dataset. Check batch identifiers, label codes, types and size.'); return; }
      if (response.status === 409) { setMessage('Dataset changed. Reload before saving.'); setUncertain(true); return; }
      const saved = await checked(response); setCurrent({ ...saved, payload }); setDirty(false);
      setList(previous => [saved, ...previous.filter(entry => entry.id !== saved.id)]);
      setMessage('Dataset saved.');
    } catch { setUncertain(true); setMessage('Dataset request failed. Reload to verify before retrying.'); }
    finally { setBusy(false); }
  }
  async function importFile(input: File) {
    if (!mayDiscard()) { return; }
    try {
      if (input.size > 2 * 1024 * 1024) { throw new Error("Imported dataset is invalid or too large."); }
      const parsed = JSON.parse(await input.text());
      if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length || parsed.items.length > 100 || parsed.items.some((entry: Item) => !entry || typeof entry.item_id !== 'string' || typeof entry.label_code !== 'string' || !entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data) || Object.values(entry.data).some(value => value !== null && !['string', 'number', 'boolean'].includes(typeof value)))) { throw new Error("Imported dataset is invalid or too large."); }
      change(parsed); setSelected(0);
    } catch { setMessage('Invalid dataset. Check batch identifiers, label codes, types and size.'); }
  }
  return <section className="test-data-section">
    <p>{t('Test data only. Batch is item_id; label_code resolves a saved Studio layout. Field names must match template bindings.')}</p>
    <div className="test-data-toolbar">
      <Field label={t('Dataset')}><Select aria-label={t('Dataset')} disabled={busy} value={current?.id ?? ''} onChange={event => { if (event.target.value) { void open(event.target.value); } }}><option value="">{t('New dataset')}</option>{list.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select></Field>
      <Button disabled={busy} onClick={() => { if (mayDiscard()) { revision.current++; setCurrent(null); setName(''); setPayload(initial()); setSelected(0); setDirty(false); setUncertain(false); setMessage(''); } }}>{t('New dataset')}</Button>
      {current && <Button disabled={busy} onClick={() => void open(current.id)}>{t('Reload dataset')}</Button>}
    </div>
    <Field label={t('Dataset name')}><Input aria-label={t('Dataset name')} maxLength={160} disabled={busy} value={name} onChange={event => { setName(event.target.value); setDirty(true); }} /></Field>
    <div className="test-data-columns">
      <div className="test-data-table"><table><thead><tr><th>{t('Batch')}</th><th>{t('Label code')}</th><th /></tr></thead><tbody>{payload.items.map((entry, index) => <tr key={`${entry.item_id}:${entry.label_code}`} aria-selected={selected === index}>
        <td><Input aria-label={t('Batch row {row}', { row: index + 1 })} disabled={busy} value={entry.item_id} onFocus={() => setSelected(index)} onChange={event => change({ ...payload, items: payload.items.map((value, i) => i === index ? { ...value, item_id: event.target.value } : value) })} /></td>
        <td><Input aria-label={t('Label code row {row}', { row: index + 1 })} disabled={busy} value={entry.label_code} onFocus={() => setSelected(index)} onChange={event => change({ ...payload, items: payload.items.map((value, i) => i === index ? { ...value, label_code: event.target.value } : value) })} /></td>
        <td><Button disabled={busy} onClick={() => setSelected(index)}>{t('Details')}</Button><Button disabled={busy || payload.items.length === 1} aria-label={t('Delete row {row}', { row: index + 1 })} onClick={() => { change({ ...payload, items: payload.items.filter((_, i) => i !== index) }); setSelected(0); }}>×</Button></td>
      </tr>)}</tbody></table><Button disabled={busy || payload.items.length >= 100} onClick={() => { change({ ...payload, items: [...payload.items, { item_id: '', label_code: '', copies: 1, data: {} }] }); setSelected(payload.items.length); }}>{t('Add batch')}</Button></div>
      {item && <div><h3>{t('Fields for batch')} {item.item_id}</h3><div className="test-data-table"><table><thead><tr><th>{t('Field')}</th><th>{t('Type')}</th><th>{t('Value')}</th><th /></tr></thead><tbody>{Object.entries(item.data).map(([key, value]) => <tr key={key}><td>{key}</td><td><Select aria-label={`${t('Type')} ${key}`} disabled={busy} value={scalarType(value)} onChange={event => editItem({ ...item, data: { ...item.data, [key]: emptyScalar(event.target.value) } })}><option>string</option><option>number</option><option>boolean</option><option>null</option></Select></td><td>{renderValueEditor(value, key)}</td><td><Button aria-label={`${t('Delete field')} ${key}`} disabled={busy} onClick={() => { const data = { ...item.data }; delete data[key]; editItem({ ...item, data }); }}>×</Button></td></tr>)}</tbody></table></div>
        <div className="test-data-toolbar"><Input aria-label={t('New field name')} disabled={busy} value={field} onChange={event => setField(event.target.value)} /><Button disabled={busy || !/^[A-Za-z0-9_-]{1,128}$/.test(field) || ['__proto__', 'constructor', 'prototype'].includes(field) || Object.prototype.hasOwnProperty.call(item.data, field)} onClick={() => { editItem({ ...item, data: { ...item.data, [field]: '' } }); setField(''); }}>{t('Add field')}</Button></div>
      </div>}
    </div>
    <details><summary>{t('JSON preview')}</summary><pre className="test-data-json">{JSON.stringify(payload, null, 2)}</pre></details>
    <div className="test-data-toolbar"><input type="file" accept=".json,application/json" hidden ref={file} onChange={event => { const selectedFile = event.target.files?.[0]; if (selectedFile) { void importFile(selectedFile); } event.target.value = ''; }} /><Button disabled={busy} onClick={() => file.current?.click()}>{t('Import JSON')}</Button>
      <Button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'test-data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t('Export JSON')}</Button>
      <Button tone="primary" disabled={busy || uncertain || invalid || !dirty || !name.trim()} onClick={() => void save()}>{t('Save changes')}</Button><span>{t(dirty ? 'Unsaved changes' : 'No unsaved changes')}</span>
    </div>
    {invalid && <p role="alert">{t('Enter a valid finite number before saving.')}</p>}
    {message && <output data-ui-status-block  >{t(message)}</output>}
  </section>;
}
