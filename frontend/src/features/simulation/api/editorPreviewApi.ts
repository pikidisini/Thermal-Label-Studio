import { API_BASE } from '../../../shared/api';

import type { EditorOutputSnapshot } from '../../canvas';
export type EditorPreviewRequest = EditorOutputSnapshot;

export interface EditorPreviewResult {
  requestId: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  pngBase64: string;
}

export async function runEditorPreview(request: EditorPreviewRequest, signal?: AbortSignal, purpose: 'preview' | 'simulation' = 'preview'): Promise<EditorPreviewResult> {
  const response = await fetch(`${API_BASE}/simulation/editor-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, purpose }),
    signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 422
      ? 'The current canvas cannot be simulated by the server renderer.'
      : 'The server could not create the simulation preview.');
  }
  const payload = await response.json() as {
    request_id: string; width_px: number; height_px: number; dpi: number; png_base64: string; template_sha256: string; binding_version: number;
  };
  if (!payload || typeof payload.request_id !== 'string' || !payload.request_id
      || payload.binding_version !== 1 || !/^[0-9a-f]{64}$/.test(payload.template_sha256)
      || !Number.isInteger(payload.width_px) || payload.width_px < 1 || payload.width_px > 4096
      || !Number.isInteger(payload.height_px) || payload.height_px < 1 || payload.height_px > 4096
      || payload.width_px * payload.height_px > 4000000 || payload.dpi !== request.draft.dpi
      || typeof payload.png_base64 !== 'string' || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(payload.png_base64)) {
    throw new Error('The server returned an invalid simulation preview.');
  }
  return {
    requestId: payload.request_id,
    widthPx: payload.width_px,
    heightPx: payload.height_px,
    dpi: payload.dpi,
    pngBase64: payload.png_base64,
  };
}

export function editorPreviewUrl(result: EditorPreviewResult): string {
  return `data:image/png;base64,${result.pngBase64}`;
}
