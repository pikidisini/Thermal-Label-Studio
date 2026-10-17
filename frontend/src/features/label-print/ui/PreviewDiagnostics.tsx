import { useTranslation } from '../../../shared/i18n';
import type { PreviewStage, PreviewStep } from '../api/batchPreviewApi';

const names: Record<PreviewStage, string> = {
  FETCH_DATA: 'Retrieve data', VALIDATE_DATA: 'Validate label data', RESOLVE_LAYOUT: 'Find saved layout',
  BIND_TEMPLATE: 'Bind data to template', RASTERIZE: 'Render bitmap', ENCODE_IPL: 'Encode IPL',
  DECODE_IPL: 'Decode IPL to PNG', ACCEPT_PREVIEW: 'Accept preview',
};
const reasons: Record<string, [string, string]> = {
  layout_not_found: ['Saved layout for label code "{code}" was not found.', 'Save a layout in Label Studio using this exact label code, then try again.'],
  layout_unavailable: ['The saved layout could not be read.', 'Check template storage and the saved SVG artifact.'],
  batch_not_found: ['Batch not found in test data.', 'Check the batch against item_id in the selected dataset.'],
  binding_failed: ['Template admission or data binding failed.', 'Check template binding fields, required data and media dimensions.'],
  renderer_unavailable: ['The server could not render the bound SVG.', 'Check the server renderer installation and supported SVG content.'],
  sap_status_failed: ['SAP returned a failure status.', 'Check the batch and the RFC business validation in SAP.'],
  sap_response_invalid: ['The RFC returned data that does not match the label contract.', 'Check status mapping, label JSON and the requirement for one label per batch.'],
  sap_timeout: ['The RFC call timed out; its outcome is unknown.', 'Check SAP connectivity before making another request. No automatic retry was made.'],
  sap_logon_failed: ['SAP logon failed.', 'Check the configured SAP credentials and client.'],
  sap_communication_failed: ['Communication with SAP failed; its outcome may be unknown.', 'Check SAP connectivity before making another request. No automatic retry was made.'],
  sap_runtime_unavailable: ['The native RFC runtime is unavailable.', 'Check the server RFC runtime configuration.'],
  sap_execution_not_allowed: ['The server does not allow this SAP target or function.', 'Check the server target and function allowlists.'],
  management_conflict: ['Configuration changed during this request. These results cannot be used.', 'Reload the configured RFC operations before making another request.'],
};

export function PreviewFailure({ batch, code, error, failedStage, notAttempted }: { batch: string; code?: string; error: string; failedStage?: PreviewStage | null; notAttempted?: boolean }) {
  const t = useTranslation();
  const [reason, action] = reasons[error] ?? ['Label preparation failed at the stage shown below.', 'Check the error code and the configuration for this stage.'];
  return <div className="label-print-failure" role="alert">
    <strong>{t('Batch {batch}', { batch })} — {t(notAttempted ? 'Not attempted' : failedStage ? 'Failed at: {stage}' : 'Failed', { stage: failedStage ? t(names[failedStage]) : '' })}</strong>
    <p>{t(reason, { code: code ?? '?' })}</p>
    <details className="label-print-failure-detail"><summary>{t('Details')}</summary>
      {notAttempted && <p>{t('This batch was not processed because an earlier batch stopped further requests.')}</p>}
      <p>{t(action)}</p><p>{t('Error code')}: <code>{error}</code>{code && <> · {t('Label code')}: <code>{code}</code></>}</p>
    </details>
  </div>;
}

export function PreviewSteps({ steps, initiallyOpen = false }: { steps?: PreviewStep[]; failed: boolean; initiallyOpen?: boolean }) {
  const t = useTranslation();
  return <details className="label-print-progress" open={initiallyOpen}>
    <summary>{t('Processing steps')}</summary>
    {!steps?.length ? <p>{t('Stage information is unavailable for this response.')}</p> : <ol>{steps.map(step => <li key={step.stage} data-stage={step.stage} data-status={step.status}>
      <span>{t(names[step.stage])}</span><strong>{t(step.status === 'PASSED' ? 'Succeeded' : step.status === 'FAILED' ? 'Failed' : 'Not run')}</strong>
    </li>)}</ol>}
  </details>;
}
