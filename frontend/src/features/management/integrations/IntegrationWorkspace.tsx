import { useState } from 'react';
import { Button } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import type { SapConnection, RfcOperation } from '../api/sapRfcApi';
import { AddSourceButton, IntegrationsSection } from './IntegrationsSection';
import { SapConnectionForm } from './SapConnectionForm';
import { RfcOperationForm } from './RfcOperationForm';
import './sap-rfc.css';

type Tab = 'API Sources' | 'SAP Connections' | 'RFC Operations';
export function IntegrationWorkspace({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const [tab, setTab] = useState<Tab>('API Sources');
  const [connection, setConnection] = useState<SapConnection | null>(null);
  const [operation, setOperation] = useState<RfcOperation | null>(null);
  const [existing, setExisting] = useState(false);
  const config = management.snapshot?.document.sap_rfc ?? { connections: [], operations: [] };
  const close = () => { setConnection(null); setOperation(null); };
  return <>
    <div className="management-tools" role="tablist" aria-label={t('Integration type')}>{(['API Sources', 'SAP Connections', 'RFC Operations'] as const).map(name => <Button key={name} variant="tab" selected={tab === name} role="tab" aria-selected={tab === name} disabled={management.saving} onClick={() => { setTab(name); close(); management.setEditor(null); management.setIssuedKey(null); }}>{t(name)}</Button>)}</div>
    {tab === 'API Sources' && <><div className="management-tools"><AddSourceButton management={management} /></div><IntegrationsSection management={management} /></>}
    {tab !== 'API Sources' && <p className="management-notice">{t('Saving configuration does not contact SAP. Fetch from SAP explicitly calls the saved RFC when the server connector is enabled.')}</p>}
    {tab === 'SAP Connections' && <><div className="management-tools"><Button tone="primary" disabled={management.actionsDisabled} onClick={() => { setExisting(false); setConnection({ connection_id: '', name: '', host: '', system_number: '00', client: '', username: '', language: 'EN', enabled: false }); }}>{t('Add SAP connection')}</Button></div>
      <div className="management-integration-columns"><section className="management-source-list management-sap-list" aria-label={t('SAP Connections')}>{config.connections.map(c => <Button key={c.connection_id} className="management-source-row" disabled={management.saving} onClick={() => { setExisting(true); setConnection(c); }}><strong>{c.name}</strong><span>{c.connection_id} · {c.host} · {c.client}</span><small>{t('Not verified with SAP')}</small></Button>)}{!config.connections.length && <p>{t('No SAP connections configured.')}</p>}</section>
      <section className="management-source-detail">{connection && <SapConnectionForm key={`${existing}-${connection.connection_id}`} initial={connection} existing={existing} management={management} close={close} />}</section></div></>}
    {tab === 'RFC Operations' && <><div className="management-tools"><Button tone="primary" disabled={management.actionsDisabled} onClick={() => { setExisting(false); setOperation({ operation_id: '', name: '', connection_id: config.connections[0]?.connection_id ?? '', function_name: 'Z_TLS_GET_LABEL_DATA', enabled: false, parameters: [{ name: 'IV_CHARG', label: t('Batch number'), kind: 'string', required: true, source: 'operator', constant: null }], response_mode: 'label_json', json_path: 'EV_JSON', status_path: 'EV_STATUS', success_value: 'S', message_path: 'EV_MESSAGE', result_path: '', result_kind: 'structure', mappings: [] }); }}>{t('Add RFC operation')}</Button></div>
      {!config.connections.length && <p>{t('You can configure an RFC operation now. Add a SAP connection before saving it; a live SAP connection is not required.')}</p>}
      <div className="management-integration-columns"><section className="management-source-list management-sap-list" aria-label={t('RFC Operations')}>{config.operations.map(o => <Button key={o.operation_id} className="management-source-row" disabled={management.saving} onClick={() => { setExisting(true); setOperation(o); }}><strong>{o.name}</strong><span>{o.function_name} · {o.connection_id}</span><small>{t(o.enabled ? 'Not verified with SAP' : 'Draft')}</small></Button>)}{!config.operations.length && <p>{t('No RFC operations configured.')}</p>}</section>
      <section className="management-source-detail">{operation && <RfcOperationForm key={`${existing}-${operation.operation_id}`} initial={operation} existing={existing} management={management} close={close} />}</section></div></>}
  </>;
}
