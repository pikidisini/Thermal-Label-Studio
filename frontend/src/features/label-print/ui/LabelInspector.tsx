import { useState } from 'react';
import { useTranslation } from '../../../shared/i18n';
import { Badge } from '../../../shared/ui/primitives';
import { previewStatus, type LabelPreview } from '../model/labelPreview';
import { PreviewFailure, PreviewSteps } from './PreviewDiagnostics';
import { PrintTabs } from './PrintTabs';

type InspectorTab = 'preview' | 'data' | 'status' | 'detail';
const tabs: Array<{ value: InspectorTab; label: string }> = [
  { value: 'preview', label: 'Preview' }, { value: 'data', label: 'Data' },
  { value: 'status', label: 'Status' }, { value: 'detail', label: 'Details' },
];
export function LabelInspector({ label, demo, language, source, delivery }: Readonly<{
  label?: LabelPreview; demo: boolean; language: string; source: string; delivery?: string;
}>) {
  const t = useTranslation();
  const [tab, setTab] = useState<InspectorTab>('preview');
  let deliveryMessage = 'No print job has been submitted.';
  if (delivery) deliveryMessage = delivery;
  if (demo) deliveryMessage = 'Demo mode: no SAP, protocol renderer, or printer is contacted.';
  const facts = label ? [
    ['Batch', label.batch], ['Label code', label.code ?? (demo ? 'SAMPLE_ROLL' : '—')],
    ['Template version', label.version ?? '—'], ['Data source', t(source)],
    ['Printer language', language],
    ['Resolution', label.dpi ? `${label.dpi} dpi` : '—'],
    ['Image size', label.widthPx && label.heightPx ? `${label.widthPx} × ${label.heightPx} px` : '—'],
  ] : [];
  return <section className="label-print-inspector" aria-label={t('Active label')}>
    <PrintTabs<InspectorTab> id="label-inspector" label="Label information" tabs={tabs} value={tab} onChange={setTab} />
    {tabs.map(item => <div key={item.value} role="tabpanel" id={`label-inspector-panel-${item.value}`} aria-labelledby={`label-inspector-tab-${item.value}`} hidden={tab !== item.value} className="label-print-inspector-panel">
      {!label ? <p className="label-print-empty">{t('Select a gallery preview to inspect a label.')}</p> : <>
        <div className="label-print-inspector-heading"><strong className="label-print-batch">{label.batch}</strong><Badge tone={label.error ? 'danger' : 'neutral'}>{t(previewStatus(label))}</Badge></div>
        {item.value === 'preview' && (label.error ? <PreviewFailure batch={label.batch} code={label.code} error={label.error} failedStage={label.failedStage} notAttempted={label.notAttempted} /> : <><div className="label-print-large-preview"><img src={label.image} alt={t('Large preview for batch {batch}', { batch: label.batch })} /></div><p className="label-print-muted">{t(demo ? 'Illustration only' : 'Decoded payload')} · {language}</p></>)}
        {item.value === 'data' && <><dl className="label-print-facts">{facts.map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl><p className="label-print-muted">{t('The preview response contains output metadata, not the original label field values.')}</p></>}
        {item.value === 'status' && <>{label.error && <PreviewFailure batch={label.batch} code={label.code} error={label.error} failedStage={label.failedStage} notAttempted={label.notAttempted} />}<PreviewSteps key={`${label.id}-${label.batch}`} steps={label.steps} initiallyOpen /><p className="label-print-muted">{t(deliveryMessage)}</p></>}
        {item.value === 'detail' && <dl className="label-print-facts">{[...facts, ['Template SHA-256', label.checksum ?? '—'], ['IPL SHA-256', label.payloadHash ?? '—'], ['Dataset revision', label.datasetRevision ?? '—'], ['RFC operation', label.operationId ?? '—'], ['Configuration revision', label.operationRevision ?? '—'], ['Error code', label.error ?? '—']].map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl>}
      </>}
    </div>)}
  </section>;
}
