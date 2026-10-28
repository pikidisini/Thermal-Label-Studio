import { ApplicationHeader } from '../../../shared/ui/ApplicationHeader';
import { useAccount, authFetch as fetch } from '../../../shared/auth/client';

import { PrinterStatusPanel } from './PrinterStatusPanel';
import { SapOperationPicker, type SapSelection } from './SapOperationPicker';
import { ApplicationPageShell } from '../../../shared/ui';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer, LoaderCircle, ScanLine } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';
import { Badge, Button, Field, Input, Select } from '../../../shared/ui/primitives';
import { Icon } from '../../../shared/ui/Icon';
import { demoLabelImage } from '../model/demoLabels';
import { previewDatasetBatches, BatchPreviewRequestError } from '../api/batchPreviewApi';
import { LabelInspector } from './LabelInspector';
import { PrintTabs } from './PrintTabs';
import { deliveryStatus, previewStatus, type LabelPreview } from '../model/labelPreview';
import './label-print.css';
import './split-print.css';
import { BatchEntry } from './BatchEntry';
import { useServerPrint } from './useServerPrint';
import { API_BASE } from '../../../shared/api';
import { getConfiguredPrinters, type ConfiguredPrinter } from '../api/printersApi';



const gallerySizeLabels = { small: 'Small previews', medium: 'Medium previews', large: 'Large previews' };

function sourceLabel(sap: boolean, dataset: boolean, fallback = 'Demo illustrations'): string {
  if (sap) return 'SAP';
  if (dataset) return 'Test Data';
  return fallback;
}

function emptyResultMessage(testData: boolean, demo: boolean): string {
  if (testData) return 'Enter batches from the selected dataset and choose Get Data for server IPL previews.';
  if (demo) return 'Enter batches and choose Get Data to view demo illustrations.';
  return 'Choose an RFC operation and enter batches to prepare SAP previews.';
}

function printerChoiceLabel(loading: boolean, error: string, printers: ConfiguredPrinter[]): string {
  if (loading) return 'Loading registered printers…';
  if (error) return 'Printer list unavailable';
  if (!printers.length) return 'No registered printers';
  if (!printers.some(item => item.enabled)) return 'No enabled printers';
  return 'Select printer';
}

function submitLabel(simulating: boolean, sending: boolean, demo: boolean): string {
  if (simulating) return 'Simulating print…';
  if (sending) return 'Sending…';
  return demo ? 'Simulate print' : 'Print';
}

function retrievalFailure(error: unknown, sap: boolean): string {
  if (sap) return 'SAP preview failed. Check the operation, runtime and server configuration. No retry was made.';
  const fallback = 'Test data preview request failed. Check the server and renderer configuration.';
  if (error instanceof Error && ['Batch limit is 100 per request.', fallback, 'Invalid test data preview response.'].includes(error.message)) return error.message;
  return fallback;
}

function getPrintBlockReason({ serverPrinting, locked, busy, selected, configuredPrinter, validCopies, hasMissingArtifact }: {
  serverPrinting: boolean; locked: boolean; busy: boolean; selected: number; configuredPrinter: boolean;
  validCopies: boolean; hasMissingArtifact: boolean;
}): string {
  if (serverPrinting) return 'Sending from server to printer...';
  if (locked) return 'Printing is locked until the previous job is checked.';
  if (busy) return 'Preparing IPL previews…';
  if (!selected) return 'Select at least one successful label preview.';
  if (!configuredPrinter) return 'Select an enabled registered printer.';
  if (!validCopies) return 'Copies must be an integer from 1 to 999.';
  if (hasMissingArtifact) return 'Preview has no print artifact. Get Data again before printing.';
  return '';
}

function printStatusMessage({ demo, serverMessage, message, labels, sapSource, testData, language, translate }: {
  demo: boolean; serverMessage: string; message: string; labels: LabelPreview[]; sapSource: boolean;
  testData: boolean; language: string; translate: (...args: any[]) => string;
}): string {
  if (!demo && serverMessage) return translate(serverMessage);
  if (message) return translate(message);
  if (!demo && labels.length) {
    return translate('{ready} previews ready; {failed} failed; {skipped} not attempted. No print job was created.', {
      ready: labels.filter(label => !label.error).length,
      failed: labels.filter(label => label.error && !label.notAttempted).length,
      skipped: labels.filter(label => label.notAttempted).length,
    });
  }
  return translate('No print job has been submitted.');
}

function toLabelPreview(item: any): LabelPreview {
  return {
    id: item.index,
    batch: item.batch,
    image: item.png_base64 ? `data:image/png;base64,${item.png_base64}` : '',
    selected: item.status === 'PREVIEWED',
    code: item.label_code ?? undefined,
    version: item.template_version ?? undefined,
    checksum: item.template_sha256 ?? undefined,
    operationId: item.operation_id,
    operationRevision: item.operation_revision,
    datasetRevision: item.dataset_updated_at,
    payloadHash: item.payload_sha256 ?? undefined,
    error: item.error_code ?? undefined,
    widthPx: item.width_px ?? undefined,
    heightPx: item.height_px ?? undefined,
    dpi: item.dpi ?? undefined,
    steps: item.steps,
    failedStage: item.failed_stage,
    notAttempted: item.not_attempted,
    artifact: item.print_artifact ?? undefined,
  };
}

async function requestRemotePreview({
  batches, signal, testData, datasetId, sapSource, sapOperation, current, revision,
  translate, onLabels, onMessage, onBusy,
}: {
  batches: string[]; signal: AbortSignal; testData: boolean; datasetId: string;
  sapSource: boolean; sapOperation: SapSelection | null; current: number; revision: React.MutableRefObject<number>;
  translate: (...args: any[]) => string; onLabels: (labels: LabelPreview[]) => void;
  onMessage: (message: string) => void; onBusy: (busy: boolean) => void;
}): Promise<void> {
  try {
    const results = await previewDatasetBatches(batches, signal, testData ? datasetId : '', sapSource ? sapOperation ?? undefined : undefined);
    if (current !== revision.current) return;
    onLabels(results.map(toLabelPreview));
    onMessage('');
  } catch (error) {
    if (current === revision.current && !signal.aborted && error instanceof BatchPreviewRequestError) {
      onMessage(translate('Preview request failed (HTTP {status}, {code}). No per-batch progress was returned; completed stages cannot be confirmed. No automatic retry was made.', { status: error.status, code: error.code }));
      return;
    }
    if (current === revision.current && !signal.aborted) onMessage(retrievalFailure(error, sapSource));
  } finally {
    if (current === revision.current) onBusy(false);
  }
}

export function LabelPrintPage() {
  const t = useTranslation(); const account = useAccount();
  const serverPrint = useServerPrint();
  const [demo, setDemo] = useState(false);
  const [sapOperation, setSapOperation] = useState<SapSelection | null>(null);
  const [source, setSource] = useState('sap');
  const sapSource = !demo && source === 'sap';
  const testData = !demo && source === 'dataset';
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [datasetId, setDatasetId] = useState('');
  useEffect(() => { if (source !== 'dataset') { return; } let active = true; fetch(`${API_BASE}/studio-sample-datasets`).then(response => { if (!response.ok) { throw new Error("Sample dataset storage is unavailable."); } return response.json(); }).then(value => { if (active) { setDatasets(value); } }).catch(() => { if (active) { setMessage('Sample dataset storage is unavailable.'); } }); return () => { active = false; }; }, [source]);
  const [busy, setBusy] = useState(false);
  const [requestedBatches, setRequestedBatches] = useState<string[]>([]);
  const [demoPrinting, setDemoPrinting] = useState(false);
  const [activeLabelId, setActiveLabelId] = useState<number | null>(null);
  const [gallerySize, setGallerySize] = useState<'small' | 'medium' | 'large'>('medium');
  const [settingsTab, setSettingsTab] = useState<'printer' | 'source'>('printer');
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const operationBusy = busy || serverPrint.printing || demoPrinting;
  const pending = useRef<AbortController | null>(null);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; pending.current?.abort(); }, []);
  const [labels, setLabels] = useState<LabelPreview[]>([]);
  const [printer, setPrinter] = useState('intermec');
  const [configuredPrinters, setConfiguredPrinters] = useState<ConfiguredPrinter[]>([]);
  const [configuredPrinterId, setConfiguredPrinterId] = useState('');
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersError, setPrintersError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const configuredPrinter = configuredPrinters.find(item => item.target_id === configuredPrinterId && item.enabled);
  useEffect(() => {
    if (demo) { return; }
    const controller = new AbortController();
    setPrintersLoading(true); setPrintersError(''); setConfiguredPrinters([]); setConfiguredPrinterId('');
    getConfiguredPrinters(controller.signal).then(printers => { if (!controller.signal.aborted) { setConfiguredPrinters(printers); } })
      .catch(error => { if (!controller.signal.aborted) { setPrintersError(error instanceof Error && error.message === 'Invalid printer configuration response.' ? error.message : 'Configured printers could not be loaded.'); } })
      .finally(() => { if (!controller.signal.aborted) { setPrintersLoading(false); } });
    return () => controller.abort();
  }, [demo, catalogRevision]);
  const [language, setLanguage] = useState('IPL');
  const [connection, setConnection] = useState('Ethernet');
  const [copies, setCopies] = useState('1');
  const [agent, setAgent] = useState(true);
  const [message, setMessage] = useState('');
  const selected = labels.filter(label => label.selected).length;
  const quantity = Number(copies);
  const validCopies = Number.isInteger(quantity) && quantity >= 1 && quantity <= 999;
  const printBlockReason = getPrintBlockReason({ serverPrinting: serverPrint.printing, locked: Boolean(serverPrint.locked),
    busy, selected, configuredPrinter: Boolean(configuredPrinter), validCopies,
    hasMissingArtifact: labels.some(label => label.selected && !label.artifact) });
  function invalidate() { revision.current++; pending.current?.abort(); setBusy(false); setLabels([]); setActiveLabelId(null); setMessage(''); serverPrint.resetView(); }
  async function retrieveRemote(batches: string[]) {
    if (testData && !datasetId) { setMessage('Select a saved test dataset first.'); return; }
    const controller = new AbortController(); pending.current = controller;
    const current = revision.current; setBusy(true);
    await requestRemotePreview({ batches, signal: controller.signal, testData, datasetId, sapSource,
      sapOperation, current, revision, translate: t, onLabels: setLabels, onMessage: setMessage, onBusy: setBusy });
  }
  async function retrieve(batches: string[]) {
    if (operationBusy) { return; }
    invalidate();
    setRequestedBatches(batches);
    if (testData || (sapSource && sapOperation?.ready)) {
      await retrieveRemote(batches);
      return;
    }
    if (!demo) { setMessage('Choose an enabled label RFC operation with an available runtime before Get Data. No request was sent.'); return; }
    setLabels(batches.map((batch, id) => ({ id, batch, image: demoLabelImage(batch), selected: true })));
    setMessage('Demo labels loaded. These images are illustrations, not SAP or IPL/ZPL rendering results.');
  }
  const activeLabel = labels.find(label => label.id === activeLabelId) ?? labels[0];
  const activeOutcome = serverPrint.result?.items.find(item => serverPrint.batches[item.index] === activeLabel?.batch)?.status;
  const activeDelivery = deliveryStatus(activeOutcome);
  const statusMessage = printStatusMessage({ demo, serverMessage: serverPrint.message, message, labels,
    sapSource, testData, language, translate: t });
  return <ApplicationPageShell className="label-print-page">
    <ApplicationHeader testId="label-print-brand-home"><span>Label Print</span></ApplicationHeader>
    <main className="label-print-content label-print-split">
      <div className="label-print-heading"><a href="/" className="application-back"><Icon component={ArrowLeft} />{t('Main menu')}</a><label className="label-print-check"><input type="checkbox" disabled={operationBusy} checked={demo} onChange={event => { setDemo(event.target.checked); setSapOperation(null); setLanguage('IPL'); invalidate(); }} />{t('Demo mode')}</label></div>
      <div className="label-print-layout">
        <section className={`label-print-intake${inputCollapsed ? ' is-collapsed' : ''}`} aria-label={t('Data preparation')}>
          <div className="label-print-intake-heading"><h2>{t('Batch numbers')}</h2><Button variant="compact" aria-expanded={!inputCollapsed} aria-controls="label-print-input" onClick={() => setInputCollapsed(!inputCollapsed)}>{t(inputCollapsed ? 'Show batch table' : 'Collapse input')}</Button></div>
          <fieldset id="label-print-input" disabled={operationBusy} className="label-print-operation-fields label-print-intake-body">
          <BatchEntry busy={operationBusy} retrieving={busy} results={labels} onBatchesChange={invalidate} onRetrieve={retrieve} />
          </fieldset>
        </section>
        <section className={`label-print-results gallery-size-${gallerySize}`} aria-labelledby="label-results-title">
          <div className="label-print-results-heading"><fieldset className="min-w-0 label-print-gallery-sizes"  aria-label={t('Preview size')}>{(['small', 'medium', 'large'] as const).map((size, index) => <Button key={size} variant="compact" selected={gallerySize === size} aria-pressed={gallerySize === size} aria-label={t(gallerySizeLabels[size])} onClick={() => setGallerySize(size)}>{['S', 'M', 'L'][index]}</Button>)}</fieldset><div><h2 id="label-results-title">{t('Label results')}</h2><p>{t('{count} labels', { count: labels.length })}{labels.length > 0 && ` · ${t(sourceLabel(sapSource, testData))} · ${language}`}</p></div>
            <label className="label-print-check"><input type="checkbox" disabled={operationBusy || !labels.some(label => !label.error)} checked={selected > 0 && selected === labels.filter(label => !label.error).length} ref={element => { if (element) { element.indeterminate = selected > 0 && selected < labels.filter(label => !label.error).length; } }} onChange={event => setLabels(labels.map(label => ({ ...label, selected: !label.error && event.target.checked })))} />{t('Select all')}</label><Button variant="compact" disabled={operationBusy || !selected} onClick={() => setLabels(labels.map(label => ({ ...label, selected: false })))}>{t('Clear selection')}</Button>
          </div>
          {demo && <p className="label-print-demo-note">{t('Demo mode: no SAP, protocol renderer, or printer is contacted.')}</p>}
          {testData && <p className="label-print-demo-note">{t('Test Data — real server binding and IPL decode. Print sends the selected test labels to a real printer.')}</p>}
          {busy && <output data-ui-status-block className="label-print-process" ><Icon component={LoaderCircle} className="label-print-spinner" /><div><h2>{t('Preparing IPL previews…')}</h2><p>{t('Waiting for the server response. Results will appear when processing completes.')}</p><p>{t('{count} batches', { count: requestedBatches.length })}</p></div></output>}
          {busy && <div className="label-print-gallery" aria-hidden="true">{requestedBatches.slice(0, 6).map((batch) => <div className="label-print-card label-print-placeholder" key={batch}><span>{batch}</span><div className="label-print-skeleton" /><div className="label-print-skeleton" /></div>)}</div>}
          {!busy && (!labels.length ? <div className="label-print-empty"><Icon component={ScanLine} size={32} /><h2>{t('No label results yet')}</h2><p>{t(emptyResultMessage(testData, demo))}</p></div> :
            <div className="label-print-gallery">{labels.map(label => <article key={label.id} className={`label-print-card${label.selected ? ' is-selected' : ''}${activeLabel?.id === label.id ? ' is-active' : ''}`}>
              <div className="label-print-card-heading"><label className="label-print-check"><input type="checkbox" disabled={operationBusy || !!label.error} checked={label.selected} onChange={event => setLabels(labels.map(item => item.id === label.id ? { ...item, selected: event.target.checked } : item))} /><span className="label-print-batch">{label.batch}</span></label></div>
              <Button variant="compact" className="label-print-thumbnail" aria-pressed={activeLabel?.id === label.id} aria-label={t('Inspect batch {batch}', { batch: label.batch })} onClick={() => setActiveLabelId(label.id)}>
                {label.error ? <span className="label-print-thumbnail-error"><strong>{t(label.notAttempted ? 'Not attempted' : 'Failed')}</strong><span>{label.code ?? label.error}</span></span> : <img src={label.image} alt={t((testData || sapSource) ? 'IPL preview for batch {batch}' : 'Demo label for batch {batch}', { batch: label.batch })} />}
              </Button>
              <div className="label-print-card-footer"><span>{label.code ?? (demo ? 'SAMPLE_ROLL' : '—')}{label.version ? ` · ${label.version}` : ''}</span><Badge tone={label.error ? 'danger' : 'neutral'}>{t(previewStatus(label))}</Badge></div>
            </article>)}</div>)}

          <div className="label-print-message">

          {(serverPrint.printing || demoPrinting) && <output data-ui-status-block className="label-print-process" ><Icon component={LoaderCircle} className="label-print-spinner" /><div><h2>{t(demoPrinting ? 'Simulating print…' : 'Sending from server to printer...')}</h2><p>{t('Waiting for the final response. Per-batch delivery progress is not available.')}</p><p>{t('{count} labels', { count: demoPrinting ? selected : serverPrint.batches.length })} · {t('Copies per label')}: {copies}</p></div></output>}
          {!demo && serverPrint.locked && <div className="label-print-demo-note"><p>{t('Printing is locked until the previous job is checked. Job ID: {id}', { id: serverPrint.locked })}</p><Button disabled={operationBusy} onClick={() => { if (window.confirm(t('Have you checked the printer and previous print results? Clearing this lock permits another deliberate print and can duplicate labels.'))) { serverPrint.unlock(); } }}>{t('Printer checked; allow a new print')}</Button></div>}
          {!demo && serverPrint.result && <div className="label-print-job-results"><p>{t('Job ID: {id}', { id: serverPrint.result.job_id })}</p><ol>{serverPrint.result.items.map(item => <li key={item.index}>{t('Batch {batch}', { batch: serverPrint.batches[item.index] ?? String(item.index + 1) })}: {t(deliveryStatus(item.status) ?? 'Not attempted')}</li>)}</ol></div>}
          {!demo && printBlockReason && <p id="label-print-block-reason" className="label-print-muted">{t(printBlockReason)}</p>}
          <output data-ui-status-block className="label-print-status"  aria-live="polite">{statusMessage}</output>
          </div>
        </section>
        <aside className="label-print-right">
          <LabelInspector label={activeLabel} demo={demo} language={language} source={sourceLabel(!demo && source === 'sap', !demo && source !== 'sap', 'Demo')} delivery={activeDelivery} />
          <section className="label-print-configuration" aria-label={t('Print settings')}>
            <PrintTabs<'printer' | 'source'> id="print-settings" label="Settings tabs" tabs={[{ value: 'printer', label: 'Printer' }, { value: 'source', label: 'Data source' }]} value={settingsTab} onChange={setSettingsTab} />
            <div role="tabpanel" id="print-settings-panel-printer" aria-labelledby="print-settings-tab-printer" hidden={settingsTab !== 'printer'}>
              <fieldset disabled={operationBusy} className="label-print-operation-fields">
          <section className="label-print-settings" aria-labelledby="print-settings-title">
            <h2 className="label-print-settings-title" id="print-settings-title">{t('Print settings')}</h2>
            <Field label={t('Printer')}><Select data-variant="compact" aria-label={t('Printer')} value={demo ? printer : configuredPrinterId} disabled={!demo && (printersLoading || !!printersError || !configuredPrinters.some(item => item.enabled))} onChange={event => { if (demo) { setPrinter(event.target.value); setLanguage(event.target.value === 'intermec' ? 'IPL' : 'ZPL'); } else { setConfiguredPrinterId(event.target.value); setLanguage('IPL'); setConnection('Ethernet'); } setMessage(''); }}>
              {!demo && <><option value="">{t(printerChoiceLabel(printersLoading, printersError, configuredPrinters))}</option>{configuredPrinters.map(item => <option key={item.target_id} value={item.target_id} disabled={!item.enabled}>{item.target_id}{!item.enabled ? ` (${t('Disabled')})` : ''}</option>)}</>}
              {demo && <><option value="intermec">{t('Intermec — Example')}</option><option value="zebra">{t('Zebra — Example')}</option></>}
            </Select></Field>
            {!demo && <>
              <div className="label-print-printer-tools"><Button variant="compact" disabled={operationBusy || printersLoading} onClick={() => { setCatalogRevision(value => value + 1); invalidate(); }}>{t('Refresh printers')}</Button>{account?.role === 'Admin' && <a href="/management?section=printers">{t('Manage printers')}</a>}</div>
              {printersError && <p role="alert">{t(printersError)}</p>}
              {configuredPrinter && <p className="label-print-printer-address">{configuredPrinter.host.includes(':') ? `[${configuredPrinter.host}]` : configuredPrinter.host}:{configuredPrinter.port} · {configuredPrinter.transport}</p>}
              <p className="label-print-muted">{t('Registered and enabled describes configuration only. Use Check status for a device response.')}</p>
              {configuredPrinter && <PrinterStatusPanel key={`${configuredPrinter.target_id}:${configuredPrinter.host}:${configuredPrinter.port}`} printer={configuredPrinter} disabled={operationBusy} />}
            </>}
            <div className="label-print-pair">
              <Field label={t('Printer language')}><Select data-variant="compact" aria-label={t('Printer language')} disabled={!demo} value={demo ? language : 'IPL'} onChange={event => { setLanguage(event.target.value); invalidate(); }}><option>IPL</option><option disabled={testData}>ZPL</option></Select></Field>
              <Field label={t('Printer connection')}><Select data-variant="compact" aria-label={t('Printer connection')} disabled={!demo} value={demo ? connection : 'Ethernet'} onChange={event => { setConnection(event.target.value); setMessage(''); }}><option>Ethernet</option><option>USB</option></Select></Field>
            </div>
            {demo && <><div className="label-print-agent"><span>{t('Local agent')}</span><Badge tone={agent ? 'success' : 'neutral'}>{t(agent ? 'Connected (demo)' : 'Disconnected (demo)')}</Badge></div><Button variant="compact" onClick={() => { setAgent(!agent); setMessage(''); }}>{t(agent ? 'Disconnect demo agent' : 'Connect demo agent')}</Button></>}
            <p className="label-print-muted">{t(demo ? 'Example printers and agent status are simulated.' : 'LAN printing is sent directly by the server. No local agent is required.')}</p>
          </section>
              </fieldset>
          <div className="label-print-submit">
            <Field label={t('Copies per label')}><Input data-variant="compact" disabled={operationBusy} aria-label={t('Copies per label')} type="number" min={1} max={999} step={1} value={copies} onChange={event => { setCopies(event.target.value); setMessage(''); }} /></Field>
            {!validCopies && <p role="alert">{t('Copies must be an integer from 1 to 999.')}</p>}
            <span>{t('{selected} selected × {copies} copies = {total} prints', { selected, copies: validCopies ? quantity : '—', total: validCopies ? selected * quantity : '—' })}</span>
            <Button aria-describedby={!demo ? "label-print-block-reason" : undefined} className="inline-flex items-center gap-2" tone="primary" disabled={operationBusy || !!serverPrint.locked || !selected || !validCopies || (demo ? !agent : busy || !configuredPrinter || labels.some(label => label.selected && !label.artifact))} onClick={async () => { if (operationBusy) { return; } if (demo) { setDemoPrinting(true); try { await new Promise(resolve => setTimeout(resolve, 600)); setMessage(t('Demo: {count} prints prepared via {connection}. Nothing was sent to a printer.', { count: selected * quantity, connection })); } finally { setDemoPrinting(false); } } else if (configuredPrinter) { setMessage(''); void serverPrint.print(configuredPrinter, labels.filter(label => label.selected && label.artifact).map(label => label.artifact!), quantity, labels.filter(label => label.selected).map(label => label.batch)); } }}><Icon component={serverPrint.printing || demoPrinting ? LoaderCircle : Printer} className={serverPrint.printing || demoPrinting ? 'label-print-spinner' : undefined} />{t(submitLabel(demoPrinting, serverPrint.printing, demo))}</Button>
          </div>
            </div>
            <div role="tabpanel" id="print-settings-panel-source" aria-labelledby="print-settings-tab-source" hidden={settingsTab !== 'source'}>
              <fieldset disabled={operationBusy} className="label-print-operation-fields">
                {demo && <p className="label-print-demo-note">{t('Demo mode: no SAP, protocol renderer, or printer is contacted.')}</p>}
          <div className="label-print-source-fields">

          {!demo && <div className="label-print-settings">
            <Field label={t('Data source')}><Select data-variant="compact" aria-label={t('Data source')} value={source} onChange={event => { setSource(event.target.value); setSapOperation(null); setLanguage('IPL'); invalidate(); }}>
              <option value="sap">{t('SAP')}</option><option value="dataset">{t('Test Data')}</option>
            </Select></Field>
            {source === 'dataset' && <><Field label={t('Dataset')}><Select data-variant="compact" aria-label={t('Dataset')} value={datasetId} onChange={event => { setDatasetId(event.target.value); invalidate(); }}><option value="">{t('Select dataset')}</option>{datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</Select></Field><p>{t('Batch matches item_id. Preview uses the saved layout for each label_code.')}</p>{account?.role !== 'Operator' && <a href="/management?section=datasets">{t('Manage test data')}</a>}</>}
          </div>}
          {!demo && source === 'sap' && <SapOperationPicker onChange={selection => { setSapOperation(selection); invalidate(); }} />}
          </div>

              </fieldset>
            </div>
          </section>
        </aside>
      </div>
    </main>
  </ApplicationPageShell>;
}
