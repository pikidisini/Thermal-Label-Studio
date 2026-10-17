import type { PreviewStage, PreviewStep } from '../api/batchPreviewApi';

export type LabelPreview = {
  id: number; batch: string; image: string; selected: boolean;
  code?: string; version?: string; checksum?: string; payloadHash?: string;
  error?: string; datasetRevision?: string; operationId?: string;
  operationRevision?: string; steps?: PreviewStep[]; failedStage?: PreviewStage | null;
  notAttempted?: boolean; artifact?: string; widthPx?: number; heightPx?: number; dpi?: number;
};
