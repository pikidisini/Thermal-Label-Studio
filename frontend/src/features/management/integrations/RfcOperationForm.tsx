import { SapField } from './SapField';
import { useState } from 'react';
import { Button, Field, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { sapRfcApi, type RfcOperation, type RfcParameter, type LiveResult } from '../api/sapRfcApi';

export function RfcOperationForm({ initial, existing, management, close }: { initial: RfcOperation; existing: boolean; management: ManagementController; close: () => void }) {
  const t = useTranslation();
  const examples: Record<RfcParameter['kind'], string> = { string: 'DEMO-001', integer: '10', decimal: '0.50', date: '2026-01-31', boolean: 'true', string_list: 'DEMO-001\nDEMO-002' };
  const [value, setValue] = useState(initial);
  const [values, setValues] = useState<Record<string, string>>({});
  const [live, setLive] = useState<LiveResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const disabled = management.actionsDisabled || fetching;
  const responseMode = value.response_mode ?? 'mapping';
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const update = (changes: Partial<RfcOperation>) => { setValue(previous => ({ ...previous, ...changes })); setLive(null); setError(''); };
  const parameter = (index: number, changes: Partial<RfcParameter>) => update({ parameters: value.parameters.map((p, i) => i === index ? { ...p, ...changes } : p) });
  async function fetchFromSap() {
    if (!management.policy) return;
    const missing = initial.parameters.find(p => p.source === 'operator' && p.required && (values[p.name] === undefined || values[p.name] === ''));
    if (missing) { setLive(null); setError(t('Enter a value for {parameter}. Placeholder examples are not submitted.', { parameter: missing.name })); return; }
    setFetching(true); setLive(null); setError('');
    try { setLive(await sapRfcApi.execute(management.policy.revision, initial.operation_id, values)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'SAP request failed. No automatic retry was made.'); }
    finally { setFetching(false); }
  }
  return <form className="management-source-form" onSubmit={event => { event.preventDefault(); if (management.policy) void management.mutate(() => sapRfcApi.operation(management.policy!.revision, value), close); }}>
    <h3>{t(existing ? 'Edit RFC operation' : 'Add RFC operation')}</h3>
    <p className="management-notice">{t('Saving configuration does not verify SAP connectivity. Use Fetch from SAP to check the actual response.')}</p>
    <Button disabled={disabled} onClick={() => { update({ function_name: 'Z_TLS_GET_LABEL_DATA', parameters: [{ name: 'IV_CHARG', label: t('Batch number'), kind: 'string', required: true, source: 'operator', constant: null }], response_mode: 'label_json', json_path: 'EV_JSON', status_path: 'EV_STATUS', success_value: 'S', message_path: 'EV_MESSAGE', result_path: '', result_kind: 'structure' }); setValues({}); }}>{t('Use Z_TLS_GET_LABEL_DATA contract')}</Button>
    <div className="management-fields">
      <SapField label={t('Operation ID')} help={t("Required. Unique application ID for this operation, for example GET_ROLL_LABEL. Use letters, numbers, _ or - (up to 64 characters). This is not the SAP function name.")}><Input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" disabled={disabled || existing} placeholder={t('Example: {value}', { value: 'GET_ROLL_LABEL' })} value={value.operation_id} onChange={e => update({ operation_id: e.target.value })} /></SapField>
      <SapField label={t('Operation name')} help={t("Required. A display name describing the task, for example Get roll label data.")}><Input required maxLength={120} disabled={disabled} placeholder={t('Example: {value}', { value: t('Get roll label data') })} value={value.name} onChange={e => update({ name: e.target.value })} /></SapField>
      <SapField label={t('SAP connection')} help={t("Required to save. Select the connection configured in SAP Connections. It identifies the destination server and client; SAP does not need to be online to save this operation.")}><Select required disabled={disabled} value={value.connection_id} onChange={e => update({ connection_id: e.target.value })}><option value="">{t('Select SAP connection')}</option>{management.snapshot?.document.sap_rfc?.connections.map(c => <option key={c.connection_id} value={c.connection_id}>{c.name}</option>)}</Select></SapField>
      <SapField label={t('Function module name')} help={t("Required. Exact RFC-enabled function module name, for example Z_GET_LABEL_DATA. Up to 30 letters, digits or underscores, starting with a letter or underscore. Confirm the actual name with the ABAP developer; the example is illustrative.")}><Input required pattern="[A-Za-z_][A-Za-z0-9_]{0,29}" disabled={disabled} placeholder={t('Example: {value}', { value: 'Z_TLS_GET_LABEL_DATA' })} value={value.function_name} onChange={e => update({ function_name: e.target.value })} /></SapField>
      <SapField label={t('Configuration')} help={t("Disabled keeps the operation as a draft. Enabled makes it selectable when its SAP connection is also enabled. Both states remain unverified until a real SAP runtime is available.")}><Select disabled={disabled} value={String(value.enabled)} onChange={e => update({ enabled: e.target.value === 'true' })}><option value="false">{t('Disabled')}</option><option value="true">{t('Enabled')}</option></Select></SapField>
    </div>
    <section className="management-source-group"><h3>{t('RFC input parameters')}</h3>
      {value.parameters.map((p, index) => <fieldset key={index} className="management-rfc-fields"><legend>{t('Parameter')} {index + 1}</legend>
        <SapField label={t('SAP parameter name')} help={t("Required. Exact input parameter name expected by the RFC, for example IV_ROLL_NUMBER. Add only parameters in the agreed SAP contract; names must be unique.")}><Input required pattern="[A-Za-z_][A-Za-z0-9_]{0,29}" disabled={disabled} placeholder={t('Example: {value}', { value: 'IV_CHARG' })} value={p.name} onChange={e => parameter(index, { name: e.target.value })} /></SapField>
        <SapField label={t('Display name')} help={t("Required. User-facing name for this input, for example Roll number. Changing it does not change the technical SAP parameter name.")}><Input required maxLength={80} disabled={disabled} placeholder={t('Example: {value}', { value: t('Roll number') })} value={p.label} onChange={e => parameter(index, { label: e.target.value })} /></SapField>
        <SapField label={t('Data type')} help={t("Choose the expected value type: string for text or identifiers with leading zeros; integer for whole numbers; decimal for fractions; date for YYYY-MM-DD; boolean for true/false; string_list for one text value per line.")}><Select disabled={disabled} value={p.kind} onChange={e => parameter(index, { kind: e.target.value as RfcParameter['kind'] })}>{(['string', 'integer', 'decimal', 'date', 'boolean', 'string_list'] as const).map(kind => <option key={kind}>{kind}</option>)}</Select></SapField>
        <SapField label={t('Value source')} help={t("Operator input accepts a value supplied by the user. Constant always uses the value configured here; callers cannot override it.")}><Select disabled={disabled} value={p.source} onChange={e => parameter(index, { source: e.target.value as RfcParameter['source'] })}><option value="operator">{t('Operator input')}</option><option value="constant">{t('Constant')}</option></Select></SapField>
        {p.source === 'constant' && <SapField label={t('Constant value')} help={t("Enter a fixed value matching the selected data type. Examples: PROD for string, 10 for integer, 0.50 for decimal, 2026-10-15 for date, or true for boolean. For lists, enter one value per line.")}>{p.kind === 'string_list' ? <textarea aria-label={t('Constant value')} data-ui-control="input" rows={3} maxLength={4096} disabled={disabled} placeholder={t('Example: {value}', { value: p.name === 'IV_CHARG' ? '0000317326' : examples[p.kind] })} value={p.constant ?? ''} onChange={e => parameter(index, { constant: e.target.value })} /> : <Input maxLength={4096} disabled={disabled} placeholder={t('Example: {value}', { value: p.name === 'IV_CHARG' ? '0000317326' : examples[p.kind] })} value={p.constant ?? ''} onChange={e => parameter(index, { constant: e.target.value })} />}</SapField>}
        <SapField label={t('Required')} help={t("Checked means this value must be provided. For response mappings, a required field must exist and cannot be null or empty; 0 and false are valid values.")}><Input type="checkbox" disabled={disabled} checked={p.required} onChange={e => parameter(index, { required: e.target.checked })} /></SapField>
        <Button disabled={disabled} onClick={() => update({ parameters: value.parameters.filter((_, i) => i !== index) })}>{t('Remove parameter')}</Button>
      </fieldset>)}
      <Button disabled={disabled || value.parameters.length >= 32} onClick={() => update({ parameters: [...value.parameters, { name: '', label: '', kind: 'string', required: true, source: 'operator', constant: null }] })}>{t('Add parameter')}</Button>
      <p className="management-muted">{t('Dates use YYYY-MM-DD. Boolean values use true or false. String lists use one value per line.')}</p>
    </section>
    <section className="management-source-group"><h3>{t('RFC response processing')}</h3>
      <SapField label={t('Response handling')} help={t('JSON label payload reads label_code and data directly. Direct fields preserve a structure or table. Manual mapping is only needed to rename or extract fields.')}><Select disabled={disabled} value={responseMode} onChange={e => { const mode = e.target.value as NonNullable<RfcOperation['response_mode']>; update({ response_mode: mode, mappings: mode === 'mapping' && !value.mappings.length ? [{ source: '', target: '', required: true }] : value.mappings }); }}><option value="label_json">{t('JSON label payload (direct)')}</option><option value="direct">{t('Structure or table (direct)')}</option><option value="mapping">{t('Manual field mapping (advanced)')}</option></Select></SapField>
      {responseMode === 'label_json' && <>
        <p className="management-notice">{t('Read the JSON text, select its label_code and use every field in data without renaming. No field mappings are required.')}</p>
        <div className="management-fields">
          <SapField label={t('JSON export parameter')} help={t('RFC export containing the JSON text. For Z_TLS_GET_LABEL_DATA, use EV_JSON.')}><Input required disabled={disabled} placeholder="EV_JSON" value={value.json_path ?? 'EV_JSON'} onChange={e => update({ json_path: e.target.value })} /></SapField>
          <SapField label={t('Status export parameter')} help={t('Check this RFC status before parsing JSON. For Z_TLS_GET_LABEL_DATA, use EV_STATUS.')}><Input required disabled={disabled} placeholder="EV_STATUS" value={value.status_path ?? 'EV_STATUS'} onChange={e => update({ status_path: e.target.value })} /></SapField>
          <SapField label={t('Success status')} help={t('Only this status permits data processing. Z_TLS_GET_LABEL_DATA returns S on success.')}><Input required maxLength={16} disabled={disabled} placeholder="S" value={value.success_value ?? 'S'} onChange={e => update({ success_value: e.target.value })} /></SapField>
          <SapField label={t('Message export parameter')} help={t('RFC result message parameter. For Z_TLS_GET_LABEL_DATA, use EV_MESSAGE.')}><Input required disabled={disabled} placeholder="EV_MESSAGE" value={value.message_path ?? 'EV_MESSAGE'} onChange={e => update({ message_path: e.target.value })} /></SapField>
        </div>
      </>}
      {responseMode !== 'label_json' && <>
      <div className="management-fields"><SapField label={t('Result path')} help={t("Optional. Location of the result inside the RFC response, for example ET_LABEL_DATA or ES_RESULT.LABELS. Leave blank to use the response root. Use field names separated by dots, without array indexes.")}><Input maxLength={256} disabled={disabled} placeholder="ET_LABEL_DATA" value={value.result_path} onChange={e => update({ result_path: e.target.value })} /></SapField><SapField label={t('Result shape')} help={t("Table means a list of rows, such as ET_LABEL_DATA. Structure means one object, such as ES_LABEL_DATA. Choose the shape that matches the configured result path.")}><Select disabled={disabled} value={value.result_kind} onChange={e => update({ result_kind: e.target.value as RfcOperation['result_kind'] })}><option value="table">{t('Table')}</option><option value="structure">{t('Structure')}</option></Select></SapField></div>
      <p className="management-muted">{t('Use dot-separated field names. Leave the result path empty to map the response root.')}</p>
      </>}
      {responseMode === 'mapping' && <>{value.mappings.map((mapping, index) => <fieldset key={index} className="management-rfc-fields"><legend>{t('Mapping')} {index + 1}</legend>
        <SapField label={t('SAP response field')} help={t("Required. Field within each result row or structure, for example ZZNOMORROLL or MATERIAL.CODE. This path starts inside the selected result, so do not repeat ET_LABEL_DATA here.")}><Input required maxLength={256} disabled={disabled} placeholder={t('Example: {value}', { value: 'ZZNOMORROLL' })} value={mapping.source} onChange={e => update({ mappings: value.mappings.map((m, i) => i === index ? { ...m, source: e.target.value } : m) })} /></SapField>
        <SapField label={t('Label data field')} help={t("Required. Exact destination key used by the label data or template, for example Roll Number. Preserve spelling, spaces and letter case. Each destination key must be unique.")}><Input required maxLength={128} disabled={disabled} placeholder={t('Example: {value}', { value: 'Roll Number' })} value={mapping.target} onChange={e => update({ mappings: value.mappings.map((m, i) => i === index ? { ...m, target: e.target.value } : m) })} /></SapField>
        <SapField label={t('Required')} help={t("Checked means this value must be provided. For response mappings, a required field must exist and cannot be null or empty; 0 and false are valid values.")}><Input type="checkbox" disabled={disabled} checked={mapping.required} onChange={e => update({ mappings: value.mappings.map((m, i) => i === index ? { ...m, required: e.target.checked } : m) })} /></SapField>
        <Button disabled={disabled || value.mappings.length <= 1} onClick={() => update({ mappings: value.mappings.filter((_, i) => i !== index) })}>{t('Remove mapping')}</Button>
      </fieldset>)}
      <Button disabled={disabled || value.mappings.length >= 64} onClick={() => update({ mappings: [...value.mappings, { source: '', target: '', required: true }] })}>{t('Add mapping')}</Button></>}
    </section>
    <div className="management-tools"><Button tone="primary" type="submit" disabled={disabled || !value.connection_id}>{t('Save changes')}</Button><Button disabled={fetching || management.saving} onClick={close}>{t('Cancel')}</Button>{existing && <Button tone="danger" disabled={disabled} onClick={() => setDeleting(true)}>{t('Delete RFC operation')}</Button>}</div>
    {deleting && <div className="management-notice"><Field label={t('Type the ID to confirm')}><Input disabled={disabled} placeholder={initial.operation_id} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field><Button tone="danger" disabled={disabled || confirmation !== initial.operation_id} onClick={() => management.policy && void management.mutate(() => sapRfcApi.remove(management.policy!.revision, 'operations', initial.operation_id), close)}>{t('Confirm delete')}</Button><Button disabled={disabled} onClick={() => setDeleting(false)}>{t('Cancel deletion')}</Button></div>}
    {existing && <section className="management-source-group"><h3>{t('Test RFC operation')}</h3>
      <p>{t('Enter a batch and fetch the actual response using the saved SAP connection. This calls SAP; it does not render or print labels.')}</p>
      {initial.parameters.filter(p => p.source === 'operator').map(p => <Field key={p.name} label={`${p.label} (${p.name})`}>{p.kind === 'string_list' ? <textarea aria-label={`${p.label} (${p.name})`} data-ui-control="input" rows={3} disabled={disabled || dirty} placeholder={t('Example: {value}', { value: p.name === 'IV_CHARG' ? '0000317326' : examples[p.kind] })} value={values[p.name] ?? ''} onChange={e => { setValues(previous => ({ ...previous, [p.name]: e.target.value })); setLive(null); setError(''); }} /> : <Input disabled={disabled || dirty} placeholder={t('Example: {value}', { value: p.name === 'IV_CHARG' ? '0000317326' : examples[p.kind] })} value={values[p.name] ?? ''} onChange={e => { setValues(previous => ({ ...previous, [p.name]: e.target.value })); setLive(null); setError(''); }} />}</Field>)}
      <div className="management-tools"><Button tone="primary" disabled={disabled || dirty || !initial.enabled || !management.snapshot?.document.sap_rfc?.connections.find(c => c.connection_id === initial.connection_id)?.enabled} onClick={() => void fetchFromSap()}>{t(fetching ? 'Fetching from SAP…' : 'Fetch from SAP')}</Button></div>
      {(!initial.enabled || !management.snapshot?.document.sap_rfc?.connections.find(c => c.connection_id === initial.connection_id)?.enabled) && <p>{t('Enable the SAP connection and RFC operation before fetching data.')}</p>}
      {dirty && <p>{t('Save changes before calling SAP.')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {live && <div className="management-source-group"><p role="status">{t('Actual SAP response received. No label was printed.')} · {live.target.system_id} / {live.target.client}</p><pre className="management-rfc-result">{JSON.stringify(live.items ?? live.rows, null, 2)}</pre><details><summary>{t('Raw RFC response')}</summary><pre className="management-rfc-result">{JSON.stringify(live.response, null, 2)}</pre></details></div>}

    </section>}
  </form>;
}
