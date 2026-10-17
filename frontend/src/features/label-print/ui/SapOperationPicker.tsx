import { useState } from 'react';
import { Badge, Button, Field, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { OperationCatalog } from '../../management';

export type SapSelection = { operationId: string; revision: string; batchParameter: string; ready: boolean };
export function SapOperationPicker({ onChange }: { onChange: (selection: SapSelection | null) => void }) {
  const t = useTranslation();
  const [catalog, setCatalog] = useState<OperationCatalog | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const operation = catalog?.operations.find(o => o.operation_id === selected);
  return <div className="label-print-sap-picker">
    <Button variant="compact" disabled={loading} onClick={() => { setLoading(true); setSelected(''); setCatalog(null); setError(''); onChange(null); void import('../../management').then(({ sapRfcApi }) => sapRfcApi.catalog()).then(setCatalog).catch(() => setError('SAP operation configuration is unavailable.')).finally(() => setLoading(false)); }}>{t('Load configured RFC operations')}</Button>
    {error && <p role="alert">{t(error)}</p>}
    {catalog && <><Field label={t('RFC operation')}><Select data-variant="compact" aria-label={t('RFC operation')} value={selected} onChange={e => { setSelected(e.target.value); const op = catalog.operations.find(entry => entry.operation_id === e.target.value); const params = op?.parameters.filter(p => p.source === 'operator') ?? []; onChange(op ? { operationId: op.operation_id, revision: catalog.revision, batchParameter: params[0]?.name ?? '', ready: catalog.runtime_available && op.enabled && op.response_mode === 'label_json' && params.length === 1 && params[0].kind === 'string' } : null); }}><option value="">{t('Select RFC operation')}</option>{catalog.operations.map(o => <option key={o.operation_id} value={o.operation_id} disabled={!o.enabled}>{o.name}{!o.enabled ? ` (${t('Disabled')})` : ''}</option>)}</Select></Field>
      {!catalog.operations.length && <p>{t('No RFC operations configured.')}</p>}
      <Badge tone={catalog.runtime_available ? 'neutral' : 'warning'}>{t(catalog.runtime_available ? 'Available' : 'Unavailable')}</Badge>
      </>}
    <details className="label-print-config-details"><summary>{t('Details')}</summary>
      {catalog && <p>{t(catalog.runtime_available ? 'RFC runtime is available. Get Data will contact the configured SAP target.' : 'SAP RFC runtime is not available. Check server configuration.')}</p>}
      {operation && <><p>{operation.parameters.map(p => `${p.label} (${p.name})`).join(', ')}</p><p>{t('Label Print requires label JSON output and one operator string parameter for batch. Other inputs must be configured constants.')}</p></>}
      <a href="/management?section=integrations">{t('Manage SAP connections and RFC operations')}</a>
    </details>
  </div>;
}
