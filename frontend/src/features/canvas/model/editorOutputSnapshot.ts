import { exportFabricToSvg } from '../svg/fabricSvgExporter';
import { useContractStore } from '../../../store/useContractStore';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useSimulationStore } from '../../../store/useSimulationStore';

export interface EditorOutputSnapshot {
  draft: { svg: string; width_mm: number; height_mm: number; dpi: number; binding_version: 1 };
  data: Record<string, unknown>;
  field_descriptions: Record<string, string>;
  encoder: 'IPL';
  copies: number;
}

/** Synchronous action-time copy: samples remain draft geometry, never output values. */
export function captureEditorOutput(canvas: any, copies = 1): EditorOutputSnapshot {
  const contract = useContractStore.getState();
  if (contract.outputBlocked) throw new Error('Create a canonical working copy before output.');
  const { labelWidthMm, labelHeightMm } = useTemplateStore.getState();
  const svg = exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, 4, { serverBinding: true });
  if (!svg) throw new Error('The current canvas cannot be exported for output.');
  return Object.freeze({
    draft: Object.freeze({ svg, width_mm: labelWidthMm, height_mm: labelHeightMm,
      dpi: useSimulationStore.getState().dpi, binding_version: 1 as const }),
    data: Object.freeze({ ...contract.tokenMap }),
    field_descriptions: Object.freeze({ ...contract.fieldDescriptions }),
    encoder: 'IPL' as const, copies,
  });
}
