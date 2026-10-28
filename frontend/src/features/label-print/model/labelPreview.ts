import type { PreviewStage, PreviewStep } from '../api/batchPreviewApi';

export type LabelPreview = {
  id: number; batch: string; image: string; selected: boolean;
  code?: string; version?: string; checksum?: string; payloadHash?: string;
  error?: string; datasetRevision?: string; operationId?: string;
  operationRevision?: string; steps?: PreviewStep[]; failedStage?: PreviewStage | null;
  notAttempted?: boolean; artifact?: string; widthPx?: number; heightPx?: number; dpi?: number;
};

export function previewStatus(label: { notAttempted?: boolean; error?: string }): string {
  if (label.notAttempted) return 'Not attempted';
  if (label.error) return 'Failed';
  return 'Preview ready';
}

const deliveryLabels: Record<string, string> = {
  SUBMITTED: 'Submitted to transport', UNCERTAIN: 'Outcome uncertain',
  FAILED_BEFORE_SEND: 'Failed before sending', NOT_ATTEMPTED: 'Not attempted',
};

export function deliveryStatus(status?: string): string | undefined {
  return status === undefined ? undefined : deliveryLabels[status];
}
